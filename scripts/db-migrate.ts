import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb, closeDbPool } from '../src/shared/db';
import { resolve } from 'node:path';

async function runMigrations() {
  console.info('[db:migrate] Running database migrations...');
  const db = getDb();

  const migrationsFolder = resolve(process.cwd(), 'drizzle');
  await migrate(db, { migrationsFolder });

  console.info('[db:migrate] Migrations completed successfully.');
  await closeDbPool();
}

runMigrations().catch(async (err) => {
  console.error('[db:migrate] Migration failed:', err);
  await closeDbPool();
  process.exit(1);
});
