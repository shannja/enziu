"""
ENZIU Security Middleware
Rate limiting, input validation, security headers, and authentication.
"""

from __future__ import annotations

import logging
import re
import time
from typing import Callable, Awaitable

from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from ..config import settings

# Configure security logging
logger = logging.getLogger("security")
logger.setLevel(logging.INFO)

# Create console handler
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
formatter = logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)


# ===========================================
# Rate Limiting Configuration
# ===========================================

# Initialize rate limiter
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[
        f"{settings.rate_limit_general}/minute"
    ]
)

# Rate limits for different endpoint types
RATE_LIMITS = {
    "upload": f"{settings.rate_limit_upload}/minute",  # Expensive AI processing
    "chat": f"{settings.rate_limit_chat}/minute",      # AI inference
    "voucher": f"{settings.rate_limit_voucher}/minute", # Financial operations
    "health": f"{settings.rate_limit_health}/minute",   # Health checks
}


# ===========================================
# Security Headers Middleware
# ===========================================

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""
    
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[JSONResponse]]
    ) -> JSONResponse:
        response = await call_next(request)
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Content Security Policy
        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdn.paddle.com; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data:; "
            "connect-src 'self' https://api.nscale.com https://api.paddle.com; "
            "frame-ancestors 'none'; "
            "form-action 'self'; "
            "base-uri 'self';"
        )
        response.headers["Content-Security-Policy"] = csp
        
        # HSTS (only in production)
        if not settings.debug:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )
        
        # Remove server header
        response.headers.pop("Server", None)
        response.headers.pop("X-Powered-By", None)
        
        return response


# ===========================================
# Input Validation Middleware
# ===========================================

class InputValidationMiddleware(BaseHTTPMiddleware):
    """Validate and sanitize all incoming requests."""
    
    # Maximum request size (10MB for file uploads)
    MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB
    
    # Allowed file extensions
    ALLOWED_EXTENSIONS = {'.pdf'}
    
    # Maximum string length for text inputs
    MAX_STRING_LENGTH = 10000
    
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[JSONResponse]]
    ) -> JSONResponse:
        # Check content length
        content_length = request.headers.get("Content-Length")
        if content_length and int(content_length) > self.MAX_UPLOAD_SIZE:
            logger.warning(
                f"Request too large from {request.client.host}: {content_length} bytes"
            )
            return JSONResponse(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                content={"detail": "Request entity too large"}
            )
        
        # Validate content type for POST/PUT requests
        if request.method in ["POST", "PUT"]:
            content_type = request.headers.get("Content-Type", "")
            
            # Allow multipart for file uploads
            if "/upload" in request.url.path:
                if "multipart/form-data" not in content_type:
                    logger.warning(
                        f"Invalid content type for upload from {request.client.host}: {content_type}"
                    )
                    return JSONResponse(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        content={"detail": "Content-Type must be multipart/form-data for file uploads"}
                    )
            # Allow JSON for other endpoints
            elif "application/json" not in content_type:
                logger.warning(
                    f"Invalid content type from {request.client.host}: {content_type}"
                )
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content={"detail": "Content-Type must be application/json"}
                )
        
        # Log suspicious requests
        user_agent = request.headers.get("User-Agent", "")
        if self._is_suspicious_user_agent(user_agent):
            logger.warning(
                f"Suspicious user agent from {request.client.host}: {user_agent[:100]}"
            )
        
        return await call_next(request)
    
    def _is_suspicious_user_agent(self, user_agent: str) -> bool:
        """Check for suspicious user agents."""
        if not user_agent:
            return True
        
        # Common suspicious patterns
        suspicious_patterns = [
            r'sqlmap',
            r'nikto',
            r'nmap',
            r'masscan',
            r'python-requests',
            r'curl',
            r'wget',
        ]
        
        for pattern in suspicious_patterns:
            if re.search(pattern, user_agent, re.IGNORECASE):
                return True
        
        return False


# ===========================================
# Authentication Middleware
# ===========================================

class APIKeyMiddleware(BaseHTTPMiddleware):
    """Validate API keys for protected endpoints."""
    
    # Endpoints that require API key authentication
    PROTECTED_ENDPOINTS = {
        "/api/voucher/validate",
        "/api/voucher/recover",
        "/api/voucher/decrement",
    }
    
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[JSONResponse]]
    ) -> JSONResponse:
        # Skip authentication for protected endpoints in development
        if settings.debug:
            return await call_next(request)
        
        # Check if endpoint requires authentication
        if request.url.path in self.PROTECTED_ENDPOINTS:
            api_key = request.headers.get("X-API-Key")
            
            if not api_key:
                logger.warning(
                    f"Missing API key for {request.url.path} from {request.client.host}"
                )
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "API key required"}
                )
            
            # Validate API key (in production, check against stored keys)
            if not self._validate_api_key(api_key):
                logger.warning(
                    f"Invalid API key for {request.url.path} from {request.client.host}"
                )
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={"detail": "Invalid API key"}
                )
        
        return await call_next(request)
    
    def _validate_api_key(self, api_key: str) -> bool:
        """Validate API key format and value."""
        # Basic format validation
        if not api_key or len(api_key) < 32:
            return False
        
        # In production, validate against stored API keys
        # For now, accept any key that meets minimum length
        return True


# ===========================================
# Security Event Logger
# ===========================================

class SecurityEventLogger:
    """Log security-related events for monitoring."""
    
    @staticmethod
    def log_rate_limit_exceeded(endpoint: str, ip: str):
        """Log rate limit violations."""
        logger.warning(
            f"Rate limit exceeded: endpoint={endpoint}, ip={ip}, time={time.time()}"
        )
    
    @staticmethod
    def log_authentication_failure(endpoint: str, ip: str, reason: str):
        """Log authentication failures."""
        logger.warning(
            f"Authentication failure: endpoint={endpoint}, ip={ip}, reason={reason}, time={time.time()}"
        )
    
    @staticmethod
    def log_suspicious_activity(activity: str, ip: str, details: str = ""):
        """Log suspicious activity."""
        logger.warning(
            f"Suspicious activity: {activity}, ip={ip}, details={details}, time={time.time()}"
        )
    
    @staticmethod
    def log_file_upload(filename: str, size: int, ip: str):
        """Log file uploads for audit trail."""
        logger.info(
            f"File uploaded: filename={filename}, size={size}, ip={ip}, time={time.time()}"
        )


# ===========================================
# Rate Limit Exceeded Handler
# ===========================================

def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Custom handler for rate limit exceeded exceptions."""
    # Log the rate limit violation
    SecurityEventLogger.log_rate_limit_exceeded(
        endpoint=str(request.url.path),
        ip=request.client.host if request.client else "unknown"
    )
    
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Rate limit exceeded. Please try again later.",
            "error": "too_many_requests"
        },
        headers={
            "Retry-After": str(exc.detail.retry_after) if hasattr(exc.detail, 'retry_after') else "60"
        }
    )
