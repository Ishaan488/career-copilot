import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, closeDbPool } from '@/shared/db';
import { systemSettings, notifications } from '@/db/index';
import { eq } from 'drizzle-orm';

describe('T-DB-1: Database and Schema Persistence', () => {
  beforeAll(() => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
  });

  afterAll(async () => {
    await closeDbPool();
  });

  it('connects, writes, and reads from system_settings', async () => {
    const db = getDb();
    const testKey = 'test_setting_' + Date.now();

    await db.insert(systemSettings).values({
      key: testKey,
      value: { enabled: true, scoreThreshold: 75 },
      updatedBy: 'test_runner',
    });

    const rows = await db.select().from(systemSettings).where(eq(systemSettings.key, testKey));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe(testKey);
    expect((rows[0]?.value as { enabled: boolean }).enabled).toBe(true);

    // Clean up
    await db.delete(systemSettings).where(eq(systemSettings.key, testKey));
  });

  it('enforces partial unique index on notifications dedupe_key', async () => {
    const db = getDb();
    const dedupeKey = 'test_dedupe_' + Date.now();

    await db.insert(notifications).values({
      type: 'test_alert',
      title: 'Alert 1',
      body: 'Body 1',
      dedupeKey,
    });

    // Inserting a duplicate non-dismissed notification with same dedupe_key must fail
    await expect(
      db.insert(notifications).values({
        type: 'test_alert',
        title: 'Alert 2',
        body: 'Body 2',
        dedupeKey,
      })
    ).rejects.toThrow();

    // Clean up
    await db.delete(notifications).where(eq(notifications.dedupeKey, dedupeKey));
  });
});
