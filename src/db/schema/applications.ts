import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { jobs } from './jobs';
import { resumeVersions } from './resumes';

// Applications: Canonical record of candidate applications (Doc 08 §64, Doc 10 §3)
export const applications = pgTable(
  'applications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    dedupeKey: text('dedupe_key').notNull(), // sha256(company_id + canonical application URL / req_id)
    submissionSource: text('submission_source'), // 'manual_confirmed' | 'automated_verified' | 'automated_unverified_resolved'
    status: text('status').default('draft').notNull(), // 'draft' | 'preparing' | 'awaiting_review' | 'ready_to_submit' | 'submitted' | 'withdrawn' | 'closed' | 'rejected'
    platform: text('platform').default('generic').notNull(), // 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'generic'
    applicationUrl: text('application_url').notNull(),
    verifiedDomain: boolean('verified_domain').default(false).notNull(),
    resumeVersionId: uuid('resume_version_id').references(() => resumeVersions.id, { onDelete: 'set null' }),
    workflowId: uuid('workflow_id'),
    nextAction: text('next_action'),
    nextActionDueAt: timestamp('next_action_due_at', { withTimezone: true }),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).defaultNow().notNull(),
    notes: text('notes'),
    source: text('source').default('copilot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('applications_job_id_unique_idx').on(t.jobId),
    index('applications_status_idx').on(t.status),
    index('applications_dedupe_key_idx').on(t.dedupeKey),
    index('applications_workflow_id_idx').on(t.workflowId),
  ]
);

// Application Tasks: Audit log of individual step execution for each application (Doc 08 §65)
export const applicationTasks = pgTable(
  'application_tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    step: text('step').notNull(),
    status: text('status').default('pending').notNull(), // 'pending' | 'running' | 'done' | 'failed' | 'skipped'
    attempts: integer('attempts').default(0).notNull(),
    errorClass: text('error_class'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('application_tasks_application_id_step_idx').on(t.applicationId, t.step),
    index('application_tasks_status_idx').on(t.status),
  ]
);

// Application Form Fields: Normalized interactive form controls discovered on the portal (Doc 08 §66, Doc 12 §4)
export const applicationFormFields = pgTable(
  'application_form_fields',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    pageIndex: integer('page_index').default(0).notNull(),
    fieldKey: text('field_key').notNull(), // sha256(normalizedLabel|type|sortedOptions)
    label: text('label').notNull(),
    type: text('type').notNull(), // 'text' | 'email' | 'phone' | 'number' | 'date' | 'select' | 'radio' | 'checkbox' | 'multiselect' | 'file' | 'textarea' | 'unknown'
    required: boolean('required').default(false).notNull(),
    options: jsonb('options').default(sql`'[]'::jsonb`).notNull(),
    selectorStrategy: jsonb('selector_strategy').default(sql`'[]'::jsonb`).notNull(),
    category: text('category').default('other').notNull(), // 'profile' | 'legal' | 'consent' | 'bond' | 'work_auth' | 'salary' | 'notice' | 'relocation' | 'background' | 'sensitive' | 'eeo' | 'other'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('application_form_fields_app_key_idx').on(t.applicationId, t.fieldKey),
    index('application_form_fields_category_idx').on(t.category),
  ]
);

// Application Field Answers: Resolved answer data and human approval status (Doc 08 §67, Doc 12 §5)
export const applicationFieldAnswers = pgTable(
  'application_field_answers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fieldId: uuid('field_id')
      .notNull()
      .references(() => applicationFormFields.id, { onDelete: 'cascade' }),
    answer: jsonb('answer'), // nullable for left_blank or declined
    decision: text('decision').default('answered').notNull(), // 'answered' | 'declined' | 'left_blank'
    source: text('source').notNull(), // 'profile' | 'reusable' | 'ai' | 'human'
    sourceRef: text('source_ref'),
    confidence: numeric('confidence', { precision: 3, scale: 2 }),
    status: text('status').default('proposed').notNull(), // 'proposed' | 'needs_review' | 'approved' | 'filled' | 'verified_filled' | 'failed'
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    reviewedByRequestId: uuid('reviewed_by_request_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('application_field_answers_field_id_idx').on(t.fieldId),
    index('application_field_answers_status_idx').on(t.status),
    index('application_field_answers_source_idx').on(t.source),
  ]
);

// Application Events: Immutable chronological audit timeline (Doc 08 §69)
export const applicationEvents = pgTable(
  'application_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'created' | 'step_completed' | 'review_requested' | 'review_answered' | 'handover_started' | 'submitted' | 'rejected'
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    actor: text('actor').notNull(), // 'system' | 'user' | 'policy'
    details: jsonb('details').default(sql`'{}'::jsonb`).notNull(),
    at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('application_events_application_id_at_idx').on(t.applicationId, t.at),
  ]
);

// Application Authorizations: Per-application explicit authorization bound to summary_hash (Doc 08 §71, Doc 13 §8)
export const applicationAuthorizations = pgTable(
  'application_authorizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // 'submission' | 'legal_declaration' | 'consent' | 'bond' | 'custom'
    scope: jsonb('scope').notNull(), // job, company, ats, declaration text hash
    summaryHash: text('summary_hash').notNull(), // Hash of answers + resume sha256 + URL
    summarySnapshot: jsonb('summary_snapshot').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
    grantedBy: text('granted_by').default('user').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('application_authorizations_app_summary_idx').on(t.applicationId, t.summaryHash),
  ]
);
