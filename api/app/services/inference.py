"""
ENZIU Inference Service
Two-phase policy audit architecture:

  Phase 1 — ENZIU_EXTRACTOR (Scout 17B, 890K context):
    Extracts Step 0 facts (A–R) from raw policy text.
    Output: structured facts JSON. Cached per session.

  Phase 2 — ENZIU_AUDITOR (Llama 3.3 70B, 131K context):
    Scores facts and generates the full ENZIU report.
    Input: cached facts JSON. Output: full report with insight cards.

Single-pass architecture: Both phases run during sneak peek, full report
is cached and reused to prevent drift between preview and final output.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any, Dict

import httpx

from ..config import settings
from ..prompts import ENZIU_EXTRACTOR_PROMPT, ENZIU_AUDITOR_PROMPT

logger = logging.getLogger("inference")
logger.setLevel(logging.DEBUG if settings.debug else logging.INFO)

# ---------------------------------------------------------------------------
# Prompt injection patterns — stripped from all user-controlled text
# ---------------------------------------------------------------------------
_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?(previous|prior|above|foregoing)\s+instructions?", re.IGNORECASE),
    re.compile(r"you\s+are\s+now\s+\w+", re.IGNORECASE),
    re.compile(r"<\|im_start\|>|<\|im_end\|>", re.IGNORECASE),
    re.compile(r"^\s*(system|assistant|user)\s*:", re.IGNORECASE | re.MULTILINE),
    re.compile(r"\[system\]|\[assistant\]|\[user\]", re.IGNORECASE),
    re.compile(r"override\s+(the\s+)?(system\s+)?prompt", re.IGNORECASE),
    re.compile(r"disregard\s+(all\s+)?(previous\s+)?instructions", re.IGNORECASE),
    re.compile(r"new\s+instructions?\s*(:|=)", re.IGNORECASE),
    re.compile(r"\[/INST\]|<<KSYS>>|<</SYS>>"),
]


def _sanitize_injected_text(text: str, source: str = "") -> str:
    """Strip prompt injection patterns from user-controlled text."""
    if not text:
        return text
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    stripped_count = 0
    for pattern in _INJECTION_PATTERNS:
        before = len(cleaned)
        cleaned = pattern.sub("[REDACTED]", cleaned)
        stripped_count += before - len(cleaned)
    if stripped_count > 0:
        logger.warning(
            f"Prompt injection sanitized ({source}): {stripped_count} chars stripped. "
            f"Original first 200 chars: {text[:200]}"
        )
    return cleaned


# ---------------------------------------------------------------------------
# Boolean normalization
# ---------------------------------------------------------------------------

def _to_bool(value: Any) -> bool:
    """
    Normalize boolean fields that LLMs may emit as strings.
    Treats true/"true"/"TRUE"/"YES"/"yes"/1 as True.
    Treats false/"false"/"FALSE"/"NO"/"no"/0/null/None as False.
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value != 0
    if isinstance(value, str):
        return value.strip().upper() in ("TRUE", "YES", "1")
    return False


def _normalize_facts_booleans(facts: Dict[str, Any]) -> Dict[str, Any]:
    """
    Walk the facts dict and coerce all known boolean fields to real Python bools.
    This is a defensive pass — it fixes string booleans emitted by the LLM
    despite the prompt instructing otherwise.
    """
    # Top-level YES/NO string fields — keep as strings (Auditor reads them as
    # strings and normalizes itself), but ensure uppercase.
    for key in ("definitions_section", "table_of_contents", "section_numbering",
                "page_cross_references"):
        if key in facts and isinstance(facts[key], str):
            facts[key] = facts[key].strip().upper()

    # waiting_period.found
    wp = facts.get("waiting_period")
    if isinstance(wp, dict) and "found" in wp:
        wp["found"] = _to_bool(wp["found"])

    # appeal_rights.present, appeal_rights.timeline_days_stated
    ar = facts.get("appeal_rights")
    if isinstance(ar, dict):
        if "present" in ar:
            ar["present"] = _to_bool(ar["present"])
        if "timeline_days_stated" in ar:
            ar["timeline_days_stated"] = _to_bool(ar["timeline_days_stated"])

    # payout_timeline.found
    pt = facts.get("payout_timeline")
    if isinstance(pt, dict) and "found" in pt:
        pt["found"] = _to_bool(pt["found"])

    # regulator_reference.present
    rr = facts.get("regulator_reference")
    if isinstance(rr, dict) and "present" in rr:
        rr["present"] = _to_bool(rr["present"])

    return facts


def _normalize_report_booleans(report: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize boolean fields in the Auditor's output report.
    Specifically fixes appeal_rights_present which must be a real bool.
    Also ensures total_deductions is a positive integer.
    """
    ce = report.get("claim_efficiency")
    if isinstance(ce, dict) and "appeal_rights_present" in ce:
        ce["appeal_rights_present"] = _to_bool(ce["appeal_rights_present"])

    # Ensure total_deductions is a non-negative integer
    td = report.get("total_deductions")
    if td is not None:
        try:
            td_int = int(td)
            report["total_deductions"] = abs(td_int)  # always positive
        except (TypeError, ValueError):
            report["total_deductions"] = 0

    # Ensure each red_flag deduction is a positive integer
    for flag in report.get("red_flags", []):
        if isinstance(flag, dict) and "deduction" in flag:
            try:
                flag["deduction"] = abs(int(flag["deduction"]))
            except (TypeError, ValueError):
                flag["deduction"] = 0

    return report


def _validate_and_fix_report(report: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate and fix the Auditor's output report for consistency.
    
    This function:
    1. Filters out finding_triggered red flags with empty excerpts (structural flags allow null)
    2. Filters out insight cards with empty excerpts (per prompt: must have page citation)
    3. Recalculates enziu_index to ensure mathematical consistency
    4. Recalculates grade to match the index
    5. Recalculates total_deductions from remaining flags
    """
    # 1. Filter out finding_triggered red flags with empty excerpts
    # Per prompt: finding_triggered flags require verbatim excerpt
    # Structural flags may have excerpt=null (no verbatim text available)
    red_flags = report.get("red_flags", [])
    valid_red_flags = []
    for flag in red_flags:
        if isinstance(flag, dict):
            source = flag.get("source", "")
            excerpt = flag.get("excerpt")
            
            # Structural flags can have null excerpt per v3.0 spec
            if source == "structural":
                valid_red_flags.append(flag)
            # Finding-triggered flags require non-empty excerpt
            elif excerpt and excerpt.strip():
                valid_red_flags.append(flag)
            else:
                logger.warning(
                    f"Removing red flag '{flag.get('flag_id', 'unknown')}' "
                    f"due to empty excerpt (source: {source})"
                )
    report["red_flags"] = valid_red_flags

    # 2. Filter out insight cards with empty excerpts
    # Per prompt line 270: "if you cannot cite a specific page, do not create the card"
    # and line 382: excerpt is required
    insight_cards = report.get("insight_cards", [])
    valid_insight_cards = []
    for card in insight_cards:
        if isinstance(card, dict):
            excerpt = card.get("excerpt", "")
            # Keep card if it has a non-empty excerpt
            if excerpt and excerpt.strip():
                valid_insight_cards.append(card)
            else:
                logger.warning(
                    f"Removing insight card '{card.get('question', 'unknown')[:50]}' "
                    f"due to empty excerpt"
                )
    report["insight_cards"] = valid_insight_cards

    # 3. Recalculate total_deductions from remaining flags
    total_deductions = sum(
        flag.get("deduction", 0) for flag in valid_red_flags
    )
    # Cap at 40, floor at 0 (per prompt line 212)
    total_deductions = max(0, min(40, total_deductions))
    report["total_deductions"] = total_deductions

    # 4. Calculate base_score from dimension scores
    clarity = report.get("clarity", {})
    coverage = report.get("coverage", {})
    claim_efficiency = report.get("claim_efficiency", {})
    
    clarity_score = clarity.get("score", 0)
    coverage_score = coverage.get("score", 0)
    claims_score = claim_efficiency.get("score", 0)
    
    base_score = clarity_score + coverage_score + claims_score

    # 5. Recalculate enziu_index: base_score - total_deductions (floor 0)
    enziu_index = max(0, base_score - total_deductions)
    report["enziu_index"] = enziu_index

    # 6. Recalculate grade to match the index
    overall_grade = _index_to_grade(enziu_index)
    
    # Update grade object
    grade = report.get("grade", {})
    grade["overall"] = overall_grade
    
    # Also validate per-dimension grades
    clarity_pct = (clarity_score / 30) * 100 if clarity_score > 0 else 0
    coverage_pct = (coverage_score / 40) * 100 if coverage_score > 0 else 0
    claims_pct = (claims_score / 30) * 100 if claims_score > 0 else 0
    
    grade["clarity"] = _index_to_grade(int(clarity_pct))
    grade["coverage"] = _index_to_grade(int(coverage_pct))
    grade["claimsEfficiency"] = _index_to_grade(int(claims_pct))
    
    report["grade"] = grade

    # 7. Update score_preview based on overall grade
    report["score_preview"] = _grade_to_score_preview(overall_grade)

    logger.info(
        f"Report validation complete — "
        f"enziu_index={enziu_index}, grade={overall_grade}, "
        f"base_score={base_score}, deductions={total_deductions}, "
        f"red_flags={len(valid_red_flags)}, insight_cards={len(valid_insight_cards)}"
    )

    return report


# ---------------------------------------------------------------------------
# Grade helpers (mirrors front-end gradeToPercentage)
# ---------------------------------------------------------------------------

# All grades the Auditor can produce (Step 5 band table)
_GRADE_BANDS = ("A+", "A", "B+", "B", "C+", "C", "D", "F")

_GRADE_SCORE_MAP: dict[str, int] = {
    "A+": 95, "A": 85, "B+": 77, "B": 72,
    "C+": 67, "C": 62, "D": 55, "F": 30,
}


def _index_to_grade(index: int) -> str:
    """Convert a numeric ENZIU index to its letter grade band."""
    if index >= 90:
        return "A+"
    if index >= 80:
        return "A"
    if index >= 75:
        return "B+"
    if index >= 70:
        return "B"
    if index >= 65:
        return "C+"
    if index >= 60:
        return "C"
    if index >= 50:
        return "D"
    return "F"


def _grade_to_score_preview(grade: str) -> str:
    if grade in ("A+", "A"):
        return "high"
    if grade in ("B+", "B", "C+"):
        return "medium"
    return "low"


# ---------------------------------------------------------------------------
# JSON repair
# ---------------------------------------------------------------------------

def _safe_parse_json(raw: str, log_prefix: str = "") -> Dict[str, Any]:
    """
    Robust JSON extraction from LLM output.
    Handles markdown fences, trailing commas, truncation, and extra text.
    """
    if not raw or not raw.strip():
        raise ValueError("Empty response from LLM")

    cleaned = raw.strip()
    cleaned = cleaned.removeprefix("```json").removeprefix("```")
    cleaned = cleaned.removesuffix("```").strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end < start:
        if log_prefix:
            logger.warning(f"{log_prefix} no JSON found; raw (2000 chars): {raw[:2000]}")
        raise ValueError("No JSON object found in response")

    cleaned = cleaned[start:end + 1]

    # Fix single-quoted keys
    cleaned = re.sub(r"'([^'\"\s]+)'\s*:", r'"\1":', cleaned)
    # Remove trailing commas before } or ]
    cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)

    # Fix unterminated strings (truncated output)
    in_string = escaped = False
    for ch in cleaned:
        if escaped:
            escaped = False
            continue
        if ch == "\\":
            escaped = True
            continue
        if ch == '"':
            in_string = not in_string
    if in_string:
        cleaned += '"'
        cleaned += "}" * max(0, cleaned.count("{") - cleaned.count("}"))
        cleaned += "]" * max(0, cleaned.count("[") - cleaned.count("]"))

    if log_prefix:
        logger.debug(f"{log_prefix} cleaned JSON (first 500 chars): {cleaned[:500]}")

    return json.loads(cleaned)


# ---------------------------------------------------------------------------
# Fallback facts — always uses real Python booleans
# ---------------------------------------------------------------------------

def _fallback_facts() -> Dict[str, Any]:
    return {
        "policy_type": "other",
        "carrier_name": None,
        "word_count": 0,
        "page_count": 0,
        "definitions_section": "NO",
        "capitalized_terms": [],
        "defined_terms": [],
        "exclusions": [],
        "table_of_contents": "NO",
        "section_numbering": "NO",
        "page_cross_references": "NO",
        "waiting_period": {"found": False, "page": None, "quote": None, "days": None},
        "sub_limits": {"location": "ABSENT", "items": []},
        "appeal_rights": {"present": False, "timeline_days_stated": False},
        "payout_timeline": {"found": False, "quote": None, "days": None},
        "regulator_reference": {"present": False, "quote": None, "page": None},
        "risk_findings": [],
        "financial_terms": {
            "annual_premium": None,
            "deductible": None,
            "policy_effective_date": None,
            "carrier_name": None,
        },
    }


def _error_report(message: str) -> Dict[str, Any]:
    """Minimal valid report structure for error cases."""
    return {
        "enziu_index": 0,
        "grade": {
            "overall": "C",
            "clarity": "C",
            "coverage": "C",
            "claimsEfficiency": "C"
        },
        "score_preview": "medium",
        "clarity": {"score": 0, "grade": "C", "sub_scores": {}, "estimated_grade_level": 12, "reasoning": message},
        "coverage": {"score": 0, "grade": "C", "sub_scores": {}, "exclusion_count": 0, "reasoning": message},
        "claim_efficiency": {"score": 0, "grade": "C", "sub_scores": {}, "appeal_rights_present": False, "payout_days_stated": None, "reasoning": message},
        "red_flags": [],
        "exclusions": [],
        "clauses": [],
        "insight_cards": [],
        "total_deductions": 0,
        "plain_english_summary": "Document could not be processed.",
        "comparison_ready": {"policy_type": "unknown", "carrier_name": None, "policy_effective_date": None, "annual_premium_stated": None, "deductible_stated": None},
        "error": message,
    }


def _transform_report_for_frontend(report: Dict[str, Any]) -> Dict[str, Any]:
    """
    Transform Auditor output to match frontend expectations.
    Maps backend field names to frontend-expected names.
    """
    # Create a copy to avoid mutating the cached report
    transformed = report.copy()
    
    # Map red_flags → detailedFlags
    if "red_flags" in transformed:
        transformed["detailedFlags"] = transformed["red_flags"]
    
    # Map plain_english_summary → summary
    if "plain_english_summary" in transformed:
        transformed["summary"] = transformed["plain_english_summary"]
    
    return transformed


# ---------------------------------------------------------------------------
# InferenceClient
# ---------------------------------------------------------------------------

class InferenceClient:
    """
    Two-phase inference client for ENZIU policy audits.

    Phase 1 — Extractor: Scout 17B (890K context)
    Phase 2 — Auditor:   Llama 3.3 70B (131K context)

    Single-pass architecture: Both phases run during sneak peek.
    Full report is cached and reused to prevent drift.
    """

    def __init__(self) -> None:
        self.api_key = settings.inference_api_key
        self.api_base = settings.inference_api_base
        self.extractor_model = settings.inference_model
        self.auditor_model = settings.auditor_model
        self.headers: dict[str, str] = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        self._session_cache: dict[str, Dict[str, Any]] = {}
        self._report_cache: dict[str, Dict[str, Any]] = {}
        logger.info(
            f"InferenceClient initialized — "
            f"extractor={self.extractor_model}, auditor={self.auditor_model}"
        )

    # ── Core HTTP ────────────────────────────────────────────────────────

    async def _complete(
        self,
        prompt: str,
        system_prompt: str = "You are a helpful insurance policy analyst.",
        temperature: float = 0.0,
        max_tokens: int = 2000,
        timeout: float = 55.0,
        max_retries: int = 1,
        model: str | None = None,
    ) -> str:
        model_name = model or self.extractor_model
        payload: dict[str, Any] = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        last_error: Exception = Exception("Failed to get response from Inference API")

        for attempt in range(max_retries):
            if attempt > 0:
                backoff = 2 ** attempt
                logger.warning(f"Retry {attempt}/{max_retries} after {backoff}s")
                await asyncio.sleep(backoff)

            try:
                logger.info(
                    f"Inference request (attempt {attempt + 1}/{max_retries}) "
                    f"model={model_name}, timeout={timeout}s"
                )
                logger.debug(f"LLM prompt ({len(prompt)} chars, first 500): {prompt[:500]}")
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.post(
                        f"{self.api_base}/chat/completions",
                        headers=self.headers,
                        json=payload,
                    )

                if response.status_code == 200:
                    data = response.json()
                    if "choices" in data and data["choices"]:
                        content = data["choices"][0]["message"]["content"]
                        if content is None:
                            raise Exception("Model returned null content — will retry")
                        logger.info(f"Response received — {len(content)} chars")
                        return content
                    raise Exception(f"Malformed response: {list(data.keys())}")

                error_text = response.text[:500] if response.text else "No response body"
                logger.error(f"Inference API error: {response.status_code} — {error_text}")
                if 400 <= response.status_code < 500 and response.status_code != 429:
                    raise Exception(f"Inference API {response.status_code}: {error_text}")
                last_error = Exception(f"Inference API {response.status_code}: {error_text}")

            except (httpx.ConnectTimeout, httpx.ReadTimeout) as e:
                logger.error(f"Timeout on attempt {attempt + 1}: {type(e).__name__}")
                last_error = Exception(
                    f"Inference timed out after {timeout}s. "
                    "The model may be under load — please try again."
                )
            except httpx.HTTPError as e:
                logger.error(f"HTTP error on attempt {attempt + 1}: {e}")
                last_error = e
            except Exception as e:
                if any(k in str(e) for k in ("Inference API", "Malformed response")):
                    raise
                logger.error(f"Unexpected error on attempt {attempt + 1}: {e}")
                last_error = e

        raise last_error

    # ── Phase 1: Fact Extraction ─────────────────────────────────────────

    async def extract_facts(self, text: str, session_id: str) -> Dict[str, Any]:
        """
        Phase 1 — Run ENZIU Extractor on raw policy text.
        Caches normalized facts JSON in-memory for the session lifetime.
        """
        start_time = time.time()
        logger.info(f"extract_facts() — session={session_id}, chars={len(text)}")

        if session_id in self._session_cache:
            logger.info(f"Returning cached facts for session={session_id}")
            return self._session_cache[session_id]

        try:
            safe_text = _sanitize_injected_text(text, "extractor_pdf")
            prompt = (
                f"{ENZIU_EXTRACTOR_PROMPT}\n\n"
                f"<document>\n{safe_text}\n</document>\n\nExtraction:"
            )

            raw = await self._complete(
                prompt=prompt,
                system_prompt=(
                    "You are ENZIU Extractor. Return ONLY valid JSON. "
                    "All boolean fields must be JSON literals true or false — "
                    "never strings. No preamble. No markdown."
                ),
                max_tokens=8000,
                timeout=300.0,
                max_retries=2,
                temperature=0.0,
                model=self.extractor_model,
            )

            facts = _safe_parse_json(raw, log_prefix="Extractor")
            if isinstance(facts, str):
                facts = json.loads(facts)
            if not isinstance(facts, dict):
                raise ValueError(
                    f"Expected JSON object from Extractor, got {type(facts).__name__}. "
                    f"Raw (first 500 chars): {str(facts)[:500]}"
                )

            # Defensive normalization — fixes any string booleans the LLM emitted
            facts = _normalize_facts_booleans(facts)

            elapsed = time.time() - start_time
            logger.info(
                f"Fact extraction complete — session={session_id}, "
                f"policy_type={facts.get('policy_type', '?')}, "
                f"time={elapsed:.2f}s"
            )

            # DEBUG: Print full Extractor JSON response for debugging
            print(f"\n{'='*80}")
            print(f"=== EXTRACTOR JSON RESPONSE (session={session_id}) ===")
            print(json.dumps(facts, indent=2, ensure_ascii=False)[:10000])  # Limit to 10K chars
            print(f"=== END EXTRACTOR JSON ===")
            print(f"{'='*80}\n")

            self._session_cache[session_id] = facts
            return facts

        except Exception as e:
            elapsed = time.time() - start_time
            logger.error(
                f"Fact extraction failed after {elapsed:.2f}s: "
                f"{type(e).__name__}: {e}",
                exc_info=True,
            )
            return _fallback_facts()

    # ── Sneak Peek (Single-Pass: Extraction + Audit) ─────────────────────

    async def analyze_sneak_peek(self, text: str, session_id: str) -> Dict[str, Any]:
        """
        Sneak Peek — runs Phase 1 extraction AND Phase 2 audit, caches the full report,
        and returns a lightweight preview PLUS the full report for client-side caching.
        This ensures consistency (no drift) between sneak peek and full report since
        both use the same audit result. The full report is returned so the client can
        cache it encrypted — eliminating delay after payment.
        """
        logger.info(f"analyze_sneak_peek() — session={session_id}")

        try:
            # Run full audit (extraction + scoring) and cache the result
            full_report = await self.process_document(text, session_id)

            # Check if audit returned an error
            if "error" in full_report:
                # Extract facts for basic info
                facts = await self.extract_facts(text, session_id)
                policy_type = facts.get("policy_type", "other")
                carrier_name = facts.get("carrier_name") or (
                    facts.get("financial_terms") or {}
                ).get("carrier_name")
                return {
                    "grade": {"overall": "C", "clarity": "C", "coverage": "C", "claimsEfficiency": "C"},
                    "topRisk": full_report.get("error", "Document error"),
                    "redFlags": ["Analysis unavailable"],
                    "summary": "Unable to analyze this document.",
                    "score_preview": "medium",
                    "policy_type": policy_type,
                    "carrier_name": carrier_name,
                    "full_report": full_report,  # Return error report for consistency
                }

            # Extract sneak peek data from the full cached report
            grade = full_report.get("grade", {})
            overall_grade = grade.get("overall", "C")
            score_preview = full_report.get("score_preview", "medium")

            # Get top risk from red flags
            red_flags = full_report.get("red_flags", [])
            if red_flags:
                top_risk = red_flags[0].get("plain_english", "Red flag detected")
                red_flag_names = [
                    flag.get("plain_english", flag.get("flag_id", ""))
                    for flag in red_flags[:3]
                ]
            else:
                exclusion_count = full_report.get("coverage", {}).get("exclusion_count", 0)
                top_risk = (
                    f"{exclusion_count} material exclusion(s)"
                    if exclusion_count > 0
                    else "No major red flags detected"
                )
                red_flag_names = []

            policy_type = full_report.get("comparison_ready", {}).get("policy_type", "other")
            carrier_name = full_report.get("comparison_ready", {}).get("carrier_name")

            # Return preview + full report for client-side encrypted caching
            return {
                "grade": grade,
                "topRisk": top_risk,
                "redFlags": red_flag_names,
                "summary": full_report.get("plain_english_summary", "Preview from extracted facts."),
                "score_preview": score_preview,
                "policy_type": policy_type,
                "carrier_name": carrier_name,
                "full_report": full_report,  # Full report for instant access after payment
            }

        except Exception as e:
            logger.error(f"Sneak peek error: {e}", exc_info=True)
            return {
                "grade": {"overall": "C", "clarity": "C", "coverage": "C", "claimsEfficiency": "C"},
                "topRisk": "Unable to analyze at this time",
                "redFlags": ["Analysis in progress"],
                "summary": "Full analysis available after payment.",
                "score_preview": "medium",
                "policy_type": "other",
                "carrier_name": None,
            }

    # ── Phase 2: Full Policy Audit ────────────────────────────────────────

    async def process_document(self, text: str, session_id: str) -> Dict[str, Any]:
        """
        Phase 2 — Run ENZIU Auditor on cached facts.
        Ensures facts are extracted first (reads from cache if available).
        Returns full ENZIU report JSON per the auditor schema.
        
        Single-pass architecture: If the report is already cached from
        analyze_sneak_peek(), returns the cached result to prevent drift.
        """
        start_time = time.time()
        logger.info(f"process_document() — session={session_id}")

        # Check if we already have a cached full report (from sneak peek)
        if session_id in self._report_cache:
            logger.info(f"Returning cached full report for session={session_id}")
            return self._report_cache[session_id].copy()

        try:
            facts = await self.extract_facts(text, session_id)

            if "error" in facts:
                error_msg = facts["error"]
                logger.warning(f"Facts contain error: {error_msg}")
                error_report = _error_report(str(error_msg))
                self._report_cache[session_id] = error_report
                return error_report

            facts_json = json.dumps({"facts": facts}, ensure_ascii=False)
            prompt = f"{ENZIU_AUDITOR_PROMPT}\n\n{facts_json}\n\nAudit:"

            raw = await self._complete(
                prompt=prompt,
                system_prompt=(
                    "You are ENZIU Auditor. Return ONLY valid JSON. "
                    "All boolean fields must be JSON literals true or false. "
                    "The deduction field on each red flag is a positive integer. "
                    "total_deductions is a positive integer. "
                    "No preamble. No markdown."
                ),
                max_tokens=16000,  # Increased to prevent summary truncation
                timeout=420.0,
                max_retries=2,
                temperature=0.0,
                model=self.auditor_model,
            )

            report = _safe_parse_json(raw, log_prefix="Auditor")
            if isinstance(report, str):
                report = json.loads(report)
            if not isinstance(report, dict):
                raise ValueError(
                    f"Expected JSON object from Auditor, got {type(report).__name__}. "
                    f"Raw (first 500 chars): {str(report)[:500]}"
                )

            # Defensive normalization of report output
            report = _normalize_report_booleans(report)

            # Validate and fix report for consistency (excerpts, index calculation, grades)
            report = _validate_and_fix_report(report)

            # DEBUG: Print full Auditor JSON response for debugging
            print(f"\n{'='*80}")
            print(f"=== AUDITOR JSON RESPONSE (session={session_id}) ===")
            print(json.dumps(report, indent=2, ensure_ascii=False)[:15000])  # Limit to 15K chars
            print(f"=== END AUDITOR JSON ===")
            print(f"{'='*80}\n")

            # Cache the full report for reuse (prevents drift)
            self._report_cache[session_id] = report

            elapsed = time.time() - start_time
            logger.info(
                f"Full audit complete — session={session_id}, "
                f"grade={report.get('grade', {}).get('overall', '?')}, "
                f"time={elapsed:.2f}s"
            )
            return report

        except Exception as e:
            elapsed = time.time() - start_time
            logger.error(
                f"Full audit failed after {elapsed:.2f}s: {type(e).__name__}: {e}",
                exc_info=True,
            )
            error_report = _error_report("Unable to analyze policy completely.")
            self._report_cache[session_id] = error_report
            return error_report

    # ── Get Transformed Report for Frontend ───────────────────────────────

    async def get_frontend_report(self, text: str, session_id: str) -> Dict[str, Any]:
        """
        Get the full audit report transformed for frontend consumption.
        Runs the audit if not already cached, then applies field aliasing.
        """
        # Get or compute the full report
        report = await self.process_document(text, session_id)
        
        # Transform for frontend compatibility
        return _transform_report_for_frontend(report)

    # ── Session management ───────────────────────────────────────────────

    def clear_session(self, session_id: str) -> None:
        self._session_cache.pop(session_id, None)
        self._report_cache.pop(session_id, None)
        logger.info(f"Session cache cleared: {session_id}")

    async def store_session(self, session_id: str, data: dict[str, Any]) -> None:
        pass  # TODO: Upstash Redis

    async def mark_session_paid(self, session_id: str) -> None:
        logger.info(f"Session marked as paid: {session_id}")

    async def check_session_payment(self, session_id: str) -> bool:
        return False  # TODO: Upstash Redis

    async def end_session(self, session_id: str) -> None:
        self.clear_session(session_id)