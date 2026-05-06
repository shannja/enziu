"""
ENZIU Inference Service
NScale client for Llama 3.3 70B Instruct.

Provides:
- Sneak peek analysis (free preview)
- Full policy analysis with ENZIU Index
- Deep Dive Q&A
- Comparative analysis for brokers
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import httpx

from ..config import settings
from ..prompts import SNEAK_PEEK_PROMPT, ENZIU_INDEX_PROMPT, DEEP_DIVE_PROMPT, COMPARE_PROMPT

# Configure logging for inference
logger = logging.getLogger("inference")
logger.setLevel(logging.DEBUG if settings.debug else logging.INFO)

# Prompts are loaded from markdown files in api/app/prompts/
# Edit the .md files to customize the AI behavior
class NScaleClient:
    """
    Client for NScale API (OpenAI-compatible Llama 3.3 70B).
    
    Handles all inference operations for ENZIU analysis.
    """
    
    def __init__(self) -> None:
        self.api_key = settings.nscale_service_token
        self.api_base = settings.nscale_api_base
        self.model = settings.nscale_model
        self.headers: dict[str, str] = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        logger.info(f"NScaleClient initialized - model: {self.model}, api_base: {self.api_base}")
        logger.debug(f"API key prefix: {self.api_key[:8]}..." if self.api_key else "No API key configured")
    
    async def _complete(
        self,
        prompt: str,
        system_prompt: str = "You are a helpful insurance policy analyst.",
        temperature: float = 0.1,
        max_tokens: int = 2000,
    ) -> str:
        """
        Send a completion request to NScale.
        
        Args:
            prompt: User prompt
            system_prompt: System instructions
            temperature: Sampling temperature
            max_tokens: Maximum response tokens
            
        Returns:
            Generated text response
        """
        start_time = time.time()
        prompt_preview = prompt[:200] + "..." if len(prompt) > 200 else prompt
        
        logger.debug(f"_complete() called - temp={temperature}, max_tokens={max_tokens}")
        logger.debug(f"Prompt preview: {prompt_preview}")
        logger.debug(f"System prompt: {system_prompt[:100]}...")
        
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        
        logger.info(f"Sending NScale request - model={self.model}, temp={temperature}, max_tokens={max_tokens}")
        logger.debug(f"API endpoint: {self.api_base}/chat/completions")
        logger.debug(f"API key prefix: {self.api_key[:8]}..." if self.api_key else "No API key")
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                logger.debug("HTTP client created, sending POST request...")
                response = await client.post(
                    f"{self.api_base}/chat/completions",
                    headers=self.headers,
                    json=payload,
                )
                
                elapsed = time.time() - start_time
                logger.info(f"NScale response - status={response.status_code}, time={elapsed:.2f}s")
                
                if response.status_code != 200:
                    logger.error(f"NScale API error: {response.status_code} - {response.text[:500]}")
                    raise Exception(f"NScale API error: {response.status_code} - {response.text}")
                
                data = response.json()
                
                # Extract response content
                if "choices" in data and len(data["choices"]) > 0:
                    content = data["choices"][0]["message"]["content"]
                    logger.debug(f"Response content length: {len(content)} chars")
                    logger.debug(f"Response preview: {content[:200]}...")
                    
                    # Log token usage if available
                    if "usage" in data:
                        usage = data["usage"]
                        logger.debug(f"Token usage - prompt: {usage.get('prompt_tokens', 'N/A')}, completion: {usage.get('completion_tokens', 'N/A')}")
                    
                    logger.info(f"Successfully received response from NScale - {len(content)} chars")
                    return content
                else:
                    logger.error(f"Unexpected response format: {data}")
                    raise Exception(f"Unexpected NScale response format: {list(data.keys())}")
                    
        except httpx.ConnectTimeout:
            logger.error("Connection timeout to NScale API - check network/firewall")
            raise Exception("Connection timeout to NScale API")
        except httpx.HTTPError as e:
            logger.error(f"HTTP error calling NScale: {type(e).__name__} - {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Error calling NScale: {type(e).__name__} - {str(e)}")
            raise
    
    async def analyze_sneak_peek(
        self, extracted_text: str, session_id: str
    ) -> dict[str, Any]:
        """
        Generate a sneak peek analysis (free preview).
        
        Returns grade band, top risk, and red flag names only.
        Full details require payment.
        Uses the dedicated SNEAK_PEEK_PROMPT for rapid pre-audit.
        """
        start_time = time.time()
        logger.info(f"analyze_sneak_peek() - session_id={session_id}, text_length={len(extracted_text)}")
        logger.debug(f"Using SNEAK_PEEK_PROMPT for analysis")
        
        prompt = f"""{SNEAK_PEEK_PROMPT}

Policy text (excerpt for preview):
{extracted_text[:5000]}...

Analysis:"""
        
        try:
            response_text = await self._complete(
                prompt=prompt,
                system_prompt="You are ENZIU, an AI insurance policy auditor. Return ONLY valid JSON. No preamble. No markdown.",
                temperature=0.1,
                max_tokens=500,
            )
            
            logger.debug(f"Raw response received: {response_text[:200]}...")
            
            # Parse JSON response
            # Remove markdown code blocks if present
            response_text = response_text.strip()
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            
            analysis: dict[str, Any] = json.loads(response_text.strip())
            logger.debug(f"Parsed JSON analysis: {list(analysis.keys())}")
            
            result = {
                "grade": {
                    "overall": analysis.get("score_band", "C"),
                    "clarity": "C",
                    "coverage": "C",
                    "claimsEfficiency": "C",
                },
                "topRisk": analysis.get("top_risk", "Analysis in progress"),
                "redFlags": analysis.get("red_flag_names", ["Analysis in progress"])[:3],
                "summary": analysis.get("one_line", "Full analysis available after payment."),
                # Additional sneak peek data
                "score_preview": analysis.get("score_preview", "medium"),
                "policy_type": analysis.get("policy_type", "other"),
                "carrier_name": analysis.get("carrier_name"),
            }
            
            elapsed = time.time() - start_time
            logger.info(f"Sneak peek analysis completed - session_id={session_id}, time={elapsed:.2f}s")
            logger.debug(f"Result: grade={result['grade']['overall']}, policy_type={result['policy_type']}")
            
            return result
        
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error in sneak peek: {str(e)}")
            logger.debug(f"Response that failed to parse: {response_text[:500]}")
            # Return placeholder analysis on error
            return {
                "grade": {
                    "overall": "C",
                    "clarity": "C",
                    "coverage": "C",
                    "claimsEfficiency": "C",
                },
                "topRisk": "Unable to analyze policy at this time",
                "redFlags": ["Analysis in progress"],
                "summary": "Full analysis available after payment.",
                "score_preview": "medium",
                "policy_type": "other",
                "carrier_name": None,
            }
        except Exception as e:
            logger.error(f"Error in sneak peek analysis: {type(e).__name__} - {str(e)}")
            return {
                "grade": {
                    "overall": "C",
                    "clarity": "C",
                    "coverage": "C",
                    "claimsEfficiency": "C",
                },
                "topRisk": "Unable to analyze policy at this time",
                "redFlags": ["Analysis in progress"],
                "summary": "Full analysis available after payment.",
                "score_preview": "medium",
                "policy_type": "other",
                "carrier_name": None,
            }
    
    async def analyze_policy(
        self, extracted_text: str, session_id: str
    ) -> dict[str, Any]:
        """
        Generate full policy analysis (paid feature).
        
        Returns complete ENZIU Index with detailed flags and citations.
        """
        start_time = time.time()
        logger.info(f"analyze_policy() - session_id={session_id}, text_length={len(extracted_text)}")
        logger.debug(f"Using ENZIU_INDEX_PROMPT for full analysis")
        
        prompt = f"""{ENZIU_INDEX_PROMPT}

Full policy text:
{extracted_text}

Analysis:"""
        
        try:
            response_text = await self._complete(
                prompt=prompt,
                system_prompt="You are an insurance policy analyst. Return valid JSON only.",
            )
            
            logger.debug(f"Raw response received: {response_text[:200]}...")
            
            # Parse JSON
            response_text = response_text.strip()
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            
            analysis: dict[str, Any] = json.loads(response_text.strip())
            logger.debug(f"Parsed JSON analysis keys: {list(analysis.keys())}")
            
            result = {
                "grade": analysis.get("grade"),
                "topRisk": analysis.get("topRisk"),
                "redFlags": [
                    flag.get("name", "Unknown")
                    for flag in analysis.get("redFlags", [])
                ],
                "summary": analysis.get("summary"),
                "detailedFlags": analysis.get("redFlags", []),
            }
            
            elapsed = time.time() - start_time
            logger.info(f"Full policy analysis completed - session_id={session_id}, time={elapsed:.2f}s, flags={len(result['redFlags'])}")
            
            return result
        
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error in policy analysis: {str(e)}")
            return {
                "grade": {
                    "overall": "C",
                    "clarity": "C",
                    "coverage": "C",
                    "claimsEfficiency": "C",
                },
                "topRisk": "Analysis error",
                "redFlags": [],
                "summary": "Unable to complete analysis.",
            }
        except Exception as e:
            logger.error(f"Error in policy analysis: {type(e).__name__} - {str(e)}")
            return {
                "grade": {
                    "overall": "C",
                    "clarity": "C",
                    "coverage": "C",
                    "claimsEfficiency": "C",
                },
                "topRisk": "Analysis error",
                "redFlags": [],
                "summary": "Unable to complete analysis.",
            }
    
    async def chat(
        self, session_id: str, message: str
    ) -> dict[str, Any]:
        """
        Deep Dive Q&A for a single policy.
        """
        start_time = time.time()
        logger.info(f"chat() - session_id={session_id}, message_length={len(message)}")
        logger.debug(f"Chat message: {message[:200]}...")
        
        # Retrieve session data (in production, fetch from Redis)
        policy_text = ""  # Would be retrieved from session storage
        
        prompt = DEEP_DIVE_PROMPT.format(
            policy_text=policy_text[:8000] if policy_text else "[Policy text]",
            question=message,
        )
        
        response = await self._complete(
            prompt=prompt,
            system_prompt="You are an insurance policy analyst. Always cite page numbers.",
        )
        
        # Extract page number if mentioned
        page: int | None = None
        if "page " in response.lower():
            try:
                page_str = response.lower().split("page ")[1].split()[0]
                page = int("".join(filter(str.isdigit, page_str)))
                logger.debug(f"Extracted page number: {page}")
            except (IndexError, ValueError):
                logger.debug("No page number found in response")
        
        elapsed = time.time() - start_time
        logger.info(f"Chat response generated - session_id={session_id}, time={elapsed:.2f}s, response_length={len(response)}")
        
        return {
            "response": response,
            "page": page,
            "disclaimer": "page X — not legal advice",
        }
    
    async def compare(
        self,
        session_id: str,
        message: str,
        policyA: dict[str, Any],
        policyB: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Comparative analysis for broker mode.
        """
        start_time = time.time()
        logger.info(f"compare() - session_id={session_id}, gradeA={policyA.get('grade', {}).get('overall', 'Unknown')}, gradeB={policyB.get('grade', {}).get('overall', 'Unknown')}")
        logger.debug(f"Comparison question: {message[:200]}...")
        
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
        )
        
        elapsed = time.time() - start_time
        logger.info(f"Comparison completed - session_id={session_id}, time={elapsed:.2f}s, response_length={len(response)}")
        
        return {
            "response": response,
            "disclaimer": "page X — not legal advice",
        }
    
    async def store_session(self, session_id: str, data: dict[str, Any]) -> None:
        """
        Store session data in Redis.
        
        In development mode, this is a no-op.
        In production, stores to Upstash Redis.
        """
        # TODO: Implement Redis storage
        pass
    
    async def end_session(self, session_id: str) -> None:
        """
        End session and wipe all data.
        """
        # TODO: Implement Redis session deletion
        pass