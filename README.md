# Career Copilot

> A production-quality, local-first, personal AI-powered job discovery, intelligence, and application automation platform.

Career Copilot operates like a persistent personal operations assistant. It continuously discovers relevant job opportunities from supported sources (Greenhouse, Lever, Ashby, company career pages), normalizes listings, conducts verifiable company research, evaluates suitability against candidate preferences, and assists with or executes applications under strict, user-controlled autonomy policies.

---

## Core Engineering Principles

1. **Modular Monolith First**: Explicit module boundaries with zero cyclic dependencies enforced by automated linting and dependency cruiser rules.
2. **Local-First Architecture**: Runs locally on your machine with native PostgreSQL 16, pg-boss for persistent background jobs, and Playwright for browser automation. No cloud dependencies or external SaaS lock-in.
3. **Zero Fabrication & Verifiable Evidence**: Missing information is always marked `unknown`, never fabricated. Company research and salary intelligence link directly to retrieved evidence URLs and confidence levels.
4. **Resume Immutability Invariant**: Uploads and attaches your verified original PDF resume byte-for-byte. **Zero resume generation, rewriting, tailoring, or text modification.**
5. **Human-in-the-Loop Core Subsystem**: Core categories—such as legal declarations, bond agreements, non-competes, work authorizations, salary expectations, and demographic/EEO disclosures—**never use AI** and always pause for explicit human review.
6. **Graceful Degraded Mode**: All discovery, filtering, evaluation, and application features continue working deterministically even if AI providers (e.g., Gemini API) are offline or quota-exhausted.

---

## Milestone Progress

| Milestone | Description | Status |
|---|---|---|
| **M0** | WSL2 Ubuntu environment, PostgreSQL 16, Playwright Chromium, tooling | ✅ Complete |
| **M1** | Shared foundation, pg-boss queue, scrypt auth, CSRF middleware, UI shell | ✅ Complete |
| **M2** | Candidate profile, job preferences, autonomy policies, reusable answers | ✅ Complete |
| **M3** | Resume manager: PDF upload, SHA-256 dedupe, versioning, preview | ✅ Complete |
| **M4** | Company discovery, monitoring & career page detection (separate from jobs) | 🔄 Next |
| **M5** | Job discovery engine (Greenhouse, Lever, Ashby adapters, deduplication) | 📋 Planned |
| **M6** | Gemini AI provider integration, rate limiting & cache layer | 📋 Planned |
| **M7** | Job description intelligence & deterministic eligibility engine | 📋 Planned |
| **M8** | Company research & legitimacy assessment engine | 📋 Planned |
| **M9** | Deterministic suitability scoring & recommendation engine | 📋 Planned |
| **M10** | Browser automation & ATS form field extraction | 📋 Planned |
| **M11** | Manual browser handover workflow (default submission mode) | 📋 Planned |
| **M12** | Policy-controlled automated submission (explicit per-app authorization) | 📋 Planned |
| **M13** | Application lifecycle tracking & email notification monitoring | 📋 Planned |
| **M14** | System hardening, security audit, retention pruning & backup | 📋 Planned |

---

## Tech Stack

- **Framework**: Next.js 15 (App Router, React 19)
- **Database**: PostgreSQL 16 + Drizzle ORM
- **Job Queue**: pg-boss v10 (PostgreSQL-backed background worker with heartbeats)
- **Browser Automation**: Playwright (Chromium headless/headed)
- **AI Intelligence**: Google Gemini API via unified provider abstraction
- **Testing**: Vitest (Unit & Integration) + Playwright (E2E)
- **Architecture Quality**: Dependency Cruiser (strict module boundaries) + ESLint + TypeScript strict mode

---

## Getting Started

### 1. Prerequisites
- Node.js ≥ 22.13.0
- PostgreSQL ≥ 15 (PostgreSQL 16 recommended)
- WSL2 Ubuntu 24.04 (or native Linux / macOS)

### 2. Environment Setup
Clone the repository and copy the example environment configuration:
```bash
git clone https://github.com/Ishaan488/career-copilot.git
cd career-copilot
cp .env.example .env
```
Edit `.env` with your PostgreSQL database credentials and optional API keys (Gemini API, Telegram bot, SMTP).

### 3. Database Migration
```bash
# Apply schema migrations to development database
npm run db:migrate

# Reset and migrate test database
npm run db:reset:test
```

### 4. Running the Platform
```bash
# Run web application and background worker concurrently
npm run dev:all

# Or run separately:
npm run dev         # Next.js web dashboard (http://127.0.0.1:3000)
npm run dev:worker  # Background job queue worker
```

### 5. Running Verification Suites
```bash
npm run typecheck    # TypeScript strict validation
npm run lint         # ESLint check
npm run check:deps   # Module boundary architectural audit
npm test             # Vitest unit and integration test suite
```

---

## Architecture Documentation

Detailed architectural design records and specifications are in [`docs/`](docs/):
- [`docs/01-product-requirements-document.md`](docs/01-product-requirements-document.md): PRD & vision
- [`docs/02-architecture-overview.md`](docs/02-architecture-overview.md): System topology & invariants
- [`docs/07-modular-monolith-architecture.md`](docs/07-modular-monolith-architecture.md): Monolith boundaries
- [`docs/08-database-design.md`](docs/08-database-design.md): PostgreSQL schema & relational model
- [`docs/10-state-machines.md`](docs/10-state-machines.md): Job & Application lifecycles
- [`docs/19-user-decisions.md`](docs/19-user-decisions.md): Authoritative architectural decisions log

---

## License

Private / Personal Use.
