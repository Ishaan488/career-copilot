# 03 — Functional Requirements

Format: `FR-<area>-<n>` — requirement. **AC:** acceptance criteria.

## PROFILE (PRF)
- FR-PRF-1 CRUD for: personal info, emails (multiple, one primary), phone, location, work authorization (per country), education, experience, skills (name, category, proficiency 1–5, years, evidence note), projects, certifications, awards, publications, links. **AC:** every field editable in UI, persisted, validated.
- FR-PRF-2 Each profile fact has `verification_status` ∈ `verified | unverified`. Only `verified` facts may feed resumes/form answers. **AC:** unverified facts are visible but excluded by `profile.getVerifiedSnapshot()`.
- FR-PRF-3 Resume upload (PDF/DOCX) → text extraction → AI-proposed profile **draft** → user reviews each item and marks verified. Never auto-verified. **AC:** draft items sit in `profile_import_drafts` until accepted.
- FR-PRF-4 Profile changes are versioned (`profile_revisions` JSON snapshot on each save). **AC:** can view previous revision.
- FR-PRF-5 Onboarding wizard with completeness meter listing missing items needed by features.

## PREFERENCES & AUTONOMY (PRE)
- FR-PRE-1 Job preferences: preferred/excluded roles, industries, locations, work modes, min/preferred comp (amount, currency, period), experience level, employment types, prioritized/excluded companies, notice period, relocation.
- FR-PRE-2 Autonomy policy (all default OFF): allowed sources; may auto-shortlist (threshold); may auto-prepare resume; may auto-fill forms; may auto-submit **within scope** (scope = sources/ATS list, min suitability, max per day, allowed company risk level, forbidden question categories); always-review question categories (non-removable core set: legal, consent, bond, work authorization, salary, notice, relocation, background check, sensitive PII).
- FR-PRE-3 Reusable answers: question pattern + answer + scope; created only after explicit user "Save as reusable" confirmation. **AC:** `reusable_application_answers.authorized_at` NOT NULL.
- FR-PRE-4 Policy rules (FR-POL) editable via UI as typed rule objects.

## SOURCES & DISCOVERY (DSC)
- FR-DSC-1 Source registry with adapter type, config, enabled flag, schedule, status, last success, last error. **AC:** failing source doesn't affect others (test).
- FR-DSC-2 Adapter interface (doc 07 §B). v1 adapters: `greenhouse`, `lever`, `ashby`, `smartrecruiters`, `rss_feed`, `url_import`, `manual_paste`, `email_alert`.
- FR-DSC-3 Each sync run recorded (`source_sync_runs`): counts new/changed/unchanged/failed, errors, duration, cursor.
- FR-DSC-4 Rate limiting per source (token bucket, configurable), honors `Retry-After`, robots.txt check for non-API fetches.
- FR-DSC-5 Raw payload preserved (`job_snapshots`); changes detected by content hash.
- FR-DSC-6 Normalization to canonical job (doc 08 `jobs`). Compensation parsed deterministically where possible.
- FR-DSC-7 Dedup: per doc 07 §B.3. Never merge solely on title+company. Source listings preserved.
- FR-DSC-8 Job lifecycle statuses and timestamps (doc 10 §1).
- FR-DSC-9 Listing disappearance: after 2 consecutive successful syncs missing → `closed`. Never on failed sync.
- FR-DSC-10 Pre-filter (deterministic, cheap) before AI: excluded companies/roles, location/work-mode hard conflicts → `rejected` with reason (user can undo).

## INTELLIGENCE (INT)
- FR-INT-1 JD analysis → structured `job_analyses` + `job_skill_requirements`. Skipped if `description_hash` + `analysis_schema_version` + `model_task_version` unchanged (cache).
- FR-INT-2 Eligibility engine (pure): rules per hard requirement → `eligible | ineligible | unknown` with per-rule results.
- FR-INT-3 Suitability score (pure): weighted components, explainable breakdown, configurable weights (must sum to 100 ±0.01; validated).
- FR-INT-4 Company research: evidence items with `kind`, `url`, `retrieved_at`, `excerpt`, `verification_status`. Sources: official site fetch, DNS/domain checks (WHOIS optional), career-page presence, news search provider (configurable), review-site links (stored as low-weight evidence).
- FR-INT-5 Legitimacy assessment is a rule-based checklist over evidence (domain mismatch, free-mail recruiter domain, payment request keywords, etc.) + AI synthesis. Output level: `no_concerns_found | some_concerns | high_concern | insufficient_evidence`. **Never** output "legitimate"/"fraudulent" as a fact.
- FR-INT-6 Compensation intelligence rows typed `disclosed | reported | estimated | unknown` with amount range, currency, period, source, retrieved_at, confidence.
- FR-INT-7 Recommendation derived by deterministic function from (eligibility, suitability, risk, comp, info completeness). Values: strongly_recommended, recommended, consider, low_priority, not_eligible, high_risk, insufficient_information. **AC:** property test — ineligible job never gets a positive recommendation.
- FR-INT-8 Every evaluation stores references to evidence ids and rule results; history kept in `recommendation_history`.

## POLICY (POL)
- FR-POL-1 Rules are data (`policy_rules` rows, zod-typed, versioned, enable/disable, priority). Types listed in doc 07 §E.
- FR-POL-2 `evaluate(ctx)` pure; returns decision + all rule results + explanation; persisted in `policy_decisions`.
- FR-POL-3 Independent of AI provider module (no import).

## RESUME (RES)
- FR-RES-1 Master resume = rendering of verified profile (no tailoring).
- FR-RES-2 Tailored version: selection (which verified experiences/projects/skills, order) is deterministic from JD analysis; AI may propose *rewording of existing bullets* only.
- FR-RES-3 Validator: every bullet/skill/date/org in output maps to `source_ref` (profile item id + text span) or is an approved rewording (`approved_by_user`). Failure blocks approval.
- FR-RES-4 Export: HTML→PDF (Playwright) and DOCX (`docx` lib). Templates: 2 built-in (`classic`, `compact`).
- FR-RES-5 Versioning, job association, diff view, user approval required before use in application (`approved_at`).

## APPLICATION PREP & EXECUTION (APP)
- FR-APP-1 Application created from shortlisted job; workflow state in `workflow_checkpoints`.
- FR-APP-2 Domain verification: application URL host must match known ATS domains or the company's verified domains; otherwise review request.
- FR-APP-3 Form extraction to `application_form_fields` (label, type, required, options, selector strategy, section).
- FR-APP-4 Answer resolution hierarchy: profile exact → reusable → AI suggestion (grounded, flagged `needs_review` always) → human.
- FR-APP-5 Sensitive categories always create review requests (FR-HIT).
- FR-APP-6 Fill + upload + post-fill validation (read back values, compare to intended).
- FR-APP-7 Final summary screen: all answers, docs, risks; user authorization step.
- FR-APP-8 Submit only with valid authorization (doc 10 §6); intent row before click; verification by evidence (confirmation page text/URL/email).
- FR-APP-9 Timeout/uncertainty → `submission_unverified`; no auto-retry; user decides (check portal, mark submitted, retry-confirmed).
- FR-APP-10 Block detection (CAPTCHA/login wall/403) → pause, notify, "continue manually" option; never evade.
- FR-APP-11 Screenshots on failure; execution logs per step.

## HUMAN REVIEW (HIT)
- FR-HIT-1 Review request fields per spec (doc 08 `human_review_requests`). Statuses: pending, answered, approved, rejected, deferred, cancelled, expired.
- FR-HIT-2 Creation is transactional: checkpoint + request + notification outbox in one transaction; then workflow `paused`.
- FR-HIT-3 Response validated per request `response_schema`; stored in `human_review_responses`; workflow resumed via queue job `workflow.resume` (idempotent).
- FR-HIT-4 Actions: answer, approve, edit+approve, investigate further (enqueues AI job, request stays pending), defer (snooze until), reject, cancel application, save reusable (explicit checkbox + confirm dialog).
- FR-HIT-5 Never auto-expire unless user configured expiry; default none.

## TRACKING (TRK)
- FR-TRK-1 Application statuses per doc 10 §3; every transition → `application_events`.
- FR-TRK-2 Email monitoring (IMAP, read-only, opt-in): classify confirmation/assessment/interview/rejection using rules first, AI second; **suggest** status change with evidence; auto-apply only confirmation→`under_review`; others require one-click user confirm (configurable).
- FR-TRK-3 No inference of rejection from silence. Show "no update for N days" only.
- FR-TRK-4 Notes, recruiter contacts, interview stages, deadlines, next action.

## NOTIFICATIONS (NOT)
- FR-NOT-1 Types listed in PRD; each has dedupe key; unchanged info never re-notifies.
- FR-NOT-2 Channels: in_app (always), telegram, email; per-type channel preferences; digest (off/daily/weekly) for low-priority types.
- FR-NOT-3 Outbox pattern; delivery attempts recorded; links to entity routes.

## INFRA (INF)
- FR-INF-1 Worker heartbeat table; UI banner "Worker offline since X — no discovery/monitoring is running".
- FR-INF-2 Queue: pg-boss; retries w/ exponential backoff; max retries; terminal failures surfaced in Activity page.
- FR-INF-3 Execution logs (`agent_execution_logs`) per workflow step; audit logs for user/system actions.
- FR-INF-4 Live updates via SSE (`/api/events`).
- FR-INF-5 Local access protection: passcode login, httpOnly cookie, server binds 127.0.0.1.

## UI (UI)
- FR-UI-1 17 areas per doc 14. FR-UI-2 Global search (jobs, companies). FR-UI-3 Empty states with next-action CTA. FR-UI-4 Destructive actions need confirm dialog. FR-UI-5 Timestamps shown in user timezone.
