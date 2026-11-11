import { getQueue, startHeartbeat, closeQueue, registerHandler, enqueue } from '@/modules/queue';
import { logger } from '@/shared/logger';
import { closeDbPool } from '@/shared/db';
import { generateId } from '@/shared/ids';
import { runCompanyCheck } from '@/modules/company-discovery';
import { reconcileSources, runSourceSync } from '@/modules/discovery';
import { intelligenceService } from '@/modules/intelligence';
import { companyResearchService } from '@/modules/companies';
import { applicationService } from '@/modules/application';
import { runRetentionPruning, createDatabaseBackup } from '@/modules/maintenance';
import { z } from 'zod';

const workerId = `worker_${generateId().slice(0, 8)}`;

async function startWorker() {
  logger.info({ workerId }, '[Worker] Starting worker process...');

  // Start pg-boss queue
  await getQueue();

  // Register company.check job handler
  await registerHandler(
    'company.check',
    z.object({ companyId: z.string().uuid() }),
    async (payload) => {
      logger.info({ companyId: payload.companyId }, '[Worker] Running scheduled company check');
      await runCompanyCheck(payload.companyId, 'system');
    }
  );

  // Register company.research job handler (Milestone 8)
  await registerHandler(
    'company.research',
    z.object({ companyId: z.string().uuid(), force: z.boolean().optional() }),
    async (payload) => {
      logger.info({ companyId: payload.companyId }, '[Worker] Running company research & legitimacy check');
      const res = await companyResearchService.researchCompany(payload.companyId, { force: payload.force });
      logger.info(
        { companyId: payload.companyId, status: res.legitimacyStatus, score: res.legitimacyScore },
        '[Worker] Company research completed'
      );
    }
  );

  // Register discovery.reconcile_sources job handler
  await registerHandler(
    'discovery.reconcile_sources',
    z.object({}).passthrough(),
    async () => {
      logger.info('[Worker] Running discovery source reconciliation');
      const res = await reconcileSources();
      logger.info(res, '[Worker] Source reconciliation finished');
    }
  );

  // Register discovery.sync_source job handler
  await registerHandler(
    'discovery.sync_source',
    z.object({ sourceId: z.string().uuid() }),
    async (payload) => {
      logger.info({ sourceId: payload.sourceId }, '[Worker] Running source sync');
      const res = await runSourceSync(payload.sourceId);
      logger.info(res, '[Worker] Source sync finished');
    }
  );

  // Register intel.analyze job handler (Milestone 6)
  await registerHandler(
    'intel.analyze',
    z.object({ jobId: z.string().uuid(), force: z.boolean().optional() }),
    async (payload) => {
      logger.info({ jobId: payload.jobId }, '[Worker] Running job intelligence analysis');
      const res = await intelligenceService.analyzeJob(payload.jobId, { force: payload.force });
      logger.info(res, '[Worker] Job intelligence analysis finished');

      // Chain evaluation upon successful analysis (Milestone 7)
      if (res.status === 'completed') {
        try {
          await enqueue(
            'intel.evaluate',
            { jobId: payload.jobId },
            { singletonKey: `intel.evaluate.${payload.jobId}` }
          );
        } catch (enqueueErr) {
          logger.warn(
            { enqueueErr, jobId: payload.jobId },
            '[Worker] Could not chain intel.evaluate'
          );
        }
      }
    }
  );

  // Register intel.evaluate job handler (Milestone 7)
  await registerHandler(
    'intel.evaluate',
    z.object({ jobId: z.string().uuid(), force: z.boolean().optional() }),
    async (payload) => {
      logger.info({ jobId: payload.jobId }, '[Worker] Running job evaluation & recommendation');
      const res = await intelligenceService.evaluateJob(payload.jobId, { force: payload.force });
      logger.info(res, '[Worker] Job evaluation & recommendation finished');
    }
  );

  // Register ai.drain_pending job handler (Milestone 6 degraded recovery)
  await registerHandler(
    'ai.drain_pending',
    z.object({ limit: z.number().int().optional() }),
    async (payload) => {
      logger.info('[Worker] Running AI pending jobs drain');
      const res = await intelligenceService.drainPendingAIJobs(payload.limit ?? 20);
      logger.info(res, '[Worker] AI pending jobs drain completed');
    }
  );

  // Register application.run_step job handler (Milestone 9)
  await registerHandler(
    'application.run_step',
    z.object({ workflowId: z.string().uuid(), step: z.string().optional() }).passthrough(),
    async (payload) => {
      logger.info({ workflowId: payload.workflowId }, '[Worker] Running application workflow step');
      await applicationService.executeStep(payload.workflowId);
    }
  );

  // Register workflow.resume job handler (Milestone 9)
  await registerHandler(
    'workflow.resume',
    z.object({ workflowId: z.string().uuid(), requestId: z.string().uuid().optional() }),
    async (payload) => {
      logger.info({ workflowId: payload.workflowId, requestId: payload.requestId }, '[Worker] Resuming workflow');
      await applicationService.resumeWorkflow(payload.workflowId, payload.requestId);
    }
  );

  // Register maintenance.retention job handler (Milestone 14)
  await registerHandler(
    'maintenance.retention',
    z.object({}).passthrough(),
    async (payload) => {
      logger.info('[Worker] Running scheduled data retention pruning');
      const res = await runRetentionPruning(payload as Record<string, unknown>);
      logger.info(res, '[Worker] Data retention pruning completed');
    }
  );

  // Register maintenance.backup job handler (Milestone 14)
  await registerHandler(
    'maintenance.backup',
    z.object({ mirrorDir: z.string().optional() }).passthrough(),
    async (payload) => {
      logger.info('[Worker] Running scheduled database backup');
      const res = await createDatabaseBackup(payload);
      logger.info({ backupDir: res.backupDir }, '[Worker] Database backup completed');
    }
  );

  // Run startup recovery for any stale workflow checkpoints
  try {
    const recoveredCount = await applicationService.recoverStaleWorkflows();
    if (recoveredCount > 0) {
      logger.info({ recoveredCount }, '[Worker] Recovered stale workflows on startup');
    }
  } catch (recoverErr) {
    logger.warn({ recoverErr }, '[Worker] Could not run startup workflow recovery');
  }

  // Start heartbeat
  await startHeartbeat(workerId, {
    pid: process.pid,
    platform: process.platform,
    nodeVersion: process.version,
  });

  logger.info({ workerId }, '[Worker] Worker process running and heartbeat active.');

  const shutdown = async (signal: string) => {
    logger.info({ signal, workerId }, '[Worker] Shutting down worker...');
    await closeQueue();
    await closeDbPool();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startWorker().catch(async (err) => {
  logger.error({ err }, '[Worker] Fatal error starting worker process');
  await closeQueue();
  await closeDbPool();
  process.exit(1);
});
