import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getQueue, enqueue, getWorkerStatus, startHeartbeat, stopHeartbeat, closeQueue } from '@/modules/queue';
import { getDb, closeDbPool } from '@/shared/db';
import { workerHeartbeats } from '@/db/schema/infra';
import { eq } from 'drizzle-orm';

describe('T-Q-1: Queue and Worker Heartbeat', () => {
  beforeAll(async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    await getQueue();
  });

  afterAll(async () => {
    stopHeartbeat();
    await closeQueue();
    await closeDbPool();
  });

  it('enqueues a job with singletonKey deduplication', async () => {
    const queueName = 'test.singleton.job';
    const singletonKey = 'singleton_test_' + Date.now();

    const jobId1 = await enqueue(queueName, { data: 'first' }, { singletonKey });
    expect(jobId1).toBeTruthy();

    // Sending again with same singletonKey while active returns null (debounced)
    const jobId2 = await enqueue(queueName, { data: 'second' }, { singletonKey });
    expect(jobId2).toBeNull();
  });

  it('records worker heartbeat and accurately reports status', async () => {
    const testWorkerId = 'worker_test_' + Date.now();

    await startHeartbeat(testWorkerId, { pid: 12345 });

    const status = await getWorkerStatus(testWorkerId);
    expect(status.online).toBe(true);
    expect(status.lastSeenAt).toBeInstanceOf(Date);
    expect(status.ageSeconds).toBeLessThanOrEqual(5);

    stopHeartbeat();

    // Artificially simulate stale heartbeat in DB (older than 60s)
    const db = getDb();
    const staleDate = new Date(Date.now() - 120 * 1000);
    await db
      .update(workerHeartbeats)
      .set({ lastSeenAt: staleDate })
      .where(eq(workerHeartbeats.workerId, testWorkerId));

    const staleStatus = await getWorkerStatus(testWorkerId);
    expect(staleStatus.online).toBe(false);
    expect(staleStatus.ageSeconds).toBeGreaterThanOrEqual(60);
  });
});
