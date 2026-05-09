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
    from .inference import InferenceClient

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

VALID_TRANSACTION_STATUSES = ("completed", "billed", "paid")

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


class VerifyPaymentResponse(BaseModel):
    success: bool
    session_id: str
    voucher_code: str | None = None


# ---------------------------------------------------------------------------
# PaddleService
# ---------------------------------------------------------------------------

class PaddleService:
    """
    Service for interacting with Paddle Billing API.
    """

    def __init__(self, voucher_service: "VoucherService", inference_client: "InferenceClient | None" = None) -> None:
        self.voucher_service = voucher_service
        self.inference_client = inference_client
        self.api_base = PADDLE_API_BASE
        logger.info("PaddleService initialized - API base: %s", self.api_base)

    def _auth_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {settings.paddle_api_key}",
            "Content-Type": "application/json",
        }

    def _verify_webhook_signature(self, body: bytes, signature_header: str) -> bool:
        """
        Verify a Paddle webhook signature (HMAC-SHA256).

        Paddle-Signature format:  ts=<timestamp>;h1=<hex_digest>
        Signed payload:           <timestamp>:<raw_body>
        """
        try:
            parts = dict(p.split("=", 1) for p in signature_header.split(";"))
            ts = parts.get("ts", "")
            h1 = parts.get("h1", "")

            if not ts or not h1:
                logger.warning("Malformed Paddle-Signature header")
                return False

            signed_payload = f"{ts}:{body.decode('utf-8')}".encode("utf-8")

            # Use hmac.new with explicit digestmod (required in Python 3.8+, avoids deprecation)
            mac = hmac.new(
                settings.paddle_webhook_secret.encode("utf-8"),
                signed_payload,
                hashlib.sha256,
            )
            expected = mac.hexdigest()

            return hmac.compare_digest(expected, h1)
        except Exception as exc:
            logger.error("Signature verification error: %s", exc)
            return False

    def get_router(self) -> APIRouter:
        router = APIRouter(prefix="/api/paddle", tags=["paddle"])

        @router.post(
            "/transaction",
            response_model=CreateTransactionResponse,
            summary="Create a Paddle transaction (server-side)",
        )
        async def create_transaction(body: CreateTransactionRequest) -> CreateTransactionResponse:
            """
            Create a Paddle transaction server-side and return its ID to the frontend.
            Frontend passes the returned transaction_id to Paddle.Checkout.open({ transactionId }).
            """
            if not body.price_id.startswith(PRICE_ID_PREFIX):
                logger.warning("Invalid price_id format: %s", body.price_id[:20])
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid price_id — must start with 'pri_'",
                )

            if body.pack_type not in VALID_PACK_TYPES:
                logger.warning("Invalid pack_type: %s", body.pack_type)
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
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Paddle API")

            if resp.status_code != 201:
                logger.error("Paddle transaction creation failed: %s — %s", resp.status_code, resp.text[:200])
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Paddle returned {resp.status_code}: {resp.text}",
                )

            transaction_id: str = resp.json()["data"]["id"]
            logger.info("Transaction created — id=%s session=%s pack=%s", transaction_id, body.session_id, body.pack_type)
            return CreateTransactionResponse(transaction_id=transaction_id)


        @router.post(
            "/verify",
            response_model=VerifyPaymentResponse,
            summary="Verify a completed Paddle transaction and mark session as paid",
        )
        async def verify_payment(body: VerifyPaymentRequest) -> VerifyPaymentResponse:
            """
            Called by the frontend when the checkout.completed event fires.
            Verifies the transaction with Paddle and marks the session as paid.

            The frontend is responsible for calling Paddle.Checkout.close() after
            this endpoint returns success=True.
            """
            if not body.transaction_id.startswith(TRANSACTION_ID_PREFIX):
                logger.warning("Invalid transaction_id format: %s", body.transaction_id[:20])
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid transaction_id")

            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    resp = await client.get(
                        f"{self.api_base}/transactions/{body.transaction_id}",
                        headers=self._auth_headers(),
                    )
            except httpx.RequestError as exc:
                logger.error("Paddle API unreachable: %s", exc)
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Paddle API")

            if resp.status_code != 200:
                logger.error("Paddle transaction fetch failed: %s — %s", resp.status_code, resp.text[:200])
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Paddle returned {resp.status_code}")

            txn = resp.json()["data"]
            txn_status: str = txn.get("status", "")

            if txn_status not in VALID_TRANSACTION_STATUSES:
                logger.warning("Transaction %s has unexpected status: %s", body.transaction_id, txn_status)

                status_messages = {
                    "pending": "Transaction is still pending. Please complete the payment.",
                    "ready":   "Transaction is still being processed.",
                    "draft":   "Transaction is still a draft.",
                    "canceled": "Transaction was canceled. Please start a new payment.",
                    "expired":  "Transaction has expired. Please start a new payment.",
                }
                detail = status_messages.get(txn_status, f"Transaction not completed (status='{txn_status}'). Please try again.")
                raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=detail)

            # Mark session as paid in Redis
            if self.inference_client:
                try:
                    await self.inference_client.mark_session_paid(body.session_id)
                    logger.info("Session marked as paid — session=%s txn=%s", body.session_id, body.transaction_id)
                except Exception as e:
                    logger.error("Failed to mark session as paid: %s", e)
                    # Non-fatal — payment is verified, continue
            else:
                logger.warning("InferenceClient not configured — session not marked as paid")

            # Create a recovery voucher — session_id serves as the passphrase
            try:
                voucher = await self.voucher_service.create_voucher(
                    pack_type="PAYG",
                    passphrase=body.session_id,
                    transaction_id=body.transaction_id,
                )
                voucher_code = voucher["code"]
                logger.info("Recovery voucher created — code=%s session=%s", voucher_code[:8], body.session_id)
            except Exception as e:
                logger.error("Failed to create recovery voucher: %s", e)
                voucher_code = None  # Non-fatal — verification still succeeds

            # NOTE: The frontend must call Paddle.Checkout.close() upon receiving success=True.
            return VerifyPaymentResponse(success=True, session_id=body.session_id, voucher_code=voucher_code)


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
            Reliable production backup to the client-side checkout.completed event.

            Verified events:
              transaction.completed → mark session as paid
              transaction.payment_failed → logged for monitoring
            """
            raw_body = await request.body()

            if not settings.debug and settings.paddle_webhook_secret:
                if not paddle_signature:
                    logger.warning("Webhook received with no signature")
                    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Paddle-Signature header")

                if not self._verify_webhook_signature(raw_body, paddle_signature):
                    logger.warning("Webhook signature verification failed")
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid webhook signature")

            try:
                event = await request.json()
            except Exception:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body")

            event_type: str = event.get("event_type", "")
            logger.info("Paddle webhook received: %s", event_type)

            if event_type == "transaction.completed":
                txn = event.get("data", {})
                txn_id: str = txn.get("id", "")
                custom_data: dict = txn.get("custom_data") or {}
                session_id: str = custom_data.get("session_id", "")

                if session_id and self.inference_client:
                    try:
                        await self.inference_client.mark_session_paid(session_id)
                        logger.info("Session marked as paid via webhook — session=%s txn=%s", session_id, txn_id)
                    except Exception as e:
                        logger.error("Failed to mark session as paid via webhook: %s", e)
                elif not session_id:
                    logger.warning("transaction.completed webhook without session_id — txn=%s", txn_id)

            elif event_type == "transaction.payment_failed":
                txn_id = event.get("data", {}).get("id", "unknown")
                logger.warning("Payment failed — txn=%s", txn_id)

            return JSONResponse(content={"status": "received"})

        return router