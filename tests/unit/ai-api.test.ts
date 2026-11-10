import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getAiStatus } from '../../src/app/api/ai/status/route';
import { GET as getAiUsage } from '../../src/app/api/ai/usage/route';
import { POST as triggerAnalyze } from '../../src/app/api/jobs/[id]/analyze/route';
import { GET as getJobAnalysisRoute } from '../../src/app/api/jobs/[id]/analysis/route';
import { aiService } from '../../src/modules/ai/service';
import { FakeAIProvider } from '../support/fake-ai-provider';
import { getDb } from '@/shared/db';
import { jobs, jobAnalyses, jobSkillRequirements, jobStatusHistory } from '../../src/db/schema';

describe('T-API: AI & Intelligence REST API Endpoints', () => {
  const db = getDb();

  beforeEach(async () => {
    aiService.setProvider(new FakeAIProvider());
    await db.delete(jobSkillRequirements);
    await db.delete(jobAnalyses);
    await db.delete(jobStatusHistory);
    await db.delete(jobs);
  });

  it('GET /api/ai/status returns current operational status', async () => {
    const res = await getAiStatus();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe('available');
    expect(json.defaultModel).toBe('gemini-2.0-flash');
    expect(json.dailyRequestsLimit).toBeGreaterThan(0);
  });

  it('GET /api/ai/usage returns telemetry and metrics', async () => {
    const req = new NextRequest('http://127.0.0.1:3000/api/ai/usage');
    const res = await getAiUsage(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.metrics).toBeDefined();
    expect(json.status).toBeDefined();
    expect(json.metrics.date).toBeDefined();
  });

  it('POST /api/jobs/[id]/analyze executes analysis and GET /api/jobs/[id]/analysis retrieves it', async () => {
    // 1. Create a job in DB
    const [job] = await db
      .insert(jobs)
      .values({
        title: 'Full Stack Tech Lead',
        normalizedTitle: 'full stack tech lead',
        descriptionText: 'Lead our web platform team. Experience with TypeScript and PostgreSQL required.',
        descriptionHash: 'hash_api_123',
        status: 'new',
      })
      .returning();

    // 2. Trigger analysis
    const analyzeReq = new NextRequest(`http://127.0.0.1:3000/api/jobs/${job!.id}/analyze`, {
      method: 'POST',
      body: JSON.stringify({ force: false }),
    });
    const analyzeRes = await triggerAnalyze(analyzeReq, {
      params: Promise.resolve({ id: job!.id }),
    });
    expect(analyzeRes.status).toBe(200);

    const analyzeJson = await analyzeRes.json();
    expect(analyzeJson.status).toBe('completed');
    expect(analyzeJson.analysisId).toBeDefined();

    // 3. Retrieve analysis via GET /api/jobs/[id]/analysis
    const getReq = new NextRequest(`http://127.0.0.1:3000/api/jobs/${job!.id}/analysis`);
    const getRes = await getJobAnalysisRoute(getReq, {
      params: Promise.resolve({ id: job!.id }),
    });
    expect(getRes.status).toBe(200);

    const getJson = await getRes.json();
    expect(getJson.id).toBe(analyzeJson.analysisId);
    expect(getJson.skills.length).toBeGreaterThan(0);
  });

  it('GET /api/jobs/[id]/analysis returns 404 when no analysis exists', async () => {
    const getReq = new NextRequest('http://127.0.0.1:3000/api/jobs/00000000-0000-0000-0000-000000000000/analysis');
    const getRes = await getJobAnalysisRoute(getReq, {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(getRes.status).toBe(404);
  });
});
