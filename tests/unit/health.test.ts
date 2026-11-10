import { describe, it, expect, afterAll } from 'vitest';
import { GET } from '@/app/api/health/route';
import { closeDbPool } from '@/shared/db';
import { closeQueue } from '@/modules/queue';

describe('Health Route API', () => {
  afterAll(async () => {
    await closeQueue();
    await closeDbPool();
  });

  it('returns healthy status with db and worker info', async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.db).toBe('ok');
    expect(body.queue).toBe('ok');
    expect(body).toHaveProperty('worker');
    expect(typeof body.worker.online).toBe('boolean');
    expect(body.version).toBe('0.1.0');
    expect(body).toHaveProperty('timestamp');
  });
});
