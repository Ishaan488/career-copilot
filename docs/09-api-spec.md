# 09 — API Specification

Base `/api`. JSON. All routes require session cookie except `/api/auth/*` and `/api/health`. Mutating routes require `Origin` match + `Content-Type: application/json`. Errors: `{ "error": { "code": "VALIDATION", "message": "...", "details": {} } }` with HTTP: VALIDATION 400, UNAUTHORIZED 401, FORBIDDEN 403, NOT_FOUND 404, CONFLICT/INVALID_TRANSITION 409, RATE_LIMITED 429, EXTERNAL_UNAVAILABLE 502, BUDGET_EXCEEDED 429, INTERNAL 500.
Lists: `?page=1&pageSize=50&sort=field:dir&q=` → `{items,total,page,pageSize}`.

## Auth & system
- POST `/auth/setup` (only if no credential) {passcode} · POST `/auth/login` · POST `/auth/logout` · GET `/auth/me`
- GET `/health` → {db,queue,worker:{online,lastSeenAt},lastDiscoveryAt,version}
- GET `/events` (SSE) → events `{type,entity,id}`
- GET/PUT `/settings`, GET `/settings/:key`

## Profile
- GET `/profile` · PUT `/profile` (core) · CRUD `/profile/{education|experience|skills|projects|certifications|awards|publications|links|emails|phones|work-authorizations}` (POST, PUT `/:id`, DELETE `/:id`) · POST `/profile/:section/:id/verify` {verified:boolean}
- GET `/profile/completeness` · GET `/profile/revisions`
- GET/PUT `/preferences` · GET/PUT `/autonomy` (`level` 1|2 only; any enabling change requires `confirm:true`; level 3 → 400) · GET `/autonomy/history`
- GET/POST `/reusable-answers` (POST requires `authorized:true`; core categories require `coreCategoryConfirmed:true`; EEO rejected unless confirmed) · PATCH/DELETE `/:id`

## Company discovery (separate from jobs)
- GET `/companies` (filters: discoveryStatus, q, ats, hasOpenings) · POST `/companies` {name?,domain?,careerUrl?} · POST `/companies/import` {format:'csv'|'text', content} → batch summary
- GET `/companies/:id` (+research, evidence, domains, career pages, monitor, check runs, probe candidates) · PATCH `/companies/:id` {discoveryStatus: 'registered'|'paused'|'excluded'|'monitoring', reason}
- POST `/companies/:id/detect` (career page/ATS detection, enqueues) · POST `/companies/:id/probe` (slug probing, enqueues) · POST `/companies/:id/candidates/:cid/confirm|reject`
- POST `/companies/:id/check` (run monitor now) · GET `/companies/:id/checks`
- POST `/companies/:id/research` · POST `/companies/:id/domains` · GET `/companies/:id/evidence`

## Sources & job discovery
- GET `/sources` (derived + manual) · POST `/sources` (manual types only: rss_feed) · GET/PUT/DELETE `/sources/:id` (derived sources: only enable/disable via company) · POST `/sources/:id/sync` · GET `/sources/:id/runs`
- POST `/jobs/import-url` {url} (also proposes company registration) · POST `/jobs/import-manual` {…}
- GET `/jobs` filters: status[], q, company, source, workMode, minScore, recommendation[], postedAfter, hasComp, sort
- GET `/jobs/:id` (job + listings + latest analysis + evaluation + status history) · POST `/jobs/:id/transition` {to,reason} · POST `/jobs/:id/reanalyze` · POST `/jobs/:id/resolve-duplicate` {action:'merge'|'keep_separate', otherJobId}
- GET `/jobs/:id/evaluation` (full breakdown+evidence refs)

## Policy
- GET/POST `/policy/rules` · PUT/DELETE `/policy/rules/:id` · GET `/policy/decisions?subjectId=` · POST `/policy/simulate` {jobId} (dry-run, no mutation)

## Resume Manager (no generation)
- GET `/resumes` · POST `/resumes` (multipart PDF + label, notes) → creates version; duplicate hash → 409 with existing version id
- GET `/resumes/:id` · POST `/resumes/:id/versions` (upload new version) · GET `/resume-versions/:id/preview` (inline PDF, original bytes) · GET `/resume-versions/:id/download` · POST `/resume-versions/:id/default` · POST `/resume-versions/:id/archive` · DELETE `/resume-versions/:id` (`confirm:true`; 409 if attached to a non-terminal application)
- PUT `/applications/:id/resume` {resumeVersionId} (selection)

## Applications
- POST `/jobs/:id/applications` (requires shortlisted job & autonomy level ≥2; 409 `DUPLICATE_APPLICATION` with existing id if dedupe_key matches) · GET `/applications` · GET `/applications/:id` (+fields,answers,docs,events,workflow,submission,resume attachment) · POST `/applications/:id/start` · POST `/applications/:id/pause` · POST `/applications/:id/cancel` · DELETE `/applications/:id` (`confirm:true`, lists cascade)
- POST `/applications/:id/approve-summary` {summaryHash} · POST `/applications/:id/handover` (open headed browser; 503 `HEADED_UNAVAILABLE` if WSLg missing) · POST `/applications/:id/confirm-manual-submission` {note}
- POST `/applications/:id/authorize` {kind,summaryHash,confirm:true} (403 unless `SUBMISSION_ENABLED` env + settings toggle) · POST `/applications/:id/submit` (409 unless authorized & ready; 403 when gates off) · POST `/applications/:id/resolve-unverified` {outcome:'submitted'|'not_submitted'|'retry_confirmed'}
- PATCH `/applications/:id` {status? (manual tracker transitions), notes, nextAction} · POST `/applications/:id/events` (note) · CRUD `/applications/:id/{contacts|interviews}`
- GET `/applications/:id/screenshots/:name`

## Human review
- GET `/review` ?status= · GET `/review/:id` · POST `/review/:id/respond` {action:'answer'|'approve'|'edit_approve'|'reject'|'defer'|'cancel_application'|'investigate', payload, deferUntil?, saveAsReusable?:{confirmed:true,scope}}

## Tracking & dashboard
- GET `/dashboard` (counts computed from DB) · GET `/tracker` (grouped by status) · (opt-in only, Q15) POST `/tracking/email/test-connection` · GET `/tracking/suggestions` · POST `/tracking/suggestions/:id/confirm|dismiss`

## Notifications & activity
- GET `/notifications` · POST `/notifications/:id/read` · POST `/notifications/read-all` · GET/PUT `/notification-prefs` · POST `/notifications/telegram/test`
- GET `/activity` (execution logs, filter by correlation/workflow/level) · GET `/activity/queue` (failed/terminal jobs, retry button → POST `/activity/queue/:id/retry` only for safe job types)
- GET `/ai/usage` (requests/tokens vs budget, quota state) · GET `/trace/:entityType/:entityId` (traceability view per doc 08 §12) · GET/PUT `/settings/retention`
- Codes added: `DUPLICATE_APPLICATION` 409, `HEADED_UNAVAILABLE` 503, `SUBMISSION_DISABLED` 403, `AI_UNAVAILABLE` 503 (only for explicitly AI-only endpoints such as reanalyze).

## Contracts
Request/response zod schemas live in `modules/<m>/schemas.ts` and are re-exported to the UI for typing (`import type`). OpenAPI file generation is optional (not required v1).
