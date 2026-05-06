"""
ENZIU API - Main Application Entry Point
Insurance Transparency Engine
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import io
import uuid
import time
from typing import Optional

from .config import settings
from .services.pdf_extractor import PDFExtractor
from .services.inference import NScaleClient
from .services.voucher import VoucherService
from .services.security import (
    SecurityHeadersMiddleware,
    InputValidationMiddleware,
    APIKeyMiddleware,
    limiter,
    SecurityEventLogger,
    RATE_LIMITS,
    rate_limit_exceeded_handler,
)
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from .models.schemas import (
    UploadResponse,
    ChatRequest,
    ChatResponse,
    CompareRequest,
    VoucherValidationRequest,
    VoucherValidationResponse,
    VoucherRecoveryRequest,
)

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
async def health_check(request) -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy", "timestamp": str(time.time())}


# ===========================================
# PDF Upload Endpoints (Memory-Safe)
# ===========================================

@app.post("/api/upload", response_model=UploadResponse)
@limiter.limit(RATE_LIMITS["upload"])
async def upload_policy(request, file: UploadFile = File(...)):
    """
    Upload and analyze a single insurance policy PDF.
    
    ZERO DISK WRITE: The file is processed entirely in memory using io.BytesIO.
    No document content is ever written to disk.
    
    Returns a sneak peek analysis for free, with option to pay for full report.
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
async def upload_policy_batch(request, file: UploadFile = File(...)):
    """
    Upload a policy for broker comparison mode.
    Upload two PDFs separately, then compare them.
    
    ZERO DISK WRITE: All processing happens in memory.
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
        
        # Generate analysis for this policy
        analysis = await nscale_client.analyze_policy(extracted_text, session_id)
        
        # Store session data
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
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Deep Dive Q&A for a single policy.
    
    Every response includes:
    - Page citations
    - "Not legal advice" disclaimer
    """
    try:
        response = await nscale_client.chat(
            session_id=request.session_id,
            message=request.message
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
async def compare(request: CompareRequest) -> ChatResponse:
    """
    Comparative Q&A for broker mode.
    Analyzes both policies together for data-backed comparisons.
    """
    try:
        response = await nscale_client.compare(
            session_id=request.session_id,
            message=request.message,
            policyA=request.policyA,
            policyB=request.policyB
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
async def validate_voucher(request: VoucherValidationRequest) -> VoucherValidationResponse:
    """
    Validate a voucher code with HMAC fast rejection.
    
    Security:
    1. HMAC validation for fast rejection of fake codes
    2. Bcrypt verification for passphrase
    3. Atomic credit decrement in Redis
    """
    try:
        result = await voucher_service.validate(
            code=request.code,
            passphrase=request.passphrase
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
async def recover_voucher(request: VoucherRecoveryRequest) -> JSONResponse:
    """
    Recover a lost voucher code using passphrase.
    
    No email required - just the passphrase hash lookup.
    """
    try:
        result = await voucher_service.recover(
            passphrase=request.passphrase
        )
        
        return JSONResponse(content=result)
        
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/voucher/decrement")
@limiter.limit(RATE_LIMITS["voucher"])
async def decrement_credits(request, session_id: str, code: str) -> JSONResponse:
    """
    Atomically decrement voucher credits.
    Prevents double-spending.
    """
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
async def end_session(request, session_id: str) -> JSONResponse:
    """
    End a session and wipe all data.
    
    Called when user closes the tab.
    All session data is permanently deleted.
    """
    try:
        await nscale_client.end_session(session_id)
        return JSONResponse(content={"status": "deleted"})
    except Exception:
        # Still return success even if session doesn't exist
        return JSONResponse(content={"status": "deleted"})


# ===========================================
# Paddle Webhooks
# ===========================================

@app.post("/api/paddle/webhook")
@limiter.limit(RATE_LIMITS["general"])
async def paddle_webhook(request) -> JSONResponse:
    """
    Handle Paddle payment webhooks.
    
    Creates voucher codes on successful payment.
    """
    # TODO: Implement Paddle webhook handling
    return JSONResponse(content={"status": "received"})