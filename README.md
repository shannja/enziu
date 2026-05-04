# ENZIU — Insurance Transparency Engine

**Understand what you actually bought.** Scored, cited, plain English analysis — zero data stored.

## Overview

ENZIU is an insurance transparency engine with a "Stateless" and "Zero-Footprint" architecture where user data is never written to disk. All PDF processing happens in memory.

## Project Structure

```
enziu/
├── web/                    # Next.js 14+ Frontend (TypeScript)
│   ├── app/               # App Router pages
│   ├── components/        # React components
│   │   ├── ui/           # Shadcn/UI components
│   │   ├── customer/     # Customer mode components
│   │   └── broker/       # Broker mode components
│   ├── lib/              # Utilities
│   ├── types/            # TypeScript definitions
│   └── tailwind.config.ts # Tailwind with Amber brand
│
├── api/                    # FastAPI Backend (Python)
│   └── app/
│       ├── main.py        # FastAPI app with /upload endpoint
│       ├── config.py      # Configuration management
│       ├── services/
│       │   ├── pdf_extractor.py  # PyMuPDF in-memory extraction
│       │   ├── inference.py      # NScale Llama 3.3 client
│       │   └── voucher.py        # HMAC + bcrypt validation
│       └── models/
│           └── schemas.py        # Pydantic models
│
├── assets/                 # Branding
│   └── logo/
│       └── amber-asterisk.svg
│
├── .env.example           # Environment template
└── .gitignore
```

## Features

### Customer Mode ($4.99 per audit)
- Upload insurance PDF → stream to memory
- Free Sneak Peek (grade band, top risk, red flags)
- Pay $4.99 via Paddle for full report
- Deep Dive Q&A (5 chats with page citations)
- Session wiped on tab close

### Broker Mode (Voucher packs)
- Upload 2 PDFs for comparison
- Voucher code + passphrase authentication
- Split view with Policy A/B toggle
- Comparative Q&A with verdict bar
- Chat limits: PAYG 5, Starter 10, Pro 20, Office 20

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14+ on Vercel |
| Styling | Tailwind CSS + Shadcn/UI |
| Backend | FastAPI on Railway |
| Inference | NScale (Llama 3.3 70B) |
| State | Upstash Redis |
| Payments | Paddle Billing |

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- Poetry (for Python dependencies)

### Frontend Setup

```bash
cd web
npm install
npm run dev
```

### Backend Setup

```bash
cd api
poetry install
cp ../.env.example .env
# Edit .env with your API keys
poetry run uvicorn app.main:app --reload
```

### Environment Variables

See `.env.example` for all required variables:
- `NSCALE_API_KEY` — NScale inference API key
- `UPSTASH_REDIS_REST_URL` — Upstash Redis URL
- `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis token
- `PADDLE_CLIENT_TOKEN` — Paddle.js client token
- `VOUCHER_HMAC_SECRET` — HMAC secret for voucher validation

## Security & Privacy

- **Zero disk write**: All PDFs processed in memory via `io.BytesIO`
- **No PII storage**: Voucher system uses code + bcrypt passphrase only
- **HMAC validation**: Fast rejection of fake voucher codes
- **Session cleanup**: Data wiped when tab closes
- **Not legal advice**: Every response includes disclaimer

## Legal Disclaimer

ENZIU provides analysis, not legal advice. All outputs are scores, citations, and direct quotes. Every response includes "page X — not legal advice."

## License

© 2024 ENZIU. All rights reserved.