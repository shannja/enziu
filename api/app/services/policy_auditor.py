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
from ..prompts import MAP_CHUNK_PROMPT, REDUCE_FACTSHEET_PROMPT
from .inference import InferenceClient

logger = logging.getLogger("policy_auditor")
logger.setLevel(logging.DEBUG if settings.debug else logging.INFO)


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
            # Prepare prompt with chunk text
            prompt = MAP_CHUNK_PROMPT.format(chunk_text=chunk)
            
            # Call primary model (Llama 70B)
            raw_response = await self.primary_client._complete(
                prompt=prompt,
                system_prompt="You are an insurance policy auditor extracting facts from a document chunk.",
                max_tokens=2000,
                timeout=55.0,  # Serverless-safe timeout
                max_retries=1,
            )
            
            # Parse JSON response
            cleaned = raw_response.strip().removeprefix("```json").removesuffix("```").strip()
            chunk_facts = json.loads(cleaned)
            
            logger.info(
                f"Chunk {chunk_index} processed: "
                f"limits={len(chunk_facts.get('liability_limits', []))}, "
                f"exclusions={len(chunk_facts.get('exclusions', []))}, "
                f"clauses={len(chunk_facts.get('clauses', []))}, "
                f"flags={len(chunk_facts.get('red_flags', []))}"
            )
            
            return chunk_facts
            
        except Exception as e:
            logger.error(f"Error processing chunk {chunk_index}: {e}")
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
            
            # Parse JSON response
            cleaned = raw_response.strip().removeprefix("```json").removesuffix("```").strip()
            fact_sheet = json.loads(cleaned)
            
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
            logger.error(f"Error in reduce phase: {e}")
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

    async def analyze_sneak_peek(self, text: str, session_id: str) -> Dict[str, Any]:
        """
        Generate a free sneak peek using the cheaper model.
        Processes the FULL document (not just first chunk).
        
        Args:
            text: Full policy text
            session_id: Session ID for logging
            
        Returns:
            Sneak peek analysis
        """
        from ..prompts import SNEAK_PEEK_PROMPT
        
        logger.info(f"analyze_sneak_peek() - session={session_id}, chars={len(text)}")
        
        try:
            # Use the full text (Qwen 14B can handle it)
            prompt = f"{SNEAK_PEEK_PROMPT}\n\nPolicy text:\n{text}\n\nAnalysis:"
            
            # Call sneak peek model (Qwen 14B)
            raw = await self.sneak_peek_client._complete(
                prompt=prompt,
                system_prompt="You are ENZIU, an AI insurance policy auditor. Return ONLY valid JSON. No preamble. No markdown.",
                max_tokens=500,
                timeout=55.0,
                max_retries=2,
            )
            
            # Parse JSON response
            cleaned = raw.strip().removeprefix("```json").removesuffix("```").strip()
            analysis = json.loads(cleaned)
            
            # Format response
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

    async def chat(
        self, session_id: str, message: str, fact_sheet: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Answer a question using the fact sheet and chat model.
        
        Args:
            session_id: Session ID for logging
            message: User's question
            fact_sheet: Master Policy Fact Sheet
            
        Returns:
            Chat response with page citation
        """
        from ..prompts import DEEP_DIVE_PROMPT
        
        logger.info(f"chat() - session={session_id}")
        
        if not fact_sheet:
            raise ValueError(
                "Fact sheet is missing. Please generate a policy audit first."
            )
        
        try:
            # Serialize fact sheet to JSON string
            fact_sheet_json = json.dumps(fact_sheet, indent=2)
            
            # Prepare prompt with fact sheet and question
            prompt = DEEP_DIVE_PROMPT.format(
                policy_text=fact_sheet_json,
                question=message,
            )
            
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