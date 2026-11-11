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

// Companies Registry (Company entities tracked independently of whether they currently have job openings)
export const companies = pgTable(
  'companies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    primaryDomain: text('primary_domain'),
    industry: text('industry'),
    sizeRange: text('size_range'), // '1-10' | '11-50' | '51-200' | '201-500' | '501-1000' | '1000+'
    hqCountry: text('hq_country').default('India'),
    websiteUrl: text('website_url'),
    notes: text('notes'),
    discoveryStatus: text('discovery_status').default('discovered').notNull(), // 'discovered' | 'registered' | 'monitoring' | 'paused' | 'excluded'
    origin: text('origin').default('manual').notNull(), // 'manual' | 'csv' | 'job_url' | 'rss' | 'email' | 'probe'
    originRef: text('origin_ref'),
    registeredAt: timestamp('registered_at', { withTimezone: true }).defaultNow().notNull(),
    excludedAt: timestamp('excluded_at', { withTimezone: true }),
    excludeReason: text('exclude_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('companies_normalized_name_idx').on(t.normalizedName),
    uniqueIndex('companies_primary_domain_idx').on(t.primaryDomain),
  ]
);

// Company Associated Domains
export const companyDomains = pgTable('company_domains', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  domain: text('domain').notNull().unique(),
  kind: text('kind').default('official').notNull(), // 'official' | 'careers' | 'ats' | 'email' | 'unverified'
  verification: text('verification').default('unverified').notNull(), // 'verified' | 'partially_verified' | 'unverified' | 'unknown'
  evidenceId: uuid('evidence_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Company Career Pages & ATS Endpoints
export const companyCareerPages = pgTable(
  'company_career_pages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    atsType: text('ats_type').default('unknown').notNull(), // 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'workday' | 'darwinbox' | 'oracle' | 'successfactors' | 'custom' | 'unknown' | 'unsupported'
    boardId: text('board_id'), // e.g. "stripe" for boards.greenhouse.io/stripe or jobs.lever.co/spotify
    status: text('status').default('candidate').notNull(), // 'candidate' | 'confirmed' | 'rejected' | 'dead'
    verification: text('verification').default('unverified').notNull(), // 'verified' | 'partially_verified' | 'unverified'
    detectedVia: text('detected_via').default('manual').notNull(), // 'manual' | 'link_detect' | 'embed_detect' | 'json_ld' | 'probe' | 'job_url'
    evidenceId: uuid('evidence_id'),
    detectedAt: timestamp('detected_at', { withTimezone: true }).defaultNow().notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('company_career_pages_comp_ats_board_idx').on(t.companyId, t.atsType, t.boardId),
  ]
);

// Company Monitoring (Scheduled checking of company career page for new openings)
export const companyMonitors = pgTable('company_monitors', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().unique().references(() => companies.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').default(true).notNull(),
  checkIntervalHours: integer('check_interval_hours').default(24).notNull(),
  status: text('status').default('ok').notNull(), // 'ok' | 'failing' | 'paused'
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  nextCheckAt: timestamp('next_check_at', { withTimezone: true }),
  openingsCount: integer('openings_count'), // null = unknown, 0 = 0 openings
  consecutiveFailures: integer('consecutive_failures').default(0).notNull(),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Company Check Runs (Audit history of monitor executions; retention 180 days)
export const companyCheckRuns = pgTable('company_check_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  careerPageId: uuid('career_page_id').references(() => companyCareerPages.id, { onDelete: 'set null' }),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: text('status').default('running').notNull(), // 'succeeded' | 'failed' | 'blocked_by_robots' | 'unreachable'
  openingsCount: integer('openings_count'), // null = unknown, 0 = real count
  boardAlive: boolean('board_alive'),
  atsChanged: boolean('ats_changed').default(false).notNull(),
  details: jsonb('details').default(sql`'{}'::jsonb`).notNull(),
  error: text('error'),
});

// ATS Probe Candidates (Probing common slug patterns against major ATSs)
export const companyProbeCandidates = pgTable(
  'company_probe_candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    atsType: text('ats_type').notNull(), // 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters'
    slug: text('slug').notNull(),
    outcome: text('outcome').notNull(), // 'exists' | 'not_found' | 'rate_limited' | 'error'
    displayedName: text('displayed_name'),
    nameMatchScore: numeric('name_match_score'),
    domainMatch: boolean('domain_match'),
    status: text('status').default('pending_confirmation').notNull(), // 'pending_confirmation' | 'confirmed' | 'rejected'
    probedAt: timestamp('probed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('company_probe_candidates_comp_ats_slug_idx').on(t.companyId, t.atsType, t.slug),
  ]
);

// Company Import Batches (Bulk CSV / Paste batch tracking)
export const companyImportBatches = pgTable('company_import_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  source: text('source').default('paste').notNull(), // 'csv' | 'paste'
  total: integer('total').notNull(),
  accepted: integer('accepted').notNull(),
  rejected: integer('rejected').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Company Research (Milestone 8: Verifiable company research, signals, and legitimacy assessment; retention 180 days)
export const companyResearch = pgTable(
  'company_research',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // 'official_website' | 'public_web' | 'composite'
    legitimacyStatus: text('legitimacy_status').default('insufficient_evidence').notNull(), // 'verified' | 'some_concerns' | 'high_concern' | 'insufficient_evidence'
    legitimacyScore: numeric('legitimacy_score', { precision: 5, scale: 2 }).notNull(),
    signals: jsonb('signals').default(sql`'{}'::jsonb`).notNull(),
    riskFactors: jsonb('risk_factors').default(sql`'[]'::jsonb`).notNull(),
    summary: text('summary').notNull(),
    researchedAt: timestamp('researched_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('company_research_company_id_researched_at_idx').on(t.companyId, t.researchedAt),
    index('company_research_legitimacy_status_idx').on(t.legitimacyStatus),
  ]
);

// Company Research Evidence (Verifiable source URLs, captured timestamps, content snippets, and confidence levels)
export const companyResearchEvidence = pgTable(
  'company_research_evidence',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    researchId: uuid('research_id')
      .notNull()
      .references(() => companyResearch.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    signalType: text('signal_type').notNull(), // 'domain_ssl' | 'contact_info' | 'about_us' | 'careers_presence' | 'leadership' | 'social_presence' | 'business_registry'
    sourceUrl: text('source_url').notNull(),
    contentSnippet: text('content_snippet').notNull(),
    confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull(), // 0.00 to 1.00
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('company_research_evidence_company_id_idx').on(t.companyId),
    index('company_research_evidence_research_id_idx').on(t.researchId),
    index('company_research_evidence_signal_type_idx').on(t.signalType),
  ]
);
