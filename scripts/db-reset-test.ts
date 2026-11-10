import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { resolve } from 'node:path';
import { config } from '../src/shared/config';

const { Pool } = pg;

async function resetTestDb() {
  console.info('[db:reset:test] Resetting test database...');
  const pool = new Pool({ connectionString: config.TEST_DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');

    const db = drizzle(pool);
    const migrationsFolder = resolve(process.cwd(), 'drizzle');
    await migrate(db, { migrationsFolder });

    console.info('[db:reset:test] Test database reset and migrated successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

resetTestDb().catch((err) => {
  console.error('[db:reset:test] Failed:', err);
  process.exit(1);
});
