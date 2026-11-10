import { describe, it, expect, beforeEach } from 'vitest';
import { intelligenceService } from '../../src/modules/intelligence/service';
import { aiService } from '../../src/modules/ai/service';
import { FakeAIProvider } from '../support/fake-ai-provider';
import { getDb } from '@/shared/db';
import {
  jobs,
  jobAnalyses,
  jobSkillRequirements,
  jobStatusHistory,
  aiCache,
  aiRequests,
} from '../../src/db/schema';
import { eq } from 'drizzle-orm';

describe('T-AI-4: IntelligenceService and Job Analysis Lifecycle', () => {
  let fakeProvider: FakeAIProvider;
  const db = getDb();

  beforeEach(async () => {
    fakeProvider = new FakeAIProvider();
    aiService.setProvider(fakeProvider);

    // Clean up test tables
    await db.delete(aiCache);
    await db.delete(aiRequests);
    await db.delete(jobSkillRequirements);
    await db.delete(jobAnalyses);
    await db.delete(jobStatusHistory);
    await db.delete(jobs);
  });

  it('analyzes a new job, persists structured analysis & skills, and transitions status to under_analysis', async () => {
    // 1. Insert a test job
    const [testJob] = await db
      .insert(jobs)
      .values({
        title: 'Staff Platform Engineer',
        normalizedTitle: 'staff platform engineer',
        descriptionText: 'We require 7+ years with Kubernetes and Go. Strong experience with TypeScript is required.',
        descriptionHash: 'hash_test_12345',
        status: 'new',
        workMode: 'remote',
      })
      .returning();

    // 2. Run analysis
    const result = await intelligenceService.analyzeJob(testJob!.id);
    expect(result.status).toBe('completed');
    expect(result.analysisId).toBeDefined();

    // 3. Verify job_analyses record exists
    const [savedAnalysis] = await db
      .select()
      .from(jobAnalyses)
      .where(eq(jobAnalyses.jobId, testJob!.id));

    expect(savedAnalysis).toBeDefined();
    expect(savedAnalysis!.model).toBeDefined();
    expect(savedAnalysis!.responsibilities).toBeInstanceOf(Array);

    // 4. Verify job_skill_requirements were stored
    const skills = await db
      .select()
      .from(jobSkillRequirements)
      .where(eq(jobSkillRequirements.analysisId, savedAnalysis!.id));

    expect(skills.length).toBeGreaterThan(0);
    expect(skills.some((s) => s.normalizedName === 'typescript')).toBe(true);

    // 5. Verify job status transitioned from 'new' to 'under_analysis'
    const [updatedJob] = await db.select().from(jobs).where(eq(jobs.id, testJob!.id));
    expect(updatedJob!.status).toBe('under_analysis');
    expect(updatedJob!.analysisStatus).toBe('completed');

    // 6. Verify job_status_history record
    const history = await db
      .select()
      .from(jobStatusHistory)
      .where(eq(jobStatusHistory.jobId, testJob!.id));

    expect(history.length).toBe(1);
    expect(history[0]!.fromStatus).toBe('new');
    expect(history[0]!.toStatus).toBe('under_analysis');
    expect(history[0]!.actor).toBe('system');
  });

  it('skips re-analysis when job description hash is unchanged (T-AI-4)', async () => {
    const [testJob] = await db
      .insert(jobs)
      .values({
        title: 'Senior Frontend Developer',
        normalizedTitle: 'senior frontend developer',
        descriptionText: 'Proficiency in React and Tailwind is required for building rich UIs.',
        descriptionHash: 'hash_unchanged_abc',
        status: 'new',
      })
      .returning();

    // First analysis: runs provider
    const firstResult = await intelligenceService.analyzeJob(testJob!.id);
    expect(firstResult.status).toBe('completed');
    expect(fakeProvider.calls.length).toBe(1);

    // Second analysis without force flag: skipped
    const secondResult = await intelligenceService.analyzeJob(testJob!.id);
    expect(secondResult.status).toBe('unchanged');
    expect(secondResult.skipped).toBe(true);
    expect(fakeProvider.calls.length).toBe(1); // Not called again!

    // Third analysis WITH force=true: runs
    const forcedResult = await intelligenceService.analyzeJob(testJob!.id, { force: true });
    expect(forcedResult.status).toBe('completed');
    expect(fakeProvider.calls.length).toBe(2);
  });

  it('skips analysis if job is already closed or archived', async () => {
    const [closedJob] = await db
      .insert(jobs)
      .values({
        title: 'Archived Position',
        normalizedTitle: 'archived position',
        descriptionText: 'Legacy role description.',
        descriptionHash: 'hash_closed_999',
        status: 'closed',
      })
      .returning();

    const result = await intelligenceService.analyzeJob(closedJob!.id);
    expect(result.status).toBe('skipped');
    expect(result.skipped).toBe(true);
    expect(fakeProvider.calls.length).toBe(0);
  });

  it('retrieves complete analysis and skills via getJobAnalysis', async () => {
    const [testJob] = await db
      .insert(jobs)
      .values({
        title: 'Backend Lead',
        normalizedTitle: 'backend lead',
        descriptionText: 'Build distributed systems with Go and PostgreSQL.',
        descriptionHash: 'hash_lead_123',
        status: 'new',
      })
      .returning();

    await intelligenceService.analyzeJob(testJob!.id);

    const fullAnalysis = await intelligenceService.getJobAnalysis(testJob!.id);
    expect(fullAnalysis).toBeDefined();
    expect(fullAnalysis?.skills).toBeDefined();
    expect(fullAnalysis?.skills.length).toBeGreaterThan(0);
  });
});
