"""
ENZIU Inference Service
Two-phase policy audit architecture:

  Phase 1 — ENZIU_EXTRACTOR (Scout 17B, 890K context):
    Extracts Step 0 facts (A–R) from raw policy text.
    Output: structured facts JSON. Cached per session.

  Phase 2 — ENZIU_AUDITOR (Llama 3.3 70B, 131K context):
    Scores facts and generates the full ENZIU report.
    Input: cached facts JSON. Output: full report including insight_cards.

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
# Prompt injection patterns
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
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value != 0
    if isinstance(value, str):
        return value.strip().upper() in ("TRUE", "YES", "1")
    return False


def _normalize_facts_booleans(facts: Dict[str, Any]) -> Dict[str, Any]:
    for key in ("definitions_section", "table_of_contents", "section_numbering",
                "page_cross_references"):
        if key in facts and isinstance(facts[key], str):
            facts[key] = facts[key].strip().upper()

    wp = facts.get("waiting_period")
    if isinstance(wp, dict) and "found" in wp:
        wp["found"] = _to_bool(wp["found"])

    ar = facts.get("appeal_rights")
    if isinstance(ar, dict):
        if "present" in ar:
            ar["present"] = _to_bool(ar["present"])
        if "timeline_days_stated" in ar:
            ar["timeline_days_stated"] = _to_bool(ar["timeline_days_stated"])

    pt = facts.get("payout_timeline")
    if isinstance(pt, dict) and "found" in pt:
        pt["found"] = _to_bool(pt["found"])

    rr = facts.get("regulator_reference")
    if isinstance(rr, dict) and "present" in rr:
        rr["present"] = _to_bool(rr["present"])

    return facts


def _normalize_report_booleans(report: Dict[str, Any]) -> Dict[str, Any]:
    ce = report.get("claim_efficiency")
    if isinstance(ce, dict) and "appeal_rights_present" in ce:
        ce["appeal_rights_present"] = _to_bool(ce["appeal_rights_present"])

    td = report.get("total_deductions")
    if td is not None:
        try:
            report["total_deductions"] = abs(int(td))
        except (TypeError, ValueError):
            report["total_deductions"] = 0

    for flag in report.get("red_flags", []):
        if isinstance(flag, dict) and "deduction" in flag:
            try:
                flag["deduction"] = abs(int(flag["deduction"]))
            except (TypeError, ValueError):
                flag["deduction"] = 0

    return report


def _validate_insight_cards(cards: Any) -> list:
    """
    Validate and normalise the insight_cards array from the Auditor.
    Returns a clean list — invalid entries are dropped with a warning rather
    than discarding the entire array.

    Required fields per card: question, answer, category, priority, page, excerpt.
    We only hard-drop cards whose page is missing or zero (they cannot be cited).
    All other fields fall back to safe defaults so the frontend never crashes.
    """
    if not isinstance(cards, list):
        logger.warning("insight_cards is not a list — returning empty array")
        return []

    valid = []
    seen_priorities: set[int] = set()

    for i, card in enumerate(cards):
        if not isinstance(card, dict):
            logger.warning(f"insight_cards[{i}] is not a dict — skipping")
            continue

        page = card.get("page")
        if not isinstance(page, int) or page <= 0:
            logger.warning(f"insight_cards[{i}] has invalid page={page!r} — skipping")
            continue

        excerpt = card.get("excerpt", "")
        if not excerpt or not str(excerpt).strip():
            # Auditor prompt requires excerpt; log but keep the card — page citation
            # still works, text highlight simply won't fire.
            logger.warning(f"insight_cards[{i}] has empty excerpt — keeping card with empty string")
            excerpt = ""

        priority = card.get("priority")
        if not isinstance(priority, int) or priority < 1 or priority > 8:
            # Assign a fallback priority that doesn't collide
            priority = i + 1
            logger.warning(f"insight_cards[{i}] has invalid priority — reassigning to {priority}")
        if priority in seen_priorities:
            priority = max(seen_priorities) + 1
            logger.warning(f"insight_cards[{i}] duplicate priority — reassigning to {priority}")
        seen_priorities.add(priority)

        valid.append({
            "question": str(card.get("question") or ""),
            "answer":   str(card.get("answer")   or ""),
            "category": str(card.get("category") or "explain"),
            "priority": priority,
            "page":     page,
            "excerpt":  str(excerpt),
        })

    logger.info(f"insight_cards validated: {len(valid)}/{len(cards)} cards kept")
    return valid


def _validate_and_fix_report(report: Dict[str, Any]) -> Dict[str, Any]:
    # ── Red flags ──────────────────────────────────────────────────────────
    # Filter red flags: structural can have null excerpt, finding_triggered cannot.
    red_flags = report.get("red_flags", [])
    valid_red_flags = []
    for flag in red_flags:
        if not isinstance(flag, dict):
            continue
        source = flag.get("source", "")
        excerpt = flag.get("excerpt")
        if source == "structural" or (excerpt and excerpt.strip()):
            valid_red_flags.append(flag)
        else:
            logger.warning(f"Removing red flag '{flag.get('flag_id', 'unknown')}' — empty excerpt")
    report["red_flags"] = valid_red_flags

    # ── Insight cards — PRESERVE, do NOT pop ──────────────────────────────
    # insight_cards are generated by the Auditor (Step 6) and must be kept
    # intact so DeepDiveQuestions can render the Policy Q&A tab.
    # They are intentionally NOT shown in FullReport — that separation is
    # handled on the frontend, not here.
    raw_cards = report.get("insight_cards", [])
    report["insight_cards"] = _validate_insight_cards(raw_cards)

    # ── Scores & grades ────────────────────────────────────────────────────
    total_deductions = max(0, min(40, sum(f.get("deduction", 0) for f in valid_red_flags)))
    report["total_deductions"] = total_deductions

    clarity_score  = report.get("clarity", {}).get("score", 0)
    coverage_score = report.get("coverage", {}).get("score", 0)
    claims_score   = report.get("claim_efficiency", {}).get("score", 0)
    base_score     = clarity_score + coverage_score + claims_score
    enziu_index    = max(0, base_score - total_deductions)
    report["enziu_index"] = enziu_index

    overall_grade = _index_to_grade(enziu_index)
    grade = report.get("grade", {})
    grade["overall"]          = overall_grade
    grade["clarity"]          = _index_to_grade(int((clarity_score  / 30) * 100) if clarity_score  > 0 else 0)
    grade["coverage"]         = _index_to_grade(int((coverage_score / 40) * 100) if coverage_score > 0 else 0)
    grade["claimsEfficiency"] = _index_to_grade(int((claims_score   / 30) * 100) if claims_score   > 0 else 0)
    report["grade"] = grade
    report["score_preview"] = _grade_to_score_preview(overall_grade)

    logger.info(
        f"Report validation complete — enziu_index={enziu_index}, grade={overall_grade}, "
        f"base_score={base_score}, deductions={total_deductions}, "
        f"red_flags={len(valid_red_flags)}, insight_cards={len(report['insight_cards'])}"
    )
    return report


# ---------------------------------------------------------------------------
# Grade helpers
# ---------------------------------------------------------------------------

_GRADE_BANDS = ("A+", "A", "B+", "B", "C+", "C", "D", "F")

_GRADE_SCORE_MAP: dict[str, int] = {
    "A+": 95, "A": 85, "B+": 77, "B": 72,
    "C+": 67, "C": 62, "D": 55, "F": 30,
}


def _index_to_grade(index: int) -> str:
    if index >= 90: return "A+"
    if index >= 80: return "A"
    if index >= 75: return "B+"
    if index >= 70: return "B"
    if index >= 65: return "C+"
    if index >= 60: return "C"
    if index >= 50: return "D"
    return "F"


def _grade_to_score_preview(grade: str) -> str:
    if grade in ("A+", "A"):        return "high"
    if grade in ("B+", "B", "C+"): return "medium"
    return "low"


# ---------------------------------------------------------------------------
# JSON repair
# ---------------------------------------------------------------------------

def _safe_parse_json(raw: str, log_prefix: str = "") -> Dict[str, Any]:
    if not raw or not raw.strip():
        raise ValueError("Empty response from LLM")

    cleaned = raw.strip()
    cleaned = cleaned.removeprefix("```json").removeprefix("```")
    cleaned = cleaned.removesuffix("```").strip()

    start = cleaned.find("{")
    end   = cleaned.rfind("}")
    if start == -1 or end == -1 or end < start:
        if log_prefix:
            logger.warning(f"{log_prefix} no JSON found; raw (2000 chars): {raw[:2000]}")
        raise ValueError("No JSON object found in response")

    cleaned = cleaned[start:end + 1]
    cleaned = re.sub(r"'([^'\"\s]+)'\s*:", r'"\1":', cleaned)
    cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)

    in_string = escaped = False
    for ch in cleaned:
        if escaped:    escaped = False; continue
        if ch == "\\": escaped = True;  continue
        if ch == '"':  in_string = not in_string
    if in_string:
        cleaned += '"'
        cleaned += "}" * max(0, cleaned.count("{") - cleaned.count("}"))
        cleaned += "]" * max(0, cleaned.count("[") - cleaned.count("]"))

    if log_prefix:
        logger.debug(f"{log_prefix} cleaned JSON (first 500 chars): {cleaned[:500]}")

    return json.loads(cleaned)


# ---------------------------------------------------------------------------
# Fallbacks
# ---------------------------------------------------------------------------

def _fallback_facts() -> Dict[str, Any]:
    return {
        "policy_type": "other", "carrier_name": None,
        "word_count": 0, "page_count": 0,
        "definitions_section": "NO", "capitalized_terms": [], "defined_terms": [],
        "exclusions": [], "table_of_contents": "NO", "section_numbering": "NO",
        "page_cross_references": "NO",
        "waiting_period": {"found": False, "page": None, "quote": None, "days": None},
        "sub_limits": {"location": "ABSENT", "items": []},
        "appeal_rights": {"present": False, "timeline_days_stated": False},
        "payout_timeline": {"found": False, "quote": None, "days": None},
        "regulator_reference": {"present": False, "quote": None, "page": None},
        "risk_findings": [],
        "financial_terms": {
            "annual_premium": None, "deductible": None,
            "policy_effective_date": None, "carrier_name": None,
        },
    }


def _error_report(message: str, is_non_insurance: bool = False) -> Dict[str, Any]:
    # For non-insurance documents, use "N/A" for grades
    grade_value = "N/A" if is_non_insurance else "C"
    return {
        "enziu_index": 0,
        "grade": {"overall": grade_value, "clarity": grade_value, "coverage": grade_value, "claimsEfficiency": grade_value},
        "score_preview": "medium",
        "clarity":          {"score": 0, "grade": grade_value, "sub_scores": {}, "estimated_grade_level": 12, "reasoning": message},
        "coverage":         {"score": 0, "grade": grade_value, "sub_scores": {}, "exclusion_count": 0,        "reasoning": message},
        "claim_efficiency": {"score": 0, "grade": grade_value, "sub_scores": {}, "appeal_rights_present": False, "payout_days_stated": None, "reasoning": message},
        "red_flags":    [],
        "exclusions":   [],
        "clauses":      [],
        "insight_cards": [],
        "total_deductions": 0,
        "plain_english_summary": "Document could not be processed." if not is_non_insurance else "This document does not appear to be an insurance policy.",
        "comparison_ready": {
            "policy_type": "unknown", "carrier_name": None,
            "policy_effective_date": None, "annual_premium_stated": None,
            "deductible_stated": None,
        },
        "error": message,
    }


def _transform_report_for_frontend(report: Dict[str, Any]) -> Dict[str, Any]:
    """
    Remap Auditor field names to the camelCase keys the frontend expects.
    insight_cards passes through unchanged — customer-mode.tsx reads it
    directly off the fact sheet under that exact key.
    """
    transformed = report.copy()
    # red_flags → detailedFlags (FullReport reads detailedFlags)
    if "red_flags" in transformed:
        transformed["detailedFlags"] = transformed["red_flags"]
    # plain_english_summary → summary (SneakPeekBento reads summary)
    if "plain_english_summary" in transformed:
        transformed["summary"] = transformed["plain_english_summary"]
    # insight_cards remains as-is — convertFactSheetToResult reads it by name
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
    Full report (including insight_cards) cached in-memory per session;
    no server-side persistence.
    """

    def __init__(self) -> None:
        self.api_key         = settings.inference_api_key
        self.api_base        = settings.inference_api_base
        self.extractor_model = settings.inference_model
        self.auditor_model   = settings.auditor_model
        self.headers: dict[str, str] = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type":  "application/json",
        }
        self._session_cache: dict[str, Dict[str, Any]] = {}
        self._report_cache:  dict[str, Dict[str, Any]] = {}
        logger.info(
            f"InferenceClient initialized — "
            f"extractor={self.extractor_model}, auditor={self.auditor_model}"
        )

    # ── Core HTTP ────────────────────────────────────────────────────────────

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
                {"role": "user",   "content": prompt},
            ],
            "temperature": temperature,
            "max_tokens":  max_tokens,
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

    # ── Phase 1: Fact Extraction ─────────────────────────────────────────────

    async def extract_facts(self, text: str, session_id: str) -> Dict[str, Any]:
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
            logger.info(
                f"Extractor prompt prepared — total length: {len(prompt)} chars, "
                f"document text: {len(safe_text)} chars"
            )
            logger.debug(f"Extractor prompt (full content): {prompt}")

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
                    f"Expected JSON object from Extractor, got {type(facts).__name__}."
                )

            facts = _normalize_facts_booleans(facts)

            elapsed = time.time() - start_time
            logger.info(
                f"Fact extraction complete — session={session_id}, "
                f"policy_type={facts.get('policy_type', '?')}, time={elapsed:.2f}s"
            )
            logger.debug(
                f"Extractor JSON response (session={session_id}):\n"
                f"{json.dumps(facts, indent=2, ensure_ascii=False)}"
            )

            self._session_cache[session_id] = facts
            return facts

        except Exception as e:
            elapsed = time.time() - start_time
            logger.error(
                f"Fact extraction failed after {elapsed:.2f}s: {type(e).__name__}: {e}",
                exc_info=True,
            )
            return _fallback_facts()

    # ── Sneak Peek ───────────────────────────────────────────────────────────

    async def analyze_sneak_peek(self, text: str, session_id: str) -> Dict[str, Any]:
        logger.info(f"analyze_sneak_peek() — session={session_id}")

        try:
            full_report = await self.process_document(text, session_id)

            if "error" in full_report:
                facts        = await self.extract_facts(text, session_id)
                policy_type  = facts.get("policy_type", "other")
                carrier_name = facts.get("carrier_name") or (
                    facts.get("financial_terms") or {}
                ).get("carrier_name")
                # Pass through the grades from full_report (may be "N/A" for non-insurance docs)
                grade = full_report.get("grade", {})
                return {
                    "grade":        grade,
                    "topRisk":      full_report.get("error", "Document error"),
                    "redFlags":     ["Analysis unavailable"],
                    "summary":      full_report.get("plain_english_summary", "Unable to analyze this document."),
                    "score_preview": "medium",
                    "policy_type":  policy_type,
                    "carrier_name": carrier_name,
                    "full_report":  full_report,
                }

            grade         = full_report.get("grade", {})
            score_preview = full_report.get("score_preview", "medium")
            red_flags     = full_report.get("red_flags", [])

            if red_flags:
                top_risk       = red_flags[0].get("plain_english", "Red flag detected")
                red_flag_names = [f.get("plain_english", f.get("flag_id", "")) for f in red_flags[:3]]
            else:
                exclusion_count = full_report.get("coverage", {}).get("exclusion_count", 0)
                top_risk        = (
                    f"{exclusion_count} material exclusion(s)"
                    if exclusion_count > 0
                    else "No major red flags detected"
                )
                red_flag_names = []

            return {
                "grade":        grade,
                "topRisk":      top_risk,
                "redFlags":     red_flag_names,
                "summary":      full_report.get("plain_english_summary", ""),
                "score_preview": score_preview,
                "policy_type":  full_report.get("comparison_ready", {}).get("policy_type", "other"),
                "carrier_name": full_report.get("comparison_ready", {}).get("carrier_name"),
                "full_report":  full_report,
            }

        except Exception as e:
            logger.error(f"Sneak peek error: {e}", exc_info=True)
            return {
                "grade":        {"overall": "C", "clarity": "C", "coverage": "C", "claimsEfficiency": "C"},
                "topRisk":      "Unable to analyze at this time",
                "redFlags":     ["Analysis in progress"],
                "summary":      "Full analysis available after payment.",
                "score_preview": "medium",
                "policy_type":  "other",
                "carrier_name": None,
            }

    # ── Phase 2: Full Audit ───────────────────────────────────────────────────

    async def process_document(self, text: str, session_id: str) -> Dict[str, Any]:
        start_time = time.time()
        logger.info(f"process_document() — session={session_id}")

        if session_id in self._report_cache:
            logger.info(f"Returning cached full report for session={session_id}")
            return self._report_cache[session_id].copy()

        try:
            facts = await self.extract_facts(text, session_id)

            if "error" in facts:
                error_msg = str(facts["error"])
                is_non_insurance = "not a recognized insurance policy" in error_msg.lower()
                error_report = _error_report(error_msg, is_non_insurance=is_non_insurance)
                self._report_cache[session_id] = error_report
                return error_report

            facts_json = json.dumps({"facts": facts}, ensure_ascii=False)
            prompt     = f"{ENZIU_AUDITOR_PROMPT}\n\n{facts_json}\n\nAudit:"

            logger.info(
                f"Auditor prompt prepared — total length: {len(prompt)} chars, "
                f"facts JSON: {len(facts_json)} chars"
            )
            logger.debug(f"Auditor prompt (full content): {prompt}")

            raw = await self._complete(
                prompt=prompt,
                system_prompt=(
                    "You are ENZIU Auditor. Return ONLY valid JSON. "
                    "All boolean fields must be JSON literals true or false. "
                    "The deduction field on each red flag is a positive integer. "
                    "total_deductions is a positive integer. "
                    "insight_cards is a required array — include all 8 cards. "
                    "No preamble. No markdown."
                ),
                max_tokens=8000,
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
                    f"Expected JSON object from Auditor, got {type(report).__name__}."
                )

            report = _normalize_report_booleans(report)
            report = _validate_and_fix_report(report)

            logger.debug(
                f"Auditor JSON response (session={session_id}):\n"
                f"{json.dumps(report, indent=2, ensure_ascii=False)}"
            )

            self._report_cache[session_id] = report

            elapsed = time.time() - start_time
            logger.info(
                f"Full audit complete — session={session_id}, "
                f"grade={report.get('grade', {}).get('overall', '?')}, time={elapsed:.2f}s"
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

    # ── Frontend transform ────────────────────────────────────────────────────

    async def get_frontend_report(self, text: str, session_id: str) -> Dict[str, Any]:
        report = await self.process_document(text, session_id)
        return _transform_report_for_frontend(report)

    # ── Session management ────────────────────────────────────────────────────

    def clear_session(self, session_id: str) -> None:
        self._session_cache.pop(session_id, None)
        self._report_cache.pop(session_id, None)
        logger.info(f"Session cache cleared: {session_id}")

    async def end_session(self, session_id: str) -> None:
        self.clear_session(session_id)