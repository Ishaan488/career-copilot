import { z } from 'zod';

export const auditRecordSchema = z.object({
  actor: z.string().default('user'),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

export type AuditRecordInput = z.infer<typeof auditRecordSchema>;

export const executionLogSchema = z.object({
  correlationId: z.string(),
  workflowId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  kind: z.enum(['ai', 'browser', 'discovery', 'workflow', 'queue']),
  step: z.string().optional(),
  level: z.enum(['info', 'warn', 'error', 'debug']).default('info'),
  message: z.string(),
  data: z.record(z.unknown()).optional(),
  durationMs: z.number().int().optional(),
  tokensIn: z.number().int().optional(),
  tokensOut: z.number().int().optional(),
  errorClass: z.string().optional(),
});

export type ExecutionLogInput = z.infer<typeof executionLogSchema>;
