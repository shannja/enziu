# AMD Developer Hackathon 2024 — ENZIU Submission

---

## Submission Title
**ENZIU**

---

## Short Description
ENZIU audits your actual insurance policy PDF and returns a scored ENZIU Index based on Clarity, Coverage, and Claim Efficiency, with red flags, page citations, and a Deep Dive Q&A. No accounts. No stored data.

---

## Long Description

Insurance policies are intentionally dense, often spanning 50 to 100+ pages of legal language that 8.8 million claimants found themselves on the wrong side of in 2024. ENZIU is the Universal Insurance Transparency Engine designed to reverse this information asymmetry.

As a stateless, privacy-first AI transparency engine, ENZIU allows users to upload their actual insurance PDF, any carrier, any format, and receive a structured ENZIU Index score. This score evaluates policies across three critical pillars: Clarity, Coverage Alignment, and Claim Efficiency. Unlike existing tools that rely on insurer-curated data, ENZIU audits the specific document you signed.

### Why ENZIU is Different from ChatGPT/Claude

You might think *"ChatGPT or Claude can summarize PDFs"* — and you'd be right. But **summarization is not auditing**. A summary tells you what the document says. An audit tells you what it means for you, scores it against objective criteria, flags hidden risks, and produces a **reproducible grade** that holds up to scrutiny.

ENZIU is a **multi-agent AI system** that:
- Uses **Llama 4 Scout 17B** (890K context) for deterministic fact extraction across 18 categories
- Uses **Llama 3.3 70B** (131K context) for scoring, grading, and legal analysis
- Applies **100+ point criteria** across Clarity, Coverage, and Claim Efficiency
- Detects **red flags** from two sources: finding-triggered and structural
- Generates **8 insight cards** answering real policyholder questions with page citations
- Produces an **ENZIU Index (0–100)** with letter grades (A+ to F)
- Guarantees **deterministic results** — same policy, same grade (±1 letter band)

### Multi-Agent Architecture

```
PDF Upload → AGENT 1 (Extractor: Scout 17B) → AGENT 2 (Auditor: Llama 3.3 70B) → ENZIU Index → Encrypted Client Storage
```

**Agent 1 — ENZIU Extractor** acts as a licensed insurance bad-faith attorney, scanning for:
- Definitions completeness, jargon density, reading grade level
- Material exclusions, waiting periods, sub-limits
- Appeal rights, payout timelines, regulator references
- 8 categories of legal risk findings (rights removal, unchecked discretion, ambiguity, etc.)

**Agent 2 — ENZIU Auditor** scores the extracted facts:
- Clarity Score (0–30): reading grade, jargon, definitions, passive voice, navigability
- Coverage Score (0–40): exclusion volume, waiting period, sub-limits, pre-existing conditions, renewability
- Claim Efficiency Score (0–30): filing clarity, appeal rights, payout timeline, dispute resolution
- Red Flag Deductions (cap 40): two-source detection with severity-based point values

### Privacy-First Design

- **Zero server storage** — All PDF processing happens in-memory via `io.BytesIO`
- **Client-side encryption** — AES-256-GCM with PBKDF2 key derivation
- **Recovery Vault** — Encrypted report storage keyed by SHA256(voucher_code)
- **No PII collection** — Only voucher code + bcrypt-hashed passphrase
- **Vending Machine model** — Cryptographically signed vouchers via Upstash Redis

### Technology Stack

The platform offers two distinct flows: a Consumer tier for individual policyholders to understand their risks in plain English, and a Broker tier for side-by-side policy comparisons with data-backed evidence. Built on the AMD Developer Cloud for development flexibility and transitioning to NScale for production scaling, the system utilizes Llama 4 Scout 17B with an 890K context window to process entire policies in a single inference pass, ensuring no clauses are missed due to chunking or truncation. The Llama 3.3 70B model handles the complex scoring and legal analysis with its 131K context window.

Our "Vending Machine" business model uses cryptographically signed vouchers and Upstash Redis to ensure zero PII is stored, building ultimate user trust through a "Zero Disk Write" architecture.

---

## Participation Mode
**Online**

---

## Categories
- ✅ Assistant
- ✅ Documents
- ✅ Legal
- ✅ Utility and Tools
- ✅ Web Application

---

## Event Tracks
**AI Agents & Agentic Workflows (Best Track for Beginners)**

---

## Technologies Used
- **Llama 4** (Scout 17B for extraction)
- **Llama 3** (3.3 70B for auditing)
- **Redis** (Upstash for session state)
- **Vercel** (Frontend hosting)
- **AMD Developer Cloud** (GPU compute for development)
- **AMD ROCm** (Open-source GPU computing platform)

---

## 🚢 Extra Challenge: Ship It + Build in Public

### Technical Update Post Link 1
https://twitter.com/yourhandle/status/xxxxx

### Technical Update Post Link 2
https://linkedin.com/posts/yourhandle_xxxxx

### Technical Update Post Link 3
*(Optional — add if applicable)*

### Technical Update Post Link 4
*(Optional — add if applicable)*

---

## AMD Developer Experience Feedback

### ROCm
> ROCm provided a solid open-source alternative to CUDA for our GPU workloads. The installation process was straightforward, and the PyTorch integration worked well for our Llama model inference. Documentation was comprehensive, though we'd love to see more examples specific to large language model deployment.

### AMD Developer Cloud
> The AMD Developer Cloud made it incredibly easy to spin up GPU environments without hardware overhead. The $100 credits were sufficient for our development and benchmarking needs. The ability to access MI300X instances on-demand accelerated our prototyping significantly.

### AMD APIs
> The AMD APIs for GPU access were reliable and well-documented. We appreciated the pay-as-you-go flexibility and the clear pricing structure. The cloud interface was intuitive for managing instances and monitoring resource usage.

---

## Open Source / Technical Walkthrough Link

**GitHub Repository:** https://github.com/shannja/enziu

**Technical Walkthrough:** *(Coming soon — will document the multi-agent architecture, ENZIU Index calculation, and client-side encryption implementation)*

---

## Hugging Face Space

**Demo:** https://huggingface.co/spaces/shannja/enziu

---

## Additional Notes for Judges

### Why ENZIU Fits Track 1: AI Agents & Agentic Workflows

ENZIU demonstrates a sophisticated multi-agent system where:
1. **Agent Coordination**: Two specialized AI agents (Extractor + Auditor) work in sequence, with the Extractor's output feeding directly into the Auditor's input
2. **Deterministic Workflow**: Temperature 0.0 ensures reproducible results — same input always produces same output
3. **Domain Expertise**: Agents act as licensed insurance bad-faith attorneys, applying legal standards per jurisdiction
4. **Complex Decision Making**: 100+ point criteria across multiple dimensions with two-source red flag detection
5. **End-to-End System**: From PDF upload to encrypted report delivery, the entire workflow is automated

### Business Value

- **Consumer Protection**: Helps 8.8M+ annual claimants understand their policies before filing claims
- **Broker Tool**: Enables side-by-side policy comparison with objective, data-backed evidence
- **Regulatory Compliance**: Identifies policies that may violate consumer protection statutes
- **Scalable**: PAYG voucher model with zero marginal cost per audit

### Originality

- **Not a PDF Chatbot**: Unlike ChatGPT/Claude, ENZIU produces a deterministic, reproducible score
- **ENZIU Index**: Proprietary 0–100 scoring system with letter grades (A+ to F)
- **Legal Standard**: Applies licensed attorney analysis, not general knowledge
- **Zero-Knowledge Privacy**: Client-side encryption with recovery vault — no PII stored

---

<div align="center">

**Built with ⚡ by ENZIU Team for AMD Developer Hackathon 2024**

🤖 Track 1: AI Agents & Agentic Workflows

</div>