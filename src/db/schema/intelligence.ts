import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { jobs } from './jobs';

// Job Analyses: Structured output extracted from job description via AI / degraded fallback
export const jobAnalyses = pgTable(
  'job_analyses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    descriptionHash: text('description_hash').notNull(),
    schemaVersion: integer('schema_version').default(1).notNull(),
    taskVersion: integer('task_version').default(1).notNull(),
    model: text('model').notNull(),
    responsibilities: jsonb('responsibilities').default(sql`'[]'::jsonb`).notNull(), // text[]
    seniority: text('seniority'), // e.g. 'mid' | 'senior' | 'lead'
    domain: text('domain'), // e.g. 'backend' | 'frontend' | 'fullstack' | 'devops' | 'mobile' | 'data' | 'ai'
    techStack: jsonb('tech_stack').default(sql`'[]'::jsonb`).notNull(), // text[]
    experienceMinYears: integer('experience_min_years'),
    experienceMaxYears: integer('experience_max_years'),
    educationRequirements: jsonb('education_requirements').default(sql`'[]'::jsonb`).notNull(),
    employmentType: text('employment_type'),
    locationConstraints: jsonb('location_constraints').default(sql`'[]'::jsonb`).notNull(),
    compMentions: jsonb('comp_mentions').default(sql`'[]'::jsonb`).notNull(),
    applicationConditions: jsonb('application_conditions').default(sql`'[]'::jsonb`).notNull(),
    ambiguities: jsonb('ambiguities').default(sql`'[]'::jsonb`).notNull(), // text[]
    injectionSuspected: boolean('injection_suspected').default(false).notNull(),
    rawOutput: jsonb('raw_output'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('job_analyses_unique_idx').on(
      t.jobId,
      t.descriptionHash,
      t.schemaVersion,
      t.taskVersion
    ),
    index('job_analyses_job_id_idx').on(t.jobId),
  ]
);

// Job Skill Requirements: Extracted required/preferred skills with verified source JD quotes
export const jobSkillRequirements = pgTable(
  'job_skill_requirements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => jobAnalyses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    level: text('level').default('required').notNull(), // 'required' | 'preferred'
    mandatory: boolean('mandatory').default(true).notNull(),
    quote: text('quote'), // exact verified quote substring from JD
    minYears: integer('min_years'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('job_skill_requirements_analysis_id_idx').on(t.analysisId),
    index('job_skill_requirements_normalized_name_idx').on(t.normalizedName),
  ]
);
