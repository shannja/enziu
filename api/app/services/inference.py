"""
ENZIU Inference Service
Generic LLM inference client for Llama 3.3 70B Instruct (or similar).
Serverless-safe: chat uses a single attempt with a tight timeout.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any

import httpx

from ..config import settings
from ..prompts import SNEAK_PEEK_PROMPT, ENZIU_INDEX_PROMPT, DEEP_DIVE_PROMPT, COMPARE_PROMPT

logger = logging.getLogger("inference")
logger.setLevel(logging.DEBUG if settings.debug else logging.INFO)

# Injection patterns to strip from user-provided text before it enters any prompt
_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?(previous|prior|above|foregoing)\s+instructions?", re.IGNORECASE),
    re.compile(r"you\s+are\s+now\s+\w+", re.IGNORECASE),
    re.compile(r"<\|im_start\|>|<\|im_end\|>", re.IGNORECASE),
    re.compile(r"^\s*(system|assistant|user)\s*:", re.IGNORECASE | re.MULTILINE),
    re.compile(r"\[system\]|\[assistant\]|\[user\]", re.IGNORECASE),
    re.compile(r"override\s+(the\s+)?(system\s+)?prompt", re.IGNORECASE),
    re.compile(r"disregard\s+(all\s+)?(previous\s+)?instructions", re.IGNORECASE),
    re.compile(r"new\s+instructions?\s*(:|=)", re.IGNORECASE),
    re.compile(r"\[/INST\]|<<SYS>>|<</SYS>>"),  # Llama instruction tags
]


def _sanitize_injected_text(text: str, source: str = "") -> str:
    """
    Strip prompt injection patterns from user-controlled text.
    Logs a warning if anything was modified.
    
    Args:
        text: Raw text from user (PDF content, chat message, etc.)
        source: Label for logging (e.g. "pdf_extract", "chat_message")
        
    Returns:
        Sanitized text with injection patterns removed
    """
    if not text:
        return text
    
    cleaned = text
    
    # Strip NUL bytes and other dangerous control characters (keep \n, \r, \t)
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", cleaned)
    
    # Strip injection patterns
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


class InferenceClient:
    """Generic LLM inference client (OpenAI-compatible API)."""

    def __init__(
        self,
        model: str = "",
        api_base: str = "",
        api_key: str = "",
    ) -> None:
        """
        Initialize with optional model override.
        
        Args:
            model: Override default model (optional)
            api_base: Override default API base URL (optional)
            api_key: Override default API key (optional)
        """
        self.api_key = api_key or settings.inference_api_key
        self.api_base = api_base or settings.inference_api_base
        self.model = model or settings.inference_model
        self.headers: dict[str, str] = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        logger.info(f"InferenceClient initialized - model: {self.model}")

    async def _complete(
        self,
        prompt: str,
        system_prompt: str = "You are a helpful insurance policy analyst.",
        temperature: float = 0.1,
        max_tokens: int = 2000,
        timeout: float = 55.0,   # Serverless-safe default: under Vercel's 60s hobby limit
        max_retries: int = 1,    # Single attempt for chat; callers can override for batch ops
    ) -> str:
        """Send a completion request with optional retry/backoff."""
        payload: dict[str, Any] = {
            "model": self.model,
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
                logger.info(f"Inference request (attempt {attempt + 1}/{max_retries}) - model={self.model}, timeout={timeout}s")
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
                            raise Exception("Inference API returned null content in response")
                        logger.info(f"Response received - {len(content)} chars")
                        return content
                    raise Exception(f"Unexpected response format: {list(data.keys())}")

                error_text = response.text[:500] if response.text else "No response body"
                logger.error(f"Inference API error: {response.status_code} - {error_text}")

                # Never retry on 4xx except 429
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
                if any(k in str(e) for k in ("Inference API", "Unexpected response")):
                    raise  # Already formatted — don't retry
                logger.error(f"Unexpected error on attempt {attempt + 1}: {e}")
                last_error = e

        raise last_error

    # ── Sneak peek ───────────────────────────────────────────────────────────

    async def analyze_sneak_peek(self, extracted_text: str, session_id: str) -> dict[str, Any]:
        """Free preview — grade band, top risk, red flag names only."""
        logger.info(f"analyze_sneak_peek() - session={session_id}, chars={len(extracted_text)}")

        prompt = (
            f"{SNEAK_PEEK_PROMPT}\n\n"
            f"Policy text (excerpt):\n{extracted_text[:5000]}...\n\nAnalysis:"
        )

        try:
            raw = await self._complete(
                prompt=prompt,
                system_prompt="You are ENZIU, an AI insurance policy auditor. Return ONLY valid JSON. No preamble. No markdown.",
                max_tokens=500,
                timeout=55.0,
                max_retries=2,
            )
            analysis: dict[str, Any] = json.loads(
                raw.strip().removeprefix("```json").removesuffix("```").strip()
            )
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
            logger.error(f"Sneak peek error: {e}")
            return {
                "grade": {"overall": "C", "clarity": "C", "coverage": "C", "claimsEfficiency": "C"},
                "topRisk": "Unable to analyze at this time",
                "redFlags": ["Analysis in progress"],
                "summary": "Full analysis available after payment.",
                "score_preview": "medium",
                "policy_type": "other",
                "carrier_name": None,
            }

    # ── Full analysis ────────────────────────────────────────────────────────

    async def analyze_policy(self, extracted_text: str, session_id: str) -> dict[str, Any]:
        """Full paid analysis — called from /api/analyze/full which has a 5-min budget."""
        logger.info(f"analyze_policy() - session={session_id}, chars={len(extracted_text)}")

        safe_text = _sanitize_injected_text(extracted_text, "analyze_policy")
        prompt = f"{ENZIU_INDEX_PROMPT}\n\n<document>\n{safe_text}\n</document>\n\nAnalysis:"

        try:
            raw = await self._complete(
                prompt=prompt,
                system_prompt="You are an insurance policy analyst. Return valid JSON only.",
                max_tokens=3000,
                timeout=280.0,   # /api/analyze/full has a 300s client-side abort
                max_retries=2,
            )
            analysis: dict[str, Any] = json.loads(
                raw.strip().removeprefix("```json").removesuffix("```").strip()
            )
            # Normalize grade: if the LLM returned a string like "C", convert it
            # to the object format the frontend expects: {overall, clarity, coverage, claimsEfficiency}
            raw_grade = analysis.get("grade")
            if isinstance(raw_grade, str):
                normalized_grade = {
                    "overall": raw_grade,
                    "clarity": raw_grade,
                    "coverage": raw_grade,
                    "claimsEfficiency": raw_grade,
                }
            elif isinstance(raw_grade, dict):
                normalized_grade = {
                    "overall": raw_grade.get("overall") or raw_grade.get("score_band") or "C",
                    "clarity": raw_grade.get("clarity") or raw_grade.get("clarity_grade") or "C",
                    "coverage": raw_grade.get("coverage") or raw_grade.get("coverage_grade") or "C",
                    "claimsEfficiency": raw_grade.get("claimsEfficiency") or raw_grade.get("claims_efficiency_grade") or "C",
                }
            else:
                normalized_grade = {"overall": "C", "clarity": "C", "coverage": "C", "claimsEfficiency": "C"}

            return {
                "grade": normalized_grade,
                "topRisk": analysis.get("topRisk"),
                "redFlags": [f.get("name", "Unknown") for f in analysis.get("redFlags", [])],
                "summary": analysis.get("summary"),
                "detailedFlags": analysis.get("redFlags", []),
            }
        except Exception as e:
            logger.error(f"Policy analysis error: {e}")
            return {
                "grade": {"overall": "C", "clarity": "C", "coverage": "C", "claimsEfficiency": "C"},
                "topRisk": "Analysis error",
                "redFlags": [],
                "summary": "Unable to complete analysis.",
            }

    # ── Chat ─────────────────────────────────────────────────────────────────

    async def chat(self, session_id: str, message: str, policy_text: str = "") -> dict[str, Any]:
        """
        Deep Dive Q&A.
        Sends the full policy text to the LLM so it can search every page.
        Parses the LLM JSON response and returns a human-readable prose message
        plus the page number and excerpt for PDF viewer navigation.
        Raises ValueError (→ HTTP 400) if policy_text is missing so the client
        knows to restore from IndexedDB rather than getting a silent 500.
        """
        if not policy_text or len(policy_text.strip()) < 50:
            raise ValueError(
                "Policy text is missing. Please re-upload your PDF — "
                "the extracted text was not found in this session."
            )

        logger.info(f"chat() - session={session_id}, policy_chars={len(policy_text)}")

        # Sanitize both the policy text and user question
        safe_policy_text = _sanitize_injected_text(policy_text[:100000], "chat_policy")
        safe_message = _sanitize_injected_text(message, "chat_message")
        prompt = DEEP_DIVE_PROMPT.format(
            policy_text=safe_policy_text,
            question=safe_message,
        )

        # Single attempt, tight timeout — serverless functions must respond quickly
        raw = await self._complete(
            prompt=prompt,
            system_prompt="You are an insurance policy analyst. Always cite page numbers.",
            max_tokens=800,
            timeout=55.0,
            max_retries=1,
        )

        # Parse the LLM's JSON response
        page: int | None = None
        response_text: str = raw
        excerpt: str | None = None
        try:
            cleaned = raw.strip().removeprefix("```json").removesuffix("```").strip()
            data = json.loads(cleaned)
            found = data.get("found", False)
            page = data.get("page_number") or None
            excerpt = data.get("exact_excerpt") or None

            if found and data.get("plain_english_explanation"):
                # Use the LLM's prose explanation as the response
                explanation = data["plain_english_explanation"]
                section = data.get("section_title") or ""
                section_prefix = f" ({section})" if section else ""
                response_text = (
                    f"{explanation}\n\n"
                    f"**Source:** Page {page}{section_prefix}"
                    if page
                    else explanation
                )
            elif not found:
                reason = data.get("not_found_reason") or "I couldn't find this information in the policy document."
                response_text = reason
            else:
                # Fallback: if the LLM returned found=true but no explanation, use the excerpt
                quote = data.get("exact_excerpt") or ""
                response_text = f"The policy states on page {page}: \"{quote}\"" if page and quote else raw
        except (json.JSONDecodeError, Exception) as e:
            logger.warning(f"Failed to parse LLM JSON response: {e}")
            # Fallback: return the raw response as-is
            response_text = raw

        return {
            "response": response_text,
            "page": page,
            "excerpt": excerpt,
            "disclaimer": "Not legal advice — page citations are approximate",
        }

    # ── Compare ──────────────────────────────────────────────────────────────

    async def compare(
        self,
        session_id: str,
        message: str,
        policyA: dict[str, Any],
        policyB: dict[str, Any],
    ) -> dict[str, Any]:
        """Comparative analysis for broker mode."""
        prompt = COMPARE_PROMPT.format(
            gradeA=policyA.get("grade", {}).get("overall", "Unknown"),
            summaryA=policyA.get("summary", ""),
            gradeB=policyB.get("grade", {}).get("overall", "Unknown"),
            summaryB=policyB.get("summary", ""),
            question=message,
        )
        response = await self._complete(
            prompt=prompt,
            system_prompt="You are an insurance policy analyst comparing two policies.",
            max_tokens=800,
            timeout=55.0,
            max_retries=1,
        )
        return {"response": response, "disclaimer": "Not legal advice"}

    # ── Session stubs ────────────────────────────────────────────────────────

    async def store_session(self, session_id: str, data: dict[str, Any]) -> None:
        pass  # TODO: Upstash Redis

    async def mark_session_paid(self, session_id: str) -> None:
        logger.info(f"Session marked as paid: {session_id}")

    async def check_session_payment(self, session_id: str) -> bool:
        return False  # TODO: Upstash Redis

    async def end_session(self, session_id: str) -> None:
        pass  # TODO: Upstash Redis