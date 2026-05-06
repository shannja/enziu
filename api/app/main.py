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
    ChatRequest,
    ChatResponse,
    CompareRequest,
    UploadResponse,
    VoucherRecoveryRequest,
    VoucherValidationRequest,
    VoucherValidationResponse,
)
from .services.inference import NScaleClient
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
nscale_client = NScaleClient()
voucher_service = VoucherService()
paddle_service = PaddleService(voucher_service=voucher_service)


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
        "nscale_api_key": (
            settings.nscale_service_token[:20] + "..."
            if settings.nscale_service_token
            else "NOT SET"
        ),
        "nscale_api_base": settings.nscale_api_base,
        "nscale_model": settings.nscale_model,
        "paddle_sandbox": settings.paddle_sandbox,
        "debug": settings.debug,
    }


# ===========================================
# PDF Upload
# ===========================================

@limiter.limit(RATE_LIMITS["upload"])
@app.post("/api/upload", response_model=None)
async def upload_policy(request: Request, file: UploadFile = File(...)):
    """
    Upload and analyse a single insurance policy PDF.
    ZERO DISK WRITE — processed entirely in memory via io.BytesIO.
    Returns a free sneak-peek analysis; full report requires payment.
    """
    start_time = time.time()
    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"upload_policy() - ip={client_ip}, filename={file.filename}")

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    try:
        content = await file.read()
        buffer = io.BytesIO(content)
        logger.debug(f"File read — {len(content)} bytes")

        session_id = str(uuid.uuid4())

        extracted_text = pdf_extractor.extract_text(buffer)
        logger.info(f"Text extracted — {len(extracted_text)} chars")

        sneak_peek = await nscale_client.analyze_sneak_peek(extracted_text, session_id)

        await nscale_client.store_session(session_id, {
            "mode": "customer",
            "created_at": time.time(),
            "expires_at": time.time() + 3600,
            "chats_remaining": 5,
            "extracted_text": extracted_text,
        })

        logger.info(
            f"upload_policy() done — session={session_id}, "
            f"grade={sneak_peek.get('grade', {}).get('overall')}, "
            f"time={time.time() - start_time:.3f}s"
        )
        return UploadResponse(session_id=session_id, **sneak_peek)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"upload_policy() failed — {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {e}")


@limiter.limit(RATE_LIMITS["upload"])
@app.post("/api/upload/batch", response_model=None)
async def upload_policy_batch(request: Request, file: UploadFile = File(...)):
    """
    Upload a policy for broker comparison mode.
    ZERO DISK WRITE — all processing in memory.
    """
    start_time = time.time()
    client_ip = request.client.host if request.client else "unknown"
    logger.info("upload_policy_batch() - ip=%s, filename=%s", client_ip, file.filename)

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        logger.warning("upload_policy_batch() - invalid file type: %s", file.filename)
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    try:
        content = await file.read()
        buffer = io.BytesIO(content)
        logger.debug("upload_policy_batch() - file read: %d bytes", len(content))

        session_id = str(uuid.uuid4())
        extracted_text = pdf_extractor.extract_text(buffer)
        logger.info("upload_policy_batch() - text extracted: %d chars", len(extracted_text))

        analysis = await nscale_client.analyze_policy(extracted_text, session_id)

        await nscale_client.store_session(session_id, {
            "mode": "broker",
            "created_at": time.time(),
            "expires_at": time.time() + 3600,
            "chats_remaining": 5,
            "extracted_text": extracted_text,
        })

        logger.info(
            "upload_policy_batch() done - session=%s, grade=%s, time=%.3fs",
            session_id,
            analysis.get("grade", {}).get("overall", "unknown"),
            time.time() - start_time,
        )
        return UploadResponse(session_id=session_id, **analysis)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("upload_policy_batch() failed - %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=500, detail=f"Processing failed: {e}")


# ===========================================
# Chat / Deep Dive
# ===========================================

@limiter.limit(RATE_LIMITS["chat"])
@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: Request, body: ChatRequest) -> ChatResponse:
    """Deep Dive Q&A for a single policy. Every response includes page citations."""
    try:
        response = await nscale_client.chat(
            session_id=body.session_id,
            message=body.message,
        )
        return ChatResponse(
            response=response["response"],
            page=response.get("page"),
            disclaimer="page X — not legal advice",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@limiter.limit(RATE_LIMITS["chat"])
@app.post("/api/compare", response_model=ChatResponse)
async def compare(request: Request, body: CompareRequest) -> ChatResponse:
    """Comparative Q&A for broker mode — analyses both policies together."""
    try:
        response = await nscale_client.compare(
            session_id=body.session_id,
            message=body.message,
            policyA=body.policyA,
            policyB=body.policyB,
        )
        return ChatResponse(
            response=response["response"],
            disclaimer="page X — not legal advice",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
# Session
# ===========================================

@limiter.limit(RATE_LIMITS["general"])
@app.post("/api/session/end")
async def end_session(request: Request, session_id: str) -> JSONResponse:
    """End a session and wipe all associated data permanently."""
    try:
        await nscale_client.end_session(session_id)
    except Exception:
        pass  # Return success even if session doesn't exist
    return JSONResponse(content={"status": "deleted"})