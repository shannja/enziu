"""
ENZIU API - Main Application Entry Point
Insurance Transparency Engine
"""

from __future__ import annotations

import io
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .config import settings
from .models.schemas import (
    AuditRequest,
    AuditResponse,
    VoucherRecoveryRequest,
    VoucherValidationRequest,
    VoucherValidationResponse,
)
from typing import Any
from .services.inference import InferenceClient
from .services.paddle import PaddleService
from .services.pdf_extractor import PDFExtractor
from .services.security import (
    RATE_LIMITS,
    APIKeyMiddleware,
    InputValidationMiddleware,
    SecurityEventLogger,
    SecurityHeadersMiddleware,
    limiter,
    rate_limit_exceeded_handler,
)
from .services.voucher import VoucherService

logger = logging.getLogger("main")
logger.setLevel(logging.DEBUG if settings.debug else logging.INFO)

# ---------------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------------

pdf_extractor = PDFExtractor()
inference_client = InferenceClient()
voucher_service = VoucherService()
paddle_service = PaddleService(voucher_service=voucher_service, inference_client=inference_client)


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"🚀 {settings.app_name} starting up...")
    print(f"📍 Mode: {'development' if settings.debug else 'production'}")
    print(f"💳 Paddle: {'sandbox' if settings.paddle_sandbox else 'production'}")
    yield
    print("👋 Shutting down ENZIU API...")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title=settings.app_name,
    description="ENZIU Insurance Transparency Engine API - Zero data stored",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(InputValidationMiddleware)
app.add_middleware(APIKeyMiddleware)

# Rate limiting
app.add_middleware(SlowAPIMiddleware)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# Routers
app.include_router(paddle_service.get_router())  # mounts /api/paddle/*


# ===========================================
# Health
# ===========================================

@limiter.limit(RATE_LIMITS["health"])
@app.get("/api/health")
async def health_check(request: Request) -> dict:
    return {"status": "healthy", "timestamp": str(time.time())}


@limiter.limit(RATE_LIMITS["health"])
@app.get("/api/debug/config")
async def debug_config(request: Request) -> dict:
    """Debug endpoint — only useful in development."""
    return {
        "inference_api_key": (
            settings.inference_api_key[:20] + "..."
            if settings.inference_api_key
            else "NOT SET"
        ),
        "inference_api_base": settings.inference_api_base,
        "inference_model": settings.inference_model,
        "paddle_sandbox": settings.paddle_sandbox,
        "debug": settings.debug,
    }


# ===========================================
# PDF Extract (Upload + Sneak Peek)
# ===========================================

@limiter.limit(RATE_LIMITS["upload"])
@app.post("/api/extract", response_model=None)
async def extract_policy(request: Request, file: UploadFile = File(...)):
    """
    Extract text from an insurance policy PDF.
    ZERO DISK WRITE — processed entirely in memory via io.BytesIO.
    Returns extracted_text + free sneak-peek analysis; full report requires payment.
    
    Scanned documents are NOT supported (no OCR).
    """
    start_time = time.time()
    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"extract_policy() - ip={client_ip}, filename={file.filename}")

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    try:
        content = await file.read()
        buffer = io.BytesIO(content)
        file_size = len(content)
        logger.debug(f"File read — {file_size} bytes")

        session_id = str(uuid.uuid4())

        # Get metadata first for scan detection
        metadata = pdf_extractor.get_metadata(buffer)
        buffer.seek(0)  # Reset buffer after metadata extraction

        # Reject scanned documents (no OCR support)
        if metadata.is_scanned:
            logger.warning(f"Scanned document rejected - session={session_id}")
            raise HTTPException(
                status_code=400,
                detail="Scanned documents are not supported in this version. Please upload a digital PDF."
            )

        # Extract text using PyMuPDF — JSON format for accurate LLM citations
        extracted_text = pdf_extractor.extract_text_json(buffer)

        # Reject if no text extracted (scanned or image-based PDF)
        if not extracted_text or len(extracted_text.strip()) == 0:
            raise HTTPException(
                status_code=400,
                detail="Scanned documents are not supported in this version. Please upload a digital PDF."
            )

        logger.info(f"Text extracted — {len(extracted_text)} chars")

        # Run sneak peek inference using the cheaper model (Qwen 14B)
        sneak_peek = await inference_client.analyze_sneak_peek(extracted_text, session_id)

        # Store session metadata (NOT extracted text - client stores that)
        await inference_client.store_session(session_id, {
            "mode": "customer",
            "created_at": time.time(),
            "expires_at": time.time() + 3600,
            "chats_remaining": 5,
        })

        elapsed = time.time() - start_time
        logger.info(
            f"extract_policy() done — session={session_id}, "
            f"grade={sneak_peek.get('grade', {}).get('overall')}, "
            f"time={elapsed:.3f}s"
        )

        # Return extracted_text + sneak peek - client stores both
        response_data: dict[str, Any] = {
            "session_id": session_id,
            "extracted_text": extracted_text,
            **sneak_peek,
            "is_scanned": metadata.is_scanned,
        }
        return JSONResponse(content=response_data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"extract_policy() failed — {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {e}")




# ===========================================
# Voucher
# ===========================================

@limiter.limit(RATE_LIMITS["voucher"])
@app.post("/api/voucher/validate", response_model=VoucherValidationResponse)
async def validate_voucher(
    request: Request, body: VoucherValidationRequest
) -> VoucherValidationResponse:
    """
    Validate a voucher code + passphrase.
    1. Format check  2. Redis lookup  3. Bcrypt verify  4. Credit check
    """
    try:
        result = await voucher_service.validate(
            code=body.code, passphrase=body.passphrase
        )
        return VoucherValidationResponse(
            valid=result["valid"],
            credits=result.get("credits", 0),
            packType=result.get("pack_type"),
            error=result.get("error"),
        )
    except Exception as e:
        return VoucherValidationResponse(valid=False, error=str(e))


@limiter.limit(RATE_LIMITS["voucher"])
@app.post("/api/voucher/recover")
async def recover_voucher(
    request: Request, body: VoucherRecoveryRequest
) -> JSONResponse:
    """Recover a lost voucher code using passphrase only. No email required."""
    try:
        result = await voucher_service.recover(passphrase=body.passphrase)
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@limiter.limit(RATE_LIMITS["voucher"])
@app.post("/api/voucher/decrement")
async def decrement_credits(
    request: Request, session_id: str, code: str
) -> JSONResponse:
    """Atomically decrement voucher credits — prevents double-spending."""
    try:
        result = await voucher_service.decrement(code)
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ===========================================
# Policy Audit (Single-Shot, Llama 4 Scout)
# ===========================================

@limiter.limit(RATE_LIMITS["upload"])
@app.post("/api/policy/audit", response_model=AuditResponse)
async def audit_policy(request: Request, body: AuditRequest) -> AuditResponse:
    """
    Generate a Master Policy Fact Sheet using single-shot inference.
    Llama 4 Scout's 890K context handles the full policy in one call.
    """
    logger.info(f"audit_policy() - session={body.session_id}, text_length={len(body.extracted_text)}")
    
    # Validate input
    if not body.extracted_text or len(body.extracted_text.strip()) == 0:
        raise HTTPException(status_code=400, detail="No policy text provided")
    
    # Check for suspiciously large text (potential abuse)
    if len(body.extracted_text) > 1_500_000:  # 1.5MB limit for text
        logger.warning(f"Extracted text too large: {len(body.extracted_text)} bytes")
        raise HTTPException(status_code=413, detail="Policy text too large")
    
    start_time = time.time()
    
    try:
        # Process document using Map-Reduce
        fact_sheet = await inference_client.process_document(
            text=body.extracted_text,
            session_id=body.session_id,
        )
        
        elapsed = time.time() - start_time
        grade_val = fact_sheet.get('grade', {})
        if isinstance(grade_val, dict):
            grade_str = grade_val.get('overall', 'unknown')
        else:
            grade_str = str(grade_val) if grade_val else 'unknown'
        logger.info(
            f"Policy audit completed - "
            f"session={body.session_id}, "
            f"time={elapsed:.2f}s, "
            f"grade={grade_str}"
        )
        
        return AuditResponse(
            session_id=body.session_id,
            report=fact_sheet,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"Policy audit failed after {elapsed:.2f}s: {type(e).__name__}: {e}")
        
        # Provide specific error messages
        error_detail = str(e)
        if "timeout" in error_detail.lower():
            raise HTTPException(
                status_code=408,
                detail="Audit timed out. The policy may be too large. Please try again.",
            )
        elif "rate limit" in error_detail.lower() or "429" in error_detail:
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded. Please wait before trying again.",
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Audit failed: {error_detail}",
            )


# ===========================================
# Session
# ===========================================

# ===========================================
# ===========================================
# Payment Status Check
# ===========================================

@limiter.limit(RATE_LIMITS["general"])
@app.get("/api/paddle/status")
async def check_payment_status(request: Request, session_id: str) -> dict[str, bool]:
    """
    Check if a session has been paid for.
    Used for disconnect recovery - client checks if payment completed.
    """
    logger.info(f"check_payment_status() - session={session_id}")
    
    try:
        # Check Redis for payment flag
        # In development mode without Redis, always return False
        paid = await inference_client.check_session_payment(session_id)
        return {"paid": paid}
    except Exception as e:
        logger.error(f"Payment status check failed: {e}")
        return {"paid": False}


# ===========================================
# Session
# ===========================================

@limiter.limit(RATE_LIMITS["general"])
@app.post("/api/session/end")
async def end_session(request: Request, session_id: str) -> JSONResponse:
    """End a session and wipe all associated data permanently."""
    try:
        await inference_client.end_session(session_id)
    except Exception:
        pass  # Return success even if session doesn't exist
    return JSONResponse(content={"status": "deleted"})