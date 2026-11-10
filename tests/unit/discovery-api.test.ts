import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/shared/db';
import {
  jobStatusHistory,
  jobSourceListings,
  jobs,
  jobSources,
  companyCareerPages,
  companyMonitors,
  companies,
} from '@/db/schema';
import { GET as getJobs, POST as postJob } from '@/app/api/jobs/route';
import { GET as getJobDetail } from '@/app/api/jobs/[id]/route';
import { POST as transitionJob } from '@/app/api/jobs/[id]/transition/route';
import { GET as getSources, POST as postSource } from '@/app/api/sources/route';
import { POST as reconcileRoute } from '@/app/api/sources/reconcile/route';

describe('Discovery API Routes', () => {
  const db = getDb();

  beforeEach(async () => {
    await db.delete(jobStatusHistory);
    await db.delete(jobSourceListings);
    await db.delete(jobs);
    await db.delete(jobSources);
    await db.delete(companyCareerPages);
    await db.delete(companyMonitors);
    await db.delete(companies);
  });

  it('creates and lists jobs via /api/jobs', async () => {
    // 1. Create a job via POST /api/jobs
    const createReq = new NextRequest('http://localhost:3000/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Principal Distributed Systems Engineer',
        descriptionText: 'Architect globally resilient cloud platforms.',
        locationRaw: 'Bengaluru, India',
        workMode: 'remote',
      }),
    });

    const createRes = await postJob(createReq);
    expect(createRes.status).toBe(201);
    const createData = await createRes.json();
    expect(createData.job.id).toBeDefined();

    // 2. Query jobs via GET /api/jobs
    const listReq = new NextRequest('http://localhost:3000/api/jobs?workMode=remote');
    const listRes = await getJobs(listReq);
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.total).toBe(1);
    expect(listData.jobs[0].title).toBe('Principal Distributed Systems Engineer');

    // 3. Get job details via GET /api/jobs/[id]
    const detailReq = new NextRequest(`http://localhost:3000/api/jobs/${createData.job.id}`);
    const detailRes = await getJobDetail(detailReq, {
      params: Promise.resolve({ id: createData.job.id }),
    });
    expect(detailRes.status).toBe(200);
    const detailData = await detailRes.json();
    expect(detailData.id).toBe(createData.job.id);
    expect(detailData.listings).toHaveLength(1);

    // 4. Transition job status via POST /api/jobs/[id]/transition (new -> saved -> shortlisted)
    await transitionJob(
      new NextRequest(`http://localhost:3000/api/jobs/${createData.job.id}/transition`, {
        method: 'POST',
        body: JSON.stringify({
          toStatus: 'saved',
          reason: 'Saved for later review',
        }),
      }),
      { params: Promise.resolve({ id: createData.job.id }) }
    );

    const transReq = new NextRequest(`http://localhost:3000/api/jobs/${createData.job.id}/transition`, {
      method: 'POST',
      body: JSON.stringify({
        toStatus: 'shortlisted',
        reason: 'Excellent match for distributed systems experience',
      }),
    });
    const transRes = await transitionJob(transReq, {
      params: Promise.resolve({ id: createData.job.id }),
    });
    expect(transRes.status).toBe(200);
    const transData = await transRes.json();
    expect(transData.status).toBe('shortlisted');
  });

  it('creates and lists sources via /api/sources', async () => {
    const createSourceReq = new NextRequest('http://localhost:3000/api/sources', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Custom RSS Feed',
        type: 'rss_feed',
        config: { feedUrl: 'https://example.com/rss' },
      }),
    });

    const createRes = await postSource(createSourceReq);
    expect(createRes.status).toBe(201);

    const listRes = await getSources(new NextRequest('http://localhost:3000/api/sources'));
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.sources).toHaveLength(1);
    expect(listData.sources[0].name).toBe('Custom RSS Feed');
  });

  it('runs reconciliation via /api/sources/reconcile', async () => {
    const res = await reconcileRoute();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.reconciledCount).toBe('number');
  });
});
