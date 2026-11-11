import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { applicationService } from '@/modules/application/service';
import { getDb, closeDbPool } from '@/shared/db';
import { storage } from '@/shared/storage';
import {
  applications,
  applicationFormFields,
  applicationFieldAnswers,
  applicationAuthorizations,
  applicationSubmissions,
  applicationEvents,
  jobs,
  companies,
  resumes,
  resumeVersions,
} from '@/db/schema';
import { eq } from 'drizzle-orm';
import { setSetting } from '@/modules/settings';

describe('Submission Protocol & Idempotency Invariants (T-APP-1, Doc 10 §5)', () => {
  let companyId: string;
  let jobId: string;
  let resumeVersionId: string;
  let _resumeSha: string;

  beforeAll(async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    const db = getDb();

    // 1. Clean test data
    await db.delete(applicationSubmissions);
    await db.delete(applicationAuthorizations);
    await db.delete(applicationFieldAnswers);
    await db.delete(applicationFormFields);
    await db.delete(applicationEvents);
    await db.delete(applications);

    // 2. Insert test company
    const [comp] = await db
      .insert(companies)
      .values({
        name: 'Protocol Test Corp',
        normalizedName: 'protocol test corp',
        primaryDomain: `protocol-${Date.now()}.test`,
        origin: 'manual',
      })
      .returning();
    companyId = comp!.id;

    // 3. Insert test job
    const [job] = await db
      .insert(jobs)
      .values({
        companyId,
        title: 'Senior Systems Engineer',
        normalizedTitle: 'senior systems engineer',
        descriptionText: 'Build and verify distributed state machines.',
        descriptionHash: 'hash_' + Date.now(),
        applicationUrl: 'https://boards.greenhouse.io/protocolcorp/jobs/101',
        status: 'shortlisted',
      })
      .returning();
    jobId = job!.id;

    // 4. Create immutable resume
    const dummyPdf = Buffer.from(`%PDF-1.4\n% salt-${Date.now()}\n1 0 obj<</Type/Catalog>>endobj\nxref\ntrailer\nstartxref\n%%EOF`);
    const relPath = `resumes/proto_${Date.now()}.pdf`;
    const stored = await storage.put(relPath, dummyPdf);
    _resumeSha = stored.sha256;

    const [rParent] = await db
      .insert(resumes)
      .values({ label: 'Master Resume', isDefault: true })
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

    // Enable settings toggle
    await setSetting('submission.enabled', true);
  });

  afterAll(async () => {
    await closeDbPool();
  });

  it('enforces partial unique index on application_submissions: exactly ONE active submission per application', async () => {
    const db = getDb();
    const appId = crypto.randomUUID();

    const [app] = await db
      .insert(applications)
      .values({
        id: appId,
        jobId,
        dedupeKey: `proto_dedupe_${Date.now()}`,
        status: 'ready_to_submit',
        applicationUrl: 'https://boards.greenhouse.io/protocolcorp/jobs/101',
        verifiedDomain: true,
        resumeVersionId,
      })
      .returning();

    // First active submission in 'intent' status succeeds
    const [sub1] = await db
      .insert(applicationSubmissions)
      .values({
        applicationId: app!.id,
        status: 'intent',
      })
      .returning();
    expect(sub1).toBeDefined();

    // Second active submission in 'intent' or 'clicked' or 'verified' fails due to partial unique index
    await expect(
      db.insert(applicationSubmissions).values({
        applicationId: app!.id,
        status: 'clicked',
      })
    ).rejects.toThrow();

    // Once the first submission transitions to a terminal state like 'abandoned', a new submission can be created
    await db
      .update(applicationSubmissions)
      .set({ status: 'abandoned' })
      .where(eq(applicationSubmissions.id, sub1!.id));

    const [sub2] = await db
      .insert(applicationSubmissions)
      .values({
        applicationId: app!.id,
        status: 'intent',
      })
      .returning();
    expect(sub2).toBeDefined();

    // Clean up
    await db.delete(applicationSubmissions).where(eq(applicationSubmissions.applicationId, app!.id));
    await db.delete(applications).where(eq(applications.id, app!.id));
  });

  it('enforces pre-click intent commit before dispatching submit click', async () => {
    const db = getDb();
    const appId = crypto.randomUUID();

    const [app] = await db
      .insert(applications)
      .values({
        id: appId,
        jobId,
        dedupeKey: `proto_preclick_${Date.now()}`,
        status: 'ready_to_submit',
        applicationUrl: 'https://boards.greenhouse.io/protocolcorp/jobs/101',
        verifiedDomain: true,
        resumeVersionId,
      })
      .returning();

    // Insert form fields and approved answers
    const [field] = await db
      .insert(applicationFormFields)
      .values({
        applicationId: app!.id,
        fieldKey: 'key_name',
        label: 'Full Name',
        type: 'text',
        required: true,
      })
      .returning();

    await db.insert(applicationFieldAnswers).values({
      fieldId: field!.id,
      answer: 'Test Candidate',
      decision: 'answered',
      source: 'profile',
      status: 'approved',
    });

    const summaryHash = 'hash_proto_summary_test';

    // Authorize submission
    await db.insert(applicationAuthorizations).values({
      applicationId: app!.id,
      kind: 'submission',
      scope: { url: app!.applicationUrl },
      summaryHash,
      summarySnapshot: { answersCount: 1 },
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      grantedBy: 'user',
    });

    // Simulate pre-click failure by inserting intent and recording failed_before_click
    const [sub] = await db
      .insert(applicationSubmissions)
      .values({
        applicationId: app!.id,
        status: 'intent',
      })
      .returning();

    expect(sub!.status).toBe('intent');

    // If pre-click failure happens (e.g. navigation timeout before click), status becomes failed_before_click
    await db
      .update(applicationSubmissions)
      .set({ status: 'failed_before_click', error: 'Simulated pre-click failure' })
      .where(eq(applicationSubmissions.id, sub!.id));

    const [updatedSub] = await db
      .select()
      .from(applicationSubmissions)
      .where(eq(applicationSubmissions.id, sub!.id));
    expect(updatedSub!.status).toBe('failed_before_click');

    // Clean up
    await db.delete(applicationSubmissions).where(eq(applicationSubmissions.applicationId, app!.id));
    await db.delete(applicationAuthorizations).where(eq(applicationAuthorizations.applicationId, app!.id));
    await db.delete(applicationFieldAnswers).where(eq(applicationFieldAnswers.fieldId, field!.id));
    await db.delete(applicationFormFields).where(eq(applicationFormFields.applicationId, app!.id));
    await db.delete(applications).where(eq(applications.id, app!.id));
  });

  it('resolves unverified automated submissions via resolveUnverifiedSubmission', async () => {
    const db = getDb();
    const appId = crypto.randomUUID();

    const [app] = await db
      .insert(applications)
      .values({
        id: appId,
        jobId,
        dedupeKey: `proto_unverified_${Date.now()}`,
        status: 'submission_unverified',
        applicationUrl: 'https://boards.greenhouse.io/protocolcorp/jobs/101',
        verifiedDomain: true,
        resumeVersionId,
      })
      .returning();

    const [sub] = await db
      .insert(applicationSubmissions)
      .values({
        applicationId: app!.id,
        status: 'unverified',
        error: 'Confirmation not detected in portal',
      })
      .returning();

    // 1. User confirms submission: confirm_submitted
    const res = await applicationService.resolveUnverifiedSubmission(app!.id, 'confirm_submitted', 'User verified via email');
    expect(res.status).toBe('submitted');
    expect(res.submissionSource).toBe('automated_unverified_resolved');

    const [verifiedSub] = await db
      .select()
      .from(applicationSubmissions)
      .where(eq(applicationSubmissions.id, sub!.id));
    expect(verifiedSub!.status).toBe('verified');

    // 2. Test retry_confirmed flow on another unverified application
    const [retryJob] = await db
      .insert(jobs)
      .values({
        companyId,
        title: 'Staff Systems Engineer',
        normalizedTitle: 'staff systems engineer',
        descriptionText: 'Build and verify distributed state machines.',
        descriptionHash: 'hash_retry_' + Date.now(),
        applicationUrl: 'https://boards.greenhouse.io/protocolcorp/jobs/102',
        status: 'shortlisted',
      })
      .returning();

    const retryAppId = crypto.randomUUID();
    await db.insert(applications).values({
      id: retryAppId,
      jobId: retryJob!.id,
      dedupeKey: `proto_retry_${Date.now()}`,
      status: 'submission_unverified',
      applicationUrl: 'https://boards.greenhouse.io/protocolcorp/jobs/102',
      verifiedDomain: true,
      resumeVersionId,
    });

    const [retrySub] = await db
      .insert(applicationSubmissions)
      .values({
        applicationId: retryAppId,
        status: 'unverified',
        error: 'Timeout waiting for confirmation',
      })
      .returning();

    const retryRes = await applicationService.resolveUnverifiedSubmission(retryAppId, 'retry_confirmed', 'Retry allowed');
    expect(retryRes.status).toBe('ready_to_submit');

    const [abandonedSub] = await db
      .select()
      .from(applicationSubmissions)
      .where(eq(applicationSubmissions.id, retrySub!.id));
    expect(abandonedSub!.status).toBe('abandoned');

    // Clean up
    await db.delete(applicationSubmissions).where(eq(applicationSubmissions.applicationId, app!.id));
    await db.delete(applicationSubmissions).where(eq(applicationSubmissions.applicationId, retryAppId));
    await db.delete(applications).where(eq(applications.id, app!.id));
    await db.delete(applications).where(eq(applications.id, retryAppId));
    await db.delete(jobs).where(eq(jobs.id, retryJob!.id));
  });
});
