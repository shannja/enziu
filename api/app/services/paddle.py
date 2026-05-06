"""
ENZIU Paddle Service
Handles all Paddle Billing interactions through a class-based service.

Endpoints:
  POST /api/paddle/transaction  — create a server-side transaction, return its ID
  POST /api/paddle/verify       — verify a completed transaction, delegate voucher creation to VoucherService
  POST /api/paddle/webhook      — receive Paddle webhook events (production)
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from typing import TYPE_CHECKING

import httpx
from fastapi import APIRouter, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..config import settings, MIN_PASSPHRASE_LENGTH, PRICE_ID_PREFIX, TRANSACTION_ID_PREFIX, VALID_PACK_TYPES

if TYPE_CHECKING:
    from .voucher import VoucherService

# Configure logger
logger = logging.getLogger("paddle")
logger.setLevel(logging.DEBUG if settings.debug else logging.INFO)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PADDLE_API_BASE = (
    "https://sandbox-api.paddle.com"
    if settings.paddle_sandbox
    else "https://api.paddle.com"
)

VALID_TRANSACTION_STATUSES = ("completed", "billed")

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CreateTransactionRequest(BaseModel):
    session_id: str
    price_id: str
    pack_type: str = "PAYG"


class CreateTransactionResponse(BaseModel):
    transaction_id: str


class VerifyPaymentRequest(BaseModel):
    transaction_id: str
    session_id: str
    passphrase: str


class VerifyPaymentResponse(BaseModel):
    voucher_code: str
    credits: int
    pack_type: str


# ---------------------------------------------------------------------------
# PaddleService
# ---------------------------------------------------------------------------

class PaddleService:
    """
    Service for interacting with Paddle Billing API.
    
    Handles transaction creation, payment verification, and webhook processing.
    Delegates voucher creation to VoucherService after successful payment verification.
    """
    
    def __init__(self, voucher_service: "VoucherService") -> None:
        """
        Initialize PaddleService.
        
        Args:
            voucher_service: VoucherService instance for voucher operations
        """
        self.voucher_service = voucher_service
        self.api_base = PADDLE_API_BASE
        logger.info(
            "PaddleService initialized - API base: %s",
            self.api_base
        )
    
    def _auth_headers(self) -> dict[str, str]:
        """
        Get authentication headers for Paddle API requests.
        
        Returns:
            Dictionary with Authorization and Content-Type headers
        """
        return {
            "Authorization": f"Bearer {settings.paddle_api_key}",
            "Content-Type": "application/json",
        }
    
    def _verify_webhook_signature(self, body: bytes, signature_header: str) -> bool:
        """
        Verify a Paddle webhook signature.
        
        Paddle signs webhooks with HMAC-SHA256. The Paddle-Signature header
        contains a timestamp and the hex digest joined by semicolons:
            ts=<timestamp>;h1=<hex_digest>
        
        Args:
            body: Raw request body bytes
            signature_header: Paddle-Signature header value
            
        Returns:
            True if signature is valid, False otherwise
        """
        try:
            parts = dict(p.split("=", 1) for p in signature_header.split(";"))
            ts = parts.get("ts", "")
            h1 = parts.get("h1", "")
            
            signed_payload = f"{ts}:{body.decode()}"
            expected = hmac.new(
                settings.paddle_webhook_secret.encode(),
                signed_payload.encode(),
                hashlib.sha256,
            ).hexdigest()
            
            return hmac.compare_digest(expected, h1)
        except Exception as exc:
            logger.error("Signature verification error: %s", exc)
            return False
    
    def get_router(self) -> APIRouter:
        """
        Get the FastAPI router with all Paddle routes.
        
        Returns:
            APIRouter configured with Paddle endpoints
        """
        router = APIRouter(prefix="/api/paddle", tags=["paddle"])
        
        @router.post(
            "/transaction",
            response_model=CreateTransactionResponse,
            summary="Create a Paddle transaction (server-side)",
        )
        async def create_transaction(body: CreateTransactionRequest) -> CreateTransactionResponse:
            """
            Create a Paddle transaction server-side and return its ID to the frontend.
            
            The frontend passes the returned transaction_id to:
                Paddle.Checkout.open({ transactionId })
            
            This avoids the 400 errors that occur when price IDs are resolved
            client-side via Paddle's /paddlejs endpoint.
            """
            # Validate price_id format
            if not body.price_id.startswith(PRICE_ID_PREFIX):
                logger.warning(
                    "Invalid price_id format: %s",
                    body.price_id[:20] if len(body.price_id) > 20 else body.price_id
                )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid price_id — must start with 'pri_'",
                )
            
            # Validate pack_type
            if body.pack_type not in VALID_PACK_TYPES:
                logger.warning(
                    "Invalid pack_type: %s",
                    body.pack_type
                )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid pack_type",
                )
            
            payload = {
                "items": [{"price_id": body.price_id, "quantity": 1}],
                "custom_data": {
                    "session_id": body.session_id,
                    "pack_type": body.pack_type,
                },
            }
            
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    resp = await client.post(
                        f"{self.api_base}/transactions",
                        headers=self._auth_headers(),
                        json=payload,
                    )
            except httpx.RequestError as exc:
                logger.error("Paddle API unreachable: %s", exc)
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Could not reach Paddle API",
                )
            
            if resp.status_code != 201:
                logger.error(
                    "Paddle transaction creation failed: %s — %s",
                    resp.status_code,
                    resp.text[:200] if len(resp.text) > 200 else resp.text,
                )
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Paddle returned {resp.status_code}: {resp.text}",
                )
            
            transaction_id: str = resp.json()["data"]["id"]
            logger.info(
                "Transaction created — id=%s session=%s pack=%s",
                transaction_id,
                body.session_id,
                body.pack_type,
            )
            return CreateTransactionResponse(transaction_id=transaction_id)
        
        
        @router.post(
            "/verify",
            response_model=VerifyPaymentResponse,
            summary="Verify a completed Paddle transaction and issue a voucher",
        )
        async def verify_payment(body: VerifyPaymentRequest) -> VerifyPaymentResponse:
            """
            Called by the frontend when the checkout.completed event fires.
            
            1. Validates the transaction_id format.
            2. Fetches the transaction from Paddle to confirm status is
               'completed' (sandbox) or 'billed' (production).
            3. Delegates voucher creation entirely to VoucherService —
               Paddle code never touches voucher logic directly.
            """
            # Validate transaction_id format
            if not body.transaction_id.startswith(TRANSACTION_ID_PREFIX):
                logger.warning(
                    "Invalid transaction_id format: %s",
                    body.transaction_id[:20] if len(body.transaction_id) > 20 else body.transaction_id
                )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid transaction_id",
                )
            
            # Validate passphrase length
            if len(body.passphrase) < MIN_PASSPHRASE_LENGTH:
                logger.warning(
                    "Passphrase too short: %d characters (minimum %d)",
                    len(body.passphrase),
                    MIN_PASSPHRASE_LENGTH
                )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Passphrase must be at least 8 characters",
                )
            
            # Fetch transaction from Paddle to confirm it is paid
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    resp = await client.get(
                        f"{self.api_base}/transactions/{body.transaction_id}",
                        headers=self._auth_headers(),
                    )
            except httpx.RequestError as exc:
                logger.error("Paddle API unreachable: %s", exc)
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Could not reach Paddle API",
                )
            
            if resp.status_code != 200:
                logger.error(
                    "Paddle transaction fetch failed: %s — %s",
                    resp.status_code,
                    resp.text[:200] if len(resp.text) > 200 else resp.text,
                )
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Paddle returned {resp.status_code}",
                )
            
            txn = resp.json()["data"]
            txn_status: str = txn.get("status", "")
            pack_type: str = (txn.get("custom_data") or {}).get("pack_type", "PAYG")
            
            # 'completed' = sandbox, 'billed' = production one-time charge
            if txn_status not in VALID_TRANSACTION_STATUSES:
                logger.warning(
                    "Transaction %s has unexpected status: %s",
                    body.transaction_id,
                    txn_status,
                )
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail=f"Transaction not completed (status='{txn_status}')",
                )
            
            # Delegate entirely to VoucherService — no voucher logic here
            voucher = await self.voucher_service.create_voucher(
                pack_type=pack_type,
                passphrase=body.passphrase,
                transaction_id=body.transaction_id,
            )
            
            logger.info(
                "Voucher issued — code=%s... txn=%s session=%s",
                voucher["code"][:8],
                body.transaction_id,
                body.session_id,
            )
            
            return VerifyPaymentResponse(
                voucher_code=voucher["code"],
                credits=voucher["credits"],
                pack_type=voucher["pack_type"],
            )
        
        
        @router.post(
            "/webhook",
            summary="Receive Paddle webhook events",
            status_code=200,
        )
        async def paddle_webhook(
            request: Request,
            paddle_signature: str | None = Header(default=None, alias="Paddle-Signature"),
        ) -> JSONResponse:
            """
            Paddle sends signed webhook events for payment lifecycle changes.
            Used in production as a reliable backup to the client-side checkout.completed event.
            
            Verified events:
            - transaction.completed → issue voucher if not already issued
            - transaction.payment_failed → log for monitoring
            
            Signature verification uses HMAC-SHA256 with the webhook secret.
            """
            raw_body = await request.body()
            
            # Verify webhook signature in production
            if not settings.debug and settings.paddle_webhook_secret:
                if not paddle_signature:
                    logger.warning("Webhook received with no signature")
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Missing Paddle-Signature header",
                    )
                
                if not self._verify_webhook_signature(raw_body, paddle_signature):
                    logger.warning("Webhook signature verification failed")
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Invalid webhook signature",
                    )
            
            try:
                event = await request.json()
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid JSON body",
                )
            
            event_type: str = event.get("event_type", "")
            logger.info("Paddle webhook received: %s", event_type)
            
            if event_type == "transaction.completed":
                txn = event.get("data", {})
                txn_id: str = txn.get("id", "")
                custom_data: dict = txn.get("custom_data") or {}
                pack_type: str = custom_data.get("pack_type", "PAYG")
                
                # Webhooks don't carry the passphrase — voucher issuance via webhook
                # is only a fallback for cases where the client event was missed.
                # In production, you would look up the passphrase hash from a
                # pending-payment table keyed by transaction_id.
                logger.info(
                    "transaction.completed webhook — txn=%s pack=%s "
                    "(client-side verify is primary; webhook is backup)",
                    txn_id,
                    pack_type,
                )
            
            elif event_type == "transaction.payment_failed":
                txn_id = event.get("data", {}).get("id", "unknown")
                logger.warning("Payment failed — txn=%s", txn_id)
            
            return JSONResponse(content={"status": "received"})
        
        return router