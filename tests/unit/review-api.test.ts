import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getReviewsRoute, POST as postReviewsRoute } from '@/app/api/reviews/route';
import { GET as getReviewByIdRoute, DELETE as deleteReviewRoute } from '@/app/api/reviews/[id]/route';
import { POST as respondReviewRoute } from '@/app/api/reviews/[id]/respond/route';
import { POST as deferReviewRoute } from '@/app/api/reviews/[id]/defer/route';
import { POST as createFromJobRoute } from '@/app/api/applications/from-job/route';
import { jobs } from '@/db/schema/jobs';
import { companies } from '@/db/schema/companies';
import { humanReviewRequests } from '@/db/schema/workflows';
import { applications, applicationTasks } from '@/db/schema/applications';
import { workflowCheckpoints } from '@/db/schema/workflows';
import { getDb, closeDbPool } from '@/shared/db';
import { eq } from 'drizzle-orm';

describe('Review & Application Workflow API Endpoints (Milestone 9)', () => {
  let testJobId: string;
  let testCompanyId: string;
  let createdRequestId: string;

  beforeAll(async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    const db = getDb();

    // Clean up tables
    await db.delete(humanReviewRequests);
    await db.delete(applicationTasks);
    await db.delete(workflowCheckpoints);
    await db.delete(applications);
    await db.delete(jobs).where(eq(jobs.normalizedTitle, 'api review test engineer'));
    await db.delete(companies).where(eq(companies.normalizedName, 'api-review-corp'));

    const [c] = await db
      .insert(companies)
      .values({
        name: 'API Review Corp',
        normalizedName: 'api-review-corp',
        primaryDomain: 'apireviewcorp.io',
        origin: 'manual',
      })
      .returning({ id: companies.id });
    testCompanyId = c!.id;

    const [j] = await db
      .insert(jobs)
      .values({
        companyId: testCompanyId,
        title: 'API Review Test Engineer',
        normalizedTitle: 'api review test engineer',
        descriptionText: 'Handle HITL review and workflow automation endpoints.',
        descriptionHash: 'hash_api_review_job_1',
        applicationUrl: 'https://boards.greenhouse.io/apireviewcorp/jobs/555',
      })
      .returning({ id: jobs.id });
    testJobId = j!.id;
  });

  afterAll(async () => {
    await closeDbPool();
  });

  it('initializes application workflow via POST /api/applications/from-job', async () => {
    const req = new NextRequest('http://127.0.0.1:3000/api/applications/from-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: testJobId }),
    });

    const res = await createFromJobRoute(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.applicationId).toBeDefined();
    expect(data.workflowId).toBeDefined();
    expect(data.status).toBe('preparing');
  });

  it('creates a new human review request via POST /api/reviews with invariant check', async () => {
    // Notice: Passing suggestedAnswer for a core category (work_auth) must be stripped by service
    const req = new NextRequest('http://127.0.0.1:3000/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: testJobId,
        category: 'work_auth',
        question: 'Do you require visa sponsorship?',
        requiredAction: 'answer',
        suggestedAnswer: false,
        suggestionConfidence: 0.99,
        responseSchema: {
          type: 'boolean',
          required: true,
        },
      }),
    });

    const res = await postReviewsRoute(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.category).toBe('work_auth');
    expect(data.isCoreCategory).toBe(true);
    expect(data.suggestedAnswer).toBeNull(); // Invariant: Zero AI suggestion
    createdRequestId = data.id;
  });

  it('fetches the created review request via GET /api/reviews/[id]', async () => {
    const req = new NextRequest(`http://127.0.0.1:3000/api/reviews/${createdRequestId}`);
    const res = await getReviewByIdRoute(req, { params: Promise.resolve({ id: createdRequestId }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(createdRequestId);
    expect(data.status).toBe('pending');
  });

  it('lists active reviews via GET /api/reviews', async () => {
    const req = new NextRequest('http://127.0.0.1:3000/api/reviews?status=active');
    const res = await getReviewsRoute(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toBeInstanceOf(Array);
    expect(data.items.length).toBeGreaterThanOrEqual(1);
  });

  it('snoozes a review request via POST /api/reviews/[id]/defer', async () => {
    const snoozeDate = new Date(Date.now() + 3600 * 1000).toISOString();
    const req = new NextRequest(`http://127.0.0.1:3000/api/reviews/${createdRequestId}/defer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snoozeUntil: snoozeDate, reason: 'Deferred via test' }),
    });

    const res = await deferReviewRoute(req, { params: Promise.resolve({ id: createdRequestId }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('deferred');
  });

  it('submits user decision via POST /api/reviews/[id]/respond and marks resolved', async () => {
    const req = new NextRequest(`http://127.0.0.1:3000/api/reviews/${createdRequestId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'answer',
        answer: false,
        saveReusable: false,
      }),
    });

    const res = await respondReviewRoute(req, { params: Promise.resolve({ id: createdRequestId }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('answered');
    expect(data.userAnswer).toBe(false);
  });

  it('cancels a review request via DELETE /api/reviews/[id]', async () => {
    // Create another review request to cancel
    const createReq = new NextRequest('http://127.0.0.1:3000/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: testJobId,
        category: 'other',
        question: 'Optional portfolio check',
        requiredAction: 'answer',
      }),
    });
    const createRes = await postReviewsRoute(createReq);
    const toCancel = await createRes.json();

    const deleteReq = new NextRequest(`http://127.0.0.1:3000/api/reviews/${toCancel.id}`, {
      method: 'DELETE',
    });
    const deleteRes = await deleteReviewRoute(deleteReq, { params: Promise.resolve({ id: toCancel.id }) });

    expect(deleteRes.status).toBe(200);
    const data = await deleteRes.json();
    expect(data.status).toBe('cancelled');
  });
});
