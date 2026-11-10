# 15 — Testing Strategy & Test Plan

## 1. Tooling & layout
- **vitest** for unit + integration (`npm test` unit, `npm run test:int` integration against DB `career_copilot_test`, created/reset by `db:reset:test`, each integration file runs in its own schema or truncates tables in `beforeEach`).
- **@playwright/test** for e2e (`tests/e2e`) against built app + local worker + fixture ATS site.
- `tests/failure/` failure-injection (vitest + playwright where browser needed).
- AI in tests: `FakeProvider` scripted responses (clearly labeled test support). **No live Gemini calls in automated tests**; one optional manual script `npm run ai:smoke` (requires key) for live check.
- Time via injectable clock; randomness injected.
- Coverage thresholds: `domain/` ≥ 90%, overall ≥ 70%.

## 2. Unit tests (pure, mandatory)
| Area | Cases |
|------|-------|
| T-NORM | title cleanup; location parse ("Bengaluru, Karnataka, India", "Remote - India", "Hybrid, Pune"); work mode; employment type; HTML→text; deadlines |
| T-COMP | `₹12–18 LPA`, `INR 1,200,000 per annum`, `$120k–$150k`, `$50/hr`, `£4,000 per month`, `Competitive`, ranges w/ k/L/Cr, currency detection, none |
| T-DEDUP | same source+id; canonical URL w/ tracking params; same company+title different location NOT merged; similarity thresholds; possible_duplicate flag; title identical different companies |
| T-ELIG | each hard rule pass/fail/unknown; mandatory vs uncited; education/graduation year; experience; work auth; location; **property:** ineligible ⇒ recommendation never positive |
| T-SCORE | weights sum validation; component math; unknown comp neutral flagged; breakdown completeness; determinism; weight changes |
| T-RISK | each checklist code triggers; contradictory evidence → `contradictory`; insufficient evidence ≠ low risk |
| T-REC | precedence table |
| T-POL | each rule type; conflict resolution deny>review>allow; core rules uneditable; decision record contents |
| T-AIVAL | schema pass/fail, correction flow, quote-substring validator, grounded-answer validator, injection flag |
| T-SM | every machine: all allowed transitions pass, every non-listed transition rejected (table-driven from the same transition tables as code) |
| T-MAP | field→profile mapping, option matching exact vs fuzzy suggestion, category classifier, EEO/demographic & core categories never invoke AI and always create review requests (with decline/blank options where allowed) |
| T-AUTH | `checkSubmissionAuthorization` matrix: gates off (`SUBMISSION_ENABLED`/setting), no auth, expired, changed summary hash, unapproved answer, core/EEO field without human answer, resume sha256 mismatch, duplicate application, valid per-app |
| T-REDACT | emails, phones, keys, Telegram bot URL token, cookies, screenshot input masking |
| T-RES | PDF magic-byte validation (`%PDF-`), sha256 byte-for-byte preservation across upload/preview/attachment, immutability (no update path), duplicate hash detection, delete guard when attached to active application |
| T-CD | company slug generator, ATS URL/HTML detector, no hardcoded company list in repo (grep test) |

## 3. Integration tests
| ID | Scenario |
|----|----------|
| T-DB-1 | migrations apply on empty DB; schema matches Drizzle; constraints: submissions partial unique, reusable answers require authorized_at, salary estimate CHECK, audit immutability |
| T-DSC-1 | each adapter against saved real-response fixtures (HTTP mocked at fetch layer): pagination, rate-limit 429 w/ Retry-After, malformed item skipped & counted, change detection |
| T-DSC-2 | full sync run persists jobs/listings/snapshots/history; second run → unchanged; modified listing → snapshot + `changed` |
| T-DSC-3 | listing disappearance: closed only after 2 successful runs; failed run never closes |
| T-DSC-4 | one source throws → others still sync, run recorded failed, failures counted |
| T-API | each route: auth required, validation errors, happy path, error mapping; CSRF/origin |
| T-Q-1 | queue retry w/ backoff, max retries → terminal failure visible; singletonKey dedupe; scheduled job fires |
| T-AI-1 | pipeline w/ FakeProvider: cache hit, budget exceeded, rate-limit retry, invalid → corrected → ok, invalid twice → AI_INVALID_OUTPUT & no state change |
| T-AI-4 | unchanged JD not re-analyzed |
| T-AI-7 | prompt content allow-list (no PII leak) |
| T-INT-1 | analyze→evaluate pipeline end-to-end with FakeProvider produces evaluation, history row, policy decision, notification |
| T-HIT-1 | creating review request: checkpoint+request+notification in one tx (fault injected mid-tx → nothing persisted) |
| T-HIT-2 | response validation (bad payload 400), reusable save requires confirm |
| T-REC-1 | **Pause/restart/resume:** run workflow to `waiting_review`, drop all in-memory state (new service instances/new worker process), respond, workflow resumes at correct step, not from start (asserted by task attempt counts) |
| T-REC-2 | worker killed mid-step (real child process SIGKILL in test) → recovery job re-enqueues; no duplicate side effects |
| T-REC-3 | duplicate `workflow.resume` delivered twice → single effect |
| T-APP-1 | submission protocol: intent row precedes click; unique index blocks concurrent second submit (two parallel calls); `dedupe_key` unique index blocks duplicate active applications |
| T-CD-1 | company discovery: manual add, CSV import, career-page detection, ATS slug probing (`partially_verified` until user confirms), `company.check` with 0 openings stays `monitoring`, derived `job_sources` reconciliation |
| T-DEG | degraded mode: with `GEMINI_API_KEY` unset or 429 quota exhausted, company discovery, job discovery, manual/URL import, deterministic evaluation fields, resume manager, review center, and non-AI application prep all succeed; AI tasks mark `pending_ai` and drain on recovery |
| T-RET | `maintenance.retention` honors 180d snapshots/company evidence (archiving evidence referenced by evaluations/applications), 30d screenshots, 90d AI/exec logs, immediate temp browser file cleanup, and never deletes applications, audit history, or resume PDFs |
| T-TRC | traceability endpoint `/api/trace/:type/:id` returns source listing, evidence, AI request metadata, policy decisions, user corrections, and automation events |

## 4. Browser/E2E (Playwright) against fixture ATS
- E2E-1 onboarding wizard (all personal/preference fields blank by default) → profile persisted.
- E2E-2 profile edit + verify toggle + completeness.
- E2E-3 add source (fixture-fed local feed) → jobs listed → evaluation visible with breakdown + evidence.
- E2E-4 Resume Manager: upload PDF resume → verify sha256 → preview original inline → select for application.
- E2E-5 application prep (L2): form extracted, fields mapped, EEO & sensitive fields trigger review without AI; answer one, decline one EEO, approve suggestion, defer one; workflow resumes.
- E2E-6 submission (L2): manual handover flow AND per-application authorization gate (submit disabled until authorized with typed confirm; verified; tracker + notification updated).
- E2E-7 Company Discovery: add company → detect ATS / confirm probe candidate → monitor runs with 0 openings and shows status accurately.
- E2E-8 notifications bell + dashboard counts match DB.
- E2E-9 a11y scan on all pages (axe) no critical violations.
- E2E-10 worker offline banner (stop worker, banner appears within 90s).

## 5. Failure-injection (tests/failure)
AI provider down (503) • 429 • invalid JSON twice • network drop during fetch • browser crash mid-fill • portal layout change (fixture variant) → LAYOUT_CHANGED → pause • DB connection killed mid-transaction (rollback verified) • worker restart • duplicate discovery same listing in two sources • **submit timeout (fixture never responds)** → `unverified`, assert exactly ONE submit request received by fixture server even after recovery job runs • user responds after simulated 30 days (clock jump) • application already submitted externally (fixture page) → verified `already_applied` • CAPTCHA fixture → paused `BLOCKED_BY_PORTAL`, no evasion • login wall fixture.
**Hard invariant test:** fixture ATS counts submit POSTs; across ALL failure tests, count ≤ 1 per application.

## 6. Quality gates per milestone
`npm run typecheck && npm run lint && npm run check:deps && npm test && npm run test:int` green (+ `test:e2e`/`test:failure` where milestone says). Reports list actual counts. No `.skip`/`.only` committed (lint rule `no-only-tests`).

## 7. Manual verification checklist (human) — before enabling real submissions
1. Dry-run fill (no submit) on a real Greenhouse/Lever/Ashby posting chosen by user; screenshots reviewed.
2. Verify Telegram/email delivery.
3. Verify backup/restore.
4. Verify restart recovery on real machine reboot.
