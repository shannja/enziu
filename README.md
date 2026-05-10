# 🏆 ENZIU — Universal Insurance Transparency Engine

> **AMD Developer Hackathon 2026 Submission**  
> 🤖 **Track 1: AI Agents & Agentic Workflows**  
> ⚡ Powered by Llama 4 Scout 17B + Llama 3.3 70B on AMD Developer Cloud / Nscale

---

## 🎯 The Problem

**Insurance policies are weapons of mass confusion.** They span 50–100+ pages of intentional legal density. In 2024 alone, **8.8 million claimants** found themselves on the wrong side of fine print they never understood.

You might think *"ChatGPT or Claude can summarize PDFs"* — and you'd be right. But **summarization is not auditing**. A summary tells you what the document says. An **audit tells you what it means for you**, scores it against objective criteria, flags hidden risks, and produces a **reproducible grade** that holds up to scrutiny.

**That's ENZIU.**

---

## ✨ The Solution

ENZIU is a **multi-agent AI auditing system** that doesn't just read your policy — it **audits, scores, and grades it** with the precision of a licensed insurance bad-faith attorney.

### 🔑 Key Differentiators

| Feature | ChatGPT/Claude | ENZIU |
|---------|---------------|-------|
| **Output** | Summary | ENZIU Index (0–100) + Letter Grade |
| **Consistency** | Varies per request | Deterministic (±1 letter grade) |
| **Method** | General analysis | 100+ point criteria across 3 dimensions |
| **Privacy** | Data may be stored | Zero server storage, client-side encryption |
| **Citations** | May hallucinate | Page-verified, excerpt-backed |
| **Legal Standard** | General knowledge | Licensed attorney standard per jurisdiction |

---

## 🏗️ Architecture: Multi-Agent System

ENZIU uses a **two-phase agentic workflow** where specialized AI agents coordinate to produce deterministic, reproducible results:

```
┌─────────────────────────────────────────────────────────────────┐
│                        PDF Upload                               │
│                    (io.BytesIO — Zero Disk)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  AGENT 1: ENZIU Extractor (Llama 4 Scout 17B — 890K context)    │
│  ─────────────────────────────────────────────────────────────  │
│  • Extracts 18 categories of structured facts (A–R)             │
│  • Performs legal risk scan as bad-faith attorney               │
│  • Records page citations for every finding                     │
│  • Output: Structured JSON facts (cached per session)           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  AGENT 2: ENZIU Auditor (Llama 3.3 70B — 131K context)          │
│  ─────────────────────────────────────────────────────────────  │
│  • Scores Clarity (0–30 pts): reading grade, jargon, navigation │
│  • Scores Coverage (0–40 pts): exclusions, waiting periods      │
│  • Scores Claims (0–30 pts): appeal rights, payout timeline     │
│  • Detects Red Flags: 2-source detection (finding + structural) │
│  • Generates 8 Insight Cards with page citations                │
│  • Output: Full ENZIU Report with Index & Grade                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ENZIU Index Calculation                      │
│  ─────────────────────────────────────────────────────────────  │
│  base_score = clarity + coverage + claims (max 100)             │
│  enziu_index = base_score − red_flag_deductions (cap 40)        │
│  grade = A+ (90+) | A (80+) | B+ (75+) | B (70+) | ... | F (<50)│
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Client-Side Encrypted Storage (IndexedDB)          │
│  ─────────────────────────────────────────────────────────────  │
│  • AES-256-GCM encryption with PBKDF2 key derivation            │
│  • Recovery Vault keyed by SHA256(voucher_code)                 │
│  • Zero server-side persistence                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔬 The ENZIU Index

The **ENZIU Index** is a proprietary 0–100 score that objectively evaluates insurance policies across three dimensions:

### 📐 Scoring Criteria (100+ Points)

#### **1. Clarity Score (0–30 points)**
- **Reading Grade (8 pts)**: Flesch-Kincaid analysis across 3 samples
- **Jargon Density (6 pts)**: Undefined legal terms count
- **Definitions Completeness (6 pts)**: Defined vs capitalized terms ratio
- **Passive Voice (5 pts)**: Passive construction ratio
- **Navigability (5 pts)**: TOC, section numbering, cross-references

#### **2. Coverage Score (0–40 points)**
- **Exclusion Volume (12 pts)**: Count and prominence of exclusions
- **Waiting Period (8 pts)**: Presence, page location, days clarity
- **Sub-Limit Transparency (8 pts)**: Location and clarity of sub-limits
- **Pre-Existing Conditions (6 pts)**: Lookback period analysis
- **Renewability & Cancellation (6 pts)**: Notice periods, grounds

#### **3. Claim Efficiency Score (0–30 points)**
- **Filing Clarity (8 pts)**: Contact, forms, documentation, deadlines
- **Appeal Rights (8 pts)**: Internal + external review availability
- **Payout Timeline (7 pts)**: Explicit days commitment
- **Dispute Resolution (7 pts)**: Regulator reference, arbitration flags

### 🚩 Red Flag Detection (Two-Source)

**Source A — Finding-Triggered:**
Every risk finding from the Extractor that meets severity thresholds becomes a red flag with deduction values (1–10 points each).

**Source B — Structural:**
Flags triggered by recorded facts independent of risk findings:
- `no_internal_appeal` (critical, 10 pts)
- `sub_limits_buried` (major, 6 pts)
- `waiting_period_noncompliant` (major, 5 pts)
- `missing_sbc` (minor, 4 pts)
- `renewal_terms_absent` (minor, 3 pts)
- `no_regulator_reference` (minor, 3 pts)

### 📊 Grade Bands

| ENZIU Index | Grade | Preview |
|-------------|-------|---------|
| 90–100 | A+ | High |
| 80–89 | A | High |
| 75–79 | B+ | Medium |
| 70–74 | B | Medium |
| 65–69 | C+ | Medium |
| 60–64 | C | Low |
| 50–59 | D | Low |
| <50 | F | Low |

**Determinism Guarantee:** Same policy → Same facts → Same grade (±1 letter grade band, e.g., B+ or B- for B).

---

## 🔒 Privacy-First Architecture

### Zero Server Storage

```python
# All PDF processing happens in memory
buffer = io.BytesIO(content)  # Never touches disk
doc = fitz.open(stream=buffer, filetype="pdf")
# Processing...
doc.close()  # Nothing persisted
```

### Client-Side Encryption

Reports are encrypted in the browser using **AES-256-GCM** with keys derived via **PBKDF2**:

```typescript
// web/lib/pdf-storage.ts
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const key = await deriveSessionKey(sessionId, salt);
const ciphertext = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
  key,
  plaintext
);
```

### Recovery Vault

Lost your voucher? Recover your report without email or PII:

```typescript
// Store encrypted vault keyed by SHA256(voucher_code)
await storeRecoveryVault(voucherCode, { factSheet, extractedText, sessionId });

// Retrieve with just the voucher code
const data = await getRecoveryVault(voucherCode);
```
Remember that it is stored locally. So if you cleared your browser or used a new machine, it'll be unrecoverable.

---

## ⚡ Llama Stack Integration

ENZIU leverages the **full Llama family** for optimal performance:

| Agent | Model | Context | Purpose |
|-------|-------|---------|---------|
| **Extractor** | Llama 4 Scout 17B | 890K | Fact extraction, legal risk scan |
| **Auditor** | Llama 3.3 70B | 131K | Scoring, grading, insight generation |

### Why Two Models?

- **Scout 17B**: Massive 890K context handles entire policies (100+ pages) in one pass
- **Llama 3.3 70B**: Superior reasoning for complex scoring and legal analysis
- **Temperature 0.0**: Deterministic output for reproducible grades

### Inference Infrastructure

```python
# api/app/config.py
inference_api_base: str = "https://inference.api.nscale.com/v1"
inference_model: str = "meta-llama/Llama-4-Scout-17B-16E-Instruct"
auditor_model: str = "meta-llama/Llama-3.3-70B-Instruct"
```

Powered by **AMD Developer Cloud** for development and **NScale** for production scaling.

---

## 🚀 Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- AMD Developer Cloud account (for GPU access)
- NScale API key (for inference)

### Backend Setup

```bash
# Clone repository
git clone https://github.com/shannja/enziu.git
cd enziu/api

# Install dependencies
poetry install

# Configure environment
cp ../.env.example ../.env
# Edit .env with your API keys

# Run development server
poetry run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
cd web

# Install dependencies
npm install

# Run development server
npm run dev
```

### Environment Variables

```env
# Inference (NScale)
INFERENCE_API_KEY=your_nscale_api_key
INFERENCE_API_BASE=https://inference.api.nscale.com/v1
INFERENCE_MODEL=meta-llama/Llama-4-Scout-17B-16E-Instruct
AUDITOR_MODEL=meta-llama/Llama-3.3-70B-Instruct

# Paddle Billing
PADDLE_ENV=sandbox
PADDLE_CLIENT_TOKEN=your_client_token
PADDLE_WEBHOOK_SECRET=whsec_your_secret
PADDLE_PRODUCT_ID=pro_xxxxx

# Voucher System
VOUCHER_HMAC_SECRET=your_hmac_secret

# Security
API_SECRET_KEY=openssl rand -hex 32
```

---

## 📊 Live Demo

Try ENZIU live on Vercel:

👉 **[enziu.vercel.app](https://enziu.vercel.app)**

---

## 🛠️ Tech Stack

### Backend
- **FastAPI** — Async Python web framework
- **PyMuPDF** — In-memory PDF extraction
- **HTTPX** — Async LLM API client
- **Bcrypt** — Voucher passphrase hashing
- **SlowAPI** — Rate limiting

### Frontend
- **Next.js 15** — React 19 with App Router
- **TypeScript** — Type-safe development
- **Tailwind CSS** — Utility-first styling
- **Radix UI** — Accessible components
- **Framer Motion** — Animations
- **IndexedDB** — Client-side encrypted storage

### AI/ML
- **Llama 4 Scout 17B** — Fact extraction (890K context)
- **Llama 3.3 70B** — Policy auditing (131K context)
- **NScale Inference API** — Production serving
- **AMD Developer Cloud** — Development & benchmarking

### Infrastructure
- **Vercel** — Frontend hosting
- **AMD Developer Cloud** — GPU compute
- **Upstash Redis** — Session state and voucher log (optional)
- **Paddle** — Payment processing

---

## 📝 API Reference

### Extract & Audit Policy

```http
POST /api/extract
Content-Type: multipart/form-data

file: <pdf_file>
```

**Response:**
```json
{
  "session_id": "uuid",
  "extracted_text": "[{\"page_number\": 1, \"text\": \"...\"}]",
  "grade": {
    "overall": "B+",
    "clarity": "A",
    "coverage": "B",
    "claimsEfficiency": "C+"
  },
  "topRisk": "No internal appeal process",
  "redFlags": ["No internal appeal process"],
  "summary": "This policy covers...",
  "score_preview": "medium",
  "policy_type": "health",
  "carrier_name": "Example Insurance",
  "full_report": { /* Complete ENZIU report */ }
}
```

### Validate Voucher

```http
POST /api/voucher/validate
Content-Type: application/json

{
  "code": "ENZ-ABCD-EFGH-IJKL-MN",
  "passphrase": "my-secure-passphrase"
}
```

### Policy Audit (Cache Lookup)

```http
POST /api/policy/audit
Content-Type: application/json

{
  "session_id": "uuid",
  "extracted_text": "[...]"
}
```

---

## 🤝 Contributing

ENZIU is open source under the MIT License. Contributions welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **AMD Developer Cloud** — GPU compute credits and support
- **Meta AI** — Llama 4 and Llama 3.3 open-source models
- **NScale** — Production inference infrastructure
- **Hugging Face** — Model hub and deployment platform
- **lablab.ai** — Hackathon platform

---

## 📬 Contact

- **GitHub**: [github.com/shannja/enziu](https://github.com/shannja/enziu)
- **Website**: [enziu.vercel.app](https://enziu.vercel.app)

---

<div align="center">

**Built with ⚡ by eseyem Team for AMD Developer Hackathon 2026**

🤖 Track 1: AI Agents & Agentic Workflows

</div>
