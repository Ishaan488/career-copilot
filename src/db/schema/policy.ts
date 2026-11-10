import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Policy Rules: User-configurable or core guardrail policies governing discovery, evaluation, and application actions
export const policyRules = pgTable(
  'policy_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: text('type').notNull(), // e.g. 'exclude_company' | 'exclude_title_keyword' | 'require_work_mode' | 'min_compensation' | 'min_suitability_to_shortlist' | 'max_risk_level' | 'require_review_if_category'
    params: jsonb('params').default(sql`'{}'::jsonb`).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    priority: integer('priority').default(100).notNull(),
    version: integer('version').default(1).notNull(),
    description: text('description').notNull(),
    updatedBy: text('updated_by').default('system').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('policy_rules_type_idx').on(t.type),
    index('policy_rules_enabled_priority_idx').on(t.enabled, t.priority),
  ]
);

// Policy Decisions: Full audit log of policy evaluations across jobs, applications, or submissions
export const policyDecisions = pgTable(
  'policy_decisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scope: text('scope').notNull(), // 'job' | 'application' | 'form_field' | 'submission'
    subjectId: text('subject_id').notNull(),
    inputs: jsonb('inputs').default(sql`'{}'::jsonb`).notNull(), // redacted snapshot
    rulesEvaluated: jsonb('rules_evaluated').default(sql`'[]'::jsonb`).notNull(),
    decision: text('decision').notNull(), // 'allow' | 'require_review' | 'deny'
    explanation: text('explanation').notNull(),
    rulesetVersion: integer('ruleset_version').default(1).notNull(),
    at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('policy_decisions_scope_subject_idx').on(t.scope, t.subjectId),
    index('policy_decisions_decision_idx').on(t.decision),
    index('policy_decisions_at_idx').on(t.at),
  ]
);
