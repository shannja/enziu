"""
ENZIU Prompts Module
Loads AI prompts from markdown files for easy maintenance.

Two-phase architecture:
  Phase 1 — ENZIU_EXTRACTOR_PROMPT (Scout 17B): extracts Step 0 facts from raw policy text
  Phase 2 — ENZIU_AUDITOR_PROMPT (Llama 3.3 70B): scores facts and generates full report
"""

from pathlib import Path

PROMPTS_DIR = Path(__file__).parent


def load_prompt(filename: str) -> str:
    """Load a prompt from a markdown file."""
    return (PROMPTS_DIR / filename).read_text(encoding="utf-8").strip()


# Two-phase audit prompts
ENZIU_EXTRACTOR_PROMPT = load_prompt("enziu_extractor.md")
ENZIU_AUDITOR_PROMPT = load_prompt("enziu_auditor.md")
