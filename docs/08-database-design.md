# 08 — Database Design

PostgreSQL ≥15. Drizzle schema files in `src/db/schema/<group>.ts`. Conventions for **every table** unless noted:
`id uuid pk default gen_random_uuid()`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` (updated by app/trigger). Status columns are `text` with CHECK constraint listing allowed values (not PG enums—easier migrations). `jsonb` only where stated.
Verification enum `vstatus` (CHECK): `verified|partially_verified|ai_estimate|unverified|contradictory|unknown`.

## 1. Single-user note
No `user_id` columns. Single row `candidate_profiles`. (If multi-user ever needed → ADR + migration.)

## 2. Candidate & preferences
- **candidate_profiles**: full_name, headline, summary, timezone, current_city, current_country, address (nullable), preferred_contact (`email|phone`), notice_period_days (nullable int), current_employment_status, verification vstatus per section kept in child rows.
- **candidate_emails**: profile_id fk, email (unique per profile, citext or lower()), is_primary, verified bool. Unique partial: one primary.
- **candidate_phones**: profile_id, e164, is_primary.
- **candidate_work_authorizations**: profile_id, country, status (`citizen|permanent_resident|visa|requires_sponsorship|other`), details, verification.
- **candidate_education**: profile_id, institution, degree, department, start_year, graduation_year, grade_value numeric, grade_scale (`cgpa10|cgpa4|percentage`), coursework text[], achievements text[], verification, sort_order.
- **candidate_experience**: profile_id, org, title, kind (`job|internship|freelance`), start_date, end_date (null=current), location, responsibilities text[], achievements jsonb `[{text, metric?:{value,unit}, verified:boolean}]`, verification, sort_order.
- **candidate_skills**: profile_id, name, normalized_name, category (`language|framework|database|tool|cloud|other`), proficiency smallint 1–5, years numeric, evidence_note, verification. Unique(profile_id, normalized_name).
- **candidate_projects**: profile_id, name, description, technologies text[], contributions text[], outcomes text[], metrics jsonb, repo_url, demo_url, start_date, end_date, verification.
- **candidate_certifications**, **candidate_awards**, **candidate_publications**: profile_id, title, issuer/venue, date, url, verification.
- **candidate_links**: profile_id, kind (`github|linkedin|portfolio|website|other`), url.
- **profile_revisions**: profile_id, snapshot jsonb, reason, created_at.
- **job_preferences**: single row, **all columns nullable/empty by default (no assumed values)**: preferred_roles text[], excluded_roles text[], industries text[], excluded_industries text[], locations jsonb `[{city?,country,remoteOk}]`, work_modes text[], min_comp numeric, preferred_comp numeric, comp_currency, comp_period, experience_levels text[], employment_types text[], prioritized_companies text[], excluded_companies text[], max_notice_period_days, relocation (`no|within_country|anywhere|case_by_case`, nullable).
- **autonomy_policies**: single row (versioned: `version int`; previous rows kept in `autonomy_policy_history`): `level smallint CHECK (level IN (1,2)) default 1`, auto_shortlist bool default false, shortlist_threshold int, may_prepare_applications bool default false, may_fill_forms bool default false, allowed_company_ids uuid[] nullable, allowed_ats text[] nullable, always_review_categories text[] (must ⊇ core set; CHECK enforced in app + DB trigger), notification_prefs jsonb. **No auto_submit column (L3 not implemented).**
- **reusable_application_answers**: question_key text unique, question_patterns text[], answer jsonb, scope jsonb (`{atsTypes?,companyIds?}`), category (core categories need `core_category_confirmed bool` true), authorized_at **not null**, authorized_note, last_used_at, use_count, disabled bool. EEO category rows rejected by CHECK unless `core_category_confirmed`.

## 3. Discovery
- **job_sources**: name, type (adapter type), config jsonb (zod-validated by adapter), `origin` (`derived_from_company|manual`), `career_page_id` fk nullable (set when derived), enabled, schedule_cron, status (`idle|running|failing|disabled`), last_success_at, last_error, consecutive_failures, rate_limit jsonb. Derived sources are created/updated only by `discovery.reconcile_sources`.
- **source_sync_runs**: source_id fk, started_at, finished_at, status (`running|succeeded|partial|failed|cancelled`), counts jsonb? → explicit cols: new_count, changed_count, unchanged_count, failed_count, error text, cursor_after text.
- **companies**: name, normalized_name, primary_domain (nullable), industry, size_range, hq_country, website_url, notes, `discovery_status` (`discovered|registered|monitoring|paused|excluded`), `origin` (`manual|csv|job_url|rss|email|probe`), `origin_ref` text, registered_at, excluded_at/exclude_reason. Unique(primary_domain) where not null. Indexes: normalized_name, gin trigram on normalized_name (`pg_trgm`).
- **company_domains**: company_id, domain, kind (`official|careers|ats|email|unverified`), verification vstatus, evidence_id nullable. Unique(domain).
- **company_career_pages**: company_id, url, ats_type (`greenhouse|lever|ashby|smartrecruiters|workday|darwinbox|oracle|successfactors|custom|unknown|unsupported`), board_id text nullable, status (`candidate|confirmed|rejected|dead`), verification vstatus (probe hits = `partially_verified` until user confirms), detected_via (`manual|link_detect|embed_detect|json_ld|probe|job_url`), evidence_id, detected_at, confirmed_at, last_checked_at. Unique(company_id, ats_type, board_id).

## 3A. Company discovery (separate from job discovery)
- **company_monitors**: company_id unique fk, enabled, check_interval_hours default 24, status (`ok|failing|paused`), last_checked_at, next_check_at, openings_count int nullable (unknown ≠ 0; 0 is a real value), consecutive_failures, last_error.
- **company_check_runs**: company_id, career_page_id nullable, started_at, finished_at, status (`succeeded|failed|blocked_by_robots|unreachable`), openings_count nullable, board_alive bool nullable, ats_changed bool, details jsonb, error. Retention: 180 days.
- **company_probe_candidates**: company_id, ats_type, slug, outcome (`exists|not_found|rate_limited|error`), displayed_name, name_match_score numeric, domain_match bool nullable, status (`pending_confirmation|confirmed|rejected`), probed_at. Unique(company_id, ats_type, slug).
- **company_import_batches**: source (`csv|paste`), total, accepted, rejected, created_at (rows traceable via `companies.origin_ref`).
- **jobs** (canonical): company_id fk, title, normalized_title, seniority, description_text, description_html, location_raw, city, country, work_mode (`remote|hybrid|onsite|unknown`), employment_type, comp_min, comp_max, comp_currency, comp_period, comp_disclosed bool, posted_at, deadline_at, application_url, canonical_url, status (see doc 10 §1), status_reason, first_discovered_at, last_checked_at, description_hash, primary_listing_id (fk deferred), possible_duplicate_of uuid nullable. Indexes: (status), (company_id), (posted_at desc), (canonical_url), GIN tsvector on title+description for search.
- **job_source_listings**: job_id fk, source_id fk, external_id, listing_url, status (`active|missing|closed`), missing_count, first_seen_at, last_seen_at, last_hash. Unique(source_id, external_id).
- **job_snapshots**: listing_id fk, content_hash, raw jsonb (or file ref if >256KB), fetched_at. Unique(listing_id, content_hash).
- **job_status_history**: job_id, from_status, to_status, actor (`system|user|policy`), reason, decision_id nullable, at.

## 4. Intelligence
- **job_analyses**: job_id, description_hash, schema_version, task_version, model, responsibilities text[], seniority, domain, tech_stack text[], experience_min_years, experience_max_years, education_requirements jsonb, employment_type, location_constraints jsonb, comp_mentions jsonb, application_conditions jsonb, ambiguities text[], raw_output jsonb, tokens_in, tokens_out, created_at. Unique(job_id, description_hash, schema_version, task_version).
- **job_skill_requirements**: analysis_id fk, name, normalized_name, level (`required|preferred`), mandatory bool, quote text (JD span), min_years nullable.
- **job_evaluations**: job_id, analysis_id, profile_revision_id, weights jsonb, eligibility (`eligible|ineligible|unknown`), eligibility_rules jsonb (per-rule results), suitability_total numeric, breakdown jsonb (components with matched/missing/notes), risk_level, risk_factors jsonb, comp_assessment jsonb, company_assessment jsonb, recommendation, explanation text, evidence_ids uuid[], created_at. Index (job_id, created_at desc). Latest = max created_at (view `latest_job_evaluations`).
- **recommendation_history**: job_id, evaluation_id, recommendation, changed_from, at.
- **company_research**: company_id, version, status (`running|complete|partial|failed`), summary jsonb (identity, business, size, presence, funding), legitimacy_level, legitimacy_checks jsonb, ai_synthesis text (flagged ai_estimate), researched_at, expires_at.
- **evidence** (immutable; replaces company_evidence/salary_evidence generics): subject_type (`company|job|salary|application`), subject_id, kind (`official_site|careers_page|dns|whois|news|review_site|registry|job_posting|email_header|other`), url, title, excerpt (≤1000 chars), retrieved_at, content_hash, verification vstatus, weight (`high|medium|low`), notes. Index (subject_type, subject_id).
- **salary_evidence**: job_id nullable, company_id, evidence_id, kind (`disclosed|reported|estimated|unknown`), amount_min, amount_max, currency, period, source_label, retrieved_at, confidence (`high|medium|low`), is_estimate bool (must be true when kind=estimated; CHECK).
- **risk_assessments**: job_id, company_id, level, factors jsonb `[{code,severity,evidence_ids,detail}]`, created_at.

## 5. Policy
- **policy_rules**: type, params jsonb, enabled, priority int, version int, description, updated_by.
- **policy_decisions**: scope (`job|application|form_field|submission`), subject_id, inputs jsonb (redacted), rules_evaluated jsonb, decision (`allow|require_review|deny`), explanation, ruleset_version, at.

## 6. Resumes (Resume Manager — originals only; no generation, no modification)
- **resumes**: label, notes, `is_default` bool (partial unique: only one true), status (`active|archived`), created_at. (One row per uploaded logical resume; versions below.)
- **resume_versions**: resume_id fk, version_no, original_filename, stored_path (under `data/resumes/`), sha256 **unique**, size_bytes, mime `application/pdf`, page_count nullable, uploaded_at, label, notes, status (`active|archived|deleted`). **Immutable:** DB trigger blocks UPDATE of `stored_path, sha256, size_bytes, original_filename`. Unique(resume_id, version_no).
- **resume_attachments**: application_id fk, resume_version_id fk, selected_at, selected_by (`user`), attached_at nullable, attached_sha256 nullable (hash of the exact file handed to the browser; must equal version sha256 — CHECK in app + test), label_snapshot, version_no_snapshot. Unique(application_id) for the active attachment. Snapshots survive resume deletion (FK `ON DELETE SET NULL` on resume_version_id).
(Removed: resume_job_associations, resume_validation_results, tailored/master kinds, templates, DOCX/HTML documents.)

## 7. Applications
- **applications**: job_id fk **unique** (one application per job), `dedupe_key` text (sha256 of company_id + canonical application URL / requisition id), submission_source (`manual_confirmed|automated_verified|automated_unverified_resolved`) nullable, status (doc 10 §3), platform (ats type), application_url, verified_domain bool, resume_version_id nullable, workflow_id fk, next_action text, next_action_due_at, applied_at, last_activity_at, notes text, source label. **Partial unique index on `dedupe_key` where status NOT IN ('withdrawn','closed','rejected')** → duplicate applications refused at DB level.
- **application_tasks**: application_id, step, status (`pending|running|done|failed|skipped`), attempts, error_class, error, started_at, finished_at.
- **application_form_fields**: application_id, page_index, field_key (stable hash of label+type+options), label, type (`text|email|phone|number|date|select|radio|checkbox|multiselect|file|textarea|unknown`), required, options jsonb, selector_strategy jsonb, category (`profile|legal|consent|bond|work_auth|salary|notice|relocation|background|sensitive|eeo|other`), UNIQUE(application_id, field_key).
- **application_field_answers**: field_id, answer jsonb (nullable; null + `decision='declined'|'left_blank'` allowed for EEO/optional fields), decision (`answered|declined|left_blank`), source (`profile|reusable|ai|human`), source_ref, confidence numeric nullable, status (`proposed|needs_review|approved|filled|verified_filled|failed`), approved_at, reviewed_by_request_id nullable. CHECK: `category` core ⇒ `source IN ('human','reusable')` (never `ai`/`profile` auto for EEO).
- **application_documents**: application_id, kind (`resume|other`), file_path, resume_version_id nullable, sha256, approved_at.
- **application_events**: application_id, type, from_status, to_status, actor, details jsonb, evidence jsonb, at. Append-only.
- **application_submissions**: application_id, attempt_no, status (`intent|clicked|verified|unverified|failed_before_click|abandoned`), authorization_id fk, intent_at, clicked_at, verified_at, verification_evidence jsonb, screenshot_path, error. **Partial unique index**: `UNIQUE(application_id) WHERE status IN ('intent','clicked','verified','unverified')`.
- **application_authorizations**: application_id **not null** (per-application only in v1; no standing rows), kind (`submission|legal_declaration|consent|bond|custom`), scope jsonb (what exactly: job, company, ats, text hash of declaration), granted_at, granted_by `user`, expires_at, revoked_at, summary_hash, summary_snapshot jsonb. **Authorization covers a `summary_hash`; any change to answers/resume/URL invalidates it.**
- **application_contacts**, **application_interviews**: recruiter info; stage, scheduled_at, notes.

## 8. Human review & workflow
- **workflow_checkpoints**: workflow_id uuid unique, type (`application`), subject_id, step text, state jsonb (small, versioned), status (`running|paused|waiting_review|waiting_authorization|completed|failed|cancelled`), version int (optimistic lock), resume_token, last_error, updated_at.
- **human_review_requests**: workflow_id nullable, job_id, application_id nullable, category (core list), question text, context jsonb, uncertainty_reason text, evidence jsonb, suggested_answer jsonb nullable, suggestion_confidence numeric nullable, suggestion_rationale text, required_action (`answer|approve|authorize|decide`), response_schema jsonb, status (`pending|answered|approved|rejected|deferred|cancelled|expired`), snoozed_until, expires_at nullable, field_id nullable, checkpoint_step text, created_at, resolved_at.
- **human_review_responses**: request_id, action, payload jsonb, save_as_reusable bool, reusable_confirmed bool, validated bool, validation_errors jsonb, responded_at.

## 9. Infrastructure
- **notifications**: type, severity, title, body, link, dedupe_key, entity_type, entity_id, read_at, dismissed_at. Unique partial (dedupe_key) where dismissed_at is null.
- **notification_deliveries** (outbox): notification_id, channel, status (`pending|sent|failed|skipped`), attempts, last_error, sent_at.
- **scheduled_tasks**: name unique, cron, enabled, last_run_at, next_run_at (mirror of pg-boss schedules for UI).
- **worker_heartbeats**: worker_id, started_at, last_seen_at, info jsonb.
- **agent_execution_logs**: correlation_id, workflow_id nullable, job_id nullable, application_id nullable, kind (`ai|browser|discovery|workflow|queue`), step, level, message (redacted), data jsonb (redacted), duration_ms, tokens_in, tokens_out, error_class, at. Index (correlation_id), (at desc).
- **ai_requests**: task, model, provider, prompt_version, input_hash, `entity_type`, `entity_id` (what the output affected), `output_ref` (e.g. `job_analyses:<id>`), status (`ok|invalid_output|error|rate_limited|quota_exhausted|cached`), reported_confidence numeric nullable, validation_outcome (`passed|corrected|failed`), tokens_in, tokens_out, latency_ms, cost_estimate, error, at. Index (input_hash,task), (entity_type, entity_id). Retention 90 days.
- **user_corrections**: entity_type, entity_id, field, old_value jsonb, new_value jsonb, reason text, source_review_request_id nullable, at. Append-only.
- **ai_cache**: cache_key unique (task+schema_version+input_hash), output jsonb, created_at.
- **system_settings**: key pk, value jsonb, updated_by.
- **audit_logs**: actor, action, entity_type, entity_id, details jsonb, at. No updates/deletes (revoke via trigger raising exception on UPDATE/DELETE).
- **auth_sessions**: token_hash, created_at, expires_at, last_seen_at. **auth_credentials**: single row password_hash.
- **files**: path, kind, sha256, size, mime, created_at (registry for `data/`).

## 10. Constraints worth enforcing in DB (not only app)
- `applications.job_id` unique.
- Submission partial unique (above).
- `reusable_application_answers.authorized_at` not null.
- `salary_evidence`: `CHECK (kind <> 'estimated' OR is_estimate)`.
- `job_source_listings` unique (source_id, external_id).
- `audit_logs` immutable trigger; `evidence` immutable trigger (no UPDATE except none).
- `job_preferences`/`candidate_profiles` singleton via `CHECK (id = fixed uuid)` or `singleton boolean unique default true`.

## 11. Source of truth
| Data | Owner |
|------|-------|
| Facts about the candidate | `candidate_*` (verified only used) |
| Canonical job | `jobs`; raw in `job_snapshots` |
| Current job/app status | `jobs.status` / `applications.status`; history tables are derived log |
| Workflow progress | `workflow_checkpoints` |
| Queue state | pg-boss schema |
| Resume files | `resume_versions` (+ `data/resumes/`), immutable |
| Company registry/monitoring | `companies`, `company_career_pages`, `company_monitors` |

## 12. Traceability matrix (what is recorded, where)
| Thing to trace | Recorded in |
|----------------|-------------|
| Source of a job | `job_source_listings`, `job_snapshots` (raw), `jobs.application_url` |
| Origin of a company / board | `companies.origin/origin_ref`, `company_career_pages.detected_via`, `company_probe_candidates` |
| Evidence | `evidence` (url, retrieved_at, excerpt, confidence, verification) → referenced by ids from evaluations/research/risk |
| AI decision | `ai_requests` (task, model, prompt_version, input_hash, entity link, output_ref, reported_confidence, validation_outcome) + stored structured output (e.g. `job_analyses.raw_output`) |
| Deterministic decision | `policy_decisions` (inputs, rules, results), `job_evaluations` (weights, breakdown) |
| Confidence levels | `evidence.weight/confidence`, `salary_evidence.confidence`, `application_field_answers.confidence`, `ai_requests.reported_confidence` (informational only) |
| User corrections | `user_corrections`, `human_review_responses`, `audit_logs`, `profile_revisions` |
| Automation actions | `agent_execution_logs`, `application_events`, `application_tasks`, `application_submissions` |
| Authorizations | `application_authorizations`, `audit_logs` |
| Resume used | `resume_attachments` (version + sha256 at attach time) |
| Status changes | `job_status_history`, `application_events` |
