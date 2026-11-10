import { describe, it, expect, beforeEach } from 'vitest';
import { intelligenceService } from '@/modules/intelligence';
import { aiService } from '@/modules/ai/service';
import { FakeAIProvider } from '../support/fake-ai-provider';
import { getDb } from '@/shared/db';
import {
  jobs,
  jobAnalyses,
  jobSkillRequirements,
  jobEvaluations,
  recommendationHistory,
  jobStatusHistory,
  candidateProfiles,
  candidateSkills,
  candidateExperience,
  jobPreferences,
} from '@/db/schema';
import { eq } from 'drizzle-orm';
import { AppError } from '@/shared/errors';

describe('T-INT-1: End-to-End Evaluation & Recommendation Pipeline', () => {
  let fakeProvider: FakeAIProvider;
  const db = getDb();

  beforeEach(async () => {
    fakeProvider = new FakeAIProvider();
    aiService.setProvider(fakeProvider);

    // Clean up test tables
    await db.delete(recommendationHistory);
    await db.delete(jobEvaluations);
    await db.delete(jobSkillRequirements);
    await db.delete(jobAnalyses);
    await db.delete(jobStatusHistory);
    await db.delete(jobs);
    await db.delete(candidateSkills);
    await db.delete(candidateExperience);
    await db.delete(jobPreferences);
    await db.delete(candidateProfiles);

    // Seed a test candidate profile
    const [profile] = await db
      .insert(candidateProfiles)
      .values({
        isSingleton: true,
        fullName: 'Jane Doe',
        headline: 'Staff Software Engineer',
      })
      .returning();

    await db.insert(candidateSkills).values([
      { profileId: profile!.id, name: 'TypeScript', normalizedName: 'typescript', proficiency: 5 },
      { profileId: profile!.id, name: 'Go', normalizedName: 'golang', proficiency: 5 },
      { profileId: profile!.id, name: 'PostgreSQL', normalizedName: 'postgresql', proficiency: 4 },
      { profileId: profile!.id, name: 'Docker', normalizedName: 'docker', proficiency: 4 },
      { profileId: profile!.id, name: 'Node.js', normalizedName: 'nodejs', proficiency: 4 },
    ]);

    await db.insert(candidateExperience).values([
      {
        profileId: profile!.id,
        org: 'Tech Corp',
        title: 'Senior Distributed Systems Engineer',
        startDate: '2018-01-01',
      },
    ]);

    await db.insert(jobPreferences).values({
      isSingleton: true,
      preferredRoles: ['Staff Engineer', 'Senior Engineer'],
      workModes: ['remote'],
      locations: [{ city: 'Bangalore', country: 'India', remoteOk: true }],
      minComp: '2000000',
      preferredComp: '3500000',
    });
  });

  it('evaluates an analyzed job and computes score, eligibility, and recommendation', async () => {
    // 1. Insert a test job
    const [testJob] = await db
      .insert(jobs)
      .values({
        title: 'Staff Engineer - Distributed Systems',
        normalizedTitle: 'staff engineer distributed systems',
        descriptionText: 'Looking for a Staff Engineer. Must have Go and TypeScript experience.',
        descriptionHash: 'hash_eval_test_1',
        status: 'new',
        workMode: 'remote',
        compMin: '2500000',
        compMax: '4000000',
        compCurrency: 'INR',
        compDisclosed: true,
      })
      .returning();

    // 2. Evaluate job (orchestration analyzes first if not analyzed)
    const result = await intelligenceService.evaluateJob(testJob!.id);

    expect(result.evaluationId).toBeDefined();
    expect(result.jobId).toBe(testJob!.id);
    expect(result.eligibility).toBe('eligible');
    expect(result.suitabilityTotal).toBeGreaterThanOrEqual(70);
    expect(['strongly_recommended', 'recommended']).toContain(result.recommendation);
    expect(result.policyDecision).toBe('allow');

    // 3. Verify database persistence
    const [evaluation] = await db
      .select()
      .from(jobEvaluations)
      .where(eq(jobEvaluations.jobId, testJob!.id));

    expect(evaluation).toBeDefined();
    expect(Number(evaluation!.suitabilityTotal)).toBe(result.suitabilityTotal);
    expect(evaluation!.recommendation).toBe(result.recommendation);

    // 4. Verify updated job record
    const [updatedJob] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, testJob!.id));

    expect(updatedJob!.recommendation).toBe(result.recommendation);
    expect(Number(updatedJob!.score)).toBe(result.suitabilityTotal);

    // 5. Verify recommendation history
    const history = await db
      .select()
      .from(recommendationHistory)
      .where(eq(recommendationHistory.jobId, testJob!.id));

    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0]?.recommendation).toBe(result.recommendation);
  });

  it('supports retrieval and validation of scoring weights', async () => {
    const weights = await intelligenceService.getScoringWeights();
    expect(weights.technical).toBeDefined();

    const sum =
      weights.technical +
      weights.role +
      weights.experience +
      weights.compensation +
      weights.location +
      weights.company;
    expect(Math.abs(sum - 100)).toBeLessThan(0.01);

    // Update with valid weights
    const updated = await intelligenceService.updateScoringWeights({
      technical: 35,
      role: 25,
      experience: 10,
      compensation: 15,
      location: 10,
      company: 5,
    });
    expect(updated.technical).toBe(35);

    // Reject invalid weights sum
    await expect(
      intelligenceService.updateScoringWeights({
        technical: 50, // sum would be 115
      })
    ).rejects.toThrow(AppError);
  });

  it('lists recommended jobs ranked by score descending and excluding ineligible', async () => {
    // Seed job 1: recommended
    const [job1] = await db
      .insert(jobs)
      .values({
        title: 'Job 1',
        normalizedTitle: 'job 1',
        descriptionHash: 'hash_1',
        descriptionText: 'Description for Job 1',
        recommendation: 'strongly_recommended',
        score: '92.50',
      })
      .returning();

    // Seed job 2: consider
    const [job2] = await db
      .insert(jobs)
      .values({
        title: 'Job 2',
        normalizedTitle: 'job 2',
        descriptionHash: 'hash_2',
        descriptionText: 'Description for Job 2',
        recommendation: 'consider',
        score: '65.00',
      })
      .returning();

    // Seed job 3: not_eligible (must be excluded from recommendations!)
    await db.insert(jobs).values({
      title: 'Job 3 Ineligible',
      normalizedTitle: 'job 3 ineligible',
      descriptionHash: 'hash_3',
      descriptionText: 'Description for Job 3',
      recommendation: 'not_eligible',
      score: '98.00', // high score but ineligible
    });

    const recommended = await intelligenceService.listRecommendedJobs();
    expect(recommended.length).toBe(2);
    expect(recommended[0]?.id).toBe(job1!.id);
    expect(recommended[1]?.id).toBe(job2!.id);
    expect(recommended.some((j) => j.recommendation === 'not_eligible')).toBe(false);
  });
});
