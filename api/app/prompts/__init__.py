"""
ENZIU Prompts Module
Loads AI prompts from markdown files for easy maintenance.
"""

from pathlib import Path

PROMPTS_DIR = Path(__file__).parent


def load_prompt(filename: str) -> str:
    """Load a prompt from a markdown file."""
    return (PROMPTS_DIR / filename).read_text().strip()


# Load all prompts from markdown files
SNEAK_PEEK_PROMPT = load_prompt("sneak_peek.md")
ENZIU_INDEX_PROMPT = load_prompt("enziu_index.md")
DEEP_DIVE_PROMPT = load_prompt("customer_deep_dive.md")
COMPARE_PROMPT = load_prompt("broker_compare.md")

