import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/shared/db';
import {
  companies,
  jobs,
  applications,
  jobSourceListings,
  jobSources,
  jobSnapshots,
  jobAnalyses,
  jobEvaluations,
  companyResearch,
  companyResearchEvidence,
  applicationEvents,
  applicationFormFields,
  applicationFieldAnswers,
} from '@/db/schema';
import { GET as getTrace } from '@/app/api/trace/[type]/[id]/route';

describe('Traceability API (Doc 15 T-TRC, GET /api/trace/:type/:id)', () => {
  const db = getDb();
  let testCompanyId: string;
  let testJobId: string;
  let testAppId: string;

  beforeEach(async () => {
    const timestamp = Date.now();

    // 1. Company
    const [comp] = await db
      .insert(companies)
      .values({
        name: `Trace Co ${timestamp}`,
        normalizedName: `trace co ${timestamp}`,
        primaryDomain: `trace-${timestamp}.com`,
      })
      .returning();
    testCompanyId = comp!.id;

    // 2. Source & Listing
    const [src] = await db
      .insert(jobSources)
      .values({
        name: `Trace Feed ${timestamp}`,
        type: 'url_import',
        companyId: testCompanyId,
      })
      .returning();

    const [j] = await db
      .insert(jobs)
      .values({
        companyId: testCompanyId,
        title: `Trace Engineer ${timestamp}`,
        normalizedTitle: 'trace engineer',
        descriptionText: 'Description for trace testing',
        descriptionHash: `trace_hash_${timestamp}`,
      })
      .returning();
    testJobId = j!.id;

    const [listing] = await db
      .insert(jobSourceListings)
      .values({
        jobId: testJobId,
        sourceId: src!.id,
        externalId: `trace_ext_${timestamp}`,
        listingUrl: `https://trace-${timestamp}.com/jobs/1`,
        lastHash: `trace_hash_${timestamp}`,
      })
      .returning();

    // 3. Snapshot
    await db.insert(jobSnapshots).values({
      listingId: listing!.id,
      contentHash: `snap_hash_${timestamp}`,
      raw: { test: true },
    });

    // 4. Research & Evidence
    const [res] = await db
      .insert(companyResearch)
      .values({
        companyId: testCompanyId,
        provider: 'official_website',
        legitimacyScore: '90.00',
        summary: 'Verified legitimate company',
        expiresAt: new Date(Date.now() + 30 * 86400000),
      })
      .returning();

    const [ev] = await db
      .insert(companyResearchEvidence)
      .values({
        researchId: res!.id,
        companyId: testCompanyId,
        signalType: 'about_us',
        sourceUrl: `https://trace-${timestamp}.com/about`,
        contentSnippet: 'Snippet of company values',
        confidence: '0.90',
      })
      .returning();

    // 5. Analysis & Evaluation
    const [analysis] = await db
      .insert(jobAnalyses)
      .values({
        jobId: testJobId,
        descriptionHash: `trace_hash_${timestamp}`,
        model: 'gemini-1.5-pro',
      })
      .returning();

    await db.insert(jobEvaluations).values({
      jobId: testJobId,
      analysisId: analysis!.id,
      eligibility: 'eligible',
      suitabilityTotal: '92',
      recommendation: 'strongly_recommended',
      explanation: 'Matches all requirements',
      evidenceIds: [ev!.id],
    });

    // 6. Application
    const [app] = await db
      .insert(applications)
      .values({
        jobId: testJobId,
        dedupeKey: `trace_app_${timestamp}`,
        status: 'awaiting_review',
        applicationUrl: `https://trace-${timestamp}.com/jobs/1/apply`,
      })
      .returning();
    testAppId = app!.id;

    // 7. Event & Form field
    await db.insert(applicationEvents).values({
      applicationId: testAppId,
      type: 'review_requested',
      actor: 'system',
      details: { step: 'salary_expectations' },
    });

    const [ff] = await db
      .insert(applicationFormFields)
      .values({
        applicationId: testAppId,
        fieldKey: `salary_key_${timestamp}`,
        label: 'Desired Salary',
        type: 'text',
        required: true,
      })
      .returning();

    await db.insert(applicationFieldAnswers).values({
      fieldId: ff!.id,
      answer: '$150,000',
      decision: 'answered',
      source: 'profile',
      status: 'approved',
    });
  });

  it('retrieves complete provenance graph for a job via GET /api/trace/job/:id', async () => {
    const req = new NextRequest(`http://127.0.0.1:3000/api/trace/job/${testJobId}`);
    const res = await getTrace(req, { params: Promise.resolve({ type: 'job', id: testJobId }) });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.type).toBe('job');
    expect(data.id).toBe(testJobId);
    expect(data.root.title).toContain('Trace Engineer');
    expect(data.provenance.sources.length).toBeGreaterThanOrEqual(1);
    expect(data.provenance.snapshots.length).toBeGreaterThanOrEqual(1);
    expect(data.provenance.evaluations.length).toBeGreaterThanOrEqual(1);
    expect(data.provenance.evaluations[0].recommendation).toBe('strongly_recommended');
    expect(data.provenance.research.length).toBeGreaterThanOrEqual(1);
    expect(data.provenance.evidence.length).toBeGreaterThanOrEqual(1);
    expect(data.provenance.applications.length).toBeGreaterThanOrEqual(1);
  });

  it('retrieves complete provenance graph for an application via GET /api/trace/application/:id', async () => {
    const req = new NextRequest(`http://127.0.0.1:3000/api/trace/application/${testAppId}`);
    const res = await getTrace(req, { params: Promise.resolve({ type: 'application', id: testAppId }) });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.type).toBe('application');
    expect(data.id).toBe(testAppId);
    expect(data.root.job).toBeDefined();
    expect(data.root.job.title).toContain('Trace Engineer');
    expect(data.provenance.events.length).toBeGreaterThanOrEqual(1);
    expect(data.provenance.formFields.length).toBeGreaterThanOrEqual(1);
    expect(data.provenance.formFields[0].answer).toBeDefined();
    expect(data.provenance.formFields[0].answer.answer).toBe('$150,000');
  });

  it('retrieves provenance graph for a company via GET /api/trace/company/:id', async () => {
    const req = new NextRequest(`http://127.0.0.1:3000/api/trace/company/${testCompanyId}`);
    const res = await getTrace(req, { params: Promise.resolve({ type: 'company', id: testCompanyId }) });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.type).toBe('company');
    expect(data.id).toBe(testCompanyId);
    expect(data.root.name).toContain('Trace Co');
    expect(data.provenance.sources.length).toBeGreaterThanOrEqual(1);
    expect(data.provenance.research.length).toBeGreaterThanOrEqual(1);
    expect(data.provenance.applications.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 400 for unsupported trace entity types', async () => {
    const req = new NextRequest(`http://127.0.0.1:3000/api/trace/unknown/${testJobId}`);
    const res = await getTrace(req, { params: Promise.resolve({ type: 'unknown', id: testJobId }) });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('VALIDATION');
  });

  it('returns 404 for non-existent IDs', async () => {
    const nonExistent = '00000000-0000-0000-0000-000000000000';
    const req = new NextRequest(`http://127.0.0.1:3000/api/trace/job/${nonExistent}`);
    const res = await getTrace(req, { params: Promise.resolve({ type: 'job', id: nonExistent }) });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.code).toBe('NOT_FOUND');
  });
});
