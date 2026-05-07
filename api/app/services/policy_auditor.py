"""
ENZIU Policy Auditor Service
Map-Reduce architecture for processing large insurance policies.
Chunks text, processes in parallel, and merges results.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, List, Dict, Optional

from ..config import settings
from ..prompts import MAP_CHUNK_PROMPT, REDUCE_FACTSHEET_PROMPT, SNEAK_PEEK_CHUNK_PROMPT
from .inference import InferenceClient, _sanitize_injected_text

logger = logging.getLogger("policy_auditor")
logger.setLevel(logging.DEBUG if settings.debug else logging.INFO)


def _safe_parse_json(raw: str, log_prefix: str = "") -> Dict[str, Any]:
    """
    Robust JSON extraction from LLM output.
    Handles markdown fences, trailing commas, truncation, and extra text.
    
    Returns parsed dict on success, raises on failure.
    """
    if not raw or not raw.strip():
        raise ValueError("Empty response from LLM")
    
    cleaned = raw.strip()
    
    # Remove markdown fences
    cleaned = cleaned.removeprefix("```json").removeprefix("```")
    cleaned = cleaned.removesuffix("```")
    cleaned = cleaned.strip()
    
    # Find JSON object boundaries
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    
    if start == -1 or end == -1 or end < start:
        if log_prefix:
            logger.debug(f"{log_prefix} raw response (first 500 chars): {raw[:500]}")
        raise ValueError(f"No JSON object found in response")
    
    # Extract just the JSON portion
    cleaned = cleaned[start:end + 1]
    
    # Fix trailing commas before closing braces/brackets
    import re
    cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)
    
    # Fix unterminated strings: if the JSON ends mid-string, close it with a quote
    # Count unescaped quotes to detect unterminated strings
    in_string = False
    escaped = False
    quote_count = 0
    for ch in cleaned:
        if escaped:
            escaped = False
            continue
        if ch == "\\":
            escaped = True
            continue
        if ch == '"':
            quote_count += 1
            in_string = not in_string
    
    if in_string:
        # JSON ends mid-string — append closing quote and close any open structures
        cleaned += '"'
        # Try to close open braces/brackets
        braces = 0
        brackets = 0
        for ch in cleaned:
            if ch == "{":
                braces += 1
            elif ch == "}":
                braces -= 1
            elif ch == "[":
                brackets += 1
            elif ch == "]":
                brackets -= 1
        cleaned += "}" * max(0, braces)
        cleaned += "]" * max(0, brackets)
    
    if log_prefix:
        logger.debug(f"{log_prefix} cleaned JSON (first 500 chars): {cleaned[:500]}")
    
    return json.loads(cleaned)


class PolicyAuditor:
    """
    Map-Reduce architecture for processing large insurance policies.
    Uses a primary model (Llama 70B) for deep analysis and a secondary model
    (Qwen 14B) for the free sneak peek.
    """

    def __init__(self) -> None:
        """Initialize with separate clients for different models."""
        # Primary model for Map-Reduce (Llama 70B)
        self.primary_client = InferenceClient()
        
        # Sneak peek model (Qwen 14B)
        self.sneak_peek_client = InferenceClient(
            model=settings.sneak_peek_model,
            api_base=settings.sneak_peek_api_base or settings.inference_api_base,
            api_key=settings.sneak_peek_api_key or settings.inference_api_key,
        )
        
        # Chat model (Qwen 8B)
        self.chat_client = InferenceClient(
            model=settings.chat_model,
            api_base=settings.chat_api_base or settings.inference_api_base,
            api_key=settings.chat_api_key or settings.inference_api_key,
        )
        
        logger.info(
            f"PolicyAuditor initialized with models: "
            f"primary={settings.inference_model}, "
            f"sneak_peek={settings.sneak_peek_model}, "
            f"chat={settings.chat_model}"
        )

    def chunk_text(
        self, text: str, chunk_size: int = 80000, overlap: int = 2000
    ) -> List[str]:
        """
        Split text into overlapping chunks for parallel processing.
        
        Args:
            text: The full policy text
            chunk_size: Characters per chunk (default: 80k)
            overlap: Overlap between chunks (default: 2k)
            
        Returns:
            List of text chunks
        """
        if not text:
            return []
            
        chunks = []
        text_len = len(text)
        
        # Single chunk case
        if text_len <= chunk_size:
            return [text]
            
        # Multi-chunk case with overlap
        pos = 0
        while pos < text_len:
            # Calculate end position with overlap
            end = min(pos + chunk_size, text_len)
            
            # Extract chunk
            chunk = text[pos:end]
            chunks.append(chunk)
            
            # Move position for next chunk, accounting for overlap
            pos = end - overlap if end < text_len else text_len
            
        logger.info(f"Split {text_len} chars into {len(chunks)} chunks")
        return chunks

    async def process_chunk(self, chunk: str, chunk_index: int) -> Dict[str, Any]:
        """
        Process a single chunk with the primary model (Map phase).
        
        Args:
            chunk: Text chunk to process
            chunk_index: Index for logging
            
        Returns:
            Extracted facts from this chunk
        """
        logger.info(f"Processing chunk {chunk_index} ({len(chunk)} chars)")
        
        try:
            # Sanitize chunk text before inserting into prompt
            safe_chunk = _sanitize_injected_text(chunk, f"chunk_{chunk_index}")
            prompt = MAP_CHUNK_PROMPT.format(chunk_text=safe_chunk)
            
            # Call primary model (Llama 70B)
            raw_response = await self.primary_client._complete(
                prompt=prompt,
                system_prompt="You are an insurance policy auditor extracting facts from a document chunk.",
                max_tokens=2000,
                timeout=120.0,  # Longer timeout for Llama 70B with 60k char chunks
                max_retries=2,  # Total 3 attempts (initial + 2 retries)
            )
            
            # Parse JSON response using robust parser
            chunk_facts = _safe_parse_json(raw_response, log_prefix=f"Chunk {chunk_index}")
            
            logger.info(
                f"Chunk {chunk_index} processed: "
                f"limits={len(chunk_facts.get('liability_limits', []))}, "
                f"exclusions={len(chunk_facts.get('exclusions', []))}, "
                f"clauses={len(chunk_facts.get('clauses', []))}, "
                f"flags={len(chunk_facts.get('red_flags', []))}"
            )
            
            return chunk_facts
            
        except Exception as e:
            logger.error(f"Error processing chunk {chunk_index}: {e}", exc_info=True)
            # Return empty facts on error
            return {
                "liability_limits": [],
                "exclusions": [],
                "effective_dates": [],
                "clauses": [],
                "red_flags": [],
            }

    async def reduce_chunks(self, chunk_facts: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Merge facts from all chunks (Reduce phase).
        
        Args:
            chunk_facts: List of facts from each chunk
            
        Returns:
            Merged Master Policy Fact Sheet
        """
        logger.info(f"Reducing {len(chunk_facts)} chunk results")
        
        try:
            # Serialize chunk facts to JSON string
            chunk_facts_json = json.dumps(chunk_facts, indent=2)
            
            # Prepare prompt with all chunk facts
            prompt = REDUCE_FACTSHEET_PROMPT.format(chunk_facts=chunk_facts_json)
            
            # Call primary model (Llama 70B)
            raw_response = await self.primary_client._complete(
                prompt=prompt,
                system_prompt="You are an insurance policy auditor synthesizing facts from multiple document chunks.",
                max_tokens=3000,
                timeout=55.0,  # Serverless-safe timeout
                max_retries=1,
            )
            
            # Parse JSON response using robust parser
            fact_sheet = _safe_parse_json(raw_response, log_prefix="Reduce")
            
            logger.info(
                f"Reduce complete: "
                f"policy_type={fact_sheet.get('policy_type')}, "
                f"grade={fact_sheet.get('grade', {}).get('overall')}, "
                f"limits={len(fact_sheet.get('liability_limits', []))}, "
                f"exclusions={len(fact_sheet.get('exclusions', []))}, "
                f"clauses={len(fact_sheet.get('clauses', []))}, "
                f"flags={len(fact_sheet.get('red_flags', []))}"
            )
            
            return fact_sheet
            
        except Exception as e:
            logger.error(f"Error in reduce phase: {e}", exc_info=True)
            # Return minimal fact sheet on error
            return {
                "policy_type": "unknown",
                "carrier": "unknown",
                "effective_date": "unknown",
                "grade": {
                    "overall": "C",
                    "clarity": "C",
                    "coverage": "C",
                    "claimsEfficiency": "C",
                },
                "liability_limits": [],
                "exclusions": [],
                "clauses": [],
                "red_flags": [],
                "top_risk": "Unable to analyze policy completely.",
                "summary": "Analysis encountered an error. Limited information available.",
            }

    async def process_document(self, text: str, session_id: str) -> Dict[str, Any]:
        """
        Process a full policy document using Map-Reduce.
        
        Args:
            text: Full policy text
            session_id: Session ID for logging
            
        Returns:
            Master Policy Fact Sheet
        """
        start_time = asyncio.get_event_loop().time()
        logger.info(f"process_document() - session={session_id}, chars={len(text)}")
        
        # 1. Chunk the text
        chunks = self.chunk_text(text)
        
        # 2. MAP: Process all chunks in parallel
        chunk_tasks = [
            self.process_chunk(chunk, i) 
            for i, chunk in enumerate(chunks)
        ]
        chunk_facts = await asyncio.gather(*chunk_tasks)
        
        # 3. REDUCE: Merge all chunk facts
        fact_sheet = await self.reduce_chunks(chunk_facts)
        
        elapsed = asyncio.get_event_loop().time() - start_time
        logger.info(
            f"process_document() complete - "
            f"session={session_id}, "
            f"chunks={len(chunks)}, "
            f"time={elapsed:.2f}s"
        )
        
        return fact_sheet

    # ── Sneak Peek Chunk Processor ─────────────────────────────────────────
    SPEAK_PEEK_CHUNK_SIZE = 20000  # Minimal chunks for Qwen 14B reliability

    async def _process_sneak_peek_chunk(self, chunk: str, chunk_index: int) -> Dict[str, Any]:
        """Process a single chunk with the sneak peek model (Map phase)."""
        logger.info(f"SneakPeek chunk {chunk_index} ({len(chunk)} chars)")
        
        try:
            safe_chunk = _sanitize_injected_text(chunk, f"sneak_peek_chunk_{chunk_index}")
            prompt = f"{SNEAK_PEEK_CHUNK_PROMPT}\n\n<document>\n{safe_chunk}\n</document>\n\nAnalysis:"
            
            raw = await self.sneak_peek_client._complete(
                prompt=prompt,
                system_prompt="You are ENZIU, an AI insurance policy auditor. Return ONLY valid JSON. No preamble. No markdown.",
                max_tokens=800,
                timeout=55.0,
                max_retries=2,
            )
            
            analysis = _safe_parse_json(raw, log_prefix=f"SneakPeekChunk{chunk_index}")
            logger.debug(f"SneakPeek chunk {chunk_index} analysis: {analysis.get('score_band', '?')}")
            return analysis
            
        except Exception as e:
            logger.error(f"SneakPeek chunk {chunk_index} error: {e}", exc_info=True)
            return {
                "score_band": "C", "score_preview": "low",
                "clarity_grade": "C", "coverage_grade": "C", "claims_efficiency_grade": "C",
                "top_risk": None, "red_flag_names": [],
                "one_line": "Chunk analysis unavailable", "policy_type": "other", "carrier_name": None,
            }

    async def _reduce_sneak_peek_chunks(self, chunk_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Merge sneak peek results from all chunks.
        Weighted average for grades, collect all red flags, pick worst top_risk.
        No LLM call — this is a programmatic merge.
        """
        if not chunk_results:
            return self._default_sneak_peek()

        # Grade band → numeric mapping for averaging
        grade_to_num = {
            "A+": 97, "A": 92, "A-": 88,
            "B+": 82, "B": 78, "B-": 72,
            "C+": 68, "C": 62, "C-": 58,
            "D+": 52, "D": 48, "D-": 42, "F": 20,
        }
        num_to_grade_band = [
            (95, "A+"), (85, "A"), (77, "B+"), (72, "B"),
            (67, "C+"), (62, "C"), (55, "D"), (0, "F"),
        ]

        def avg_grade(key: str) -> str:
            grades = [r.get(key, "C") for r in chunk_results]
            nums = [grade_to_num.get(g, 62) for g in grades]
            avg = sum(nums) / len(nums)
            return next(band for threshold, band in num_to_grade_band if avg >= threshold)

        # Collect all red flags, deduplicate by name
        all_flags: List[str] = []
        seen = set()
        for r in chunk_results:
            for flag in r.get("red_flag_names", []):
                if flag and flag not in seen and flag != "<name only>":
                    seen.add(flag)
                    all_flags.append(flag)

        # Pick the worst top_risk (non-null)
        top_risks = [r.get("top_risk") for r in chunk_results if r.get("top_risk") and r.get("top_risk") != "null"]
        top_risk = top_risks[0] if top_risks else "Analysis in progress"

        # Pick most common policy_type
        types = [r.get("policy_type", "other") for r in chunk_results if r.get("policy_type") != "other"]
        policy_type = max(set(types), key=types.count) if types else "other"

        # Pick first non-null carrier
        carriers = [r.get("carrier_name") for r in chunk_results if r.get("carrier_name")]
        carrier_name = carriers[0] if carriers else None

        overall = avg_grade("score_band")
        score_preview = (
            "high" if overall in ("A+", "A", "A-")
            else "medium" if overall in ("B+", "B", "B-", "C+")
            else "low"
        )

        logger.info(
            f"SneakPeek reduce: chunks={len(chunk_results)}, "
            f"overall={overall}, flags={len(all_flags)}, "
            f"clarity={avg_grade('clarity_grade')}, "
            f"coverage={avg_grade('coverage_grade')}, "
            f"claims={avg_grade('claims_efficiency_grade')}"
        )

        return self._format_sneak_peek_response({
            "score_band": overall,
            "score_preview": score_preview,
            "clarity_grade": avg_grade("clarity_grade"),
            "coverage_grade": avg_grade("coverage_grade"),
            "claims_efficiency_grade": avg_grade("claims_efficiency_grade"),
            "top_risk": top_risk,
            "red_flag_names": all_flags[:3],
            "one_line": f"Policy graded {overall} with {len(all_flags)} red flags detected.",
            "policy_type": policy_type,
            "carrier_name": carrier_name,
        })

    def _format_sneak_peek_response(self, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Format raw analysis dict into the standard sneak peek response."""
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

    def _default_sneak_peek(self) -> Dict[str, Any]:
        """Return a default/fallback sneak peek result."""
        return {
            "grade": {"overall": "C", "clarity": "C", "coverage": "C", "claimsEfficiency": "C"},
            "topRisk": "Unable to analyze at this time",
            "redFlags": ["Analysis in progress"],
            "summary": "Full analysis available after payment.",
            "score_preview": "medium",
            "policy_type": "other",
            "carrier_name": None,
        }

    async def analyze_sneak_peek(self, text: str, session_id: str) -> Dict[str, Any]:
        """
        Generate a free sneak peek using the cheaper model.
        Uses single-shot for small policies, parallel Map-Reduce for large ones.
        
        Args:
            text: Full policy text
            session_id: Session ID for logging
            
        Returns:
            Sneak peek analysis
        """
        from ..prompts import SNEAK_PEEK_PROMPT
        
        logger.info(f"analyze_sneak_peek() - session={session_id}, chars={len(text)}")
        
        # For small policies (≤40k chars), use single-shot for speed
        if len(text) <= self.SPEAK_PEEK_CHUNK_SIZE:
            return await self._analyze_sneak_peek_single(text, session_id)
        
        # For large policies, use parallel chunking
        logger.info(f"Policy text too large ({len(text)} chars) — using parallel Map-Reduce for sneak peek")
        try:
            chunks = self.chunk_text(text, chunk_size=self.SPEAK_PEEK_CHUNK_SIZE, overlap=2000)
            logger.info(f"Splitting sneak peek into {len(chunks)} chunk(s)")
            
            chunk_tasks = [self._process_sneak_peek_chunk(chunk, i) for i, chunk in enumerate(chunks)]
            chunk_results = await asyncio.gather(*chunk_tasks)
            
            return await self._reduce_sneak_peek_chunks(chunk_results)
        except Exception as e:
            logger.error(f"Sneak peek parallel failed, falling back to single-shot: {e}", exc_info=True)
            return await self._analyze_sneak_peek_single(text[:self.SPEAK_PEEK_CHUNK_SIZE], session_id)

    async def _analyze_sneak_peek_single(self, text: str, session_id: str) -> Dict[str, Any]:
        """Single-shot sneak peek analysis for small policies."""
        from ..prompts import SNEAK_PEEK_PROMPT
        
        try:
            safe_text = _sanitize_injected_text(text, "sneak_peek_pdf")
            prompt = f"{SNEAK_PEEK_PROMPT}\n\n<document>\n{safe_text}\n</document>\n\nAnalysis:"
            
            raw = await self.sneak_peek_client._complete(
                prompt=prompt,
                system_prompt="You are ENZIU, an AI insurance policy auditor. Return ONLY valid JSON. No preamble. No markdown.",
                max_tokens=1000,
                timeout=55.0,
                max_retries=2,
            )
            
            analysis = _safe_parse_json(raw, log_prefix="SneakPeek")
            logger.debug(f"SneakPeek analysis keys: {list(analysis.keys())}")
            return self._format_sneak_peek_response(analysis)
            
        except Exception as e:
            logger.error(f"Sneak peek error: {e}", exc_info=True)
            return self._default_sneak_peek()

    async def chat(
        self, session_id: str, message: str, fact_sheet: Dict[str, Any],
        extracted_text: str = "",
    ) -> Dict[str, Any]:
        """
        Answer a question using the fact sheet and chat model.
        
        Args:
            session_id: Session ID for logging
            message: User's question
            fact_sheet: Master Policy Fact Sheet (structured analysis)
            extracted_text: Full raw policy text for searching
            
        Returns:
            Chat response with page citation
        """
        from ..prompts import DEEP_DIVE_PROMPT
        
        logger.info(f"chat() - session={session_id}, has_fact_sheet={bool(fact_sheet)}, has_extracted_text={bool(extracted_text)}")
        
        if not fact_sheet:
            raise ValueError(
                "Fact sheet is missing. Please generate a policy audit first."
            )
        
        try:
            # Build context: fact sheet for structured data, raw text for searching
            context_parts = [f"FACT SHEET (structured analysis):\n{json.dumps(fact_sheet, indent=2)}"]
            if extracted_text:
                context_parts.append(f"RAW POLICY TEXT:\n{extracted_text[:100000]}")
            
            policy_context = "\n\n---\n\n".join(context_parts)
            
            # Prepare prompt with combined context and question
            prompt = DEEP_DIVE_PROMPT.format(
                policy_text=policy_context,
                question=message,
            )
            
            logger.debug(f"chat() prompt length: {len(prompt)} chars")
            
            # Call chat model (Qwen 8B)
            raw = await self.chat_client._complete(
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
            
        except ValueError:
            raise
        except Exception as e:
            logger.error(f"Chat error: {e}")
            return {
                "response": f"I'm sorry, I couldn't process that question: {str(e)}",
                "disclaimer": "Not legal advice",
            }