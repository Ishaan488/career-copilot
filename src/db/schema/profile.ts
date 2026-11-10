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
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Verification status CHECK: 'verified' | 'partially_verified' | 'ai_estimate' | 'unverified' | 'contradictory' | 'unknown'
export const verificationStatuses = [
  'verified',
  'partially_verified',
  'ai_estimate',
  'unverified',
  'contradictory',
  'unknown',
] as const;

export type VerificationStatus = (typeof verificationStatuses)[number];

// Candidate Profile (Single User Singleton)
export const candidateProfiles = pgTable('candidate_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  isSingleton: boolean('is_singleton').default(true).notNull().unique(),
  fullName: text('full_name').notNull().default(''),
  headline: text('headline').default(''),
  summary: text('summary').default(''),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  currentCity: text('current_city').default(''),
  currentCountry: text('current_country').default('India'),
  address: text('address'),
  preferredContact: text('preferred_contact').notNull().default('email'), // 'email' | 'phone'
  noticePeriodDays: integer('notice_period_days'),
  currentEmploymentStatus: text('current_employment_status').default('employed'), // 'employed' | 'unemployed' | 'student' | 'notice_period' | 'freelancer'
  verification: text('verification').notNull().default('unverified'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const candidateEmails = pgTable('candidate_emails', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').notNull().references(() => candidateProfiles.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  isPrimary: boolean('is_primary').notNull().default(false),
  verified: boolean('verified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const candidatePhones = pgTable('candidate_phones', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').notNull().references(() => candidateProfiles.id, { onDelete: 'cascade' }),
  e164: text('e164').notNull(),
  isPrimary: boolean('is_primary').notNull().default(false),
  verified: boolean('verified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const candidateWorkAuthorizations = pgTable('candidate_work_authorizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').notNull().references(() => candidateProfiles.id, { onDelete: 'cascade' }),
  country: text('country').notNull(),
  status: text('status').notNull().default('citizen'), // 'citizen' | 'permanent_resident' | 'visa' | 'requires_sponsorship' | 'other'
  details: text('details'),
  verification: text('verification').notNull().default('unverified'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const candidateEducation = pgTable('candidate_education', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').notNull().references(() => candidateProfiles.id, { onDelete: 'cascade' }),
  institution: text('institution').notNull(),
  degree: text('degree').notNull(),
  department: text('department').default(''),
  startYear: integer('start_year'),
  graduationYear: integer('graduation_year'),
  gradeValue: numeric('grade_value'),
  gradeScale: text('grade_scale').default('cgpa10'), // 'cgpa10' | 'cgpa4' | 'percentage'
  coursework: jsonb('coursework').default(sql`'[]'::jsonb`).notNull(), // string[]
  achievements: jsonb('achievements').default(sql`'[]'::jsonb`).notNull(), // string[]
  verification: text('verification').notNull().default('unverified'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const candidateExperience = pgTable('candidate_experience', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').notNull().references(() => candidateProfiles.id, { onDelete: 'cascade' }),
  org: text('org').notNull(),
  title: text('title').notNull(),
  kind: text('kind').notNull().default('job'), // 'job' | 'internship' | 'freelance'
  startDate: text('start_date').notNull(),
  endDate: text('end_date'), // null = current
  location: text('location').default(''),
  responsibilities: jsonb('responsibilities').default(sql`'[]'::jsonb`).notNull(), // string[]
  achievements: jsonb('achievements').default(sql`'[]'::jsonb`).notNull(), // [{ text, metric?: { value, unit }, verified: boolean }]
  verification: text('verification').notNull().default('unverified'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const candidateSkills = pgTable(
  'candidate_skills',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    profileId: uuid('profile_id').notNull().references(() => candidateProfiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    category: text('category').notNull().default('other'), // 'language' | 'framework' | 'database' | 'tool' | 'cloud' | 'other'
    proficiency: integer('proficiency').notNull().default(3), // 1-5
    years: numeric('years'),
    evidenceNote: text('evidence_note'),
    verification: text('verification').notNull().default('unverified'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('candidate_skills_profile_normalized_idx').on(t.profileId, t.normalizedName),
  ]
);

export const candidateProjects = pgTable('candidate_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').notNull().references(() => candidateProfiles.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  technologies: jsonb('technologies').default(sql`'[]'::jsonb`).notNull(), // string[]
  contributions: jsonb('contributions').default(sql`'[]'::jsonb`).notNull(), // string[]
  outcomes: jsonb('outcomes').default(sql`'[]'::jsonb`).notNull(), // string[]
  metrics: jsonb('metrics').default(sql`'{}'::jsonb`).notNull(),
  repoUrl: text('repo_url'),
  demoUrl: text('demo_url'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  verification: text('verification').notNull().default('unverified'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const candidateCertifications = pgTable('candidate_certifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').notNull().references(() => candidateProfiles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  issuer: text('issuer').notNull(),
  date: text('date'),
  url: text('url'),
  verification: text('verification').notNull().default('unverified'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const candidateAwards = pgTable('candidate_awards', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').notNull().references(() => candidateProfiles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  issuer: text('issuer').notNull(),
  date: text('date'),
  url: text('url'),
  verification: text('verification').notNull().default('unverified'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const candidatePublications = pgTable('candidate_publications', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').notNull().references(() => candidateProfiles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  venue: text('venue').notNull(),
  date: text('date'),
  url: text('url'),
  verification: text('verification').notNull().default('unverified'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const candidateLinks = pgTable('candidate_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').notNull().references(() => candidateProfiles.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // 'github' | 'linkedin' | 'portfolio' | 'website' | 'other'
  url: text('url').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const profileRevisions = pgTable('profile_revisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').notNull().references(() => candidateProfiles.id, { onDelete: 'cascade' }),
  snapshot: jsonb('snapshot').notNull(),
  reason: text('reason').notNull().default('User updated profile'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Job Preferences (Single User Singleton)
export const jobPreferences = pgTable('job_preferences', {
  id: uuid('id').defaultRandom().primaryKey(),
  isSingleton: boolean('is_singleton').default(true).notNull().unique(),
  preferredRoles: jsonb('preferred_roles').default(sql`'[]'::jsonb`).notNull(), // string[]
  excludedRoles: jsonb('excluded_roles').default(sql`'[]'::jsonb`).notNull(), // string[]
  industries: jsonb('industries').default(sql`'[]'::jsonb`).notNull(), // string[]
  excludedIndustries: jsonb('excluded_industries').default(sql`'[]'::jsonb`).notNull(), // string[]
  locations: jsonb('locations').default(sql`'[]'::jsonb`).notNull(), // [{ city?: string, country: string, remoteOk: boolean }]
  workModes: jsonb('work_modes').default(sql`'[]'::jsonb`).notNull(), // 'remote' | 'hybrid' | 'onsite'
  minComp: numeric('min_comp'),
  preferredComp: numeric('preferred_comp'),
  compCurrency: text('comp_currency').notNull().default('INR'),
  compPeriod: text('comp_period').notNull().default('annual'), // 'annual' | 'monthly' | 'hourly'
  experienceLevels: jsonb('experience_levels').default(sql`'[]'::jsonb`).notNull(), // string[]
  employmentTypes: jsonb('employment_types').default(sql`'[]'::jsonb`).notNull(), // string[]
  prioritizedCompanies: jsonb('prioritized_companies').default(sql`'[]'::jsonb`).notNull(), // string[]
  excludedCompanies: jsonb('excluded_companies').default(sql`'[]'::jsonb`).notNull(), // string[]
  maxNoticePeriodDays: integer('max_notice_period_days'),
  relocation: text('relocation'), // 'no' | 'within_country' | 'anywhere' | 'case_by_case'
  scoringWeights: jsonb('scoring_weights').default(
    sql`'{"roleFit": 30, "skillMatch": 30, "comp": 15, "location": 15, "companyReputation": 10}'::jsonb`
  ).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Autonomy Policies (Single User Singleton with versioning)
export const autonomyPolicies = pgTable('autonomy_policies', {
  id: uuid('id').defaultRandom().primaryKey(),
  isSingleton: boolean('is_singleton').default(true).notNull().unique(),
  version: integer('version').notNull().default(1),
  level: integer('level').notNull().default(1), // Level 1 (discovery & eval) or Level 2 (preparation)
  autoShortlist: boolean('auto_shortlist').notNull().default(false),
  shortlistThreshold: integer('shortlist_threshold').notNull().default(70),
  mayPrepareApplications: boolean('may_prepare_applications').notNull().default(false),
  mayFillForms: boolean('may_fill_forms').notNull().default(false),
  allowedCompanyIds: jsonb('allowed_company_ids').default(sql`'[]'::jsonb`).notNull(), // string[]
  allowedAts: jsonb('allowed_ats').default(sql`'[]'::jsonb`).notNull(), // string[]
  alwaysReviewCategories: jsonb('always_review_categories').default(
    sql`'["legal", "consent", "bond", "work_auth", "salary", "notice", "relocation", "background", "sensitive", "eeo"]'::jsonb`
  ).notNull(),
  notificationPrefs: jsonb('notification_prefs').default(sql`'{}'::jsonb`).notNull(),
  submissionMode: text('submission_mode').notNull().default('manual_handover'), // 'manual_handover' (M11) | 'automated_authorized' (M12)
  maxDailyApplications: integer('max_daily_applications').notNull().default(5),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const autonomyPolicyHistory = pgTable('autonomy_policy_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  policyId: uuid('policy_id').notNull().references(() => autonomyPolicies.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  reason: text('reason').notNull().default('Policy updated'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Reusable Application Answers
export const reusableApplicationAnswers = pgTable('reusable_application_answers', {
  id: uuid('id').defaultRandom().primaryKey(),
  questionKey: text('question_key').notNull().unique(),
  questionPatterns: jsonb('question_patterns').default(sql`'[]'::jsonb`).notNull(), // string[] regex / keywords
  answer: jsonb('answer').notNull(), // typed answer data
  scope: jsonb('scope').default(sql`'{}'::jsonb`).notNull(), // { atsTypes?: string[], companyIds?: string[] }
  category: text('category').notNull().default('general'), // core categories + 'general' | 'technical'
  coreCategoryConfirmed: boolean('core_category_confirmed').notNull().default(false),
  authorizedAt: timestamp('authorized_at', { withTimezone: true }).defaultNow().notNull(),
  authorizedNote: text('authorized_note').default('User explicitly authorized answer'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  useCount: integer('use_count').notNull().default(0),
  disabled: boolean('disabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
