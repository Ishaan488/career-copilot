import { z } from 'zod';

export const companySizeRangeEnum = z.enum([
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1000+',
]);

export const companyDiscoveryStatusEnum = z.enum([
  'discovered',
  'registered',
  'monitoring',
  'paused',
  'excluded',
]);

export const companyOriginEnum = z.enum([
  'manual',
  'csv',
  'job_url',
  'rss',
  'email',
  'probe',
]);

export const createCompanySchema = z.object({
  name: z.string().min(1, 'Company name is required').max(200),
  primaryDomain: z.string().optional().nullable(),
  websiteUrl: z.string().url('Invalid website URL').optional().nullable(),
  careerUrl: z.string().url('Invalid career page URL').optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  sizeRange: companySizeRangeEnum.optional().nullable(),
  hqCountry: z.string().max(100).default('India').optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  origin: companyOriginEnum.default('manual'),
  originRef: z.string().max(500).optional().nullable(),
});

export type CreateCompanyInput = z.input<typeof createCompanySchema>;

export const updateCompanySchema = createCompanySchema.partial().extend({
  discoveryStatus: companyDiscoveryStatusEnum.optional(),
  excludeReason: z.string().max(500).optional().nullable(),
});

export type UpdateCompanyInput = z.input<typeof updateCompanySchema>;

export const listCompaniesQuerySchema = z.object({
  q: z.string().optional(),
  status: companyDiscoveryStatusEnum.optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export type ListCompaniesQuery = z.input<typeof listCompaniesQuerySchema>;

export const importCompaniesSchema = z.object({
  content: z.string().min(1, 'Import content cannot be empty'),
  source: z.enum(['csv', 'paste']).default('paste'),
});

export type ImportCompaniesInput = z.input<typeof importCompaniesSchema>;

export const updateMonitorSchema = z.object({
  enabled: z.boolean().optional(),
  checkIntervalHours: z.number().int().min(1).max(168).optional(),
});

export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>;

export const createCareerPageSchema = z.object({
  url: z.string().url('Invalid URL'),
  atsType: z.string().default('unknown'),
  boardId: z.string().optional().nullable(),
  status: z.enum(['candidate', 'confirmed', 'rejected', 'dead']).default('candidate'),
  verification: z.enum(['verified', 'partially_verified', 'unverified']).default('unverified'),
});

export type CreateCareerPageInput = z.infer<typeof createCareerPageSchema>;
