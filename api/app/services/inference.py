"""
ENZIU Inference Service
NScale client for Llama 3.3 70B Instruct.

Provides:
- Sneak peek analysis (free preview)
- Full policy analysis with ENZIU Index
- Deep Dive Q&A
- Comparative analysis for brokers
"""

import json
import time
from typing import Dict, Any, Optional

import httpx

from ..config import settings


# ===========================================
# ENZIU Index System Prompt
# ===========================================

ENZIU_INDEX_PROMPT = """You are an insurance policy analyst. Analyze the provided insurance policy text and produce the following:

1. **ENZIU Index Scores** - Grade the policy on three dimensions (A+ to F):
   - **Clarity**: How easy is the policy language to understand? Is it written in plain English or filled with legalese?
   - **Coverage**: How comprehensive is the protection? Are there significant gaps or exclusions?
   - **Claims Efficiency**: How straightforward is the claims process? Are there barriers to filing claims?

2. **Overall Grade**: A weighted combination of the three scores.

3. **Top Risk**: The single most concerning issue in one sentence.

4. **Red Flags**: Up to 3 specific concerns with:
   - Name of the concern
   - Severity (high/medium/low)
   - Page number citation
   - Direct quote from the policy

5. **Summary**: A plain-English summary of what the policy actually covers.

IMPORTANT RULES:
- Every claim must be anchored to a page number
- Never recommend - only quote and locate
- Always include "page X — not legal advice" disclaimer
- Be objective and evidence-based

Return your analysis as valid JSON with this structure:
{
  "grade": {
    "overall": "B",
    "clarity": "C+",
    "coverage": "B-",
    "claimsEfficiency": "A-"
  },
  "topRisk": "The top risk in one sentence",
  "redFlags": [
    {
      "name": "Broad exclusion clause",
      "severity": "high",
      "page": 12,
      "quote": "Direct quote from page 12"
    }
  ],
  "summary": "Plain English summary of the policy"
}
"""

DEEP_DIVE_PROMPT = """You are an insurance policy analyst answering questions about a specific policy.

RULES:
1. Every answer must include a page citation (e.g., "Page 12")
2. Never recommend - only quote and locate relevant clauses
3. Always end with "page X — not legal advice"
4. If you cannot find the answer in the policy, say so clearly
5. Quote the exact policy language when possible

Policy text:
{policy_text}

User question: {question}

Answer:"""

COMPARE_PROMPT = """You are an insurance policy analyst comparing two policies.

RULES:
1. Provide objective, evidence-based comparisons
2. Cite specific policy language when possible
3. Never recommend - only analyze and compare
4. Always end with "page X — not legal advice"

Policy A Grade: {gradeA}
Policy A Summary: {summaryA}

Policy B Grade: {gradeB}
Policy B Summary: {summaryB}

User question: {question}

Comparison:"""


class NScaleClient:
    """
    Client for NScale API (OpenAI-compatible Llama 3.3 70B).
    
    Handles all inference operations for ENZIU analysis.
    """
    
    def __init__(self):
        self.api_key = settings.nscale_api_key
        self.api_base = settings.nscale_api_base
        self.model = settings.nscale_model
        self.headers = {
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
        payload = {
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
    ) -> Dict[str, Any]:
        """
        Generate a sneak peek analysis (free preview).
        
        Returns grade band, top risk, and red flag names only.
        Full details require payment.
        """
        prompt = f"""Analyze this insurance policy and provide a JSON response:

{ENZIU_INDEX_PROMPT}

Policy text (excerpt for preview):
{extracted_text[:5000]}...

Analysis:"""
        
        try:
            response_text = await self._complete(
                prompt=prompt,
                system_prompt="You are an insurance policy analyst. Return valid JSON only.",
            )
            
            # Parse JSON response
            # Remove markdown code blocks if present
            response_text = response_text.strip()
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            
            analysis = json.loads(response_text.strip())
            
            return {
                "grade": analysis.get("grade", {
                    "overall": "C",
                    "clarity": "C",
                    "coverage": "C",
                    "claimsEfficiency": "C",
                }),
                "topRisk": analysis.get("topRisk", "Analysis in progress"),
                "redFlags": [
                    flag.get("name", "Unknown")
                    for flag in analysis.get("redFlags", [])
                ][:3],
                "summary": analysis.get("summary", ""),
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
            }
    
    async def analyze_policy(
        self, extracted_text: str, session_id: str
    ) -> Dict[str, Any]:
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
            
            analysis = json.loads(response_text.strip())
            
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
            
        except Exception as e:
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
    ) -> Dict[str, Any]:
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
        page = None
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
        policyA: Dict[str, Any],
        policyB: Dict[str, Any],
    ) -> Dict[str, Any]:
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
    
    async def store_session(self, session_id: str, data: Dict[str, Any]):
        """
        Store session data in Redis.
        
        In development mode, this is a no-op.
        In production, stores to Upstash Redis.
        """
        # TODO: Implement Redis storage
        pass
    
    async def end_session(self, session_id: str):
        """
        End session and wipe all data.
        """
        # TODO: Implement Redis session deletion
        pass