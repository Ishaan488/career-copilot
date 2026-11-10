import PgBoss from 'pg-boss';
import { z } from 'zod';
import { config } from '@/shared/config';
import { logger } from '@/shared/logger';
import { AppError } from '@/shared/errors';
import { getDb } from '@/shared/db';
import { workerHeartbeats } from '@/db/schema/infra';
import { eq, desc } from 'drizzle-orm';
import { EnqueueOptions } from './schemas';

let bossInstance: PgBoss | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
const createdQueues = new Set<string>();

export async function ensureQueue(name: string): Promise<void> {
  if (createdQueues.has(name)) return;
  const boss = await getQueue();
  try {
    await boss.createQueue(name);
    createdQueues.add(name);
  } catch (err) {
    logger.warn({ err, name }, '[Queue] Failed or redundant queue creation');
    createdQueues.add(name);
  }
}

export async function getQueue(): Promise<PgBoss> {
  if (!bossInstance) {
    const connectionString =
      process.env.NODE_ENV === 'test' ? config.TEST_DATABASE_URL : config.DATABASE_URL;

    bossInstance = new PgBoss({
      connectionString,
      application_name: 'career_copilot_queue',
      max: 10,
    });

    bossInstance.on('error', (err) => {
      logger.error({ err }, '[Queue] pg-boss internal error');
    });

    await bossInstance.start();
    logger.info('[Queue] pg-boss started');
  }
  return bossInstance;
}

export async function enqueue<T extends object>(
  name: string,
  payload: T,
  options?: EnqueueOptions
): Promise<string | null> {
  await ensureQueue(name);
  const boss = await getQueue();
  const sendOptions: PgBoss.SendOptions = {
    retryLimit: options?.retryLimit ?? 3,
    retryDelay: options?.retryDelay ?? 30,
    retryBackoff: options?.retryBackoff ?? true,
    expireInSeconds: options?.expireInSeconds ?? 300,
  };

  if (options?.singletonKey) {
    sendOptions.singletonKey = options.singletonKey;
    sendOptions.singletonSeconds = options.singletonSeconds ?? 300;
  }
  if (options?.startAfter) {
    sendOptions.startAfter = options.startAfter;
  }

  const jobId = await boss.send(name, payload, sendOptions);
  return jobId;
}

export async function registerHandler<T>(
  name: string,
  schema: z.ZodType<T>,
  handler: (payload: T, jobId: string) => Promise<void>
): Promise<void> {
  await ensureQueue(name);
  const boss = await getQueue();

  await boss.work(name, async (jobs) => {
    const jobList = Array.isArray(jobs) ? jobs : [jobs];
    for (const job of jobList) {
      const parsed = schema.safeParse(job.data);
      if (!parsed.success) {
        logger.error(
          { errors: parsed.error.format(), name, jobId: job.id },
          '[Queue] Payload validation failed for job'
        );
        throw new AppError('VALIDATION', `Invalid payload for queue job ${name}`, {
          details: parsed.error.format() as Record<string, unknown>,
        });
      }

      try {
        await handler(parsed.data, job.id);
      } catch (err: unknown) {
        logger.error({ err, name, jobId: job.id }, '[Queue] Job execution failed');
        throw err;
      }
    }
  });
}

export async function scheduleRecurring<T extends object>(
  name: string,
  cron: string,
  payload?: T
): Promise<void> {
  await ensureQueue(name);
  const boss = await getQueue();
  await boss.schedule(name, cron, payload || {});
}

export async function startHeartbeat(workerId: string, metadata?: Record<string, unknown>): Promise<void> {
  const db = getDb();

  const ping = async () => {
    try {
      await db
        .insert(workerHeartbeats)
        .values({
          workerId,
          startedAt: new Date(),
          lastSeenAt: new Date(),
          info: metadata || {},
        })
        .onConflictDoUpdate({
          target: workerHeartbeats.workerId,
          set: {
            lastSeenAt: new Date(),
            info: metadata || {},
          },
        });
    } catch (err) {
      logger.error({ err, workerId }, '[Queue] Failed to record worker heartbeat');
    }
  };

  await ping();
  heartbeatInterval = setInterval(ping, 15000);
}

export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

export async function getWorkerStatus(workerId?: string): Promise<{ online: boolean; lastSeenAt: Date | null; ageSeconds: number }> {
  const db = getDb();
  const query = workerId
    ? db.select().from(workerHeartbeats).where(eq(workerHeartbeats.workerId, workerId)).limit(1)
    : db.select().from(workerHeartbeats).orderBy(desc(workerHeartbeats.lastSeenAt)).limit(1);

  const rows = await query;
  const latest = rows[0];

  if (!latest) {
    return { online: false, lastSeenAt: null, ageSeconds: Infinity };
  }

  const ageMs = Date.now() - new Date(latest.lastSeenAt).getTime();
  const ageSeconds = Math.round(ageMs / 1000);
  const online = ageSeconds <= 60; // offline if older than 60s

  return { online, lastSeenAt: new Date(latest.lastSeenAt), ageSeconds };
}

export async function closeQueue(): Promise<void> {
  stopHeartbeat();
  if (bossInstance) {
    await bossInstance.stop();
    bossInstance = null;
  }
}
