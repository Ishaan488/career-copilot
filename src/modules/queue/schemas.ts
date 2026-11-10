import { z } from 'zod';

export const jobNames = {
  DISCOVERY_SYNC: 'discovery.sync',
  JOB_NORMALIZE: 'job.normalize',
  JOB_DEDUPE: 'job.dedupe',
  INTEL_ANALYZE: 'intel.analyze',
  COMPANY_RESEARCH: 'company.research',
  COMP_RESEARCH: 'comp.research',
  INTEL_EVALUATE: 'intel.evaluate',
  RESUME_GENERATE: 'resume.generate',
  APPLICATION_PREPARE: 'application.prepare',
  APPLICATION_RUN_STEP: 'application.run_step',
  WORKFLOW_RESUME: 'workflow.resume',
  TRACKING_POLL_EMAIL: 'tracking.poll_email',
  TRACKING_CHECK_PORTAL: 'tracking.check_portal',
  NOTIFY_DELIVER: 'notify.deliver',
  MAINTENANCE_BACKUP: 'maintenance.backup',
  MAINTENANCE_RETENTION: 'maintenance.retention',
  COMPANY_CHECK: 'company.check',
  COMPANY_DETECT: 'company.detect',
  COMPANY_PROBE: 'company.probe',
} as const;

export type JobName = (typeof jobNames)[keyof typeof jobNames];

export const enqueueOptionsSchema = z.object({
  singletonKey: z.string().optional(),
  singletonSeconds: z.number().int().positive().optional(),
  startAfter: z.number().or(z.string()).optional(),
  retryLimit: z.number().int().min(0).max(10).optional(),
  retryDelay: z.number().int().min(1).optional(),
  retryBackoff: z.boolean().optional(),
  expireInSeconds: z.number().int().optional(),
});

export type EnqueueOptions = z.infer<typeof enqueueOptionsSchema>;
