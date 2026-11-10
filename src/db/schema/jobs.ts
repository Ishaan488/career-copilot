import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies, companyCareerPages } from './companies';

// Job Sources: Where listings are fetched from (derived from confirmed career pages or manually added)
export const jobSources = pgTable(
  'job_sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'rss_feed' | 'url_import' | 'manual_paste'
    config: jsonb('config').default(sql`'{}'::jsonb`).notNull(),
    origin: text('origin').default('manual').notNull(), // 'derived_from_company' | 'manual'
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    careerPageId: uuid('career_page_id').references(() => companyCareerPages.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').default(true).notNull(),
    scheduleCron: text('schedule_cron').default('0 */6 * * *'), // Default every 6 hours
    status: text('status').default('idle').notNull(), // 'idle' | 'running' | 'failing' | 'disabled'
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastError: text('last_error'),
    consecutiveFailures: integer('consecutive_failures').default(0).notNull(),
    rateLimit: jsonb('rate_limit').default(sql`'{"reqPerMinute": 30}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('job_sources_type_idx').on(t.type),
    index('job_sources_company_id_idx').on(t.companyId),
    index('job_sources_status_idx').on(t.status),
    uniqueIndex('job_sources_career_page_id_idx').on(t.careerPageId),
  ]
);

// Source Sync Runs: Execution logs for each synchronization of a job source
export const sourceSyncRuns = pgTable(
  'source_sync_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => jobSources.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    status: text('status').default('running').notNull(), // 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled'
    newCount: integer('new_count').default(0).notNull(),
    changedCount: integer('changed_count').default(0).notNull(),
    unchangedCount: integer('unchanged_count').default(0).notNull(),
    failedCount: integer('failed_count').default(0).notNull(),
    error: text('error'),
    cursorAfter: text('cursor_after'),
    details: jsonb('details'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('source_sync_runs_source_id_idx').on(t.sourceId),
    index('source_sync_runs_started_at_idx').on(t.startedAt),
  ]
);

// Canonical Jobs: Single deduplicated entity representing a position
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    normalizedTitle: text('normalized_title').notNull(),
    seniority: text('seniority'), // 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'staff' | 'principal' | 'director' | 'executive'
    descriptionText: text('description_text').notNull(),
    descriptionHtml: text('description_html'),
    locationRaw: text('location_raw'),
    city: text('city'),
    country: text('country'),
    workMode: text('work_mode').default('unknown').notNull(), // 'remote' | 'hybrid' | 'onsite' | 'unknown'
    employmentType: text('employment_type'), // 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary'
    compMin: numeric('comp_min'),
    compMax: numeric('comp_max'),
    compCurrency: text('comp_currency'),
    compPeriod: text('comp_period'), // 'yearly' | 'monthly' | 'hourly'
    compDisclosed: boolean('comp_disclosed').default(false).notNull(),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }),
    applicationUrl: text('application_url'),
    canonicalUrl: text('canonical_url'),
    status: text('status').default('new').notNull(), // doc 10: 'new' | 'under_analysis' | 'recommended' | 'shortlisted' | 'saved' | 'rejected' | 'expired' | 'closed' | 'applied' | 'archived'
    statusReason: text('status_reason'),
    firstDiscoveredAt: timestamp('first_discovered_at', { withTimezone: true }).defaultNow().notNull(),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }).defaultNow().notNull(),
    descriptionHash: text('description_hash').notNull(),
    primaryListingId: uuid('primary_listing_id'),
    possibleDuplicateOf: uuid('possible_duplicate_of'),
    prefilterResult: jsonb('prefilter_result'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('jobs_status_idx').on(t.status),
    index('jobs_company_id_idx').on(t.companyId),
    index('jobs_posted_at_idx').on(t.postedAt),
    index('jobs_canonical_url_idx').on(t.canonicalUrl),
    index('jobs_normalized_title_idx').on(t.normalizedTitle),
  ]
);

// Job Source Listings: Individual posting references linking sources to canonical jobs
export const jobSourceListings = pgTable(
  'job_source_listings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => jobSources.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    listingUrl: text('listing_url').notNull(),
    status: text('status').default('active').notNull(), // 'active' | 'missing' | 'closed'
    missingCount: integer('missing_count').default(0).notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    lastHash: text('last_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('job_source_listings_source_external_idx').on(t.sourceId, t.externalId),
    index('job_source_listings_job_id_idx').on(t.jobId),
  ]
);

// Job Snapshots: Raw immutable snapshots of listings as received from sources
export const jobSnapshots = pgTable(
  'job_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => jobSourceListings.id, { onDelete: 'cascade' }),
    contentHash: text('content_hash').notNull(),
    raw: jsonb('raw').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('job_snapshots_listing_hash_idx').on(t.listingId, t.contentHash),
  ]
);

// Job Status History: Complete audit trail of job status transitions
export const jobStatusHistory = pgTable(
  'job_status_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    actor: text('actor').notNull(), // 'system' | 'user' | 'policy'
    reason: text('reason'),
    decisionId: uuid('decision_id'),
    at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('job_status_history_job_id_idx').on(t.jobId),
    index('job_status_history_at_idx').on(t.at),
  ]
);
