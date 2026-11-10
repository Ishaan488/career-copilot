import { getQueue, startHeartbeat, closeQueue } from '@/modules/queue';
import { logger } from '@/shared/logger';
import { closeDbPool } from '@/shared/db';
import { generateId } from '@/shared/ids';

const workerId = `worker_${generateId().slice(0, 8)}`;

async function startWorker() {
  logger.info({ workerId }, '[Worker] Starting worker process...');

  // Start pg-boss queue
  await getQueue();

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
