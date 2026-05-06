# ENZIU — Insurance Transparency Engine

**Understand what you actually bought.** Scored, cited, plain English analysis — zero data stored.

## Overview

ENZIU is an insurance transparency engine with a "Stateless" and "Zero-Footprint" architecture where user data is never written to disk. All PDF processing happens in memory.

## Project Structure

```
enziu/
├── web/                    # Next.js 15+ Frontend (TypeScript)
│   ├── app/               # App Router pages
│   ├── components/        # React components
│   │   ├── ui/           # Shadcn/UI components
│   │   ├── customer/     # Customer mode components
│   │   └── broker/       # Broker mode components
│   ├── lib/              # Utilities
│   ├── types/            # TypeScript definitions
│   └── tailwind.config.ts # Tailwind with Amber brand
│
├── api/                    # FastAPI Backend (Python 3.11+)
│   └── app/
│       ├── main.py        # FastAPI app with /upload endpoint
│       ├── config.py      # Configuration management
│       ├── services/
│       │   ├── pdf_extractor.py  # PyMuPDF in-memory extraction
│       │   ├── inference.py      # NScale Llama 3.3 client
│       │   ├── voucher.py        # HMAC + bcrypt validation
│       │   └── security.py       # Rate limiting, validation, auth
│       └── models/
│           └── schemas.py        # Pydantic models
│
├── .github/
│   └── workflows/         # CI/CD pipelines
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
| Frontend | Next.js 15+ on Vercel |
| Styling | Tailwind CSS + Shadcn/UI |
| Backend | FastAPI 0.115+ on Railway |
| Inference | NScale (Llama 3.3 70B) |
| State | Upstash Redis |
| Payments | Paddle Billing |
| CI/CD | GitHub Actions |

---

## Security Architecture

### Frontend-Backend Communication

```
┌─────────────────┐     HTTPS      ┌─────────────────┐     HTTPS     ┌─────────────────┐
│   Frontend      │───────────────▶│   Backend API   │──────────────▶│  NScale API     │
│  (Next.js)      │   JSON/FormData│   (FastAPI)     │  JSON/HTTP    │ (Llama 3.3)     │
│  Vercel         │◀───────────────│   Railway       │◀──────────────│                 │
└─────────────────┘     JSON       └─────────────────┘   JSON        └─────────────────┘
                                                                    │
                                                                    ▼
                                                           ┌─────────────────┐
                                                           │  Upstash Redis  │
                                                           │  (Sessions)     │
                                                           └─────────────────┘
```

### Data Security Measures

1. **Zero Disk Write**: All PDFs processed in memory via `io.BytesIO`
2. **No PII Storage**: Voucher system uses code + bcrypt passphrase only
3. **Session Isolation**: Each user gets unique session ID, auto-expires in 1 hour
4. **Automatic Cleanup**: All session data wiped when tab closes
5. **Encrypted Transit**: All communication uses HTTPS in production

### API Security

#### Rate Limiting
| Endpoint Type | Limit | Reason |
|--------------|-------|--------|
| Upload | 10/min | Expensive AI processing |
| Chat | 30/min | AI inference costs |
| Voucher | 20/min | Financial operations |
| Health | 100/min | Monitoring |
| General | 100/min | Default |

#### Input Validation
- **File Size**: Maximum 10MB for PDF uploads
- **File Type**: Only PDF files accepted
- **Content Type**: Strict validation for multipart/form-data and application/json
- **Request Size**: Content-Length validation before processing
- **Suspicious Agents**: Detection and logging of known attack tools

#### Security Headers
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `Content-Security-Policy: default-src 'self'; ...`
- `Referrer-Policy: strict-origin-when-cross-origin`

#### Authentication
- API key validation for voucher endpoints (production)
- HMAC validation for voucher code integrity
- Bcrypt passphrase verification

### Security Monitoring

All security events are logged including:
- Rate limit violations
- Authentication failures
- Suspicious user agents
- File upload attempts
- Invalid content types

---

## Getting Started

### Prerequisites
- Node.js 20+
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
poetry add slowapi  # For rate limiting
cp ../.env.example .env
# Edit .env with your API keys
poetry run uvicorn app.main:app --reload
```

### Environment Variables

See `.env.example` for all required variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `NSCALE_API_KEY` | NScale inference API key | Yes |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL | Yes |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token | Yes |
| `PADDLE_CLIENT_TOKEN` | Paddle.js client token | Yes |
| `VOUCHER_HMAC_SECRET` | HMAC secret for voucher validation | Yes |
| `API_SECRET_KEY` | Secret key for authentication | Yes (prod) |
| `DEBUG` | Debug mode (false in production) | No |
| `ALLOWED_ORIGINS` | CORS allowed origins | Yes |

---

## Deployment Guide

### Frontend (Vercel)

#### 1. Connect Repository
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New Project"
3. Import your GitHub repository
4. Select the `web` folder as the root directory

#### 2. Environment Variables
Set these in Vercel → Project Settings → Environment Variables:

```bash
# Required
NEXT_PUBLIC_API_URL=https://your-api.railway.app/api

# Optional (for monitoring)
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
```

#### 3. Build Settings
- **Framework Preset**: Next.js
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install`

#### 4. Deploy
- Push to main branch for automatic deployment
- Or run `vercel --prod` locally

#### 5. Custom Domain (Recommended)
1. Go to Project Settings → Domains
2. Add your domain (e.g., `enziu.com`)
3. Configure DNS records as instructed

---

### Backend (Railway)

#### 1. Connect Repository
1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository

#### 2. Service Configuration
- **Root Directory**: `api`
- **Start Command**: `poetry run uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Healthcheck Path**: `/api/health`

#### 3. Environment Variables
Set ALL of these in Railway → Project → Variables:

```bash
# NScale Inference
NSCALE_API_KEY=your_nscale_api_key
NSCALE_API_BASE=https://api.nscale.com/v1
NSCALE_MODEL=llama-3.3-70b-instruct

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_redis_token

# Paddle Billing
PADDLE_ENV=production  # or sandbox for testing
PADDLE_CLIENT_TOKEN=your_paddle_client_token
PADDLE_WEBHOOK_SECRET=your_webhook_secret
PADDLE_PRODUCT_ID=your_product_id

# Voucher System
VOUCHER_HMAC_SECRET=your_64_char_hmac_secret

# Security
API_SECRET_KEY=generate_with_openssl_rand_hex_32
DEBUG=false
ALLOWED_ORIGINS=https://enziu.com,https://www.enziu.com

# Rate Limiting (requests per minute)
RATE_LIMIT_UPLOAD=10
RATE_LIMIT_CHAT=30
RATE_LIMIT_VOUCHER=20
RATE_LIMIT_HEALTH=100
RATE_LIMIT_GENERAL=100

# File Upload
MAX_UPLOAD_SIZE_MB=10

# Request Timeout
REQUEST_TIMEOUT=60
```

#### 4. Generate Secrets
```bash
# API Secret Key
openssl rand -hex 32

# HMAC Secret
openssl rand -hex 32
```

#### 5. Deploy
- Railway automatically deploys on push to main branch
- Or use Railway CLI: `railway up`

#### 6. Networking
- Railway provides a public URL automatically
- Consider enabling "Private Network" for additional security
- Configure custom domain in Railway → Settings → Domains

---

### Upstash Redis Setup

#### 1. Create Database
1. Go to [Upstash Console](https://console.upstash.com)
2. Click "Create Database"
3. Choose region closest to your users
4. Select "Serverless" plan

#### 2. Get Connection Details
- Copy `UPSTASH_REDIS_REST_URL`
- Copy `UPSTASH_REDIS_REST_TOKEN`

#### 3. Security Settings
- Enable "Enable TLS" (default)
- Set "IP ACL" to allow your Railway IP range
- Or use "Allow all IPs" for simplicity (less secure)

---

## Security Checklist

### Pre-Deployment
- [ ] All environment variables set in Railway
- [ ] `DEBUG=false` in production
- [ ] CORS origins configured for production domains
- [ ] API_SECRET_KEY generated and set
- [ ] VOUCHER_HMAC_SECRET generated and set
- [ ] HTTPS enabled on both Vercel and Railway
- [ ] Custom domains configured (not using .vercel.app or .railway.app)

### Post-Deployment
- [ ] Test rate limiting works (try exceeding limits)
- [ ] Verify security headers in browser dev tools
- [ ] Test file upload size limits
- [ ] Verify CORS configuration
- [ ] Check security logs for suspicious activity
- [ ] Test voucher validation system
- [ ] Verify session cleanup works

### Ongoing
- [ ] Monitor rate limit violations in logs
- [ ] Review security logs weekly
- [ ] Update dependencies regularly
- [ ] Rotate API keys periodically
- [ ] Monitor Redis usage and costs

---

## Development

### Running Tests

```bash
# Python tests
cd api
poetry run pytest

# TypeScript type checking
cd web
npm run type-check

# Linting
npm run lint
```

### Code Quality Tools

- **Python**: Black (formatting), Ruff (linting), MyPy (type checking)
- **TypeScript**: ESLint 9+, TypeScript 5.5+ strict mode

---

## Legal Disclaimer

ENZIU provides analysis, not legal advice. All outputs are scores, citations, and direct quotes. Every response includes "page X — not legal advice."

## License

© 2024-2026 ENZIU. All rights reserved.

---

**Website**: [enziu.com](https://enziu.com)