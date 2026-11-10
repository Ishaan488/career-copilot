# 18 — Risks, Constraints, Assumptions & Open Decisions

## 1. Open questions for the user (consequential — do not assume)
| ID | Question | Safe default until answered |
|----|----------|-----------------------------|
| Q1 | Which companies/ATS boards should be the first sources (Greenhouse board tokens, Lever slugs, etc.)? | none; user adds |
| Q2 | Gemini API key available? Which model tier? | AI tasks stay queued; app works without AI for manual flows |
| Q3 | News/search provider for company research (e.g., a search API)? | skip; evidence marked unknown |
| Q4 | Is auto-submission desired at all, and under what scope (ATS, suitability, daily cap)? | OFF |
| Q5 | Telegram/email/IMAP credentials to use? | channels disabled |
| Q6 | Score weights/thresholds as in PRD §8? | PRD defaults, editable |
| Q7 | Notice period, salary floor, relocation stance (answers are the user's personal decisions) | unset → always review |
| Q8 | Preferred resume style/LaTeX template? | built-in classic/compact |
| Q9 | Retention preferences for snapshots/screenshots? | doc 16 §9 |
| Q10 | Run on Windows native or WSL2? | native; both supported |
| Q11 | Postgres: use installed server or Docker? | verify at M0 |
| Q12 | EEO/diversity self-ID questions: always skip/decline-to-answer or review? | always review |

## 2. Assumptions
- Single user, single profile, trusted local machine.
- Public ATS JSON APIs (Greenhouse/Lever/Ashby/SmartRecruiters) remain available (verify live at M4).
- Gemini free tier suffices for modest volume (verify at M5).
- Application forms on target ATSs are accessible without login/CAPTCHA for at least some postings.

## 3. Technical constraints
- Machine may sleep → no continuous monitoring (UI states this).
- Limited RAM → 1 Chromium at a time; avoid heavy deps.
- Free-tier AI rate limits → budgets, cache, backoff.
- Some ATS (Workday, Darwinbox, Oracle, SuccessFactors) require per-tenant, login-heavy, bot-sensitive flows → **out of v1**; supported later as prepare-only or via manual/URL import.
- LinkedIn/Naukri: no scraping (ToS). Email alerts/URL import only.

## 4. Risk register
| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R1 | Accidental unauthorized/duplicate submission | Low | Critical | 4-layer gate, intent row, unique index, `SUBMISSION_ENABLED=false` until M11, manual dry-run |
| R2 | Fabricated resume/answer content | Med | Critical | verified-only snapshot, claim validator, deterministic guards, approval step |
| R3 | Prompt injection via JD/website | Med | High | channel separation, schema/enum outputs, validators, no AI-driven navigation |
| R4 | Portal layout changes break drivers | High | Med | multi-strategy selectors, LAYOUT_CHANGED pause, readBack validation |
| R5 | ATS blocks automation / ToS concerns | Med | Med | prepare-only default for unknown portals, stop on block, user manual continue |
| R6 | AI quota exhaustion | High | Med | budgets, cache, defer, work without AI for manual flows |
| R7 | Incorrect job dedup (false merge) | Med | Med | conservative thresholds, flag-don't-merge, keep listings |
| R8 | Scope too large for small agent | High | High | milestone slicing, strict docs, tests-first for pure logic |
| R9 | Data loss on disk failure | Low | High | daily backup, restore test |
| R10 | Local web exposure (CSRF/rebinding) | Low | High | loopback bind, Origin/Host checks, SameSite=Strict |
| R11 | Misleading company legitimacy conclusion | Med | High | checklist + evidence + wording rules (never "legitimate/fraud"), insufficient_evidence default |
| R12 | Gemini API/model names change | Med | Low | models in settings; provider abstraction; verify docs at M5 |

## 5. Unresolved technical decisions (decide with evidence at the milestone)
- Exact Gemini model ids and quotas (M5).
- Whether `pdf-parse` suffices for resume PDFs vs `pdfjs-dist` (M2).
- News/search provider (M7).
- Whether pg-boss transactional enqueue is needed vs outbox relay (M8).
- Argon2 native build on Windows vs scrypt fallback (M1).

## 6. Explicit out-of-scope items (so nobody builds them by accident)
Multi-user, mobile apps, auto-accepting legal terms, CAPTCHA solving, LinkedIn/Naukri scraping, interview scheduling, auto-negotiation, cloud infra, Redis/Kafka/K8s, Python services.

## 7. Change log
- 2026-11-10: Initial plan created.
