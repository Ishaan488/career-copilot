import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { applicationService } from '@/modules/application/service';
import { humanReviewService } from '@/modules/human-review/service';
import { jobs } from '@/db/schema/jobs';
import { companies } from '@/db/schema/companies';
import { applications, applicationTasks } from '@/db/schema/applications';
import { workflowCheckpoints, humanReviewRequests } from '@/db/schema/workflows';
import { resumes, resumeVersions } from '@/db/schema/resumes';
import { getDb, closeDbPool } from '@/shared/db';
import { eq } from 'drizzle-orm';

describe('Checkpointed Workflow Engine (Milestone 9)', () => {
  let testCompanyId: string;
  let testJobId: string;
  let testJobUnverifiedId: string;
  let _testResumeId: string;

  beforeAll(async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    const db = getDb();

    // Clean up dependent tables
    await db.delete(humanReviewRequests);
    await db.delete(applicationTasks);
    await db.delete(workflowCheckpoints);
    await db.delete(applications);
    await db.delete(jobs).where(eq(jobs.normalizedTitle, 'staff workflow engineer'));
    await db.delete(jobs).where(eq(jobs.normalizedTitle, 'unverified external engineer'));
    await db.delete(companies).where(eq(companies.normalizedName, 'workflow-corp'));

    // Insert test company
    const [comp] = await db
      .insert(companies)
      .values({
        name: 'Workflow Corp',
        normalizedName: 'workflow-corp',
        primaryDomain: 'workflowcorp.com',
        origin: 'manual',
      })
      .returning({ id: companies.id });
    testCompanyId = comp!.id;

    // Insert parent resume group and active resume version
    const [rGroup] = await db
      .insert(resumes)
      .values({
        label: 'Engineering Master',
        isDefault: true,
        status: 'active',
      })
      .returning({ id: resumes.id });

    const [res] = await db
      .insert(resumeVersions)
      .values({
        resumeId: rGroup!.id,
        versionNo: 1,
        originalFilename: 'master.pdf',
        storedPath: 'data/resumes/master.pdf',
        sha256: 'hash_test_resume_master_' + Date.now(),
        sizeBytes: 1024,
        label: 'v1.0',
        status: 'active',
      })
      .returning({ id: resumeVersions.id });
    _testResumeId = res!.id;

    // Insert normal job matching company domain
    const [j1] = await db
      .insert(jobs)
      .values({
        companyId: testCompanyId,
        title: 'Staff Workflow Engineer',
        normalizedTitle: 'staff workflow engineer',
        descriptionText: 'Build and maintain fault-tolerant workflow checkpointing engines.',
        descriptionHash: 'hash_wf_job_1',
        applicationUrl: 'https://boards.greenhouse.io/workflowcorp/jobs/12345',
      })
      .returning({ id: jobs.id });
    testJobId = j1!.id;

    // Insert job pointing to an unrecognized third-party domain
    const [j2] = await db
      .insert(jobs)
      .values({
        companyId: testCompanyId,
        title: 'Unverified External Engineer',
        normalizedTitle: 'unverified external engineer',
        descriptionText: 'Third party external posting with unverified domain.',
        descriptionHash: 'hash_wf_job_2',
        applicationUrl: 'https://shady-aggregator.xyz/apply?job=999',
      })
      .returning({ id: jobs.id });
    testJobUnverifiedId = j2!.id;
  });

  afterAll(async () => {
    await closeDbPool();
  });

  it('creates an application and workflow checkpoint with deduplication enforcement', async () => {
    const res1 = await applicationService.createFromJob(testJobId);
    expect(res1.applicationId).toBeDefined();
    expect(res1.workflowId).toBeDefined();
    expect(res1.status).toBe('preparing');

    // Calling again returns the existing application (idempotent / deduplicated)
    const res2 = await applicationService.createFromJob(testJobId);
    expect(res2.applicationId).toBe(res1.applicationId);
    expect(res2.workflowId).toBe(res1.workflowId);

    // Verify checkpoint record
    const db = getDb();
    const [ckpt] = await db
      .select()
      .from(workflowCheckpoints)
      .where(eq(workflowCheckpoints.workflowId, res1.workflowId));

    expect(ckpt).toBeDefined();
    expect(ckpt!.step).toBe('resolve_url');
    expect(ckpt!.status).toBe('running');
    expect(ckpt!.version).toBe(1);
  });

  it('steps through the complete workflow pipeline when domain and resume are verified', async () => {
    const { workflowId } = await applicationService.createFromJob(testJobId);
    const db = getDb();

    // Step 1: resolve_url -> verify_domain
    await applicationService.executeStep(workflowId);
    let [ckpt] = await db
      .select()
      .from(workflowCheckpoints)
      .where(eq(workflowCheckpoints.workflowId, workflowId));
    expect(ckpt!.step).toBe('verify_domain');
    expect(ckpt!.version).toBe(2);

    // Step 2: verify_domain -> select_resume
    await applicationService.executeStep(workflowId);
    [ckpt] = await db
      .select()
      .from(workflowCheckpoints)
      .where(eq(workflowCheckpoints.workflowId, workflowId));
    expect(ckpt!.step).toBe('select_resume');
    expect(ckpt!.version).toBe(3);

    // Step 3: select_resume -> detect_platform
    await applicationService.executeStep(workflowId);
    [ckpt] = await db
      .select()
      .from(workflowCheckpoints)
      .where(eq(workflowCheckpoints.workflowId, workflowId));
    expect(ckpt!.step).toBe('detect_platform');
    expect(ckpt!.version).toBe(4);

    // Step 4: detect_platform -> final_summary
    await applicationService.executeStep(workflowId);
    [ckpt] = await db
      .select()
      .from(workflowCheckpoints)
      .where(eq(workflowCheckpoints.workflowId, workflowId));
    expect(ckpt!.step).toBe('final_summary');
    expect(ckpt!.version).toBe(5);

    // Step 5: final_summary -> done
    await applicationService.executeStep(workflowId);
    [ckpt] = await db
      .select()
      .from(workflowCheckpoints)
      .where(eq(workflowCheckpoints.workflowId, workflowId));
    expect(ckpt!.status).toBe('completed');

    // Verify application state is ready_to_submit
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.workflowId, workflowId));
    expect(app!.status).toBe('ready_to_submit');
    expect(app!.platform).toBe('greenhouse');
  });

  it('pauses workflow and generates review request when application domain is unverified', async () => {
    const { workflowId, applicationId } = await applicationService.createFromJob(testJobUnverifiedId);
    const db = getDb();

    // Step 1: resolve_url -> verify_domain
    await applicationService.executeStep(workflowId);
    let [ckpt] = await db
      .select()
      .from(workflowCheckpoints)
      .where(eq(workflowCheckpoints.workflowId, workflowId));
    expect(ckpt!.step).toBe('verify_domain');

    // Step 2: verify_domain on unrecognized domain pauses and requests review
    await applicationService.executeStep(workflowId);
    [ckpt] = await db
      .select()
      .from(workflowCheckpoints)
      .where(eq(workflowCheckpoints.workflowId, workflowId));
    expect(ckpt!.status).toBe('waiting_review');

    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId));
    expect(app!.status).toBe('awaiting_review');

    // Verify review request created
    const [reviewReq] = await db
      .select()
      .from(humanReviewRequests)
      .where(eq(humanReviewRequests.workflowId, workflowId));
    expect(reviewReq).toBeDefined();
    expect(reviewReq!.category).toBe('company_legitimacy');
    expect(reviewReq!.status).toBe('pending');

    // Answering the review request enqueues resume and allows workflow to continue
    await humanReviewService.respond(reviewReq!.id, 'approve', {
      answer: true,
      notes: 'User verified domain manually',
    });

    const resumed = await applicationService.resumeWorkflow(workflowId, reviewReq!.id);
    expect(resumed).toBe(true);

    [ckpt] = await db
      .select()
      .from(workflowCheckpoints)
      .where(eq(workflowCheckpoints.workflowId, workflowId));
    expect(ckpt!.status).toBe('running');
  });

  it('recovers stale workflows that stalled mid-execution', async () => {
    const db = getDb();

    // Artificially create a stale running checkpoint updated 5 minutes ago
    const staleWfId = crypto.randomUUID();
    const staleTime = new Date(Date.now() - 5 * 60 * 1000);

    const [staleJob] = await db
      .insert(jobs)
      .values({
        companyId: testCompanyId,
        title: 'Stale Recovery Engineer',
        normalizedTitle: 'stale recovery engineer',
        descriptionText: 'Test recovery of stalled workflows.',
        descriptionHash: 'hash_stale_' + Date.now(),
        applicationUrl: 'https://boards.greenhouse.io/workflowcorp/jobs/999',
      })
      .returning({ id: jobs.id });

    const [app] = await db
      .insert(applications)
      .values({
        jobId: staleJob!.id,
        dedupeKey: 'stale_dedupe_' + Date.now(),
        status: 'preparing',
        workflowId: staleWfId,
        applicationUrl: 'https://boards.greenhouse.io/workflowcorp/jobs/999',
      })
      .returning();

    await db.insert(workflowCheckpoints).values({
      workflowId: staleWfId,
      type: 'application',
      subjectId: app!.id,
      step: 'resolve_url',
      status: 'running',
      version: 1,
      state: { applicationId: app!.id },
      updatedAt: staleTime,
    });

    const recoveredCount = await applicationService.recoverStaleWorkflows();
    expect(recoveredCount).toBeGreaterThanOrEqual(1);
  });
});
