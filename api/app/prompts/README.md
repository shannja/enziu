# ENZIU AI Prompts

This directory contains the AI prompts used for policy analysis. Each prompt is stored in a separate markdown file for easy editing.

## Files

| File | Purpose |
|------|---------|
| `enziu_index.md` | System prompt for ENZIU Index analysis (grading policies) |
| `customer_deep_dive.md` | Prompt for customer Q&A about a single policy |
| `broker_compare.md` | Prompt for broker mode comparison Q&A |

## How to Edit Prompts

1. Open the `.md` file you want to edit
2. Modify the prompt text
3. Save the file
4. Restart the API server for changes to take effect

## Prompt Details

### sneak_peek.md (Free Preview)
Returns a lightweight analysis to entice payment:
- `score_band` - Grade band only (A+ to F)
- `score_preview` - Risk level (low/medium/high)
- `top_risk` - Single biggest risk
- `red_flag_names` - Names only, no details
- `one_line` - Verdict in 10 words or fewer
- `policy_type` - Type of insurance
- `carrier_name` - Insurance company name

**Never reveals:**
- Page numbers
- Exact excerpts
- Numerical scores
- Full analysis details

### enziu_index.md (Paid Full Report)
Returns comprehensive analysis with:
- Detailed grades (clarity, coverage, claims efficiency)
- Red flags with page citations and exact quotes
- Full policy summary
- Evidence-based analysis

## Prompt Variables

Some prompts use template variables that get replaced at runtime:

### customer_deep_dive.md
- `{policy_text}` - The extracted text from the policy PDF
- `{question}` - The user's question

### broker_compare.md
- `{gradeA}` - Grade of Policy A
- `{summaryA}` - Summary of Policy A
- `{gradeB}` - Grade of Policy B
- `{summaryB}` - Summary of Policy B
- `{question}` - The user's question

## Tips for Better Prompts

1. **Be specific** - Clearly define what you want the AI to analyze
2. **Set constraints** - Tell the AI what NOT to do (e.g., "Never recommend")
3. **Require citations** - Ask for page numbers and direct quotes
4. **Define output format** - Specify JSON structure if needed
5. **Add disclaimers** - Include "not legal advice" warnings

## Testing Changes

After editing prompts, test them by:
1. Running the API locally: `poetry run uvicorn app.main:app --reload`
2. Uploading a test PDF
3. Checking the analysis output

## Example: Adding a New Prompt

1. Create a new file: `api/app/prompts/my_new_prompt.md`
2. Add your prompt text
3. In `__init__.py`, add: `MY_NEW_PROMPT = load_prompt("my_new_prompt.md")`
4. Import in `inference.py`: `from ..prompts import MY_NEW_PROMPT`
5. Use in your code