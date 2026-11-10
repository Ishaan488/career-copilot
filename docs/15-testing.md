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
| T-MAP | field→profile mapping, option matching exact vs fuzzy suggestion, category classifier, sensitive always review |
| T-AUTH | `checkSubmissionAuthorization` matrix: no auth, expired, changed summary hash, AI-unapproved answer, legal field, cap exceeded, risk too high, valid standing, valid per-app |
| T-REDACT | emails, phones, keys, cookies |
| T-RESVAL | claim extraction; fabricated skill/date/number/employer detected; approved reword passes |

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
| T-APP-1 | submission protocol: intent row precedes click; unique index blocks concurrent second submit (two parallel calls) |

## 4. Browser/E2E (Playwright) against fixture ATS
- E2E-1 onboarding wizard → profile persisted.
- E2E-2 profile edit + verify toggle + completeness.
- E2E-3 add source (fixture-fed local feed) → jobs listed → evaluation visible with breakdown + evidence.
- E2E-4 shortlist → resume propose → validation → preview → approve.
- E2E-5 application prep: form extracted, fields mapped, review requests appear; answer one, approve suggestion, defer one; workflow resumes.
- E2E-6 authorization gate: submit button disabled until authorize; authorize with typed confirm; submission verified; tracker + notification updated.
- E2E-7 standing policy auto-submit **only** when all conditions hold (and not when a consent field present).
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
