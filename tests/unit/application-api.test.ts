import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/shared/db';
import { companies, jobs, applications } from '@/db/schema';
import { GET as getApplications } from '@/app/api/applications/route';
import { GET as getApplicationById } from '@/app/api/applications/[id]/route';
import { GET as getHandover } from '@/app/api/applications/[id]/handover/route';
import { POST as confirmSubmitted } from '@/app/api/applications/[id]/confirm-submitted/route';

describe('Application REST API Endpoints', () => {
  const db = getDb();

  it('lists applications via GET /api/applications', async () => {
    const res = await getApplications();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('returns application detail via GET /api/applications/[id]', async () => {
    const compSuffix = Date.now();
    const [comp] = await db
      .insert(companies)
      .values({
        name: 'Api Test Corp ' + compSuffix,
        normalizedName: 'api test corp ' + compSuffix,
        primaryDomain: `api-test-${compSuffix}.com`,
      })
      .returning();

    const [job] = await db
      .insert(jobs)
      .values({
        companyId: comp!.id,
        title: 'Backend Engineer',
        normalizedTitle: 'backend engineer',
        descriptionText: 'Backend engineer role description',
        descriptionHash: 'hash_' + compSuffix,
        canonicalUrl: 'https://example.com/job/1',
      })
      .returning();

    const [app] = await db
      .insert(applications)
      .values({
        jobId: job!.id,
        dedupeKey: 'dedupe_' + compSuffix,
        status: 'ready_to_submit',
        applicationUrl: 'https://example.com/job/1/apply',
        platform: 'generic',
      })
      .returning();

    const req = new NextRequest(`http://127.0.0.1:3000/api/applications/${app!.id}`);
    const res = await getApplicationById(req, { params: Promise.resolve({ id: app!.id }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(app!.id);
    expect(body.jobTitle).toBe('Backend Engineer');
    expect(body.status).toBe('ready_to_submit');
  });

  it('provides manual handover instructions via GET /api/applications/[id]/handover', async () => {
    const compSuffix = Date.now() + 1;
    const [comp] = await db
      .insert(companies)
      .values({
        name: 'Handover Test Corp ' + compSuffix,
        normalizedName: 'handover test corp ' + compSuffix,
        primaryDomain: `handover-${compSuffix}.com`,
      })
      .returning();

    const [job] = await db
      .insert(jobs)
      .values({
        companyId: comp!.id,
        title: 'DevOps Engineer',
        normalizedTitle: 'devops engineer',
        descriptionText: 'Devops engineer description',
        descriptionHash: 'hash_' + compSuffix,
        canonicalUrl: 'https://example.com/job/2',
      })
      .returning();

    const [app] = await db
      .insert(applications)
      .values({
        jobId: job!.id,
        dedupeKey: 'dedupe_' + compSuffix,
        status: 'ready_to_submit',
        applicationUrl: 'https://example.com/job/2/apply',
        platform: 'generic',
      })
      .returning();

    const req = new NextRequest(`http://127.0.0.1:3000/api/applications/${app!.id}/handover`);
    const res = await getHandover(req, { params: Promise.resolve({ id: app!.id }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applicationId).toBe(app!.id);
    expect(body.applicationUrl).toBe('https://example.com/job/2/apply');
    expect(body.instructions).toContain('Please open the application URL in your browser');
  });

  it('confirms manual submission via POST /api/applications/[id]/confirm-submitted', async () => {
    const compSuffix = Date.now() + 2;
    const [comp] = await db
      .insert(companies)
      .values({
        name: 'Confirm Corp ' + compSuffix,
        normalizedName: 'confirm corp ' + compSuffix,
        primaryDomain: `confirm-${compSuffix}.com`,
      })
      .returning();

    const [job] = await db
      .insert(jobs)
      .values({
        companyId: comp!.id,
        title: 'Security Engineer',
        normalizedTitle: 'security engineer',
        descriptionText: 'Security engineer description',
        descriptionHash: 'hash_' + compSuffix,
        canonicalUrl: 'https://example.com/job/3',
      })
      .returning();

    const [app] = await db
      .insert(applications)
      .values({
        jobId: job!.id,
        dedupeKey: 'dedupe_' + compSuffix,
        status: 'ready_to_submit',
        applicationUrl: 'https://example.com/job/3/apply',
        platform: 'generic',
      })
      .returning();

    const req = new NextRequest(`http://127.0.0.1:3000/api/applications/${app!.id}/confirm-submitted`, {
      method: 'POST',
      body: JSON.stringify({ notes: 'Applied via company portal manually' }),
    });

    const res = await confirmSubmitted(req, { params: Promise.resolve({ id: app!.id }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('submitted');
    expect(body.submissionSource).toBe('manual_confirmed');
  });
});
