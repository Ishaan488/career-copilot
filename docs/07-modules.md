# 07 — Module & Component Specifications

Each module: responsibility • public API (functions exported from `index.ts`) • internals • depends on • failure modes • acceptance.

## shared
config (zod env), logger (pino+redact), errors (`AppError` codes: VALIDATION, NOT_FOUND, CONFLICT, FORBIDDEN, INVALID_TRANSITION, EXTERNAL_UNAVAILABLE, RATE_LIMITED, BLOCKED_BY_PORTAL, AI_INVALID_OUTPUT, BUDGET_EXCEEDED, UNAUTHORIZED, INTERNAL), clock, ids, db (pool+drizzle), storage (`FileStorage`: put/get/delete/exists; local impl rooted at `DATA_DIR`, path traversal guard), redact, http (`safeFetch`: timeout, size cap, redirect limit, SSRF guard blocking private IP ranges, user-agent, robots check helper), text utils (hashing `sha256`, normalize).

`discovery`, `company-discovery` and `application` queue names add: `company.propose`, `company.detect`, `company.probe`, `company.check`, `discovery.reconcile_sources`, `maintenance.retention`.

## settings
Key/value typed settings (`system_settings`), zod schema per key, defaults in code, cached. API: `get(key)`, `set(key,val,actor)`, `getAll()`. Keys: timezone, ai.models.{task}, ai.budget, scoring.weights, thresholds, discovery.interval, notification prefs, browser limits.

## audit
`audit.record({actor,action,entityType,entityId,details})` (append-only), `execLog.start/step/finish` for `agent_execution_logs`. Redacts before write.

## queue
Wrapper over pg-boss: `enqueue(name,payload,{singletonKey,startAfter,retryLimit})`, `registerHandler(name,schema,fn,opts)`, `schedule(name,cron,payload)`, `heartbeat()`, `workerStatus()`. Queue names (constants): `discovery.sync`, `job.normalize`, `job.dedupe`, `intel.analyze`, `company.research`, `comp.research`, `intel.evaluate`, `resume.generate`, `application.prepare`, `application.run_step`, `workflow.resume`, `tracking.poll_email`, `tracking.check_portal`, `notify.deliver`, `maintenance.*`. Handler wrapper: parses payload w/ zod, logs, classifies errors (retryable vs terminal), writes failure to `agent_execution_logs`.

## notification
`notify({type,dedupeKey,title,body,link,severity})` writes `notifications` + outbox rows per enabled channel in caller's transaction. Deliverers: in_app (no-op, row is the delivery), telegram, email. Dedupe: unique(`dedupe_key`) among non-dismissed within window. Digest job.

## profile (profile, preferences, autonomy, reusable answers)
Public API: `getProfile`, `updateSection(section,data)`, `getVerifiedSnapshot(fields[])` (the ONLY way other modules read profile data; takes an allow-list of fields; returns `{values, missing[]}` — unknown/unverified values are never in `values`), `completeness()`, `getPreferences/updatePreferences`, `getAutonomyPolicy/update`, `reusableAnswers.find(questionKey)/create(authorized)`. Domain: completeness calc, revision diff, normalization of phone/email. No resume parsing/import (Q8). No default personal values.

## companies
`upsertCompany({name,domain})`, `addDomain`, `findByDomainOrName`, `getCompany`, `addEvidence`, `listEvidence`. Domain normalization (registrable domain via `tldts`). Company matching never merges on name alone if domains differ. Fuzzy name match via `pg_trgm` only to *propose* matches.

## CD — company-discovery (separate from job discovery)
Public: `addCompany({name?,domain?,careerUrl?,origin})`, `importCompanies(csv|text)`, `proposeFromJobUrl(url)`, `acceptCompany(id)`, `excludeCompany(id)`, `pauseMonitoring(id)`, `detectCareerPage(companyId)`, `probeAts(companyId)` (returns candidates), `confirmCandidate(candidateId)`, `runCheck(companyId)`, `listMonitors()`, `getBoardsForDiscovery()` (read API for `discovery`).
Internals:
- `domain/slug.ts` (pure): slug variants from a company name (lowercase, strip suffixes inc/ltd/pvt/llp/technologies, hyphen/no-hyphen/concatenated), capped count.
- `domain/ats-detect.ts` (pure): URL/HTML → `{ats, boardId}` via patterns (e.g., `boards.greenhouse.io/<token>`, `job-boards.greenhouse.io/<token>`, `jobs.lever.co/<slug>`, `jobs.ashbyhq.com/<name>`, `jobs.smartrecruiters.com/<id>`, `*.myworkdayjobs.com`, `*.darwinbox.in`, `*.taleo.net`/Oracle, `*.successfactors.com`). Unsupported matches → `unsupported:<name>`.
- `infra/career-page.ts`: safeFetch of candidate career paths with robots check; stops at first success; stores `evidence` (kind `careers_page`).
- `infra/probe.ts`: calls the public ATS API for each slug candidate via the adapter's `probeBoard(slug)` (HEAD/GET), rate-limited (default 1 req/s, max 12 probes per company per run); outcome `exists|not_found|rate_limited|error`. A hit's displayed name/jobs are compared with the company name/domain; result stored as candidate with confidence (never auto-confirmed unless setting `companyDiscovery.autoAcceptExactDomainMatch` is true and domain matches exactly).
- Check run (`company.check`): re-fetch board/career page, count openings (0 allowed), compare ATS/board identity, write `company_check_runs`, update monitor `last_checked_at/openings_count/status`. Failure isolated per company.
- Honest limitation: there is no directory of all companies; discovery only works from user inputs, derived registrations and public-API probing.
Failure modes: robots disallow → recorded `blocked_by_robots`, no fetch; 429 → backoff; domain unreachable → check failed (not "company closed").

## discovery (jobs)
Public: `listSources`, `createManualSource`, `runSync(sourceId)`, `importUrl(url)`, `importManual(payload)`, `searchJobs(filters)`, `getJob(id)`, `transitionJob(id,to,actor,reason)`. ATS `job_sources` are created/updated from `company-discovery.getBoardsForDiscovery()` via a reconcile job (`discovery.reconcile_sources`); manual sources (rss_feed) are created by the user.
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
- email_alert: only if the user opted in to IMAP (Q15; disabled by default).
**Agent MUST verify each endpoint live with a real request during M5 and save a trimmed real response to `fixtures/jobs/<source>.json`** (labeled fixture). Every ATS adapter also exposes `probeBoard(slug)` for company-discovery.
Workday/Darwinbox/Oracle/SuccessFactors: no stubs (no fake code). Companies on them are registered as `ats=unsupported`; jobs can still enter via URL import/manual paste. LinkedIn/Naukri: later, via authorized APIs, email alerts or user URLs.

## ai
See doc 11.

## policy
Pure engine. `evaluate(ruleSet, context): PolicyDecision`. Rule types (zod discriminated union `type`):
`exclude_company`, `exclude_title_keyword`, `require_work_mode`, `min_compensation`, `min_suitability_to_shortlist`, `max_risk_level`, `require_review_if_category`, `auto_prepare_resume_if`, `auto_fill_if`, `auto_submit_if` (scope object), `daily_submission_cap`, `source_allowlist`. Each has `{id,type,params,enabled,priority,version}`. Decision `{decision, rulesEvaluated:[{ruleId,matched,result,reason}], explanation, inputsSnapshot}`; deterministic conflict resolution: `deny` > `require_review` > `allow`. Core non-removable rules (code constants, not editable): legal/consent/bond/work-auth/salary/notice/relocation/background/sensitive always `require_review`.

## intelligence
Public: `analyzeJob(jobId)`, `evaluateJob(jobId)`, `researchCompany(companyId)`, `researchCompensation(jobId)`, `getEvaluation(jobId)`.
`SearchProvider` abstraction (`infra/providers/`): `interface SearchProvider { readonly name; readonly capabilities; search?(q): Promise<SearchHit[]>; fetchPublic(url): Promise<PublicPage> }`. v1 implementation: `OfficialSiteProvider` (company website, career page, DNS A/MX/TXT lookups, public pages via `safeFetch`; no third-party search/news). Registry selects enabled providers from settings; none is hardcoded in service code. Every fact → `evidence` row with URL, retrieved_at, confidence; absent facts = unknown.
Degraded mode: when AI is unavailable, `analyzeJob` returns `pending_ai`; `evaluateJob` still runs with unknown AI-dependent components (flagged), see doc 11 §10.
Domain (pure, test-heavy): `eligibility.ts`, `scoring.ts`, `risk.ts`, `recommendation.ts`, `skills-normalize.ts` (alias map: "js"→"javascript", "node"→"node.js", "postgres"→"postgresql").
- Eligibility inputs: structured requirements from analysis + verified profile snapshot. Per rule → `pass|fail|unknown` with evidence quote from JD. Final: any `fail` on a **mandatory** requirement → `ineligible`; no fails but unknown mandatory → `unknown_needs_review`; else `eligible`. Requirements the AI marks mandatory must cite a JD quote; uncited → treated as non-mandatory.
- Suitability components (0–100 each): technical (weighted overlap required 2× preferred, with proficiency factor), role (embedding-free: AI semantic score 0–100 validated + deterministic title/responsibility keyword overlap blend 50/50), experience (years fit curve), compensation (vs min/preferred; unknown → neutral 50 flagged), location/work-mode, company attractiveness (prioritized list, evidence-based signals; unknown → 50 flagged). Total = Σ weight×score. Output includes `breakdown[]` with `matched`, `missing`, `notes`.
- Risk: separate level `low|medium|high|unknown` from legitimacy checklist + evidence contradictions.
- Recommendation function (pure), precedence: `ineligible`→not_eligible; risk high→high_risk; critical info missing (no JD text or unknown eligibility on mandatory)→insufficient_information; else by thresholds.

## resume (Resume Manager — NO generation, rewriting, tailoring or modification)
Public: `uploadPdf(file,{label,notes})`, `listVersions()`, `getVersion(id)`, `setDefault(id)`, `archive(id)`, `delete(id,{confirm})`, `getOriginalFilePath(id)` (for attachment), `streamOriginal(id)` (preview/download), `recordSelection(applicationId, versionId)`, `recordAttachment(applicationId, versionId, sha256)`.
Domain/infra: `validatePdf(buffer)` (magic bytes `%PDF-`, size ≤10 MB, not encrypted check best-effort), `sha256`, immutable storage (`data/resumes/<uuid>.pdf`, file mode read-only after write; no update path exists), duplicate detection by hash, delete guard (blocked when attached to a non-terminal application). Depends on nothing but shared/audit/settings (no AI, no profile). **Forbidden:** any code that parses, edits, re-renders or generates resume content.

## human-review
Public: `createRequest({...})` (transactional w/ checkpoint), `respond(id,action,payload)`, `list`, `get`, `defer`, `cancel`. State machine doc 10 §2. Emits queue `workflow.resume`. Validates response against `response_schema` (zod JSON schema stored). Reusable-answer save requires `saveAsReusable.confirmed===true`.

## browser
Doc 12. Public: `openSession(opts)`, `PortalDriver` interface, `detectPlatform(url)`, `extractForm(page)`, `fill(page,plan)`, `submit(page)`, `verify(page)`, `screenshot`, `classifyError`. Knows nothing about profile or DB.

## application
Public: `createFromJob` (dedupe guard: job unique + `dedupe_key`), `runWorkflow(applicationId)` (queue-driven), `getApplication`, `selectResume(applicationId, versionId)`, `approveSummary(applicationId, summaryHash)`, `startManualHandover(applicationId)`, `confirmManualSubmission(applicationId, note)`, `authorize(applicationId)` (per-application only; requires `SUBMISSION_ENABLED` + setting), `submitApprovedApplication`, `resolveUnverified`. Owns workflow runner, field mapping (`mapping.ts` pure), category classifier (`classify.ts` pure: legal/consent/bond/work_auth/salary/notice/relocation/background/eeo/sensitive/other), answer resolution, pre-submission validation, submission gate. No standing/auto-submit policy exists.

## tracking
Public: `transition(applicationId,status,actor,evidence)`, `addNote/Event/Interview/Contact`, `pollEmail`, `classifyEmail(pure rules + AI fallback)`, `dashboardStats()`. Stats are computed from real rows only; no seeded data.

## api
Zod-validated, session-checked, error-mapped. ≤ 30 lines per handler.

## ui
Doc 14.
