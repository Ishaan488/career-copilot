# 03 — Functional Requirements

Format: `FR-<area>-<n>` — requirement. **AC:** acceptance criteria. Precedence: [19-user-decisions](19-user-decisions.md).

## PROFILE (PRF)
- FR-PRF-1 CRUD for: personal info, emails (multiple, one primary), phone, location, work authorization (per country), education, experience, skills (name, category, proficiency 1–5, years, evidence note), projects, certifications, awards, publications, links. **AC:** all fields editable in UI, persisted, validated. **Every personal field is nullable; the system ships with no prefilled personal data.**
- FR-PRF-2 Each profile fact has `verification_status` ∈ `verified | unverified`; null/blank = `unknown`. Only `verified` non-null facts may feed form answers. **AC:** `profile.getVerifiedSnapshot()` excludes unverified and unknown values and reports them in `missing[]`.
- FR-PRF-3 Profile changes versioned (`profile_revisions`).
- FR-PRF-4 Onboarding wizard with completeness meter listing which features are blocked by missing data.
- (Removed: resume parsing/import into profile — Q8.)

## PREFERENCES & AUTONOMY (PRE)
- FR-PRE-1 Job preferences manual in dashboard: preferred/excluded roles, industries, locations, work modes, CTC (min/preferred, currency, period), experience level, employment types, prioritized/excluded companies, notice period, relocation. Nothing defaulted (Q7). **AC:** a rule needing an unset preference evaluates to `unknown`, not pass/fail.
- FR-PRE-2 Autonomy: `level` ∈ {1,2} (3 not selectable, "Not available yet"); default 1. Sub-settings (L2): may prepare applications, may fill forms, per-category always-review list (non-removable core set: legal, consent, bond, work authorization, salary/CTC, notice period, relocation, background check, **EEO/demographic**, sensitive PII), auto-shortlist toggle + threshold (L1/L2), allowed sources/companies. Enabling any toggle needs a confirm dialog and is audit-logged.
- FR-PRE-3 Reusable answers: created only after explicit user "Save as reusable" confirmation (`authorized_at` NOT NULL); never for core review categories unless user explicitly confirms per answer; scope-limited. EEO/demographic answers are **never** reusable by default.
- FR-PRE-4 Policy rules editable (FR-POL).

## COMPANY DISCOVERY (CDS) — separate module from Job Discovery
- FR-CDS-1 Company registry with lifecycle `discovered | registered | monitoring | paused | excluded`. **No hardcoded company list anywhere in code, fixtures used in prod, or seeds.** **AC:** repo test greps for company-name seed arrays.
- FR-CDS-2 Registration inputs: manual add (name and/or domain and/or career URL), CSV/paste import, auto-registration proposals from imported job URLs/email alerts/RSS items, user confirmation of probe candidates. Every automatic proposal records `origin` and is `discovered` until accepted (auto-accept configurable, default off).
- FR-CDS-3 Career-page & ATS detection: for a company domain, check well-known career paths (`/careers`, `/jobs`, `/careers/`, link text "Careers"/"Jobs" on homepage) via `safeFetch` with robots.txt respect; detect ATS from embed/links/JSON (greenhouse, lever, ashby, smartrecruiters, workday, darwinbox, oracle, successfactors, other); extract board identifier. Unsupported ATS → `ats='unsupported'`, user told what manual paths exist.
- FR-CDS-4 ATS slug probing: given a company name, generate slug variants and query **public** ATS APIs (rate-limited, max N probes/company, honoring 404/429). A hit yields a candidate with `verification='partially_verified'`; **monitoring requires the user to confirm** (name/domain match shown as evidence).
- FR-CDS-5 Monitoring independent of openings: scheduled `company.check` (default 24h) records board existence/health, openings count (may be 0), ATS change, career-page change in `company_check_runs`. **AC:** a company with 0 openings keeps `monitoring` status and shows "0 openings, last checked …".
- FR-CDS-6 Registering a monitored ATS board automatically creates/updates the derived `job_sources` row (Job Discovery consumes it); pausing/excluding a company disables its sources.
- FR-CDS-7 Excluded companies are never fetched or monitored. Excluding is reversible, audit-logged.
- FR-CDS-8 Company check failures isolate per company; repeated failures → `failing` flag + notification (deduped).

## JOB DISCOVERY (DSC)
- FR-DSC-1 Source registry (derived from company boards + manual sources: rss_feed, url_import, manual_paste) with adapter type, config, enabled, schedule, status, last success/error.
- FR-DSC-2 Adapter interface (doc 07 §B). v1: `greenhouse`, `lever`, `ashby`, `smartrecruiters`, `rss_feed`, `url_import` (incl. supported company career pages via JSON-LD `JobPosting`), `manual_paste`. `email_alert` only if user opted into IMAP (Q15).
- FR-DSC-3 Sync runs recorded (`source_sync_runs`). A failing source never affects others.
- FR-DSC-4 Per-source rate limit (token bucket), `Retry-After`, robots.txt for non-API fetches.
- FR-DSC-5 Raw payload preserved (`job_snapshots`); change detection by content hash.
- FR-DSC-6 Normalization to canonical job; compensation parsed deterministically; unknown stays null/`unknown`.
- FR-DSC-7 Dedup per doc 07 §B.3 (never on company+title alone); source listings preserved.
- FR-DSC-8 Job lifecycle statuses with timestamps (doc 10 §1).
- FR-DSC-9 Missing listing → `closed` only after 2 consecutive **successful** syncs missing it.
- FR-DSC-10 Deterministic pre-filter (excluded companies/roles, hard location/work-mode conflicts when preferences set) → `rejected` with reason; user can undo.

## INTELLIGENCE (INT)
- FR-INT-1 JD analysis → structured rows; skipped if hash/version unchanged. **If AI unavailable** (no key, quota exhausted, outage): job stays visible, `analysis_status='pending_ai'`, deterministic fields (title/location/comp/ATS-structured data) still shown; evaluation marks AI-dependent components `unknown`; retried automatically.
- FR-INT-2 Eligibility engine (pure): per-rule `pass|fail|unknown` with JD quote.
- FR-INT-3 Suitability score (pure, weights editable in dashboard, sum = 100±0.01), every component explained (matched, missing, notes, inputs used).
- FR-INT-4 Company research via `SearchProvider` abstraction; v1 provider = official website + public pages only. Evidence rows: kind, URL, retrieved_at, excerpt, **confidence** (high/medium/low), verification status. No fabricated fields: missing → `unknown`.
- FR-INT-5 Legitimacy assessment = deterministic checklist over evidence (+ AI synthesis flagged as estimate). Levels: `no_concerns_found | some_concerns | high_concern | insufficient_evidence`. Never "legitimate"/"fraudulent".
- FR-INT-6 Compensation intelligence typed `disclosed | reported | estimated | unknown`, with amount, currency, period, source, retrieved_at, confidence; estimated is always labeled.
- FR-INT-7 Recommendation derived deterministically. **AC:** property test — ineligible never positive.
- FR-INT-8 Each evaluation stores evidence ids + rule results; history retained.

## POLICY (POL)
- FR-POL-1 Rules are data (typed, versioned, enable/disable, priority).
- FR-POL-2 `evaluate(ctx)` pure; persists `policy_decisions` with inputs, rules, results, explanation.
- FR-POL-3 Independent of AI provider.

## RESUME MANAGER (RES) — no generation (Q8)
- FR-RES-1 Upload PDF only (magic bytes `%PDF-`, ≤10 MB). Original bytes stored unmodified; sha256 recorded; file immutable (no update/overwrite path in code).
- FR-RES-2 Versions: each upload is a new version with label, notes, uploaded_at; `is_default` flag (one); duplicate upload (same sha256) detected and offered as existing version.
- FR-RES-3 Preview: serve the original PDF inline in the UI viewer (no re-rendering/conversion).
- FR-RES-4 Selection: user chooses a version per application (default pre-selected; deterministic, no AI selection). Selection recorded.
- FR-RES-5 Attachment: browser module uploads the **original file path** via `setInputFiles`; after upload, record sha256 of the file given; UI shows "attached: <label> v<n> <sha8>".
- FR-RES-6 Archive (soft) and delete (hard) with confirm; hard delete blocked while attached to a non-terminal application; deleting never affects submitted-application records' recorded hash/label.
- FR-RES-7 **Forbidden:** generating, rewriting, tailoring, editing, re-rendering, or extracting-and-modifying resume content. Lint/grep test blocks imports of pdf-generation/DOCX libs.

## APPLICATION PREPARATION & SUBMISSION (APP) — L2
- FR-APP-1 Application created only from a shortlisted job; one application per job **and** per `dedupe_key` (company + canonical application URL/requisition id) among non-terminal statuses → duplicate attempts are refused with a link to the existing application.
- FR-APP-2 Domain verification: URL host must match known ATS domains or company verified domains; else review request.
- FR-APP-3 Form extraction to `application_form_fields`.
- FR-APP-4 Answer hierarchy: (1) exact verified profile value, (2) previously approved reusable answer, (3) AI suggestion grounded in verified profile (always `needs_review`; **never** called for core-category fields), (4) human. Missing/null profile value → review request, never a guess.
- FR-APP-5 Core categories (legal, consent, bond, work authorization, salary/CTC, notice, relocation, background check, EEO/demographic, sensitive) → always review request; **no AI call**; EEO options offered: provide answer / decline-to-answer (only if portal offers it) / leave blank (only if not required).
- FR-APP-6 Fill, attach selected original PDF, read-back validation.
- FR-APP-7 Final summary with `summary_hash` (answers+resume sha256+URL); user approves.
- FR-APP-8 **Level 2 submission:** (a) manual handover — headed browser with prefilled form; user submits; user confirms in UI (`submitted`, source `user_confirmed`); (b) automated submit after per-application explicit authorization bound to `summary_hash`, only if env `SUBMISSION_ENABLED=true` AND settings toggle on (doc 18 Q14). No standing policy exists.
- FR-APP-9 Uncertain outcome → `submission_unverified`, never auto-retried; user resolves.
- FR-APP-10 Block detection (CAPTCHA/login/403/rate-limit) → pause + notify + manual handover; never evade.
- FR-APP-11 Failure screenshots **redacted** (input values masked) retained 30 days; logs execution steps.
- FR-APP-12 Partial completion: re-entering a half-filled application re-fills idempotently from stored answers; never creates a second application record or second submission.

## HUMAN REVIEW (HIT) — core subsystem
- FR-HIT-1 Request fields per doc 08; statuses: pending, answered, approved, rejected, deferred, cancelled, expired.
- FR-HIT-2 Creation transactional: checkpoint + request + notification.
- FR-HIT-3 Responses validated per `response_schema`; stored; workflow resumes via idempotent `workflow.resume` from the exact checkpoint.
- FR-HIT-4 Actions: answer, approve, edit+approve, investigate further, defer, reject, cancel application, save reusable (explicit confirm).
- FR-HIT-5 No auto-expiry unless user configured.
- FR-HIT-6 Every user correction (edited suggestion, changed profile fact via review) recorded in `user_corrections` (old, new, reason, entity).

## TRACEABILITY (TRC)
- FR-TRC-1 Every AI call links to the entity it affected and output (`ai_requests.entity_*`, model, prompt version, input hash, confidence reported, validation outcome).
- FR-TRC-2 Every form answer stores source, source_ref, confidence, who approved, when.
- FR-TRC-3 Every automation action is an `agent_execution_logs`/`application_events` row with actor `system|user|policy`.
- FR-TRC-4 UI "Why?" link on scores, recommendations, answers showing the trace (doc 08 §12).

## TRACKING (TRK)
- FR-TRK-1 Application statuses/events per doc 10 §3.
- FR-TRK-2 Email monitoring is **opt-in** (Q15, default disabled); when on, classification yields suggestions; user confirms.
- FR-TRK-3 No inference of rejection from silence.
- FR-TRK-4 Notes, recruiter contacts, interview stages, deadlines, next action.

## NOTIFICATIONS (NOT)
- FR-NOT-1 Types: new high-priority jobs, company risk findings, review requests, failed automation, quota exhausted, verified submissions, application updates, deadlines, company check failures. Dedupe key per type.
- FR-NOT-2 Channels: in_app (always), Telegram bot, SMTP email; per-type channel preferences; digest off/daily/weekly. Credentials via env only.
- FR-NOT-3 Outbox with delivery attempts; links to entity routes; failed channel never blocks others.

## INFRA (INF)
- FR-INF-1 Worker heartbeat + offline banner. FR-INF-2 pg-boss retries/backoff/terminal failures visible. FR-INF-3 Execution & audit logs. FR-INF-4 SSE updates. FR-INF-5 Local access protection (passcode, loopback bind).
- FR-INF-6 **Degraded mode:** AI failures never block non-AI features (see doc 11 §10).
- FR-INF-7 **Failure recovery:** browser crash, network interruption, API quota exhaustion, partially completed applications (doc 10 §9–10).
- FR-INF-8 Retention job per doc 16 §9.

## UI (UI)
17 areas + Companies page (doc 14). Empty states, confirm dialogs, provenance badges, timezone formatting, global search.
