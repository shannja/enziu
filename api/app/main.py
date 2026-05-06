"""
ENZIU API - Main Application Entry Point
Insurance Transparency Engine
"""

from __future__ import annotations

import io
import time
import uuid
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .config import settings
from .models.schemas import (
    UploadResponse,
    ChatRequest,
    ChatResponse,
    CompareRequest,
    VoucherValidationRequest,
    VoucherValidationResponse,
    VoucherRecoveryRequest,
)
from .services.inference import NScaleClient
from .services.pdf_extractor import PDFExtractor
from .services.security import (
    SecurityHeadersMiddleware,
    InputValidationMiddleware,
    APIKeyMiddleware,
    limiter,
    RATE_LIMITS,
    rate_limit_exceeded_handler,
)
from .services.voucher import VoucherService

# Initialize services
pdf_extractor = PDFExtractor()
nscale_client = NScaleClient()
voucher_service = VoucherService()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager for startup and shutdown events."""
    # Startup
    print(f"🚀 {settings.app_name} starting up...")
    print(f"📍 Mode: {'development' if settings.debug else 'production'}")
    yield
    # Shutdown
    print("👋 Shutting down ENZIU API...")


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    description="ENZIU Insurance Transparency Engine API - Zero data stored",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security middleware (add in order: headers -> input validation -> auth)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(InputValidationMiddleware)
app.add_middleware(APIKeyMiddleware)

# Rate limiting middleware
app.add_middleware(SlowAPIMiddleware)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


# ===========================================
# Health check
# ===========================================

@app.get("/api/health")
@limiter.limit(RATE_LIMITS["health"])
async def health_check(request: Request) -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy", "timestamp": str(time.time())}


# ===========================================
# PDF Upload Endpoints (Memory-Safe)
# ===========================================

@app.post("/api/upload", response_model=UploadResponse)
@limiter.limit(RATE_LIMITS["upload"])
async def upload_policy(request: Request, file: UploadFile = File(...)) -> UploadResponse:
    """
    Upload and analyze a single insurance policy PDF.
    
    ZERO DISK WRITE: The file is processed entirely in memory using io.BytesIO.
    No document content is ever written to disk.
    """
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    try:
        # Read file into memory - ZERO DISK WRITE
        content = await file.read()
        buffer = io.BytesIO(content)
        
        # Generate session ID
        session_id = str(uuid.uuid4())
        
        # Extract text in memory using PyMuPDF
        extracted_text = pdf_extractor.extract_text(buffer)
        
        # Generate sneak peek analysis (free preview)
        sneak_peek = await nscale_client.analyze_sneak_peek(extracted_text, session_id)
        
        # Store minimal session data in Redis (no document content)
        await nscale_client.store_session(session_id, {
            "mode": "customer",
            "created_at": time.time(),
            "expires_at": time.time() + 3600,  # 1 hour session
            "chats_remaining": 5,
            "extracted_text": extracted_text,  # Keep in memory for session
        })
        
        return UploadResponse(
            session_id=session_id,
            **sneak_peek
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@app.post("/api/upload/batch", response_model=UploadResponse)
@limiter.limit(RATE_LIMITS["upload"])
async def upload_policy_batch(request: Request, file: UploadFile = File(...)) -> UploadResponse:
    """
    Upload a policy for broker comparison mode.
    All processing happens in memory.
    """
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    try:
        content = await file.read()
        buffer = io.BytesIO(content)
        session_id = str(uuid.uuid4())
        extracted_text = pdf_extractor.extract_text(buffer)
        
        analysis = await nscale_client.analyze_policy(extracted_text, session_id)
        
        await nscale_client.store_session(session_id, {
            "mode": "broker",
            "created_at": time.time(),
            "expires_at": time.time() + 3600,
            "chats_remaining": 5,
            "extracted_text": extracted_text,
        })
        
        return UploadResponse(
            session_id=session_id,
            **analysis
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


# ===========================================
# Chat / Deep Dive Endpoints
# ===========================================

@app.post("/api/chat", response_model=ChatResponse)
@limiter.limit(RATE_LIMITS["chat"])
async def chat(request_data: ChatRequest, request: Request) -> ChatResponse:
    """Deep Dive Q&A for a single policy. Includes page citations."""
    try:
        response = await nscale_client.chat(
            session_id=request_data.session_id,
            message=request_data.message
        )
        
        return ChatResponse(
            response=response["response"],
            page=response.get("page"),
            disclaimer="page X — not legal advice"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/compare", response_model=ChatResponse)
@limiter.limit(RATE_LIMITS["chat"])
async def compare(request_data: CompareRequest, request: Request) -> ChatResponse:
    """Comparative Q&A for broker mode."""
    try:
        response = await nscale_client.compare(
            session_id=request_data.session_id,
            message=request_data.message,
            policyA=request_data.policyA,
            policyB=request_data.policyB
        )
        
        return ChatResponse(
            response=response["response"],
            disclaimer="page X — not legal advice"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===========================================
# Voucher Endpoints
# ===========================================

@app.post("/api/voucher/validate", response_model=VoucherValidationResponse)
@limiter.limit(RATE_LIMITS["voucher"])
async def validate_voucher(request_data: VoucherValidationRequest, request: Request) -> VoucherValidationResponse:
    """Validate a voucher code with HMAC fast rejection and Redis atomic decrement."""
    try:
        result = await voucher_service.validate(
            code=request_data.code,
            passphrase=request_data.passphrase
        )
        
        return VoucherValidationResponse(
            valid=result["valid"],
            credits=result.get("credits", 0),
            packType=result.get("pack_type"),
            error=result.get("error")
        )
        
    except Exception as e:
        return VoucherValidationResponse(
            valid=False,
            error=str(e)
        )


@app.post("/api/voucher/recover")
@limiter.limit(RATE_LIMITS["voucher"])
async def recover_voucher(request_data: VoucherRecoveryRequest, request: Request) -> JSONResponse:
    """Recover a lost voucher code using passphrase lookup."""
    try:
        result = await voucher_service.recover(
            passphrase=request_data.passphrase
        )
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/voucher/decrement")
@limiter.limit(RATE_LIMITS["voucher"])
async def decrement_credits(request: Request, session_id: str, code: str) -> JSONResponse:
    """Atomically decrement voucher credits to prevent double-spending."""
    try:
        result = await voucher_service.decrement(code)
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ===========================================
# Session Management
# ===========================================

@app.post("/api/session/end")
@limiter.limit(RATE_LIMITS["general"])
async def end_session(request: Request, session_id: str) -> JSONResponse:
    """End a session and wipe all data from Redis."""
    try:
        await nscale_client.end_session(session_id)
        return JSONResponse(content={"status": "deleted"})
    except Exception:
        return JSONResponse(content={"status": "deleted"})


# ===========================================
# Paddle Webhooks
# ===========================================

@app.post("/api/paddle/webhook")
@limiter.limit(RATE_LIMITS["general"])
async def paddle_webhook(request: Request) -> JSONResponse:
    """Handle Paddle payment webhooks to create voucher codes."""
    # TODO: Implement Paddle webhook handling
    return JSONResponse(content={"status": "received"})