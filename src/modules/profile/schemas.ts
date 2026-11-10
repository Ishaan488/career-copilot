import { z } from 'zod';

export const CORE_CATEGORIES = [
  'legal',
  'consent',
  'bond',
  'work_auth',
  'salary',
  'notice',
  'relocation',
  'background',
  'sensitive',
  'eeo',
] as const;

export type CoreCategory = (typeof CORE_CATEGORIES)[number];

export const VERIFICATION_STATUSES = [
  'verified',
  'partially_verified',
  'ai_estimate',
  'unverified',
  'contradictory',
  'unknown',
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const candidateProfileSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(150),
  headline: z.string().max(250).optional().default(''),
  summary: z.string().max(2000).optional().default(''),
  timezone: z.string().min(1).default('Asia/Kolkata'),
  currentCity: z.string().max(100).optional().default(''),
  currentCountry: z.string().max(100).default('India'),
  address: z.string().max(300).optional().nullable(),
  preferredContact: z.enum(['email', 'phone']).default('email'),
  noticePeriodDays: z.number().int().min(0).max(365).optional().nullable(),
  currentEmploymentStatus: z
    .enum(['employed', 'unemployed', 'student', 'notice_period', 'freelancer'])
    .default('employed'),
});

export type CandidateProfileInput = z.input<typeof candidateProfileSchema>;

export const emailSchema = z.object({
  email: z.string().email(),
  isPrimary: z.boolean().default(false),
});

export const phoneSchema = z.object({
  e164: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164)'),
  isPrimary: z.boolean().default(false),
});

export const workAuthSchema = z.object({
  country: z.string().min(1).max(100),
  status: z.enum(['citizen', 'permanent_resident', 'visa', 'requires_sponsorship', 'other']),
  details: z.string().max(500).optional().nullable(),
});

export const educationSchema = z.object({
  institution: z.string().min(1).max(200),
  degree: z.string().min(1).max(150),
  department: z.string().max(150).optional().default(''),
  startYear: z.number().int().min(1950).max(2100).optional().nullable(),
  graduationYear: z.number().int().min(1950).max(2100).optional().nullable(),
  gradeValue: z.string().or(z.number()).optional().nullable(),
  gradeScale: z.enum(['cgpa10', 'cgpa4', 'percentage']).default('cgpa10'),
  coursework: z.array(z.string()).default([]),
  achievements: z.array(z.string()).default([]),
  sortOrder: z.number().int().default(0),
});

export const achievementMetricSchema = z.object({
  text: z.string().min(1),
  metric: z
    .object({
      value: z.number(),
      unit: z.string(),
    })
    .optional(),
  verified: z.boolean().default(false),
});

export const experienceSchema = z.object({
  org: z.string().min(1).max(200),
  title: z.string().min(1).max(150),
  kind: z.enum(['job', 'internship', 'freelance']).default('job'),
  startDate: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, 'Date format must be YYYY-MM or YYYY-MM-DD'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}(-\d{2})?$/, 'Date format must be YYYY-MM or YYYY-MM-DD')
    .optional()
    .nullable(),
  location: z.string().max(100).optional().default(''),
  responsibilities: z.array(z.string()).default([]),
  achievements: z.array(achievementMetricSchema).default([]),
  sortOrder: z.number().int().default(0),
});

export const skillSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.enum(['language', 'framework', 'database', 'tool', 'cloud', 'other']).default('other'),
  proficiency: z.number().int().min(1).max(5).default(3),
  years: z.number().min(0).max(50).optional().nullable(),
  evidenceNote: z.string().max(300).optional().nullable(),
});

export const projectSchema = z.object({
  name: z.string().min(1).max(150),
  description: z.string().max(2000).default(''),
  technologies: z.array(z.string()).default([]),
  contributions: z.array(z.string()).default([]),
  outcomes: z.array(z.string()).default([]),
  metrics: z.record(z.unknown()).default({}),
  repoUrl: z.string().url().optional().nullable().or(z.literal('')),
  demoUrl: z.string().url().optional().nullable().or(z.literal('')),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

export const linkSchema = z.object({
  kind: z.enum(['github', 'linkedin', 'portfolio', 'website', 'other']),
  url: z.string().url(),
});

export const scoringWeightsSchema = z
  .object({
    roleFit: z.number().min(0).max(100),
    skillMatch: z.number().min(0).max(100),
    comp: z.number().min(0).max(100),
    location: z.number().min(0).max(100),
    companyReputation: z.number().min(0).max(100),
  })
  .refine(
    (weights) => {
      const sum =
        weights.roleFit +
        weights.skillMatch +
        weights.comp +
        weights.location +
        weights.companyReputation;
      return Math.abs(sum - 100) <= 0.01;
    },
    { message: 'Scoring weights must sum to exactly 100' }
  );

export const jobPreferencesSchema = z.object({
  preferredRoles: z.array(z.string()).default([]),
  excludedRoles: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  excludedIndustries: z.array(z.string()).default([]),
  locations: z
    .array(
      z.object({
        city: z.string().optional(),
        country: z.string(),
        remoteOk: z.boolean().default(false),
      })
    )
    .default([]),
  workModes: z.array(z.enum(['remote', 'hybrid', 'onsite'])).default([]),
  minComp: z.number().positive().optional().nullable(),
  preferredComp: z.number().positive().optional().nullable(),
  compCurrency: z.string().default('INR'),
  compPeriod: z.enum(['annual', 'monthly', 'hourly']).default('annual'),
  experienceLevels: z.array(z.string()).default([]),
  employmentTypes: z.array(z.string()).default([]),
  prioritizedCompanies: z.array(z.string()).default([]),
  excludedCompanies: z.array(z.string()).default([]),
  maxNoticePeriodDays: z.number().int().min(0).max(365).optional().nullable(),
  relocation: z.enum(['no', 'within_country', 'anywhere', 'case_by_case']).optional().nullable(),
  scoringWeights: scoringWeightsSchema.default({
    roleFit: 30,
    skillMatch: 30,
    comp: 15,
    location: 15,
    companyReputation: 10,
  }),
});

export type JobPreferencesInput = z.input<typeof jobPreferencesSchema>;

export const autonomyPolicySchema = z
  .object({
    level: z.literal(1).or(z.literal(2)), // Level 1 (discovery & eval) or Level 2 (preparation). Level 3 is strictly forbidden.
    autoShortlist: z.boolean().default(false),
    shortlistThreshold: z.number().int().min(0).max(100).default(70),
    mayPrepareApplications: z.boolean().default(false),
    mayFillForms: z.boolean().default(false),
    allowedCompanyIds: z.array(z.string()).default([]),
    allowedAts: z.array(z.string()).default([]),
    alwaysReviewCategories: z
      .array(z.string())
      .default([...CORE_CATEGORIES]),
    notificationPrefs: z.record(z.unknown()).default({}),
    submissionMode: z.enum(['manual_handover', 'automated_authorized']).default('manual_handover'),
    maxDailyApplications: z.number().int().min(1).max(50).default(5),
    confirm: z.boolean().optional(),
  })
  .refine(
    (policy) => {
      // Must contain all core review categories
      for (const core of CORE_CATEGORIES) {
        if (!policy.alwaysReviewCategories.includes(core)) {
          return false;
        }
      }
      return true;
    },
    { message: `alwaysReviewCategories must contain all core categories: ${CORE_CATEGORIES.join(', ')}` }
  );

export type AutonomyPolicyInput = z.input<typeof autonomyPolicySchema>;

export const reusableAnswerSchema = z
  .object({
    questionKey: z.string().min(1).max(200),
    questionPatterns: z.array(z.string()).min(1, 'At least one matching pattern/keyword is required'),
    answer: z.unknown(),
    scope: z
      .object({
        atsTypes: z.array(z.string()).optional(),
        companyIds: z.array(z.string()).optional(),
      })
      .default({}),
    category: z.string().default('general'),
    coreCategoryConfirmed: z.boolean().default(false),
    authorizedNote: z.string().optional(),
    disabled: z.boolean().default(false),
  })
  .refine(
    (item) => {
      const isCore = (CORE_CATEGORIES as readonly string[]).includes(item.category);
      if (isCore && !item.coreCategoryConfirmed) {
        return false;
      }
      return true;
    },
    {
      message: 'Core and EEO category reusable answers require explicit coreCategoryConfirmed: true',
      path: ['coreCategoryConfirmed'],
    }
  );

export type ReusableAnswerInput = z.input<typeof reusableAnswerSchema>;

export interface CompletenessReport {
  score: number;
  breakdown: {
    personal: number;
    contact: number;
    workAuth: number;
    experience: number;
    education: number;
    skills: number;
  };
  missingFields: string[];
}
