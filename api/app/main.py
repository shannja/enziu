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

if not logger.handlers:
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(InputValidationMiddleware)
app.add_middleware(APIKeyMiddleware)

app.add_middleware(SlowAPIMiddleware)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

app.include_router(paddle_service.get_router())


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
    Extract text from an insurance policy PDF and run the full two-phase audit.

    Single-pass architecture: both extraction and audit run here so the full
    report is available immediately after payment — no second inference call.
    The full_report is returned to the client for encrypted IndexedDB caching.

    ZERO DISK WRITE — processed entirely in memory via io.BytesIO.
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

        metadata = pdf_extractor.get_metadata(buffer)
        buffer.seek(0)

        if metadata.is_scanned:
            logger.warning(f"Scanned document rejected - session={session_id}")
            raise HTTPException(
                status_code=400,
                detail="Scanned documents are not supported in this version. Please upload a digital PDF."
            )

        extracted_text = pdf_extractor.extract_text_json(buffer)

        if not extracted_text or len(extracted_text.strip()) == 0:
            raise HTTPException(
                status_code=400,
                detail="Scanned documents are not supported in this version. Please upload a digital PDF."
            )

        logger.info(f"Text extracted — {len(extracted_text)} chars")

        # Run full two-phase audit (extractor + auditor). analyze_sneak_peek
        # runs process_document internally and caches the full report.
        sneak_peek = await inference_client.analyze_sneak_peek(extracted_text, session_id)

        elapsed = time.time() - start_time
        logger.info(
            f"extract_policy() done — session={session_id}, "
            f"grade={sneak_peek.get('grade', {}).get('overall')}, "
            f"time={elapsed:.3f}s"
        )

        # Return extracted_text + sneak peek preview + full_report for client
        # to store encrypted in IndexedDB. The full_report enables instant
        # report display after payment without a second server round-trip.
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
    """
    Recover a lost voucher using the passphrase (which is the session_id).
    Returns the session_id so the client can re-fetch the cached report.
    """
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
    try:
        result = await voucher_service.decrement(code)
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ===========================================
# Policy Audit (re-fetch from server cache)
# ===========================================

@limiter.limit(RATE_LIMITS["upload"])
@app.post("/api/policy/audit", response_model=AuditResponse)
async def audit_policy(request: Request, body: AuditRequest) -> AuditResponse:
    """
    Return the cached full report for a session.

    Primary use-case: voucher recovery on a new device where IndexedDB is empty.
    The inference_client._report_cache holds the report for the process lifetime.
    If the cache has expired (server restart), the client must re-upload the PDF.

    Note: extracted_text may be empty string for cache-only lookups.
    """
    logger.info(f"audit_policy() - session={body.session_id}, text_length={len(body.extracted_text)}")

    # Cache hit — return immediately without re-running inference
    if body.session_id in inference_client._report_cache:
        cached = inference_client._report_cache[body.session_id]
        logger.info(f"audit_policy() cache hit — session={body.session_id}")
        return AuditResponse(session_id=body.session_id, report=cached)

    # Cache miss and no text provided — report has expired
    if not body.extracted_text or not body.extracted_text.strip():
        raise HTTPException(
            status_code=404,
            detail="Report not found in server cache. Please re-upload your policy PDF."
        )

    if len(body.extracted_text) > 1_500_000:
        raise HTTPException(status_code=413, detail="Policy text too large")

    start_time = time.time()
    try:
        fact_sheet = await inference_client.process_document(
            text=body.extracted_text,
            session_id=body.session_id,
        )
        elapsed = time.time() - start_time
        grade_val = fact_sheet.get("grade", {})
        grade_str = grade_val.get("overall", "unknown") if isinstance(grade_val, dict) else str(grade_val)
        logger.info(f"Policy audit completed - session={body.session_id}, time={elapsed:.2f}s, grade={grade_str}")
        return AuditResponse(session_id=body.session_id, report=fact_sheet)

    except HTTPException:
        raise
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"Policy audit failed after {elapsed:.2f}s: {type(e).__name__}: {e}")
        error_detail = str(e)
        if "timeout" in error_detail.lower():
            raise HTTPException(status_code=408, detail="Audit timed out. Please try again.")
        elif "rate limit" in error_detail.lower() or "429" in error_detail:
            raise HTTPException(status_code=429, detail="Rate limit exceeded. Please wait before trying again.")
        else:
            raise HTTPException(status_code=500, detail=f"Audit failed: {error_detail}")


# ===========================================
# Payment Status Check
# ===========================================

@limiter.limit(RATE_LIMITS["general"])
@app.get("/api/paddle/status")
async def check_payment_status(request: Request, session_id: str) -> dict:
    return {
        "paid": False,
        "client_managed": True,
        "message": "Payment status is managed client-side. Check IndexedDB for 'enziu_payment' key."
    }


# ===========================================
# Session
# ===========================================

@limiter.limit(RATE_LIMITS["general"])
@app.post("/api/session/end")
async def end_session(request: Request, session_id: str) -> JSONResponse:
    try:
        await inference_client.end_session(session_id)
    except Exception:
        pass
    return JSONResponse(content={"status": "deleted"})