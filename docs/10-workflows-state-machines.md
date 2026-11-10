# 10 — Workflows & State Machines

All transitions: one function per machine `transition(id, to, actor, reason, evidence?)` → validates against the table below → updates row + inserts history/event row in ONE transaction → emits `app_events` NOTIFY. Invalid → `AppError('INVALID_TRANSITION')`.

## 1. Job status
States: `new, under_analysis, recommended, shortlisted, saved, rejected, expired, closed, applied, archived`.
| From | To (allowed) |
|------|--------------|
| new | under_analysis, rejected, saved, archived, closed |
| under_analysis | recommended, rejected, new (analysis failed terminal → stays visible with `status_reason`), saved, closed |
| recommended | shortlisted, saved, rejected, archived, closed, expired, under_analysis (re-eval) |
| shortlisted | applied, saved, rejected, archived, closed, expired |
| saved | shortlisted, rejected, archived, under_analysis, closed |
| rejected | new (user undo only), archived |
| expired / closed | archived, shortlisted (user reopen if listing active again) |
| applied | closed, archived |
| archived | new (user restore) |
Actors: `system` may do new→under_analysis, →closed/expired, under_analysis→recommended/rejected(only when ineligible or prefilter). `policy` may recommended→shortlisted only if autonomy allows. `user` anything allowed in table.
Rule: `applied` set only by application module upon verified/manual submission.

## 2. Human review request status
`pending → answered | approved | rejected | deferred | cancelled | expired`; `deferred → pending` (when snooze ends or user reopens); `answered/approved` terminal (create a new request to change). `pending → pending` for "investigate" (adds evidence).
On entering answered/approved: validate payload → store response → enqueue `workflow.resume{workflowId, requestId}` (singletonKey `resume:<requestId>`).
On rejected: workflow policy per category (default: application → `paused_by_user`, ask next action). On cancelled(application): application → `withdrawn`/`closed`.

## 3. Application status
States: `interested, shortlisted, preparing, awaiting_review, ready_to_submit, submitted, submission_unverified, under_review, assessment_received, interview_scheduled, interview_completed, offer_received, rejected, withdrawn, closed`.
| From | To |
|------|----|
| interested | shortlisted, preparing, withdrawn, closed |
| shortlisted | preparing, withdrawn, closed |
| preparing | awaiting_review, ready_to_submit, withdrawn, closed |
| awaiting_review | preparing (after response), ready_to_submit, withdrawn, closed |
| ready_to_submit | submitted, submission_unverified, awaiting_review (answers changed → authorization invalidated), preparing, withdrawn |
| submission_unverified | submitted (user/verification confirms), preparing (user confirms NOT submitted), closed |
| submitted | under_review, assessment_received, interview_scheduled, rejected, offer_received, withdrawn, closed |
| under_review | assessment_received, interview_scheduled, rejected, offer_received, withdrawn, closed |
| assessment_received | interview_scheduled, rejected, under_review, withdrawn, closed |
| interview_scheduled | interview_completed, rejected, withdrawn, closed |
| interview_completed | interview_scheduled (next round), offer_received, rejected, withdrawn, closed |
| offer_received | closed, withdrawn, rejected(declined by company) |
| rejected / withdrawn / closed | (terminal; user may reopen to `preparing` only from withdrawn/closed with explicit action) |
Auto transitions by system only: preparing/awaiting_review/ready_to_submit (workflow), submitted/submission_unverified (submission engine), under_review (confirmation email). Tracking statuses after submitted via system **only as suggestions** unless user enabled auto-apply for that email type. No transition to `rejected` from timeouts.

## 4. Application workflow (checkpointed step machine)
`workflow_checkpoints.step` ∈ ordered list. Each step function signature: `(ctx) => Promise<StepResult>` where `StepResult = {next: Step} | {pause: ReviewRequestSpec[]|'authorization'|'blocked'} | {done} | {fail: ErrorClass}`. Runner loop: load checkpoint (lock row `FOR UPDATE` with version) → run step → in one tx: save new `step/state/version`, write `application_tasks`, create review requests if pausing → commit → enqueue next `application.run_step` (singletonKey `wf:<id>:<step>:<version>`). Re-running a completed step is a no-op (steps are idempotent via state flags).

Steps:
1. `resolve_url` — choose official application URL (job.application_url; else listing URL). 
2. `verify_domain` — host ∈ known ATS domains list OR company verified domains; else **pause** review (category `company_legitimacy`).
3. `select_resume` — require approved resume version; if none and autonomy `auto_prepare_resume` → enqueue `resume.generate`, state waits `resume_pending` (poll via event); else pause for user to approve resume.
4. `detect_platform` — `detectPlatform(url)`.
5. `open_portal` — browser; blocked detection → pause(`blocked`).
6. `extract_form` — fields (multi-page: loop until review/submit page) → persist `application_form_fields`. NO submission/next-page clicks that commit data; page transitions limited to "Next/Continue" in drivers marked `safeNavigation`.
7. `map_fields` — pure mapping + answer resolution hierarchy → `application_field_answers`.
8. `validate_answers` — zod/type/length/option checks; classify categories; collect all items needing review → **create review requests (one per field/issue)**; if any → pause `waiting_review`; status `awaiting_review`.
9. `fill_form` — requires all answers `approved` or `profile`-sourced non-sensitive; fill; upload docs.
10. `validate_form` — read back values & portal validation messages; mismatch → fail(`fill_mismatch`) → retry ≤2 else pause for user.
11. `final_summary` — build summary & `summary_hash`; status `ready_to_submit`.
12. `await_authorization` — policy.evaluate(scope `submission`): `allow` only if a standing authorization (autonomy auto_submit scope) matches AND no review-category answers unapproved AND risk ≤ allowed AND daily cap not hit; else pause `waiting_authorization`, notify user with summary link.
13. `submit` — see §5.
14. `verify_submission` — see §5.
15. `finalize` — transition application to `submitted`, job → `applied`, notify, schedule monitoring.

Resume semantics: `workflow.resume` handler loads checkpoint; if status `waiting_review` and all requests for the checkpoint are resolved → set `running`, continue at stored `step` (usually `validate_answers` re-evaluation → `fill_form`). Idempotent: if status already running/completed → no-op.
Browser state is NOT persisted across pauses: on resume, re-open portal and re-extract/fill from stored answers (form field keys make this deterministic). Portal drafts used only if driver supports them safely.

## 5. Submission protocol (idempotency)
```
BEGIN
  assert application.status = ready_to_submit
  assert valid authorization (§6) with summary_hash == current summary_hash
  assert no application_submissions row in (intent,clicked,verified,unverified)   -- also enforced by partial unique index
  INSERT application_submissions(status='intent', authorization_id, intent_at)
COMMIT
-- browser: final pre-click checks (domain unchanged, form still filled)
UPDATE submission status='clicked', clicked_at   (committed BEFORE the click)
click submit
verify (wait for confirmation text/URL/DOM per driver; max 30s; then check email later)
  verified    → status='verified', evidence saved → application submitted
  not visible → status='unverified' → application.status=submission_unverified
  pre-click failure (nothing sent) → 'failed_before_click' ONLY if status was 'intent' (never clicked)
```
Rules:
- If worker crashes between 'clicked' and verify: on recovery, status 'clicked' → run `verify` only (inspect portal: open application URL / search confirmation email); never click again. If cannot determine → `unverified`.
- Retry of submit allowed only from `failed_before_click`/`abandoned` (new row after previous is terminal-failed) or after user `resolve-unverified: retry_confirmed`.
- "Application already submitted externally": driver detects "already applied" text → treat as `verified` with evidence kind `already_applied`.

## 6. Authorization model
`application_authorizations` kinds:
- `submission` per application: user clicks "Authorize submission" on the final summary; stores `summary_hash`. Expires in 24h (configurable) or on any answer/doc change.
- `standing` (stored in `autonomy_policies.auto_submit_scope`): allowed ats types, min suitability, max risk, daily cap, allowed sources, `excludeCategories`. Only matches when **every** answer on the form came from `profile` or approved `reusable` sources, no AI-sourced answer is unapproved, no core review category present, and policy `allow`.
- Legal/consent/bond/declaration: **always** per-item explicit authorization (`kind` accordingly, scope includes text hash of the declaration). Never covered by standing scope.
Check function `checkSubmissionAuthorization(app): {ok:boolean, reasons[]}` is pure given loaded data; tested exhaustively.

## 7. Source sync run
`running → succeeded | partial | failed | cancelled`. Failure increments source failures; after 5 consecutive → source status `failing` and notify; exponential schedule backoff (cap 24h). Never marks listings missing on failed/partial run.

## 8. Notification delivery
`pending → sent | failed(attempts<5 → pending with backoff) | skipped(channel disabled)`.

## 9. Worker recovery
Heartbeat every 15s. On worker start: (1) pg-boss resumes expired active jobs; (2) recovery job scans `workflow_checkpoints` with status `running` and `updated_at` older than 2 min → re-enqueue current step (unless step is `submit`, in which case run `verify_submission` only); (3) scans submissions `clicked` → verify.
UI offline banner when `last_seen_at` > 60s.

## 10. Diagram
```mermaid
stateDiagram-v2
  [*] --> resolve_url
  resolve_url --> verify_domain
  verify_domain --> select_resume
  verify_domain --> waiting_review: domain unknown
  select_resume --> detect_platform
  detect_platform --> open_portal
  open_portal --> extract_form
  open_portal --> blocked: captcha/login
  extract_form --> map_fields
  map_fields --> validate_answers
  validate_answers --> waiting_review: missing/sensitive
  waiting_review --> validate_answers: user responded
  validate_answers --> fill_form
  fill_form --> validate_form
  validate_form --> final_summary
  final_summary --> await_authorization
  await_authorization --> waiting_authorization: not covered
  waiting_authorization --> submit: user authorized
  await_authorization --> submit: policy allows
  submit --> verify_submission
  verify_submission --> finalize: verified
  verify_submission --> unverified: uncertain
  unverified --> finalize: user confirms
  finalize --> [*]
```
