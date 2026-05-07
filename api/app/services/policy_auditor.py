"""
ENZIU Policy Auditor Service
Single-model architecture using Llama 4 Scout 17B (890K context).
All inference goes through one client — no chunking needed.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict

from ..config import settings
from ..prompts import SNEAK_PEEK_PROMPT, ENZIU_INDEX_PROMPT, DEEP_DIVE_PROMPT
from .inference import InferenceClient, _sanitize_injected_text

logger = logging.getLogger("policy_auditor")
logger.setLevel(logging.DEBUG if settings.debug else logging.INFO)


def _safe_parse_json(raw: str, log_prefix: str = "") -> Dict[str, Any]:
    """
    Robust JSON extraction from LLM output.
    Handles markdown fences, trailing commas, truncation, and extra text.
    """
    if not raw or not raw.strip():
        raise ValueError("Empty response from LLM")
    
    cleaned = raw.strip()
    cleaned = cleaned.removeprefix("```json").removeprefix("```")
    cleaned = cleaned.removesuffix("```")
    cleaned = cleaned.strip()
    
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    
    if start == -1 or end == -1 or end < start:
        if log_prefix:
            logger.warning(f"{log_prefix} no JSON found; raw (2000 chars): {raw[:2000]}")
        raise ValueError("No JSON object found in response")
    
    cleaned = cleaned[start:end + 1]
    
    import re as _re
    # Fix single-quoted keys: 'key': → "key":
    cleaned = _re.sub(r"'([^'\"\s]+)'\s*:", r'"\1":', cleaned)
    cleaned = _re.sub(r",\s*([}\]])", r"\1", cleaned)
    
    # Fix unterminated strings
    in_string = False
    escaped = False
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
        braces = cleaned.count("{") - cleaned.count("}")
        brackets = cleaned.count("[") - cleaned.count("]")
        cleaned += "}" * max(0, braces) + "]" * max(0, brackets)
    
    if log_prefix:
        logger.debug(f"{log_prefix} cleaned JSON (first 500 chars): {cleaned[:500]}")
    
    return json.loads(cleaned)


class PolicyAuditor:
    """
    Single-model architecture.
    Llama 4 Scout 17B handles all tasks with its 890K context window.
    """

    def __init__(self) -> None:
        self.client = InferenceClient()
        logger.info(f"PolicyAuditor initialized — model: {settings.inference_model}")

    # ── Sneak Peek (free preview) ──────────────────────────────────────────

    async def analyze_sneak_peek(self, text: str, session_id: str) -> Dict[str, Any]:
        """Single-shot sneak peek — full policy text with the full scoring prompt."""
        logger.info(f"analyze_sneak_peek() — session={session_id}, chars={len(text)}")
        
        try:
            safe_text = _sanitize_injected_text(text, "sneak_peek_pdf")
            prompt = f"{SNEAK_PEEK_PROMPT}\n\n<document>\n{safe_text}\n</document>\n\nAnalysis:"
            
            raw = await self.client._complete(
                prompt=prompt,
                system_prompt="You are ENZIU, an AI insurance policy auditor. Return ONLY valid JSON. No preamble. No markdown.",
                max_tokens=1500,
                timeout=90.0,
                max_retries=2,
            )
            
            analysis = _safe_parse_json(raw, log_prefix="SneakPeek")
            logger.info(f"SneakPeek grade: {analysis.get('score_band', '?')}")
            
            return {
                "grade": {
                    "overall": analysis.get("score_band", "C"),
                    "clarity": analysis.get("clarity_grade", "C"),
                    "coverage": analysis.get("coverage_grade", "C"),
                    "claimsEfficiency": analysis.get("claims_efficiency_grade", "C"),
                },
                "topRisk": analysis.get("top_risk", "Analysis in progress"),
                "redFlags": analysis.get("red_flag_names", ["Analysis in progress"])[:3],
                "summary": analysis.get("one_line", "Full analysis available after payment."),
                "score_preview": analysis.get("score_preview", "medium"),
                "policy_type": analysis.get("policy_type", "other"),
                "carrier_name": analysis.get("carrier_name"),
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

    # ── Full Policy Audit (paid) ───────────────────────────────────────────

    async def process_document(self, text: str, session_id: str) -> Dict[str, Any]:
        """Single-shot full audit — enziu_index.md with complete policy text."""
        import asyncio as _asyncio
        
        start_time = _asyncio.get_event_loop().time()
        logger.info(f"process_document() — session={session_id}, chars={len(text)}")
        
        try:
            safe_text = _sanitize_injected_text(text, "full_audit")
            prompt = f"{ENZIU_INDEX_PROMPT}\n\n<document>\n{safe_text}\n</document>\n\nAnalysis:"
            
            raw = await self.client._complete(
                prompt=prompt,
                system_prompt="Return ONLY valid JSON. No preamble. No markdown.",
                max_tokens=12000,
                timeout=180.0,
                max_retries=2,
            )
            
            fact_sheet = _safe_parse_json(raw, log_prefix="FullAudit")
            
            elapsed = _asyncio.get_event_loop().time() - start_time
            logger.info(
                f"Full audit complete — session={session_id}, "
                f"grade={fact_sheet.get('grade', {}).get('overall')}, "
                f"time={elapsed:.2f}s"
            )
            
            return fact_sheet
            
        except Exception as e:
            elapsed = _asyncio.get_event_loop().time() - start_time
            logger.error(f"Full audit failed after {elapsed:.2f}s: {type(e).__name__}: {e}", exc_info=True)
            return {
                "policy_type": "unknown",
                "carrier": "unknown",
                "effective_date": "unknown",
                "grade": {"overall": "C", "clarity": "C", "coverage": "C", "claimsEfficiency": "C"},
                "liability_limits": [], "exclusions": [], "clauses": [], "red_flags": [],
                "top_risk": "Unable to analyze policy completely.",
                "summary": "Analysis encountered an error. Limited information available.",
            }

    # ── Deep Dive Chat ─────────────────────────────────────────────────────

    async def chat(
        self, session_id: str, message: str, fact_sheet: Dict[str, Any],
        extracted_text: str = "",
    ) -> Dict[str, Any]:
        """
        Single-shot chat — sends full fact sheet + full policy text each time.
        Llama 4 Scout's 890K context handles this comfortably.
        """
        logger.info(f"chat() — session={session_id}, has_fact={bool(fact_sheet)}, text_chars={len(extracted_text)}")
        
        if not fact_sheet:
            raise ValueError("Fact sheet is missing. Please generate a policy audit first.")
        
        try:
            context_parts = [f"FACT SHEET (structured analysis):\n{json.dumps(fact_sheet, indent=2)}"]
            if extracted_text:
                context_parts.append(f"RAW POLICY TEXT:\n{extracted_text}")
            
            policy_context = "\n\n---\n\n".join(context_parts)
            prompt = DEEP_DIVE_PROMPT.format(policy_text=policy_context, question=message)
            
            logger.debug(f"chat() prompt length: {len(prompt)} chars")
            
            raw = await self.client._complete(
                prompt=prompt,
                system_prompt="You are an insurance policy analyst. Always cite page numbers.",
                max_tokens=2500,
                timeout=90.0,
                max_retries=2,
            )
            
            # Parse LLM JSON response
            page: int | None = None
            response_text: str = raw
            excerpt: str | None = None
            
            try:
                data = _safe_parse_json(raw, log_prefix="Chat")
                found = data.get("found", False)
                page = data.get("page_number") or None
                excerpt = data.get("exact_excerpt") or None

                if found and data.get("plain_english_explanation"):
                    explanation = data["plain_english_explanation"]
                    section = data.get("section_title") or ""
                    section_prefix = f" ({section})" if section else ""
                    response_text = f"{explanation}\n\n**Source:** Page {page}{section_prefix}" if page else explanation
                elif not found:
                    response_text = data.get("not_found_reason", "Information not found in document.")
                else:
                    quote = data.get("exact_excerpt") or ""
                    response_text = f"The policy states on page {page}: \"{quote}\"" if page and quote else raw
            except Exception:
                logger.warning("Failed to parse chat JSON, using raw text")
                response_text = raw

            return {
                "response": response_text,
                "page": page,
                "excerpt": excerpt,
                "disclaimer": "Not legal advice — page citations are approximate",
            }
            
        except ValueError:
            raise
        except Exception as e:
            logger.error(f"Chat error: {e}", exc_info=True)
            return {
                "response": f"I'm sorry, I couldn't process that question: {str(e)}",
                "disclaimer": "Not legal advice",
            }