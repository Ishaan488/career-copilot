import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '@/shared/db';
import {
  jobs,
  jobSources,
  jobSourceListings,
  jobSnapshots,
  companies,
  companyResearch,
  companyResearchEvidence,
  jobAnalyses,
  jobEvaluations,
  files,
  aiRequests,
  aiCache,
  agentExecutionLogs,
  workerHeartbeats,
  applications,
  resumes,
  applicationEvents,
} from '@/db/schema';
import { runRetentionPruning } from '@/modules/maintenance';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '@/shared/config';

describe('Retention & Pruning Routine (Doc 16 §9, Doc 15 T-RET)', () => {
  const db = getDb();
  let testCompanyId: string;
  let testJobId: string;
  let testListingId: string;

  beforeEach(async () => {
    const timestamp = Date.now();
    const [c] = await db
      .insert(companies)
      .values({
        name: `Retention Test Co ${timestamp}`,
        normalizedName: `retention test co ${timestamp}`,
        primaryDomain: `retention-${timestamp}.org`,
      })
      .returning();
    testCompanyId = c!.id;

    const [src] = await db
      .insert(jobSources)
      .values({
        name: `Retention Feed ${timestamp}`,
        type: 'url_import',
        companyId: testCompanyId,
      })
      .returning();

    const [j] = await db
      .insert(jobs)
      .values({
        companyId: testCompanyId,
        title: `Retention Engineer ${timestamp}`,
        normalizedTitle: 'retention engineer',
        descriptionText: 'Description for retention tests',
        descriptionHash: `hash_${timestamp}`,
      })
      .returning();
    testJobId = j!.id;

    const [l] = await db
      .insert(jobSourceListings)
      .values({
        jobId: testJobId,
        sourceId: src!.id,
        externalId: `ext_${timestamp}`,
        listingUrl: `https://retention-${timestamp}.org/jobs/1`,
        lastHash: `hash_${timestamp}`,
      })
      .returning();
    testListingId = l!.id;
  });

  it('prunes job snapshots older than 180 days but preserves the latest snapshot per listing', async () => {
    const oldDate1 = new Date(Date.now() - 200 * 86400000);
    const oldDate2 = new Date(Date.now() - 190 * 86400000);

    // Insert 2 old snapshots for the listing
    const [s1] = await db
      .insert(jobSnapshots)
      .values({
        listingId: testListingId,
        contentHash: 'hash_old_1',
        raw: { test: 1 },
        fetchedAt: oldDate1,
      })
      .returning();

    const [s2] = await db
      .insert(jobSnapshots)
      .values({
        listingId: testListingId,
        contentHash: 'hash_old_2',
        raw: { test: 2 },
        fetchedAt: oldDate2, // newer than oldDate1, but still > 180 days old
      })
      .returning();

    // Run pruning with default 180 days
    const summary = await runRetentionPruning({ jobSnapshotsDays: 180 });

    expect(summary.jobSnapshotsPruned).toBeGreaterThanOrEqual(1);

    // Oldest snapshot should be pruned
    const [foundS1] = await db.select().from(jobSnapshots).where(eq(jobSnapshots.id, s1!.id));
    expect(foundS1).toBeUndefined();

    // The most recent snapshot (s2) MUST be preserved even though it is > 180 days old
    const [foundS2] = await db.select().from(jobSnapshots).where(eq(jobSnapshots.id, s2!.id));
    expect(foundS2).toBeDefined();
    expect(foundS2?.id).toBe(s2!.id);
  });

  it('archives referenced company evidence and deletes unreferenced expired evidence', async () => {
    const expiredDate = new Date(Date.now() - 200 * 86400000);

    const [res] = await db
      .insert(companyResearch)
      .values({
        companyId: testCompanyId,
        provider: 'official_website',
        legitimacyScore: '80.00',
        summary: 'Summary',
        expiresAt: new Date(Date.now() + 30 * 86400000),
      })
      .returning();

    // 1. Referenced evidence
    const [evReferenced] = await db
      .insert(companyResearchEvidence)
      .values({
        researchId: res!.id,
        companyId: testCompanyId,
        signalType: 'about_us',
        sourceUrl: 'https://example.com/about',
        contentSnippet: 'Sensitive or detailed snippet',
        confidence: '0.90',
        capturedAt: expiredDate,
      })
      .returning();

    // 2. Unreferenced evidence
    const [evUnreferenced] = await db
      .insert(companyResearchEvidence)
      .values({
        researchId: res!.id,
        companyId: testCompanyId,
        signalType: 'about_us',
        sourceUrl: 'https://example.com/other',
        contentSnippet: 'Unreferenced snippet',
        confidence: '0.90',
        capturedAt: expiredDate,
      })
      .returning();

    // Create analysis and evaluation referencing evReferenced.id
    const [analysis] = await db
      .insert(jobAnalyses)
      .values({
        jobId: testJobId,
        descriptionHash: 'hash_analysis',
        model: 'gemini-1.5-pro',
      })
      .returning();

    await db.insert(jobEvaluations).values({
      jobId: testJobId,
      analysisId: analysis!.id,
      eligibility: 'eligible',
      suitabilityTotal: '85',
      recommendation: 'recommended',
      explanation: 'Great match',
      evidenceIds: [evReferenced!.id],
    });

    const summary = await runRetentionPruning({ companyEvidenceDays: 180 });
    expect(summary.evidenceArchived).toBeGreaterThanOrEqual(1);
    expect(summary.evidencePruned).toBeGreaterThanOrEqual(1);

    // Referenced evidence is kept with contentSnippet replaced by [ARCHIVED_RETENTION]
    const [afterRef] = await db
      .select()
      .from(companyResearchEvidence)
      .where(eq(companyResearchEvidence.id, evReferenced!.id));
    expect(afterRef).toBeDefined();
    expect(afterRef?.contentSnippet).toBe('[ARCHIVED_RETENTION]');
    expect((afterRef?.metadata as { archived?: boolean })?.archived).toBe(true);

    // Unreferenced evidence is completely pruned
    const [afterUnref] = await db
      .select()
      .from(companyResearchEvidence)
      .where(eq(companyResearchEvidence.id, evUnreferenced!.id));
    expect(afterUnref).toBeUndefined();
  });

  it('prunes screenshots older than 30 days and sweeps tmp files older than 1 hour', async () => {
    const expiredScreenshotDate = new Date(Date.now() - 35 * 86400000);
    const tmpScreenshotPath = path.join(config.DATA_DIR, `test-sc-${Date.now()}.png`);
    await fs.promises.writeFile(tmpScreenshotPath, 'fake-png-bytes');

    await db.insert(files).values({
      path: tmpScreenshotPath,
      kind: 'screenshot',
      mime: 'image/png',
      sizeBytes: 14,
      sha256: 'fake_sha256_screenshot',
      createdAt: expiredScreenshotDate,
    });

    // Create a tmp directory file
    const tmpDir = path.join(config.DATA_DIR, 'tmp');
    await fs.promises.mkdir(tmpDir, { recursive: true });
    const oldTmpFile = path.join(tmpDir, `old-browser-${Date.now()}.tmp`);
    await fs.promises.writeFile(oldTmpFile, 'browser-state');
    // Set modified time to 2 hours ago
    const twoHoursAgo = (Date.now() - 7200000) / 1000;
    fs.utimesSync(oldTmpFile, twoHoursAgo, twoHoursAgo);

    const summary = await runRetentionPruning({ screenshotsDays: 30 });

    expect(summary.screenshotsPruned).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(tmpScreenshotPath)).toBe(false);
    expect(fs.existsSync(oldTmpFile)).toBe(false);
  });

  it('prunes AI logs/cache, agent execution logs, and worker heartbeats older than 90 days', async () => {
    const oldDate = new Date(Date.now() - 100 * 86400000);

    const [aiLog] = await db
      .insert(aiRequests)
      .values({
        task: 'jd_analysis',
        model: 'gemini-1.5-pro',
        provider: 'gemini',
        inputHash: `ai_old_${Date.now()}`,
        status: 'ok',
        at: oldDate,
      })
      .returning();

    await db.insert(aiCache).values({
      cacheKey: `cache_old_${Date.now()}`,
      output: { result: 'ok' },
      createdAt: oldDate,
    });

    const [execLog] = await db
      .insert(agentExecutionLogs)
      .values({
        correlationId: `corr_${Date.now()}`,
        kind: 'ai',
        message: 'old execution',
        at: oldDate,
      })
      .returning();

    const [heartbeat] = await db
      .insert(workerHeartbeats)
      .values({
        workerId: `worker_old_${Date.now()}`,
        lastSeenAt: oldDate,
      })
      .returning();

    const summary = await runRetentionPruning({ aiLogsDays: 90, execLogsDays: 90 });
    expect(summary.aiLogsPruned).toBeGreaterThanOrEqual(1);
    expect(summary.aiCachePruned).toBeGreaterThanOrEqual(1);
    expect(summary.execLogsPruned).toBeGreaterThanOrEqual(1);
    expect(summary.heartbeatsPruned).toBeGreaterThanOrEqual(1);

    const [aiAfter] = await db.select().from(aiRequests).where(eq(aiRequests.id, aiLog!.id));
    expect(aiAfter).toBeUndefined();

    const [execAfter] = await db.select().from(agentExecutionLogs).where(eq(agentExecutionLogs.id, execLog!.id));
    expect(execAfter).toBeUndefined();

    const [hbAfter] = await db.select().from(workerHeartbeats).where(eq(workerHeartbeats.workerId, heartbeat!.workerId));
    expect(hbAfter).toBeUndefined();
  });

  it('strictly preserves applications, application events, and resumes', async () => {
    const [app] = await db
      .insert(applications)
      .values({
        jobId: testJobId,
        dedupeKey: `retention_app_${Date.now()}`,
        status: 'submitted',
        applicationUrl: 'https://example.com/apply',
      })
      .returning();

    const [ev] = await db
      .insert(applicationEvents)
      .values({
        applicationId: app!.id,
        type: 'submitted',
        actor: 'user',
      })
      .returning();

    const [res] = await db
      .insert(resumes)
      .values({
        label: 'Permanent Resume',
      })
      .returning();

    await runRetentionPruning();

    // Verify all 3 records still exist
    const [appAfter] = await db.select().from(applications).where(eq(applications.id, app!.id));
    expect(appAfter).toBeDefined();

    const [evAfter] = await db.select().from(applicationEvents).where(eq(applicationEvents.id, ev!.id));
    expect(evAfter).toBeDefined();

    const [resAfter] = await db.select().from(resumes).where(eq(resumes.id, res!.id));
    expect(resAfter).toBeDefined();
  });
});
