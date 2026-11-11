import { describe, it, expect, beforeEach } from 'vitest';
import { intelligenceService } from '../../src/modules/intelligence/service';
import { aiService, AIService } from '../../src/modules/ai/service';
import { GeminiProvider } from '../../src/modules/ai/providers/gemini';
import { FakeAIProvider } from '../support/fake-ai-provider';
import { createManualJob, searchJobs } from '../../src/modules/discovery/service';
import { getDb } from '@/shared/db';
import { jobs, jobAnalyses, jobSkillRequirements, jobStatusHistory } from '../../src/db/schema';
import { eq } from 'drizzle-orm';

describe('T-DEG: Degraded Mode & Non-AI Functionality Isolation (Doc 11 §10, User Q2)', () => {
  const db = getDb();

  beforeEach(async () => {
    // Clean up test tables
    await db.delete(jobSkillRequirements);
    await db.delete(jobAnalyses);
    await db.delete(jobStatusHistory);
    await db.delete(jobs);
  });

  it('reports no_key when GEMINI_API_KEY is not configured', async () => {
    // Save and temporarily unset environment variable
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      // Instantiate real Gemini provider without API key
      const unconfiguredProvider = new GeminiProvider('');
      const degradedService = new AIService(unconfiguredProvider);

      const status = await degradedService.status();
      expect(status.status).toBe('no_key');
      expect(status.reason).toContain('GEMINI_API_KEY');
    } finally {
      if (originalKey) process.env.GEMINI_API_KEY = originalKey;
    }
  });

  it('allows job creation, discovery, and search to operate cleanly when AI is unavailable', async () => {
    // Point AI service to unconfigured provider
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    aiService.setProvider(new GeminiProvider(''));

    try {
      // 1. Manual job creation works completely
      const { job } = await createManualJob({
        title: 'Senior Systems Architect',
        descriptionText: 'Designing high-throughput event meshes in Rust and Kafka.',
        locationRaw: 'Bengaluru, India',
        workMode: 'hybrid',
      });

      expect(job!.id).toBeDefined();
      expect(job!.title).toBe('Senior Systems Architect');

      // 2. Job search works completely
      const searchResult = await searchJobs({ searchTerm: 'Systems' });
      expect(searchResult.total).toBe(1);
      expect(searchResult.jobs[0]!.id).toBe(job!.id);

      // 3. Triggering analysis does not throw an uncaught error; it marks job as pending_ai
      const analysisResult = await intelligenceService.analyzeJob(job!.id);
      expect(analysisResult.status).toBe('pending_ai');

      // 4. Job record has analysisStatus='pending_ai'
      const [updated] = await db.select().from(jobs).where(eq(jobs.id, job!.id));
      expect(updated!.analysisStatus).toBe('pending_ai');
      expect(updated!.statusReason).toContain('pending AI');
    } finally {
      if (originalKey) process.env.GEMINI_API_KEY = originalKey;
    }
  });

  it('drains pending_ai jobs cleanly when AI availability is restored', async () => {
    // 1. Create a job in pending_ai state
    const [pendingJob] = await db
      .insert(jobs)
      .values({
        title: 'Cloud Security Specialist',
        normalizedTitle: 'cloud security specialist',
        descriptionText: 'Security posture auditing in AWS with Terraform and IAM expertise.',
        descriptionHash: 'hash_sec_999',
        status: 'new',
        analysisStatus: 'pending_ai',
      })
      .returning();

    // 2. Restore AI with FakeAIProvider
    const fakeProvider = new FakeAIProvider();
    aiService.setProvider(fakeProvider);

    // 3. Drain pending AI jobs
    const drainResult = await intelligenceService.drainPendingAIJobs(10);
    expect(drainResult.processed).toBe(1);
    expect(drainResult.succeeded).toBe(1);

    // 4. Job is now completed and transitioned
    const [processedJob] = await db.select().from(jobs).where(eq(jobs.id, pendingJob!.id));
    expect(processedJob!.analysisStatus).toBe('completed');
    expect(processedJob!.status).toBe('under_analysis');
  });
});
