import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(),
    severity: text('severity').notNull().default('info'), // 'info'|'success'|'warn'|'error'
    title: text('title').notNull(),
    body: text('body').notNull(),
    link: text('link'),
    dedupeKey: text('dedupe_key'),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    readAt: timestamp('read_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('notifications_dedupe_idx')
      .on(table.dedupeKey)
      .where(sql`${table.dismissedAt} IS NULL AND ${table.dedupeKey} IS NOT NULL`),
  ]
);

export const notificationDeliveries = pgTable('notification_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  notificationId: uuid('notification_id')
    .notNull()
    .references(() => notifications.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull(), // 'in_app'|'telegram'|'email'
  status: text('status').notNull().default('pending'), // 'pending'|'sent'|'failed'|'skipped'
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const scheduledTasks = pgTable('scheduled_tasks', {
  name: text('name').primaryKey(),
  cron: text('cron').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const workerHeartbeats = pgTable('worker_heartbeats', {
  workerId: text('worker_id').primaryKey(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  info: jsonb('info'),
});

export const agentExecutionLogs = pgTable(
  'agent_execution_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    correlationId: text('correlation_id').notNull(),
    workflowId: uuid('workflow_id'),
    jobId: uuid('job_id'),
    applicationId: uuid('application_id'),
    kind: text('kind').notNull(), // 'ai'|'browser'|'discovery'|'workflow'|'queue'
    step: text('step'),
    level: text('level').notNull().default('info'), // 'info'|'warn'|'error'|'debug'
    message: text('message').notNull(),
    data: jsonb('data'),
    durationMs: integer('duration_ms'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    errorClass: text('error_class'),
    at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('agent_exec_logs_corr_idx').on(table.correlationId),
    index('agent_exec_logs_at_idx').on(table.at),
  ]
);

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: text('updated_by').notNull().default('system'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  details: jsonb('details'),
  at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
});

export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
});

export const authCredentials = pgTable('auth_credentials', {
  id: text('id').primaryKey().default('singleton'),
  passcodeHash: text('passcode_hash').notNull(),
  salt: text('salt').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const files = pgTable('files', {
  path: text('path').primaryKey(),
  kind: text('kind').notNull(), // 'resume'|'screenshot'|'snapshot'|'backup'
  sha256: text('sha256').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  mime: text('mime').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// AI Requests: Traceability and audit log for all AI interactions (doc 08 §9)
export const aiRequests = pgTable(
  'ai_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    task: text('task').notNull(), // 'jd_analysis' | 'role_match' | ...
    model: text('model').notNull(),
    provider: text('provider').notNull(), // 'gemini' | 'fake'
    promptVersion: integer('prompt_version').notNull().default(1),
    inputHash: text('input_hash').notNull(),
    entityType: text('entity_type'), // e.g. 'job'
    entityId: uuid('entity_id'), // e.g. jobId
    outputRef: text('output_ref'), // e.g. 'job_analyses:<id>'
    status: text('status').notNull(), // 'ok'|'invalid_output'|'error'|'rate_limited'|'quota_exhausted'|'cached'|'budget_exceeded'
    reportedConfidence: text('reported_confidence'), // stored as string/numeric
    validationOutcome: text('validation_outcome'), // 'passed'|'corrected'|'failed'
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    latencyMs: integer('latency_ms'),
    costEstimate: text('cost_estimate'),
    error: text('error'),
    at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('ai_requests_input_task_idx').on(t.inputHash, t.task),
    index('ai_requests_entity_idx').on(t.entityType, t.entityId),
    index('ai_requests_at_idx').on(t.at),
  ]
);

// AI Cache: Deterministic caching for identical inputs and prompt/schema versions
export const aiCache = pgTable('ai_cache', {
  cacheKey: text('cache_key').primaryKey(), // sha256(task + schemaVersion + promptVersion + canonicalInput)
  output: jsonb('output').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

