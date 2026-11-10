# 00 — Agent Playbook (READ FIRST)

You are building **Career Copilot**. Follow this file strictly.

## 1. Golden rules (non-negotiable)
1. Never fabricate: candidate info, company info, salaries, job listings, AI responses, submission success.
2. No placeholder buttons. If a feature isn't built, don't render its control (or render it disabled with the text "Not available yet" and no click handler).
3. AI never decides consequential things. AI output → zod validation → deterministic code → state change.
4. Never submit an application unless an `application_authorizations` row covers it (see doc 10 §6).
5. Never bypass CAPTCHA, login walls, robots.txt, or anti-bot. On block → pause + ask user to continue manually.
6. Never retry an uncertain submission. Uncertain = `submission_unverified` → human decides.
7. Never log secrets, cookies, passwords, full resumes, or full profiles.
8. Never claim something works unless a test or a command you ran proved it. Report failures honestly.
9. When a decision affects security, legality, money, or user authorization and docs don't say → STOP and ask the user.
10. Do not add a dependency not listed in doc 05 §4 without writing an ADR (`docs/adr/`) first.
11. **Never generate, rewrite, tailor, parse, or modify resumes (Q8).** Store, preview, select, and attach the user's uploaded PDF byte-for-byte.
12. **Never auto-answer or call AI on EEO/demographic, legal, consent, bond, work-authorization, salary, notice-period, relocation, background-check, or sensitive fields (Q12).** Always route to Human Review.
13. **Never hardcode a company list (Q1).** Keep `company-discovery` separate from `discovery` (jobs) so companies can be discovered and monitored even with zero openings.
14. **Non-AI functionality must work when Gemini is unavailable or out of quota (Q2).** Never let an AI failure block discovery, manual flows, resume management, review, or application preparation.
15. Read `19-user-decisions.md` — it is authoritative and overrides any conflicting text.

## 2. Working loop (per milestone)
1. Read the milestone in `17-implementation-plan.md` and its "Read" docs only.
2. Write failing tests first for pure logic (normalization, scoring, policy, state machines).
3. Implement smallest vertical slice.
4. Run: `npm run typecheck && npm run lint && npm test` (and `npm run test:e2e` where milestone says).
5. Fix until green. Never delete/skip a test to make it pass.
6. Update docs if reality differs from the plan (edit the doc; add an ADR if a decision changed).
7. Commit with message `M#: summary` (one commit per coherent sub-slice).
8. Print the **Milestone Report** (template §6).

## 3. Code conventions
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. No `any` (use `unknown` + zod).
- ESM only. Path alias `@/` → `src/`.
- File naming: `kebab-case.ts`. Types/classes `PascalCase`. DB columns `snake_case`. TS fields `camelCase` (Drizzle maps).
- **Module boundary rule:** a module may import only another module's `index.ts` (public API). Never deep-import `@/modules/x/internal/...`. Enforced by ESLint `no-restricted-imports` + `dependency-cruiser` (milestone M0).
- **Pure core / impure shell:** business rules live in `domain/` (pure functions, no I/O). DB/HTTP/browser/LLM live in `infra/`/`adapters/`.
- Errors: throw `AppError(code, message, {cause, details})` from `@/shared/errors`. Never throw strings. API maps to `{error:{code,message,details?}}`.
- Validation: every API input, queue payload, AI output, adapter output is parsed by a zod schema defined in the module's `schemas.ts`.
- IDs: UUID v7 generated in app (`uuidv7` lib or `crypto.randomUUID()` v4 acceptable). Never expose sequential ids.
- Time: use `@/shared/clock` (`now()`), injectable in tests. Never call `new Date()` in domain code.
- Logging: `pino` via `@/shared/logger`; always structured; always pass through redactor (doc 13).
- Config: only through `@/shared/config` (zod-parsed env). Never read `process.env` elsewhere.
- DB access: only inside a module's `repo.ts`/`infra/`. Multi-step changes use `db.transaction`.
- Every state change on jobs/applications/review requests goes through the module's state-machine function that (a) validates the transition (b) writes an event row (c) in one transaction.

## 4. Definition of Done (per milestone)
Behavior implemented • schema + migration • API/UI • error handling • tests pass • integrates with dependents • docs updated • no TODO that hides missing behavior (a TODO must be listed in the report as a Known Limitation).

## 5. What to do when stuck
- Test fails twice with same cause → re-read the relevant doc; do not hack the test.
- Unknown external API behavior (Gemini model names, ATS endpoints) → verify with a live request or official docs; record the finding in the relevant doc.
- Ambiguity → add to `18-risks-and-open-decisions.md` under "Open questions", choose the documented safe default, continue unless it's a rule-9 case.

## 6. Milestone Report template
```
## Milestone M# report
Implemented: …
Files/modules changed: …
DB changes (migrations): …
Tests run: <commands>
Passed: N  Failed: N (list failures)
Known limitations: …
Remaining work: …
Next milestone: M#
```
