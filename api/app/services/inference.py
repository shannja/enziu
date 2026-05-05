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
import time
from typing import Any

import httpx

from ..config import settings
from ..prompts import SNEAK_PEEK_PROMPT, ENZIU_INDEX_PROMPT, DEEP_DIVE_PROMPT, COMPARE_PROMPT


# Prompts are loaded from markdown files in api/app/prompts/
# Edit the .md files to customize the AI behavior
class NScaleClient:
    """
    Client for NScale API (OpenAI-compatible Llama 3.3 70B).
    
    Handles all inference operations for ENZIU analysis.
    """
    
    def __init__(self) -> None:
        self.api_key = settings.nscale_api_key
        self.api_base = settings.nscale_api_base
        self.model = settings.nscale_model
        self.headers: dict[str, str] = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
    
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
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.api_base}/chat/completions",
                headers=self.headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
    
    async def analyze_sneak_peek(
        self, extracted_text: str, session_id: str
    ) -> dict[str, Any]:
        """
        Generate a sneak peek analysis (free preview).
        
        Returns grade band, top risk, and red flag names only.
        Full details require payment.
        Uses the dedicated SNEAK_PEEK_PROMPT for rapid pre-audit.
        """
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
            
            # Parse JSON response
            # Remove markdown code blocks if present
            response_text = response_text.strip()
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            
            analysis: dict[str, Any] = json.loads(response_text.strip())
            
            return {
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
        
        except (json.JSONDecodeError, Exception) as e:
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
    
    async def analyze_policy(
        self, extracted_text: str, session_id: str
    ) -> dict[str, Any]:
        """
        Generate full policy analysis (paid feature).
        
        Returns complete ENZIU Index with detailed flags and citations.
        """
        prompt = f"""{ENZIU_INDEX_PROMPT}

Full policy text:
{extracted_text}

Analysis:"""
        
        try:
            response_text = await self._complete(
                prompt=prompt,
                system_prompt="You are an insurance policy analyst. Return valid JSON only.",
            )
            
            # Parse JSON
            response_text = response_text.strip()
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            
            analysis: dict[str, Any] = json.loads(response_text.strip())
            
            return {
                "grade": analysis.get("grade"),
                "topRisk": analysis.get("topRisk"),
                "redFlags": [
                    flag.get("name", "Unknown")
                    for flag in analysis.get("redFlags", [])
                ],
                "summary": analysis.get("summary"),
                "detailedFlags": analysis.get("redFlags", []),
            }
        
        except Exception:
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
            except (IndexError, ValueError):
                pass
        
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