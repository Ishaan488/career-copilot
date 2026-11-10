import { describe, it, expect, beforeEach } from 'vitest';
import { AIService } from '../../src/modules/ai/service';
import { FakeAIProvider } from '../support/fake-ai-provider';
import {
  JdAnalysisOutputSchema,
  JD_ANALYSIS_JSON_SCHEMA,
  JD_ANALYSIS_SYSTEM_PROMPT,
} from '../../src/modules/ai/prompts/jd-analysis';
import { getDb } from '@/shared/db';
import { aiRequests, aiCache } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { AppError } from '../../src/shared/errors';

describe('T-AI-1: AIService Pipeline Execution with FakeAIProvider', () => {
  let fakeProvider: FakeAIProvider;
  let service: AIService;
  const db = getDb();

  beforeEach(async () => {
    fakeProvider = new FakeAIProvider();
    service = new AIService(fakeProvider);

    // Clean up test cache and request logs
    await db.delete(aiCache);
    await db.delete(aiRequests);
  });

  it('successfully executes a structured task and records audit logs', async () => {
    const result = await service.run({
      task: 'jd_analysis',
      model: 'gemini-2.0-flash',
      system: JD_ANALYSIS_SYSTEM_PROMPT,
      userContent: [{ type: 'text', text: 'Analyze this job' }],
      schema: JdAnalysisOutputSchema,
      jsonSchema: JD_ANALYSIS_JSON_SCHEMA,
    });

    expect(result.data.seniority).toBe('senior');
    expect(result.data.skills?.length).toBeGreaterThan(0);
    expect(result.cached).toBe(false);
    expect(result.corrected).toBe(false);
    expect(result.requestId).toBeDefined();

    // Verify written to ai_requests table
    const logs = await db.select().from(aiRequests);
    expect(logs.length).toBe(1);
    expect(logs[0]!.task).toBe('jd_analysis');
    expect(logs[0]!.status).toBe('ok');
    expect(logs[0]!.validationOutcome).toBe('passed');
  });

  it('serves identical subsequent requests from cache without calling provider', async () => {
    const req = {
      task: 'jd_analysis' as const,
      model: 'gemini-2.0-flash',
      system: JD_ANALYSIS_SYSTEM_PROMPT,
      userContent: [{ type: 'text' as const, text: 'Unique job posting content 12345' }],
      schema: JdAnalysisOutputSchema,
      jsonSchema: JD_ANALYSIS_JSON_SCHEMA,
    };

    // First call: executes provider
    const first = await service.run(req);
    expect(first.cached).toBe(false);
    expect(fakeProvider.calls.length).toBe(1);

    // Second call with identical input: served from cache
    const second = await service.run(req);
    expect(second.cached).toBe(true);
    expect(second.data.seniority).toBe(first.data.seniority);
    expect(fakeProvider.calls.length).toBe(1); // Provider NOT called again

    // Verify cache hit was recorded in ai_requests
    const logs = await db.select().from(aiRequests).where(eq(aiRequests.status, 'cached'));
    expect(logs.length).toBe(1);
  });

  it('handles invalid output with one controlled correction call successfully', async () => {
    // 1. First response is missing required fields or has invalid seniority
    fakeProvider.enqueueResponse('jd_analysis', {
      responsibilities: ['Only responsibilities'],
      seniority: 'invalid_level', // Invalid enum value
    });

    // 2. Second response (the correction call) fixes the error
    fakeProvider.enqueueResponse('jd_analysis', {
      responsibilities: ['Only responsibilities'],
      seniority: 'mid',
      domain: 'backend',
      techStack: ['go'],
      experienceMinYears: 3,
      educationRequirements: [],
      locationConstraints: [],
      compMentions: [],
      applicationConditions: [],
      ambiguities: [],
      skills: [{ name: 'Go', level: 'required', mandatory: true, quote: 'Go experience' }],
      injection_suspected: false,
    });

    const result = await service.run({
      task: 'jd_analysis',
      model: 'gemini-2.0-flash',
      system: JD_ANALYSIS_SYSTEM_PROMPT,
      userContent: [{ type: 'text', text: 'Job test' }],
      schema: JdAnalysisOutputSchema,
      jsonSchema: JD_ANALYSIS_JSON_SCHEMA,
    });

    expect(result.corrected).toBe(true);
    expect(result.data.seniority).toBe('mid');
    expect(fakeProvider.calls.length).toBe(2); // One initial + one correction

    const logs = await db.select().from(aiRequests).where(eq(aiRequests.status, 'ok'));
    expect(logs[0]!.validationOutcome).toBe('corrected');
  });

  it('throws AppError when invalid output fails after correction attempt and logs invalid_output', async () => {
    // Both attempts return invalid payloads that fail schema validation
    fakeProvider.enqueueResponse('jd_analysis', { responsibilities: 'not_an_array', seniority: 12345 });
    fakeProvider.enqueueResponse('jd_analysis', { responsibilities: 'still_not_an_array', seniority: 12345 });

    await expect(
      service.run({
        task: 'jd_analysis',
        model: 'gemini-2.0-flash',
        system: JD_ANALYSIS_SYSTEM_PROMPT,
        userContent: [{ type: 'text', text: 'Broken job' }],
        schema: JdAnalysisOutputSchema,
        jsonSchema: JD_ANALYSIS_JSON_SCHEMA,
      })
    ).rejects.toThrow(AppError);

    // Verify invalid_output status recorded in ai_requests
    const logs = await db.select().from(aiRequests).where(eq(aiRequests.status, 'invalid_output'));
    expect(logs.length).toBe(1);
    expect(logs[0]!.validationOutcome).toBe('failed');
  });

  it('throws RATE_LIMITED and records status when rate limited upstream', async () => {
    fakeProvider.enqueueError(
      'jd_analysis',
      new AppError('RATE_LIMITED', 'Resource exhausted 429 quota')
    );

    await expect(
      service.run({
        task: 'jd_analysis',
        model: 'gemini-2.0-flash',
        system: JD_ANALYSIS_SYSTEM_PROMPT,
        userContent: [{ type: 'text', text: 'Rate limited test' }],
        schema: JdAnalysisOutputSchema,
        jsonSchema: JD_ANALYSIS_JSON_SCHEMA,
      })
    ).rejects.toThrow('Resource exhausted 429 quota');

    const logs = await db.select().from(aiRequests).where(eq(aiRequests.status, 'rate_limited'));
    expect(logs.length).toBe(1);
  });

  it('calculates aggregated metrics correctly', async () => {
    // Run two successful calls
    await service.run({
      task: 'jd_analysis',
      model: 'gemini-2.0-flash',
      system: JD_ANALYSIS_SYSTEM_PROMPT,
      userContent: [{ type: 'text', text: 'Job A' }],
      schema: JdAnalysisOutputSchema,
      jsonSchema: JD_ANALYSIS_JSON_SCHEMA,
    });

    await service.run({
      task: 'jd_analysis',
      model: 'gemini-2.0-flash',
      system: JD_ANALYSIS_SYSTEM_PROMPT,
      userContent: [{ type: 'text', text: 'Job B' }],
      schema: JdAnalysisOutputSchema,
      jsonSchema: JD_ANALYSIS_JSON_SCHEMA,
    });

    const metrics = await service.getUsageMetrics();
    expect(metrics.totalRequests).toBe(2);
    expect(metrics.taskBreakdown['jd_analysis']).toBeDefined();
    expect(metrics.taskBreakdown['jd_analysis']!.requests).toBe(2);
  });
});
