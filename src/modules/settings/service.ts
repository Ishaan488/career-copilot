import { getDb } from '@/shared/db';
import { systemSettings } from '@/db/schema/infra';
import { eq } from 'drizzle-orm';
import { defaultSettings } from './schemas';

const memoryCache = new Map<string, unknown>();

export async function getSetting<T>(key: string): Promise<T> {
  if (memoryCache.has(key)) {
    return memoryCache.get(key) as T;
  }

  const db = getDb();
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);

  if (row) {
    memoryCache.set(key, row.value);
    return row.value as T;
  }

  if (key in defaultSettings) {
    const val = defaultSettings[key as keyof typeof defaultSettings];
    memoryCache.set(key, val);
    return val as T;
  }

  return undefined as unknown as T;
}

export async function setSetting<T>(key: string, value: T, actor = 'user'): Promise<void> {
  const db = getDb();

  await db
    .insert(systemSettings)
    .values({
      key,
      value: value as Record<string, unknown>,
      updatedBy: actor,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value: value as Record<string, unknown>,
        updatedBy: actor,
        updatedAt: new Date(),
      },
    });

  memoryCache.set(key, value);
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const db = getDb();
  const rows = await db.select().from(systemSettings);

  const result: Record<string, unknown> = { ...defaultSettings };
  for (const row of rows) {
    result[row.key] = row.value;
  }

  return result;
}
