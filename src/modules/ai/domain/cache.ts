import crypto from 'node:crypto';
import { getDb } from '../../../shared/db';
import { aiCache } from '../../../db/schema';
import { eq } from 'drizzle-orm';

/**
 * Computes canonical sha256 cache key.
 */
export function computeCacheKey(
  task: string,
  schemaVersion: number,
  promptVersion: number,
  canonicalInput: string
): string {
  const content = `${task}|${schemaVersion}|${promptVersion}|${canonicalInput}`;
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Looks up cached output for a cache key.
 */
export async function getCachedOutput<T>(cacheKey: string): Promise<T | null> {
  const db = getDb();
  const [row] = await db
    .select({ output: aiCache.output })
    .from(aiCache)
    .where(eq(aiCache.cacheKey, cacheKey))
    .limit(1);

  if (!row) return null;
  return row.output as T;
}

/**
 * Stores output in ai_cache table.
 */
export async function setCachedOutput(cacheKey: string, output: unknown): Promise<void> {
  const db = getDb();
  await db
    .insert(aiCache)
    .values({
      cacheKey,
      output: output as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: aiCache.cacheKey,
      set: {
        output: output as Record<string, unknown>,
      },
    });
}
