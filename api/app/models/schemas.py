"""
ENZIU Pydantic Models / Schemas
All request/response models for the API.
"""

from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional, Literal, List, Any


# ===========================================
# Grade Models
# ===========================================

class Grade(BaseModel):
    """ENZIU Index grade structure."""
    overall: str = Field(..., description="Overall grade (A+ to F)")
    clarity: str = Field(..., description="Clarity score grade")
    coverage: str = Field(..., description="Coverage score grade")
    claimsEfficiency: str = Field(..., description="Claims efficiency grade")


# ===========================================
# Red Flag & Clause Models (Auditor output)
# ===========================================

class RedFlag(BaseModel):
    """Red flag from the ENZIU Auditor."""
    flag_id: str
    source: Literal["finding_triggered", "structural"]
    severity: Literal["critical", "major", "minor"]
    deduction: int
    page: int | None = None
    excerpt: str | None = None
    plain_english: str
    legal_basis: str = ""


class Exclusion(BaseModel):
    """Policy exclusion."""
    type: str
    summary: str
    page: int
    risk_level: Literal["low", "medium", "high"]
    excerpt: str | None = None


class Clause(BaseModel):
    """Policy clause with plain English explanation."""
    type: str
    summary: str
    page: int
    risk_level: Literal["low", "medium", "high"]


class InsightCard(BaseModel):
    """Pre-generated FAQ card from the ENZIU Auditor."""
    question: str
    answer: str
    category: Literal["risk", "savings", "action", "comparison", "explain"]
    priority: int = Field(..., ge=1, le=5)
    page: int | None = None
    excerpt: str | None = None  # Verbatim text from PDF that supports this insight


class ComparisonReady(BaseModel):
    """Comparison-ready fields from the ENZIU Auditor."""
    policy_type: str
    carrier_name: str | None = None
    policy_effective_date: str | None = None
    annual_premium_stated: float | None = None
    deductible_stated: float | None = None


# ===========================================
# Score Models (Auditor output sub-structure)
# ===========================================

class SubScores(BaseModel):
    reading_grade: int = 0
    jargon_density: int = 0
    definitions_completeness: int = 0
    passive_voice: int = 0
    navigability: int = 0


class ClarityScore(BaseModel):
    score: int = 0
    grade: str = "C"
    sub_scores: SubScores = Field(default_factory=SubScores)
    estimated_grade_level: int = 12
    reasoning: str = ""


class CoverageSubScores(BaseModel):
    exclusion_volume: int = 0
    waiting_period: int = 0
    sub_limit_transparency: int = 0
    pre_existing: int = 0
    renewability: int = 0


class CoverageScore(BaseModel):
    score: int = 0
    grade: str = "C"
    sub_scores: CoverageSubScores = Field(default_factory=CoverageSubScores)
    exclusion_count: int = 0
    reasoning: str = ""


class ClaimEfficiencySubScores(BaseModel):
    filing_clarity: int = 0
    appeal_rights: int = 0
    payout_timeline: int = 0
    dispute_resolution: int = 0


class ClaimEfficiencyScore(BaseModel):
    score: int = 0
    grade: str = "C"
    sub_scores: ClaimEfficiencySubScores = Field(default_factory=ClaimEfficiencySubScores)
    appeal_rights_present: bool = False
    payout_days_stated: int | None = None
    reasoning: str = ""


# ===========================================
# Upload / Analysis Models
# ===========================================

class AnalysisResult(BaseModel):
    """Complete ENZIU analysis result (auditor output + frontend glue)."""
    session_id: str
    grade: Grade
    topRisk: str
    redFlags: list[str] = []
    summary: str = ""
    detailedFlags: list[RedFlag] | None = None
    exclusions: list[Exclusion] | None = None
    clauses: list[Clause] | None = None
    insight_cards: list[InsightCard] | None = None
    clarity: ClarityScore | None = None
    coverage: CoverageScore | None = None
    claim_efficiency: ClaimEfficiencyScore | None = None
    total_deductions: int = 0
    plain_english_summary: str = ""
    comparison_ready: ComparisonReady | None = None


class UploadResponse(BaseModel):
    """Response for PDF upload / sneak peek."""
    session_id: str
    grade: Grade
    topRisk: str
    redFlags: list[str]
    summary: str
    policy_type: str = "other"
    carrier_name: str | None = None


# ===========================================
# Audit Models
# ===========================================

class AuditRequest(BaseModel):
    """Request for full policy audit (Phase 2)."""
    session_id: str
    extracted_text: str


class AuditResponse(BaseModel):
    """Response from full policy audit."""
    session_id: str
    report: dict[str, Any]


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
    mode: Literal["customer"] = "customer"
    step: str = "idle"
    created_at: float
    expires_at: float
    chats_remaining: int = 0
