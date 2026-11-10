import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from './config';
import * as schema from '../db/schema/index';

const { Pool } = pg;

let poolInstance: pg.Pool | null = null;
let dbInstance: NodePgDatabase<typeof schema> | null = null;

export function getDbPool(): pg.Pool {
  if (!poolInstance) {
    const connectionString =
      process.env.NODE_ENV === 'test' ? config.TEST_DATABASE_URL : config.DATABASE_URL;

    poolInstance = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return poolInstance;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!dbInstance) {
    const pool = getDbPool();
    dbInstance = drizzle(pool, { schema });
  }
  return dbInstance;
}

export async function closeDbPool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
    dbInstance = null;
  }
}
