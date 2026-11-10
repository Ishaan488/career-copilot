import { z } from 'zod';

export const createResumeSchema = z.object({
  label: z.string().min(1, 'Resume label is required').max(150),
  notes: z.string().max(1000).optional().nullable(),
  isDefault: z.boolean().default(false),
});

export type CreateResumeInput = z.infer<typeof createResumeSchema>;

export const uploadResumeVersionSchema = z.object({
  resumeId: z.string().uuid().optional(),
  label: z.string().min(1).max(150),
  notes: z.string().max(1000).optional().nullable(),
  isDefault: z.boolean().default(false),
});

export type UploadResumeVersionInput = z.infer<typeof uploadResumeVersionSchema>;

export const updateResumeSchema = z.object({
  label: z.string().min(1).max(150).optional(),
  notes: z.string().max(1000).optional().nullable(),
  isDefault: z.boolean().optional(),
  status: z.enum(['active', 'archived']).optional(),
});

export type UpdateResumeInput = z.infer<typeof updateResumeSchema>;
