import { createDatabaseBackup } from '../src/modules/maintenance';
import { closeDbPool } from '../src/shared/db';

async function main() {
  const args = process.argv.slice(2);
  let mirrorDir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mirror' && args[i + 1]) {
      mirrorDir = args[i + 1];
      i++;
    }
  }

  console.info('=== Career Copilot Database & Files Backup ===');
  try {
    const { backupDir, manifest } = await createDatabaseBackup({ mirrorDir });
    console.info(`✅ Backup created at: ${backupDir}`);
    console.info(`   DB dump:      ${manifest.dbDump.fileName} (${(manifest.dbDump.sizeBytes / 1024).toFixed(1)} KB, sha256: ${manifest.dbDump.sha256.slice(0, 12)}...)`);
    console.info(`   Files archive: ${manifest.filesArchive.fileName} (${(manifest.filesArchive.sizeBytes / 1024).toFixed(1)} KB)`);
    console.info(`   Counts:       ${manifest.counts.resumes} resumes, ${manifest.counts.applications} applications, ${manifest.counts.jobListings} jobs`);
    await closeDbPool();
  } catch (err) {
    console.error('❌ Backup failed:', (err as Error).message);
    await closeDbPool();
    process.exit(1);
  }
}

main();
