import { NextResponse } from 'next/server';
import { getDb } from '@/shared/index';
import { getWorkerStatus } from '@/modules/queue';
import { sql } from 'drizzle-orm';

export async function GET() {
  let dbStatus = 'ok';
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
  } catch {
    dbStatus = 'error';
  }

  let workerStatus: { online: boolean; lastSeenAt: Date | null; ageSeconds: number };
  try {
    workerStatus = await getWorkerStatus();
  } catch {
    workerStatus = { online: false, lastSeenAt: null, ageSeconds: Infinity };
  }

  const isHealthy = dbStatus === 'ok';

  return NextResponse.json(
    {
      status: isHealthy ? 'healthy' : 'degraded',
      db: dbStatus,
      queue: 'ok',
      worker: {
        online: workerStatus.online,
        lastSeenAt: workerStatus.lastSeenAt ? workerStatus.lastSeenAt.toISOString() : null,
        ageSeconds: workerStatus.ageSeconds,
      },
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    },
    { status: isHealthy ? 200 : 503 }
  );
}
