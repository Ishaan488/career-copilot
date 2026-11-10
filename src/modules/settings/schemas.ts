import { z } from 'zod';

export const scoringWeightsSchema = z
  .object({
    technicalSkillMatch: z.number().min(0).max(100).default(30),
    roleMatch: z.number().min(0).max(100).default(20),
    experienceMatch: z.number().min(0).max(100).default(15),
    compensationMatch: z.number().min(0).max(100).default(15),
    locationMatch: z.number().min(0).max(100).default(10),
    companyAttractiveness: z.number().min(0).max(100).default(10),
  })
  .refine(
    (w) => {
      const sum =
        w.technicalSkillMatch +
        w.roleMatch +
        w.experienceMatch +
        w.compensationMatch +
        w.locationMatch +
        w.companyAttractiveness;
      return Math.abs(sum - 100) < 0.01;
    },
    { message: 'Scoring weights must sum to exactly 100%' }
  );

export type ScoringWeights = z.infer<typeof scoringWeightsSchema>;

export const retentionSettingsSchema = z.object({
  jobSnapshotsDays: z.number().int().min(1).default(180),
  companyEvidenceDays: z.number().int().min(1).default(180),
  screenshotsDays: z.number().int().min(1).default(30),
  aiLogsDays: z.number().int().min(1).default(90),
  execLogsDays: z.number().int().min(1).default(90),
});

export type RetentionSettings = z.infer<typeof retentionSettingsSchema>;

export const defaultSettings = {
  timezone: 'Asia/Kolkata',
  'scoring.weights': {
    technicalSkillMatch: 30,
    roleMatch: 20,
    experienceMatch: 15,
    compensationMatch: 15,
    locationMatch: 10,
    companyAttractiveness: 10,
  },
  'retention.settings': {
    jobSnapshotsDays: 180,
    companyEvidenceDays: 180,
    screenshotsDays: 30,
    aiLogsDays: 90,
    execLogsDays: 90,
  },
  'submission.enabled': false,
} as const;
