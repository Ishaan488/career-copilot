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
- **profile_import_drafts**: source_file_id, extracted_text_hash, proposed jsonb, status (`pending|partially_accepted|accepted|discarded`).
- **job_preferences**: single row: preferred_roles text[], excluded_roles text[], industries text[], excluded_industries text[], locations jsonb `[{city?,country,remoteOk}]`, work_modes text[], min_comp numeric, preferred_comp numeric, comp_currency, comp_period, experience_levels text[], employment_types text[], prioritized_companies text[], excluded_companies text[], max_notice_period_days, relocation (`no|within_country|anywhere|case_by_case`).
- **autonomy_policies**: single row (versioned: `version int`, `previous` kept in `autonomy_policy_history`): allowed_source_ids uuid[], auto_shortlist bool, shortlist_threshold int, auto_prepare_resume bool, auto_fill_forms bool, auto_submit bool, auto_submit_scope jsonb (validated zod), always_review_categories text[] (superset of core), notification_prefs jsonb.
- **reusable_application_answers**: question_key text unique, question_patterns text[], answer jsonb, scope jsonb (`{atsTypes?,companyIds?}`), category, authorized_at **not null**, authorized_note, last_used_at, use_count, disabled bool.

## 3. Discovery
- **job_sources**: name, type (adapter type), config jsonb (zod-validated by adapter), enabled, schedule_cron, status (`idle|running|failing|disabled`), last_success_at, last_error, consecutive_failures, rate_limit jsonb.
- **source_sync_runs**: source_id fk, started_at, finished_at, status (`running|succeeded|partial|failed|cancelled`), counts jsonb? → explicit cols: new_count, changed_count, unchanged_count, failed_count, error text, cursor_after text.
- **companies**: name, normalized_name, primary_domain (nullable), industry, size_range, hq_country, website_url, notes. Unique(primary_domain) where not null. Index normalized_name.
- **company_domains**: company_id, domain, kind (`official|careers|ats|email|unverified`), verification vstatus, evidence_id nullable. Unique(domain).
- **company_career_pages**: company_id, url, ats_type, detected_at, last_checked_at.
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

## 6. Resumes
- **resumes**: kind (`master|tailored`), name, template (`classic|compact`).
- **resume_versions**: resume_id, version_no, model jsonb (structured sections w/ sourceRef), profile_revision_id, status (`draft|validated|invalid|approved|superseded`), approved_at, created_by (`system|user`), change_summary. Unique(resume_id, version_no).
- **resume_documents**: version_id, format (`pdf|docx|html`), file_path, sha256, size_bytes.
- **resume_job_associations**: version_id, job_id, application_id nullable. Unique(version_id, job_id).
- **resume_validation_results**: version_id, passed bool, issues jsonb `[{claim,kind,detail}]`, validated_at.

## 7. Applications
- **applications**: job_id fk **unique** (one application per job), status (doc 10 §3), platform (ats type), application_url, verified_domain bool, resume_version_id, workflow_id fk, next_action text, next_action_due_at, applied_at, last_activity_at, notes text, source label.
- **application_tasks**: application_id, step, status (`pending|running|done|failed|skipped`), attempts, error_class, error, started_at, finished_at.
- **application_form_fields**: application_id, page_index, field_key (stable hash of label+type+options), label, type (`text|email|phone|number|date|select|radio|checkbox|multiselect|file|textarea|unknown`), required, options jsonb, selector_strategy jsonb, category (`profile|legal|consent|bond|work_auth|salary|notice|relocation|background|sensitive|eeo|other`), UNIQUE(application_id, field_key).
- **application_field_answers**: field_id, answer jsonb, source (`profile|reusable|ai|human`), source_ref, confidence numeric nullable, status (`proposed|needs_review|approved|filled|verified_filled|failed`), approved_at, reviewed_by_request_id nullable.
- **application_documents**: application_id, kind (`resume|cover_letter|other`), file_path, resume_version_id nullable, approved_at.
- **application_events**: application_id, type, from_status, to_status, actor, details jsonb, evidence jsonb, at. Append-only.
- **application_submissions**: application_id, attempt_no, status (`intent|clicked|verified|unverified|failed_before_click|abandoned`), authorization_id fk, intent_at, clicked_at, verified_at, verification_evidence jsonb, screenshot_path, error. **Partial unique index**: `UNIQUE(application_id) WHERE status IN ('intent','clicked','verified','unverified')`.
- **application_authorizations**: application_id nullable (null = standing policy), kind (`submission|legal_declaration|consent|bond|custom`), scope jsonb (what exactly: ats, company, job, text hash of declaration), granted_at, granted_by `user`, expires_at, revoked_at, policy_version, summary_snapshot jsonb (answers+docs hash authorized). **Authorization covers a `summary_hash`; any change to answers/docs invalidates it.**
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
- **ai_requests**: task, model, provider, input_hash, status (`ok|invalid_output|error|rate_limited|cached`), tokens_in, tokens_out, latency_ms, cost_estimate, error, at. Index (input_hash,task).
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
| Settings/policies | `system_settings`, `policy_rules`, `autonomy_policies` |
