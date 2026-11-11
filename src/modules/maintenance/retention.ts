import path from 'node:path';
import fs from 'node:fs';
import { getDb } from '@/shared/db';
import { config } from '@/shared/config';
import { logger } from '@/shared/logger';
import { recordAudit } from '@/modules/audit';
import { getSetting, defaultSettings, RetentionSettings } from '@/modules/settings';
import {
  jobSnapshots,
  companyResearchEvidence,
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
import { eq, lt, desc, notInArray, sql, count } from 'drizzle-orm';

export interface RetentionSummary {
  jobSnapshotsPruned: number;
  evidenceArchived: number;
  evidencePruned: number;
  screenshotsPruned: number;
  aiLogsPruned: number;
  aiCachePruned: number;
  execLogsPruned: number;
  heartbeatsPruned: number;
  tempFilesCleaned: number;
  executedAt: string;
}

/**
 * Executes retention pruning across snapshots, evidence, logs, and artifacts (Doc 16 §9, Doc 15 T-RET).
 * Strictly preserves applications, application events, and resume PDFs.
 */
export async function runRetentionPruning(
  overrides?: Partial<RetentionSettings>
): Promise<RetentionSummary> {
  const db = getDb();
  const startTime = new Date();

  // 1. Resolve settings
  const storedSettings = await getSetting<RetentionSettings>('retention.settings');
  const settings: RetentionSettings = {
    ...defaultSettings['retention.settings'],
    ...(storedSettings || {}),
    ...(overrides || {}),
  };

  logger.info({ settings }, '[Retention] Starting data retention and pruning routine');

  // Verify baseline invariant counts before execution
  const [initialApps] = await db.select({ total: count() }).from(applications);
  const [initialEvents] = await db.select({ total: count() }).from(applicationEvents);
  const [initialResumes] = await db.select({ total: count() }).from(resumes);

  const summary: RetentionSummary = {
    jobSnapshotsPruned: 0,
    evidenceArchived: 0,
    evidencePruned: 0,
    screenshotsPruned: 0,
    aiLogsPruned: 0,
    aiCachePruned: 0,
    execLogsPruned: 0,
    heartbeatsPruned: 0,
    tempFilesCleaned: 0,
    executedAt: startTime.toISOString(),
  };

  // -------------------------------------------------------------------------
  // 1. Job Snapshots (180 days default; ALWAYS keep latest snapshot per listing)
  // -------------------------------------------------------------------------
  const snapshotsCutoff = new Date(Date.now() - settings.jobSnapshotsDays * 86400000);
  try {
    // Identify protected IDs: the latest snapshot per listing
    const latestSnapshots = await db
      .select({ id: sql<string>`DISTINCT ON (listing_id) id` })
      .from(jobSnapshots)
      .orderBy(jobSnapshots.listingId, desc(jobSnapshots.fetchedAt));

    const protectedIds = latestSnapshots.map((s) => s.id).filter(Boolean);

    let deletedSnapshots: Array<{ id: string }> = [];
    if (protectedIds.length > 0) {
      deletedSnapshots = await db
        .delete(jobSnapshots)
        .where(
          sql`${jobSnapshots.fetchedAt} < ${snapshotsCutoff} AND ${notInArray(jobSnapshots.id, protectedIds)}`
        )
        .returning({ id: jobSnapshots.id });
    } else {
      deletedSnapshots = await db
        .delete(jobSnapshots)
        .where(lt(jobSnapshots.fetchedAt, snapshotsCutoff))
        .returning({ id: jobSnapshots.id });
    }
    summary.jobSnapshotsPruned = deletedSnapshots.length;
  } catch (err) {
    logger.error({ err }, '[Retention] Error pruning job snapshots');
  }

  // -------------------------------------------------------------------------
  // 2. Company Research Evidence (180 days default)
  // Archive referenced evidence; delete unreferenced evidence.
  // -------------------------------------------------------------------------
  const evidenceCutoff = new Date(Date.now() - settings.companyEvidenceDays * 86400000);
  try {
    // Find candidate expired evidence
    const expiredEvidence = await db
      .select({
        id: companyResearchEvidence.id,
        contentSnippet: companyResearchEvidence.contentSnippet,
        metadata: companyResearchEvidence.metadata,
      })
      .from(companyResearchEvidence)
      .where(lt(companyResearchEvidence.capturedAt, evidenceCutoff));

    if (expiredEvidence.length > 0) {
      // Collect all referenced evidence IDs from jobEvaluations
      const allEvals = await db
        .select({ evidenceIds: jobEvaluations.evidenceIds })
        .from(jobEvaluations);

      const referencedIds = new Set<string>();
      for (const ev of allEvals) {
        if (Array.isArray(ev.evidenceIds)) {
          for (const eid of ev.evidenceIds) {
            if (typeof eid === 'string') referencedIds.add(eid);
          }
        }
      }

      for (const ev of expiredEvidence) {
        if (referencedIds.has(ev.id)) {
          // Archive: drop body/contentSnippet, record archived metadata
          if (ev.contentSnippet !== '[ARCHIVED_RETENTION]') {
            await db
              .update(companyResearchEvidence)
              .set({
                contentSnippet: '[ARCHIVED_RETENTION]',
                metadata: {
                  ...(typeof ev.metadata === 'object' && ev.metadata !== null ? ev.metadata : {}),
                  archived: true,
                  archivedAt: startTime.toISOString(),
                },
              })
              .where(eq(companyResearchEvidence.id, ev.id));
            summary.evidenceArchived++;
          }
        } else {
          // Unreferenced: delete row
          await db
            .delete(companyResearchEvidence)
            .where(eq(companyResearchEvidence.id, ev.id));
          summary.evidencePruned++;
        }
      }
    }
  } catch (err) {
    logger.error({ err }, '[Retention] Error processing company research evidence');
  }

  // -------------------------------------------------------------------------
  // 3. Failed-Automation Screenshots (30 days default)
  // -------------------------------------------------------------------------
  const screenshotCutoff = new Date(Date.now() - settings.screenshotsDays * 86400000);
  try {
    const expiredScreenshots = await db
      .select()
      .from(files)
      .where(
        sql`${files.kind} = 'screenshot' AND ${files.createdAt} < ${screenshotCutoff}`
      );

    for (const sc of expiredScreenshots) {
      try {
        if (fs.existsSync(sc.path)) {
          await fs.promises.unlink(sc.path);
        }
      } catch {
        // file unlink error ignored
      }
      await db.delete(files).where(eq(files.path, sc.path));
      summary.screenshotsPruned++;
    }
  } catch (err) {
    logger.error({ err }, '[Retention] Error pruning screenshot files');
  }

  // -------------------------------------------------------------------------
  // 4. Temporary Browser Files & Artifacts (Swept immediately if > 1 hour old)
  // -------------------------------------------------------------------------
  try {
    const tmpDir = path.join(config.DATA_DIR, 'tmp');
    if (fs.existsSync(tmpDir)) {
      const entries = await fs.promises.readdir(tmpDir, { withFileTypes: true });
      const oneHourAgo = Date.now() - 3600000;
      for (const entry of entries) {
        const fullPath = path.join(tmpDir, entry.name);
        try {
          const stats = await fs.promises.stat(fullPath);
          if (stats.mtimeMs < oneHourAgo) {
            await fs.promises.rm(fullPath, { recursive: true, force: true });
            summary.tempFilesCleaned++;
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, '[Retention] Error sweeping temporary browser files');
  }

  // -------------------------------------------------------------------------
  // 5. AI Execution Logs & Cache (90 days default)
  // -------------------------------------------------------------------------
  const aiCutoff = new Date(Date.now() - settings.aiLogsDays * 86400000);
  try {
    const deletedAi = await db
      .delete(aiRequests)
      .where(lt(aiRequests.at, aiCutoff))
      .returning({ id: aiRequests.id });
    summary.aiLogsPruned = deletedAi.length;

    const deletedCache = await db
      .delete(aiCache)
      .where(lt(aiCache.createdAt, aiCutoff))
      .returning({ cacheKey: aiCache.cacheKey });
    summary.aiCachePruned = deletedCache.length;
  } catch (err) {
    logger.error({ err }, '[Retention] Error pruning AI logs and cache');
  }

  // -------------------------------------------------------------------------
  // 6. Agent Execution Logs & Worker Heartbeats (90 days default)
  // -------------------------------------------------------------------------
  const execLogsCutoff = new Date(Date.now() - settings.execLogsDays * 86400000);
  try {
    const deletedExec = await db
      .delete(agentExecutionLogs)
      .where(lt(agentExecutionLogs.at, execLogsCutoff))
      .returning({ id: agentExecutionLogs.id });
    summary.execLogsPruned = deletedExec.length;

    const deletedHeartbeats = await db
      .delete(workerHeartbeats)
      .where(lt(workerHeartbeats.lastSeenAt, execLogsCutoff))
      .returning({ workerId: workerHeartbeats.workerId });
    summary.heartbeatsPruned = deletedHeartbeats.length;
  } catch (err) {
    logger.error({ err }, '[Retention] Error pruning execution logs and heartbeats');
  }

  // -------------------------------------------------------------------------
  // 7. Verify Core Invariants (Doc 16 §9: NEVER delete apps, events, or resumes)
  // -------------------------------------------------------------------------
  const [finalApps] = await db.select({ total: count() }).from(applications);
  const [finalEvents] = await db.select({ total: count() }).from(applicationEvents);
  const [finalResumes] = await db.select({ total: count() }).from(resumes);

  if (Number(finalApps?.total ?? 0) < Number(initialApps?.total ?? 0)) {
    throw new Error('[Retention INVARIANT VIOLATION] Applications count decreased during retention pruning!');
  }
  if (Number(finalEvents?.total ?? 0) < Number(initialEvents?.total ?? 0)) {
    throw new Error('[Retention INVARIANT VIOLATION] Application events count decreased during retention pruning!');
  }
  if (Number(finalResumes?.total ?? 0) < Number(initialResumes?.total ?? 0)) {
    throw new Error('[Retention INVARIANT VIOLATION] Resumes count decreased during retention pruning!');
  }

  // Record audit log
  await recordAudit({
    actor: 'system',
    action: 'maintenance.retention',
    entityType: 'system',
    details: summary as unknown as Record<string, unknown>,
  });

  logger.info({ summary }, '[Retention] Data retention pruning completed successfully');
  return summary;
}
