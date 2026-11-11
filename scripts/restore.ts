import { restoreDatabaseBackup } from '../src/modules/maintenance';
import { closeDbPool } from '../src/shared/db';

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith('-'));
  const hasConfirm = args.includes('--yes') || args.includes('-y');

  if (!target) {
    console.error('Usage: npm run restore -- <backup-path-or-folder> --yes');
    console.error('Example: npm run restore -- 2026-11-11T10-45-00-000Z --yes');
    process.exit(1);
  }

  if (!hasConfirm) {
    console.error('⚠️  Restoring a backup will overwrite current database state and files.');
    console.error('To proceed, specify the --yes flag:');
    console.error(`  npm run restore -- "${target}" --yes`);
    process.exit(1);
  }

  console.info(`=== Career Copilot Restore: ${target} ===`);
  try {
    const result = await restoreDatabaseBackup(target, { confirm: true });
    console.info(`✅ Restore completed successfully!`);
    console.info(`   Backup:             ${result.backupName}`);
    console.info(`   Checksums verified: ${result.verifiedChecksums ? 'YES' : 'SKIPPED'}`);
    console.info(`   Database:           RESTORED`);
    console.info(`   Files:              RESTORED`);
    await closeDbPool();
  } catch (err) {
    console.error('❌ Restore failed:', (err as Error).message);
    await closeDbPool();
    process.exit(1);
  }
}

main();
