import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, closeDbPool } from '@/shared/db';
import { companies, jobs, applications, applicationAuthorizations, applicationSubmissions, resumes, resumeVersions } from '@/db/schema';
import { computeSummaryHash } from '@/modules/application/domain/field-mapping';
import { storage } from '@/shared/storage';
import { setSetting } from '@/modules/settings';
import { POST as authorizeSubmission } from '@/app/api/applications/[id]/authorize-submission/route';
import { POST as revokeAuthorization } from '@/app/api/applications/[id]/revoke-authorization/route';
import { POST as submitApplication } from '@/app/api/applications/[id]/submit/route';
import { POST as resolveUnverified } from '@/app/api/applications/[id]/resolve-unverified/route';
import { eq } from 'drizzle-orm';

describe('Submission & Authorization API Endpoints (Milestone 12)', () => {
  const db = getDb();
  let companyId: string;
  let resumeVersionId: string;
  let resumeSha: string;

  beforeAll(async () => {
    process.env.SUBMISSION_ENABLED = 'true';
    await setSetting('submission.enabled', true);

    const [comp] = await db
      .insert(companies)
      .values({
        name: 'Api Sub Corp ' + Date.now(),
        normalizedName: 'api sub corp ' + Date.now(),
        primaryDomain: `apisub-${Date.now()}.test`,
      })
      .returning();
    companyId = comp!.id;

    const dummyPdf = Buffer.from(`%PDF-1.4\nApi Test Resume ${Date.now()}\n%%EOF`);
    const relPath = `resumes/api_test_${Date.now()}.pdf`;
    const stored = await storage.put(relPath, dummyPdf);
    resumeSha = stored.sha256;

    const [rParent] = await db
      .insert(resumes)
      .values({ label: 'Api Resume', isDefault: false })
      .returning();

    const [ver] = await db
      .insert(resumeVersions)
      .values({
        resumeId: rParent!.id,
        versionNo: 1,
        label: 'v1',
        sha256: stored.sha256,
        storedPath: relPath,
        sizeBytes: stored.size,
        originalFilename: 'resume.pdf',
        status: 'active',
      })
      .returning();
    resumeVersionId = ver!.id;
  });

  afterAll(async () => {
    await closeDbPool();
  });

  it('authorizes submission via POST /api/applications/[id]/authorize-submission', async () => {
    const [job] = await db
      .insert(jobs)
      .values({
        companyId,
        title: 'Platform Engineer',
        normalizedTitle: 'platform engineer',
        descriptionText: 'Description',
        descriptionHash: 'hash_auth_api_' + Date.now(),
        canonicalUrl: 'https://example.com/job/auth-api',
      })
      .returning();

    const [app] = await db
      .insert(applications)
      .values({
        jobId: job!.id,
        dedupeKey: 'dedupe_auth_api_' + Date.now(),
        status: 'ready_to_submit',
        applicationUrl: 'https://boards.greenhouse.io/corp/jobs/1',
        verifiedDomain: true,
        resumeVersionId,
      })
      .returning();

    const validHash = computeSummaryHash(app!.applicationUrl, resumeSha, []);
    const req = new NextRequest(`http://127.0.0.1:3000/api/applications/${app!.id}/authorize-submission`, {
      method: 'POST',
      body: JSON.stringify({ summaryHash: validHash, notes: 'User verified via UI modal' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await authorizeSubmission(req, { params: Promise.resolve({ id: app!.id }) });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.applicationId).toBe(app!.id);
    expect(body.summaryHash).toBe(validHash);
    expect(body.revokedAt).toBeNull();

    // Clean up
    await db.delete(applicationAuthorizations).where(eq(applicationAuthorizations.applicationId, app!.id));
    await db.delete(applications).where(eq(applications.id, app!.id));
    await db.delete(jobs).where(eq(jobs.id, job!.id));
  });

  it('revokes authorization via POST /api/applications/[id]/revoke-authorization', async () => {
    const [job] = await db
      .insert(jobs)
      .values({
        companyId,
        title: 'Backend Engineer',
        normalizedTitle: 'backend engineer',
        descriptionText: 'Description',
        descriptionHash: 'hash_revoke_api_' + Date.now(),
        canonicalUrl: 'https://example.com/job/revoke-api',
      })
      .returning();

    const [app] = await db
      .insert(applications)
      .values({
        jobId: job!.id,
        dedupeKey: 'dedupe_revoke_api_' + Date.now(),
        status: 'ready_to_submit',
        applicationUrl: 'https://boards.greenhouse.io/corp/jobs/2',
        verifiedDomain: true,
        resumeVersionId,
      })
      .returning();

    // Insert an active authorization
    await db.insert(applicationAuthorizations).values({
      applicationId: app!.id,
      kind: 'submission',
      scope: { companyId, jobId: job!.id },
      summaryHash: 'b'.repeat(64),
      summarySnapshot: {},
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });

    const req = new NextRequest(`http://127.0.0.1:3000/api/applications/${app!.id}/revoke-authorization`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Changed mind' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await revokeAuthorization(req, { params: Promise.resolve({ id: app!.id }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.revoked).toBe(true);

    const [revokedAuth] = await db
      .select()
      .from(applicationAuthorizations)
      .where(eq(applicationAuthorizations.applicationId, app!.id));
    expect(revokedAuth!.revokedAt).toBeDefined();

    // Clean up
    await db.delete(applicationAuthorizations).where(eq(applicationAuthorizations.applicationId, app!.id));
    await db.delete(applications).where(eq(applications.id, app!.id));
    await db.delete(jobs).where(eq(jobs.id, job!.id));
  });

  it('rejects POST /api/applications/[id]/submit when authorization is missing', async () => {
    const [job] = await db
      .insert(jobs)
      .values({
        companyId,
        title: 'Security Engineer',
        normalizedTitle: 'security engineer',
        descriptionText: 'Description',
        descriptionHash: 'hash_submit_api_' + Date.now(),
        canonicalUrl: 'https://example.com/job/submit-api',
      })
      .returning();

    const [app] = await db
      .insert(applications)
      .values({
        jobId: job!.id,
        dedupeKey: 'dedupe_submit_api_' + Date.now(),
        status: 'ready_to_submit',
        applicationUrl: 'https://boards.greenhouse.io/corp/jobs/3',
        verifiedDomain: true,
        resumeVersionId,
      })
      .returning();

    const req = new NextRequest(`http://127.0.0.1:3000/api/applications/${app!.id}/submit`, {
      method: 'POST',
    });

    const res = await submitApplication(req, { params: Promise.resolve({ id: app!.id }) });
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');

    // Clean up
    await db.delete(applications).where(eq(applications.id, app!.id));
    await db.delete(jobs).where(eq(jobs.id, job!.id));
  });

  it('resolves unverified submission via POST /api/applications/[id]/resolve-unverified', async () => {
    const [job] = await db
      .insert(jobs)
      .values({
        companyId,
        title: 'Data Engineer',
        normalizedTitle: 'data engineer',
        descriptionText: 'Description',
        descriptionHash: 'hash_unverified_api_' + Date.now(),
        canonicalUrl: 'https://example.com/job/unverified-api',
      })
      .returning();

    const [app] = await db
      .insert(applications)
      .values({
        jobId: job!.id,
        dedupeKey: 'dedupe_unverified_api_' + Date.now(),
        status: 'submission_unverified',
        applicationUrl: 'https://boards.greenhouse.io/corp/jobs/4',
        verifiedDomain: true,
        resumeVersionId,
      })
      .returning();

    const [_sub] = await db
      .insert(applicationSubmissions)
      .values({
        applicationId: app!.id,
        status: 'unverified',
        error: 'Confirmation banner timed out',
      })
      .returning();

    // 1. Invalid resolution rejects with 400
    const badReq = new NextRequest(`http://127.0.0.1:3000/api/applications/${app!.id}/resolve-unverified`, {
      method: 'POST',
      body: JSON.stringify({ resolution: 'invalid_action' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const badRes = await resolveUnverified(badReq, { params: Promise.resolve({ id: app!.id }) });
    expect(badRes.status).toBe(400);

    // 2. Valid confirm_submitted resolves to submitted
    const okReq = new NextRequest(`http://127.0.0.1:3000/api/applications/${app!.id}/resolve-unverified`, {
      method: 'POST',
      body: JSON.stringify({ resolution: 'confirm_submitted', notes: 'Received confirmation email' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const okRes = await resolveUnverified(okReq, { params: Promise.resolve({ id: app!.id }) });
    expect(okRes.status).toBe(200);

    const okBody = await okRes.json();
    expect(okBody.status).toBe('submitted');
    expect(okBody.submissionSource).toBe('automated_unverified_resolved');

    // Clean up
    await db.delete(applicationSubmissions).where(eq(applicationSubmissions.applicationId, app!.id));
    await db.delete(applications).where(eq(applications.id, app!.id));
    await db.delete(jobs).where(eq(jobs.id, job!.id));
  });
});
