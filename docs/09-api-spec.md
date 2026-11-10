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
- POST `/profile/import` (multipart resume) → draft · GET `/profile/import/:id` · POST `/profile/import/:id/accept` {itemIds[]} · POST `/profile/import/:id/discard`
- GET/PUT `/preferences` · GET/PUT `/autonomy` (PUT requires `confirm:true` for any change enabling auto_* ) · GET `/autonomy/history`
- GET/POST `/reusable-answers` (POST requires `authorized:true`) · PATCH/DELETE `/:id`

## Sources & discovery
- GET/POST `/sources` · GET/PUT/DELETE `/sources/:id` · POST `/sources/:id/sync` · GET `/sources/:id/runs`
- POST `/jobs/import-url` {url} · POST `/jobs/import-manual` {…}
- GET `/jobs` filters: status[], q, company, source, workMode, minScore, recommendation[], postedAfter, hasComp, sort
- GET `/jobs/:id` (job + listings + latest analysis + evaluation + status history) · POST `/jobs/:id/transition` {to,reason} · POST `/jobs/:id/reanalyze` · POST `/jobs/:id/resolve-duplicate` {action:'merge'|'keep_separate', otherJobId}
- GET `/jobs/:id/evaluation` (full breakdown+evidence refs)

## Companies
- GET `/companies` · GET `/companies/:id` (+research, evidence, domains) · POST `/companies/:id/research` · POST `/companies/:id/domains` · GET `/companies/:id/evidence`

## Policy
- GET/POST `/policy/rules` · PUT/DELETE `/policy/rules/:id` · GET `/policy/decisions?subjectId=` · POST `/policy/simulate` {jobId} (dry-run, no mutation)

## Resumes
- GET `/resumes` · GET `/resumes/:id/versions` · POST `/resumes/master/generate` · POST `/jobs/:id/resume/propose` · GET `/resume-versions/:id` · POST `/resume-versions/:id/validate` · POST `/resume-versions/:id/approve` · POST `/resume-versions/:id/render` {format} · GET `/resume-versions/:id/download?format=` · GET `/resume-versions/:a/diff/:b`

## Applications
- POST `/jobs/:id/applications` (create; requires job shortlisted) · GET `/applications` · GET `/applications/:id` (+fields,answers,docs,events,workflow,submission) · POST `/applications/:id/start` · POST `/applications/:id/pause` · POST `/applications/:id/cancel`
- POST `/applications/:id/authorize` {kind,scopeSummaryHash,confirm:true} · POST `/applications/:id/submit` (409 unless authorized & ready) · POST `/applications/:id/mark-submitted` {note,evidence} · POST `/applications/:id/resolve-unverified` {outcome:'submitted'|'not_submitted'|'retry_confirmed'}
- PATCH `/applications/:id` {status? (manual tracker transitions), notes, nextAction} · POST `/applications/:id/events` (note) · CRUD `/applications/:id/{contacts|interviews}`
- GET `/applications/:id/screenshots/:name`

## Human review
- GET `/review` ?status= · GET `/review/:id` · POST `/review/:id/respond` {action:'answer'|'approve'|'edit_approve'|'reject'|'defer'|'cancel_application'|'investigate', payload, deferUntil?, saveAsReusable?:{confirmed:true,scope}}

## Tracking & dashboard
- GET `/dashboard` (counts computed from DB) · GET `/tracker` (grouped by status) · POST `/tracking/email/test-connection` · GET `/tracking/suggestions` · POST `/tracking/suggestions/:id/confirm|dismiss`

## Notifications & activity
- GET `/notifications` · POST `/notifications/:id/read` · POST `/notifications/read-all` · GET/PUT `/notification-prefs` · POST `/notifications/telegram/test`
- GET `/activity` (execution logs, filter by correlation/workflow/level) · GET `/activity/queue` (failed/terminal jobs, retry button → POST `/activity/queue/:id/retry` only for safe job types)
- GET `/ai/usage` (requests/tokens vs budget)

## Contracts
Request/response zod schemas live in `modules/<m>/schemas.ts` and are re-exported to the UI for typing (`import type`). OpenAPI file generation is optional (not required v1).
