# 07 — Module & Component Specifications

Each module: responsibility • public API (functions exported from `index.ts`) • internals • depends on • failure modes • acceptance.

## shared
config (zod env), logger (pino+redact), errors (`AppError` codes: VALIDATION, NOT_FOUND, CONFLICT, FORBIDDEN, INVALID_TRANSITION, EXTERNAL_UNAVAILABLE, RATE_LIMITED, BLOCKED_BY_PORTAL, AI_INVALID_OUTPUT, BUDGET_EXCEEDED, UNAUTHORIZED, INTERNAL), clock, ids, db (pool+drizzle), storage (`FileStorage`: put/get/delete/exists; local impl rooted at `DATA_DIR`, path traversal guard), redact, http (`safeFetch`: timeout, size cap, redirect limit, SSRF guard blocking private IP ranges, user-agent, robots check helper), text utils (hashing `sha256`, normalize).

## settings
Key/value typed settings (`system_settings`), zod schema per key, defaults in code, cached. API: `get(key)`, `set(key,val,actor)`, `getAll()`. Keys: timezone, ai.models.{task}, ai.budget, scoring.weights, thresholds, discovery.interval, notification prefs, browser limits.

## audit
`audit.record({actor,action,entityType,entityId,details})` (append-only), `execLog.start/step/finish` for `agent_execution_logs`. Redacts before write.

## queue
Wrapper over pg-boss: `enqueue(name,payload,{singletonKey,startAfter,retryLimit})`, `registerHandler(name,schema,fn,opts)`, `schedule(name,cron,payload)`, `heartbeat()`, `workerStatus()`. Queue names (constants): `discovery.sync`, `job.normalize`, `job.dedupe`, `intel.analyze`, `company.research`, `comp.research`, `intel.evaluate`, `resume.generate`, `application.prepare`, `application.run_step`, `workflow.resume`, `tracking.poll_email`, `tracking.check_portal`, `notify.deliver`, `maintenance.*`. Handler wrapper: parses payload w/ zod, logs, classifies errors (retryable vs terminal), writes failure to `agent_execution_logs`.

## notification
`notify({type,dedupeKey,title,body,link,severity})` writes `notifications` + outbox rows per enabled channel in caller's transaction. Deliverers: in_app (no-op, row is the delivery), telegram, email. Dedupe: unique(`dedupe_key`) among non-dismissed within window. Digest job.

## profile (profile, preferences, autonomy, reusable answers)
Public API: `getProfile`, `updateSection(section,data)`, `getVerifiedSnapshot(fields[])` (the ONLY way other modules read profile data; takes an allow-list of fields), `completeness()`, `importDraftFromResume(file)`, `acceptDraftItem`, `getPreferences/updatePreferences`, `getAutonomyPolicy/update`, `reusableAnswers.find(questionKey)/create(authorized)`. Domain: completeness calc, revision diff, normalization of phone/email.

## companies
`upsertCompany({name,domain})`, `addDomain`, `findByDomainOrName`, `getCompany`, `addEvidence`, `listEvidence`. Domain normalization (registrable domain via `tldts`—add as dependency, justified: correct eTLD+1 parsing). Company matching never merges on name alone if domains differ.

## discovery
Public: `listSources`, `createSource`, `updateSource`, `runSync(sourceId)`, `importUrl(url)`, `importManual(payload)`, `searchJobs(filters)`, `getJob(id)`, `transitionJob(id,to,actor,reason)`.
### B.1 Adapter interface
```ts
interface SourceAdapter<C = unknown> {
  readonly type: SourceType;
  readonly configSchema: ZodSchema<C>;
  readonly access: 'public_api'|'public_feed'|'public_page'|'email'|'manual';
  fetchListings(ctx: {config:C; cursor?:string; http:SafeFetch; signal:AbortSignal; limiter:RateLimiter}):
    AsyncIterable<RawListingPage>;           // handles pagination internally
  extract(raw: RawListing): ExtractedJob;    // pure; adapter-specific → common shape
  detectChange(prev?: SnapshotMeta, raw: RawListing): 'new'|'changed'|'unchanged';
}
```
Registry maps `type`→adapter. `runSync` isolates every adapter call in try/catch; failure → `source_sync_runs.status='failed'`, `job_sources.consecutive_failures++`, backoff; never throws to the scheduler.
### B.2 Normalization (pure, `domain/normalize.ts`)
Title cleanup (collapse whitespace, strip req ids in brackets, keep original), `normalizedTitle` (lowercase, remove seniority-neutral noise words kept in separate `seniority` field), location parsing (`city,country`, `remote` detection incl. "Remote - India"), work mode (remote/hybrid/onsite/unknown), employment type, compensation parser (`₹12–18 LPA`, `$120k–150k`, `INR 1,200,000 per annum`, hourly/monthly; outputs min,max,currency,period,`disclosed`), HTML→text with structure preserved, deadlines.
### B.3 Dedup (pure, `domain/dedupe.ts`)
Order: (1) same source + external_id → same listing. (2) canonical application URL (strip tracking params, lowercase host, drop fragments) equal → same job. (3) same company (domain-confirmed) + same normalized title + same normalized location + description similarity ≥ 0.92 (Jaccard on 5-word shingles) → merge candidate. (4) similarity 0.80–0.92 or title/company match with different location → **flag `possible_duplicate`** for user, don't merge. Source listings always kept in `job_source_listings` pointing to canonical `jobs.id`.
### Adapters (v1)
- greenhouse: `https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` (public).
- lever: `https://api.lever.co/v0/postings/{company}?mode=json`.
- ashby: `https://api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true`.
- smartrecruiters: `https://api.smartrecruiters.com/v1/companies/{id}/postings`.
- rss_feed: any RSS/Atom URL.
- url_import: user pastes a job URL → detect ATS by host → use its API if possible else fetch page (robots-checked) and parse JSON-LD `JobPosting` first, then heuristics; if fails → manual paste.
- manual_paste: form (title, company, url, description).
- email_alert: IMAP folder/label; parse links from alert emails; resolve to `url_import`.
**Agent MUST verify each endpoint live with a real request during M4 and save a trimmed real response to `fixtures/jobs/<source>.json`** (labeled fixture).
Workday/Darwinbox/Oracle/SuccessFactors: interface-compatible stubs are NOT created (no fake code). Listed as future in doc 18.

## ai
See doc 11.

## policy
Pure engine. `evaluate(ruleSet, context): PolicyDecision`. Rule types (zod discriminated union `type`):
`exclude_company`, `exclude_title_keyword`, `require_work_mode`, `min_compensation`, `min_suitability_to_shortlist`, `max_risk_level`, `require_review_if_category`, `auto_prepare_resume_if`, `auto_fill_if`, `auto_submit_if` (scope object), `daily_submission_cap`, `source_allowlist`. Each has `{id,type,params,enabled,priority,version}`. Decision `{decision, rulesEvaluated:[{ruleId,matched,result,reason}], explanation, inputsSnapshot}`; deterministic conflict resolution: `deny` > `require_review` > `allow`. Core non-removable rules (code constants, not editable): legal/consent/bond/work-auth/salary/notice/relocation/background/sensitive always `require_review`.

## intelligence
Public: `analyzeJob(jobId)`, `evaluateJob(jobId)`, `researchCompany(companyId)`, `researchCompensation(jobId)`, `getEvaluation(jobId)`.
Domain (pure, test-heavy): `eligibility.ts`, `scoring.ts`, `risk.ts`, `recommendation.ts`, `skills-normalize.ts` (alias map: "js"→"javascript", "node"→"node.js", "postgres"→"postgresql").
- Eligibility inputs: structured requirements from analysis + verified profile snapshot. Per rule → `pass|fail|unknown` with evidence quote from JD. Final: any `fail` on a **mandatory** requirement → `ineligible`; no fails but unknown mandatory → `unknown_needs_review`; else `eligible`. Requirements the AI marks mandatory must cite a JD quote; uncited → treated as non-mandatory.
- Suitability components (0–100 each): technical (weighted overlap required 2× preferred, with proficiency factor), role (embedding-free: AI semantic score 0–100 validated + deterministic title/responsibility keyword overlap blend 50/50), experience (years fit curve), compensation (vs min/preferred; unknown → neutral 50 flagged), location/work-mode, company attractiveness (prioritized list, evidence-based signals; unknown → 50 flagged). Total = Σ weight×score. Output includes `breakdown[]` with `matched`, `missing`, `notes`.
- Risk: separate level `low|medium|high|unknown` from legitimacy checklist + evidence contradictions.
- Recommendation function (pure), precedence: `ineligible`→not_eligible; risk high→high_risk; critical info missing (no JD text or unknown eligibility on mandatory)→insufficient_information; else by thresholds.

## resume
Public: `generateMaster()`, `proposeTailored(jobId)`, `validate(versionId)`, `approve(versionId)`, `render(versionId,'pdf'|'docx')`, `listVersions`. Domain: `select.ts` (deterministic ranking of experiences/projects/skills by overlap with job requirements), `claims.ts` (extract claims from resume model; each claim has `sourceRef`), `validate.ts` (claim→profile verification; numbers/dates/orgs/skills must exist in profile text), `diff.ts`.
Resume model is **structured JSON** (sections→items→bullets with `sourceRef`) rendered by templates; AI never writes free-form full documents.

## human-review
Public: `createRequest({...})` (transactional w/ checkpoint), `respond(id,action,payload)`, `list`, `get`, `defer`, `cancel`. State machine doc 10 §2. Emits queue `workflow.resume`. Validates response against `response_schema` (zod JSON schema stored). Reusable-answer save requires `saveAsReusable.confirmed===true`.

## browser
Doc 12. Public: `openSession(opts)`, `PortalDriver` interface, `detectPlatform(url)`, `extractForm(page)`, `fill(page,plan)`, `submit(page)`, `verify(page)`, `screenshot`, `classifyError`. Knows nothing about profile or DB.

## application
Public: `createFromJob`, `runWorkflow(applicationId)` (queue-driven), `getApplication`, `authorize(applicationId, scope)`, `submitApprovedApplication`, `markSubmittedManually`, `resolveUnverified`. Owns workflow runner, field mapping (`mapping.ts` pure), answer resolution, pre-submission validation, submission gate.

## tracking
Public: `transition(applicationId,status,actor,evidence)`, `addNote/Event/Interview/Contact`, `pollEmail`, `classifyEmail(pure rules + AI fallback)`, `dashboardStats()`. Stats are computed from real rows only; no seeded data.

## api
Zod-validated, session-checked, error-mapped. ≤ 30 lines per handler.

## ui
Doc 14.
