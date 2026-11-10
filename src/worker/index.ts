import { getQueue, startHeartbeat, closeQueue, registerHandler } from '@/modules/queue';
import { logger } from '@/shared/logger';
import { closeDbPool } from '@/shared/db';
import { generateId } from '@/shared/ids';
import { runCompanyCheck } from '@/modules/company-discovery';
import { reconcileSources, runSourceSync } from '@/modules/discovery';
import { intelligenceService } from '@/modules/intelligence';
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
