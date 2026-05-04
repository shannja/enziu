"""
ENZIU Pydantic Models / Schemas
All request/response models for the API.
"""

from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional, Literal


# ===========================================
# Grade Models
# ===========================================

class Grade(BaseModel):
    """ENZIU Index grade structure."""
    overall: str = Field(..., description="Overall grade (A+ to F)")
    clarity: str = Field(..., description="Clarity score grade")
    coverage: str = Field(..., description="Coverage score grade")
    claimsEfficiency: str = Field(..., description="Claims efficiency grade")


class RedFlag(BaseModel):
    """Red flag with citation."""
    name: str
    severity: Literal["high", "medium", "low"]
    page: int
    quote: str


class Clause(BaseModel):
    """Policy clause with plain English explanation."""
    id: str
    type: str
    page: int
    text: str
    plainEnglish: str
    concern: str | None = None


# ===========================================
# Upload / Analysis Models
# ===========================================

class AnalysisResult(BaseModel):
    """Complete analysis result for a policy."""
    session_id: str
    grade: Grade
    topRisk: str
    redFlags: list[str]
    summary: str
    detailedFlags: list[RedFlag] | None = None
    clauses: list[Clause] | None = None


class UploadResponse(BaseModel):
    """Response for PDF upload endpoint."""
    session_id: str
    grade: Grade
    topRisk: str
    redFlags: list[str]
    summary: str


# ===========================================
# Chat Models
# ===========================================

class ChatRequest(BaseModel):
    """Request for Deep Dive chat."""
    session_id: str
    message: str


class ChatResponse(BaseModel):
    """Response from Deep Dive chat."""
    response: str
    page: int | None = None
    disclaimer: str = "page X — not legal advice"


class PolicySummary(BaseModel):
    """Summary of a policy for comparison."""
    grade: Grade
    summary: str


class CompareRequest(BaseModel):
    """Request for comparative analysis."""
    session_id: str
    message: str
    policyA: PolicySummary
    policyB: PolicySummary


# ===========================================
# Voucher Models
# ===========================================

class VoucherValidationRequest(BaseModel):
    """Request to validate a voucher."""
    code: str
    passphrase: str


class VoucherValidationResponse(BaseModel):
    """Response from voucher validation."""
    valid: bool
    credits: int | None = None
    packType: str | None = None
    error: str | None = None


class VoucherRecoveryRequest(BaseModel):
    """Request to recover a voucher code."""
    passphrase: str


# ===========================================
# Session Models
# ===========================================

class SessionState(BaseModel):
    """Session state stored in Redis."""
    session_id: str
    mode: Literal["customer", "broker"]
    step: str = "idle"
    created_at: float
    expires_at: float
    chats_remaining: int = 5