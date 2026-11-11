import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { jobs } from './jobs';

// Workflow Checkpoints: Resumable execution state with optimistic locking (Doc 08 §75, Doc 10 §2)
export const workflowCheckpoints = pgTable(
  'workflow_checkpoints',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowId: uuid('workflow_id').notNull(),
    type: text('type').default('application').notNull(), // 'application' | 'investigation' | 'sync'
    subjectId: uuid('subject_id').notNull(), // e.g. applicationId or jobId
    step: text('step').notNull(), // e.g. 'resolve_url' | 'verify_domain' | 'select_resume' | 'detect_platform' | 'extract_form' | 'map_fields' | 'validate_answers' | 'fill_form' | 'validate_form' | 'final_summary' | 'await_submission_decision'
    state: jsonb('state').default(sql`'{}'::jsonb`).notNull(),
    status: text('status').default('running').notNull(), // 'running' | 'paused' | 'waiting_review' | 'waiting_authorization' | 'completed' | 'failed' | 'cancelled'
    version: integer('version').default(1).notNull(), // Optimistic locking
    resumeToken: text('resume_token'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('workflow_checkpoints_workflow_id_idx').on(t.workflowId),
    index('workflow_checkpoints_status_updated_at_idx').on(t.status, t.updatedAt),
    index('workflow_checkpoints_subject_id_idx').on(t.subjectId),
  ]
);

// Human Review Requests: Core category human review invariant & uncertainty resolution (Doc 08 §76, Doc 10 §4, User Q14)
export const humanReviewRequests = pgTable(
  'human_review_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowId: uuid('workflow_id'),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id'),
    fieldId: uuid('field_id'),
    category: text('category').notNull(), // 'legal' | 'consent' | 'bond' | 'work_auth' | 'salary' | 'eeo' | 'sensitive' | 'company_legitimacy' | 'missing_profile' | 'custom_question'
    question: text('question').notNull(),
    context: jsonb('context').default(sql`'{}'::jsonb`).notNull(),
    uncertaintyReason: text('uncertainty_reason'),
    evidence: jsonb('evidence').default(sql`'[]'::jsonb`).notNull(),
    suggestedAnswer: jsonb('suggested_answer'), // NULL for core categories (EEO/legal/bond/salary) - AI prohibited
    suggestionConfidence: numeric('suggestion_confidence', { precision: 3, scale: 2 }),
    suggestionRationale: text('suggestion_rationale'),
    requiredAction: text('required_action').notNull(), // 'answer' | 'approve' | 'authorize' | 'decide'
    responseSchema: jsonb('response_schema').default(sql`'{}'::jsonb`).notNull(), // e.g. { type: 'select', options: [...] } or { type: 'text' }
    status: text('status').default('pending').notNull(), // 'pending' | 'answered' | 'approved' | 'rejected' | 'deferred' | 'cancelled' | 'expired'
    userAnswer: jsonb('user_answer'),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    checkpointStep: text('checkpoint_step'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('human_review_requests_status_idx').on(t.status),
    index('human_review_requests_job_id_idx').on(t.jobId),
    index('human_review_requests_application_id_idx').on(t.applicationId),
    index('human_review_requests_workflow_id_idx').on(t.workflowId),
    index('human_review_requests_category_idx').on(t.category),
    index('human_review_requests_created_at_idx').on(t.createdAt),
  ]
);
