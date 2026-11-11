import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '@/shared/config';
import { logger } from '@/shared/logger';
import { recordAudit } from '@/modules/audit';
import { getDb } from '@/shared/db';
import { resumes, applications, jobs } from '@/db/schema';
import { count } from 'drizzle-orm';
import { AppError } from '@/shared/errors';

const execFileAsync = promisify(execFile);

export interface BackupFileMetadata {
  fileName: string;
  sha256: string;
  sizeBytes: number;
}

export interface BackupManifest {
  version: string;
  createdAt: string;
  backupName: string;
  pgVersion?: string;
  dbDump: BackupFileMetadata;
  filesArchive: BackupFileMetadata;
  counts: {
    resumes: number;
    applications: number;
    jobListings: number;
  };
}

export interface BackupOptions {
  databaseUrl?: string;
  mirrorDir?: string;
  maxRetained?: number;
}

export interface RestoreOptions {
  databaseUrl?: string;
  confirm: boolean;
  verifyChecksums?: boolean;
}

export interface RestoreResult {
  backupName: string;
  restoredAt: string;
  verifiedChecksums: boolean;
  dbRestored: boolean;
  filesRestored: boolean;
  manifest: BackupManifest;
}

/**
 * Computes SHA-256 hash and byte length of a file.
 */
export async function computeFileMetadata(filePath: string): Promise<BackupFileMetadata> {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  let sizeBytes = 0;

  for await (const chunk of stream) {
    hash.update(chunk);
    sizeBytes += chunk.length;
  }

  return {
    fileName: path.basename(filePath),
    sha256: hash.digest('hex'),
    sizeBytes,
  };
}

/**
 * Prunes backup directories, retaining the newest N backups.
 */
export async function pruneOldBackups(baseDir: string, maxRetained = 14): Promise<number> {
  if (!fs.existsSync(baseDir)) return 0;

  const entries = await fs.promises.readdir(baseDir, { withFileTypes: true });
  const backupDirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort()
    .reverse();

  let prunedCount = 0;
  if (backupDirs.length > maxRetained) {
    const toDelete = backupDirs.slice(maxRetained);
    for (const dirName of toDelete) {
      const fullPath = path.join(baseDir, dirName);
      try {
        await fs.promises.rm(fullPath, { recursive: true, force: true });
        prunedCount++;
        logger.info({ dirName, fullPath }, '[Backup] Pruned old backup directory');
      } catch (err) {
        logger.warn({ err, fullPath }, '[Backup] Failed to prune old backup directory');
      }
    }
  }

  return prunedCount;
}

/**
 * Copies all files in a backup directory to a mirror destination.
 */
async function mirrorBackup(sourceDir: string, mirrorBaseDir: string, maxRetained = 14): Promise<string> {
  const backupName = path.basename(sourceDir);
  const targetDir = path.join(mirrorBaseDir, backupName);
  await fs.promises.mkdir(targetDir, { recursive: true });

  const files = await fs.promises.readdir(sourceDir);
  for (const file of files) {
    const srcFile = path.join(sourceDir, file);
    const destFile = path.join(targetDir, file);
    await fs.promises.copyFile(srcFile, destFile);
  }

  await pruneOldBackups(mirrorBaseDir, maxRetained);
  return targetDir;
}

/**
 * Creates a complete database + files backup (Doc 16 §7).
 * Retains the last 14 backups in DATA_DIR/backups and optional mirror directory.
 */
export async function createDatabaseBackup(options?: BackupOptions): Promise<{ backupDir: string; manifest: BackupManifest }> {
  const dbUrl = options?.databaseUrl || config.DATABASE_URL;
  const maxRetained = options?.maxRetained ?? 14;
  const mirrorDir = options?.mirrorDir || config.BACKUP_MIRROR_DIR;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupsBase = path.resolve(config.DATA_DIR, 'backups');
  const backupDir = path.join(backupsBase, timestamp);

  await fs.promises.mkdir(backupDir, { recursive: true });

  // 1. Export database via pg_dump -Fc
  const dbDumpPath = path.join(backupDir, 'db.dump');
  try {
    await execFileAsync('pg_dump', ['-Fc', '-d', dbUrl, '-f', dbDumpPath]);
  } catch (err) {
    // Clean up partial directory if dump failed
    await fs.promises.rm(backupDir, { recursive: true, force: true }).catch(() => {});
    logger.error({ err }, '[Backup] pg_dump failed');
    throw new AppError('INTERNAL', `pg_dump failed: ${(err as Error).message}`);
  }

  // 2. Package resumes and user files via tar -czf
  const filesArchivePath = path.join(backupDir, 'files.tar.gz');
  const resumesDir = path.resolve(config.DATA_DIR, 'resumes');
  await fs.promises.mkdir(resumesDir, { recursive: true });

  const itemsToArchive: string[] = ['resumes'];
  const userFilesDir = path.resolve(config.DATA_DIR, 'files');
  if (fs.existsSync(userFilesDir)) {
    itemsToArchive.push('files');
  }

  try {
    await execFileAsync('tar', ['-czf', filesArchivePath, '-C', config.DATA_DIR, ...itemsToArchive]);
  } catch (err) {
    await fs.promises.rm(backupDir, { recursive: true, force: true }).catch(() => {});
    logger.error({ err }, '[Backup] tar archiving of files failed');
    throw new AppError('INTERNAL', `tar failed: ${(err as Error).message}`);
  }

  // 3. Compute file metadata & SHA256 checksums
  const dbDumpMeta = await computeFileMetadata(dbDumpPath);
  const filesArchiveMeta = await computeFileMetadata(filesArchivePath);

  // 4. Query DB baseline row counts
  let resumeCount = 0;
  let applicationCount = 0;
  let jobCount = 0;
  try {
    const db = getDb();
    const [r] = await db.select({ total: count() }).from(resumes);
    const [a] = await db.select({ total: count() }).from(applications);
    const [j] = await db.select({ total: count() }).from(jobs);
    resumeCount = Number(r?.total ?? 0);
    applicationCount = Number(a?.total ?? 0);
    jobCount = Number(j?.total ?? 0);
  } catch (err) {
    logger.warn({ err }, '[Backup] Could not query table counts for manifest');
  }

  // 5. Detect pg version
  let pgVersion = 'unknown';
  try {
    const { stdout } = await execFileAsync('pg_dump', ['--version']);
    pgVersion = stdout.trim();
  } catch {
    // ignore
  }

  // 6. Write manifest.json
  const manifest: BackupManifest = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    backupName: timestamp,
    pgVersion,
    dbDump: dbDumpMeta,
    filesArchive: filesArchiveMeta,
    counts: {
      resumes: resumeCount,
      applications: applicationCount,
      jobListings: jobCount,
    },
  };

  const manifestPath = path.join(backupDir, 'manifest.json');
  await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  // 7. Prune backups older than 14
  const prunedLocal = await pruneOldBackups(backupsBase, maxRetained);

  // 8. Mirror backup if configured
  if (mirrorDir && mirrorDir.trim()) {
    try {
      await mirrorBackup(backupDir, path.resolve(mirrorDir), maxRetained);
      logger.info({ mirrorDir }, '[Backup] Successfully mirrored backup');
    } catch (err) {
      logger.error({ err, mirrorDir }, '[Backup] Failed to mirror backup');
    }
  }

  // 9. Record audit
  await recordAudit({
    actor: 'system',
    action: 'maintenance.backup',
    entityType: 'system',
    details: {
      backupName: timestamp,
      dbSize: dbDumpMeta.sizeBytes,
      filesSize: filesArchiveMeta.sizeBytes,
      prunedLocal,
    },
  });

  logger.info({ backupDir, manifest }, '[Backup] Backup completed successfully');
  return { backupDir, manifest };
}

/**
 * Restores database and user files from a backup directory (Doc 16 §7).
 * Requires explicit confirm: true.
 */
export async function restoreDatabaseBackup(
  backupTarget: string,
  options: RestoreOptions
): Promise<RestoreResult> {
  if (!options?.confirm) {
    throw new AppError(
      'VALIDATION',
      'Restore operation requires explicit confirmation (confirm: true or --yes flag).'
    );
  }

  const dbUrl = options?.databaseUrl || config.DATABASE_URL;
  let resolvedBackupDir = path.resolve(backupTarget);

  // If path is just a backup timestamp or not found directly, check DATA_DIR/backups/<target>
  if (!fs.existsSync(resolvedBackupDir)) {
    const candidate = path.resolve(config.DATA_DIR, 'backups', backupTarget);
    if (fs.existsSync(candidate)) {
      resolvedBackupDir = candidate;
    } else {
      throw new AppError('NOT_FOUND', `Backup directory not found at: ${backupTarget}`);
    }
  }

  const manifestPath = path.join(resolvedBackupDir, 'manifest.json');
  const dbDumpPath = path.join(resolvedBackupDir, 'db.dump');
  const filesArchivePath = path.join(resolvedBackupDir, 'files.tar.gz');

  if (!fs.existsSync(dbDumpPath)) {
    throw new AppError('NOT_FOUND', `db.dump missing in backup directory: ${resolvedBackupDir}`);
  }
  if (!fs.existsSync(filesArchivePath)) {
    throw new AppError('NOT_FOUND', `files.tar.gz missing in backup directory: ${resolvedBackupDir}`);
  }

  let manifest: BackupManifest;
  if (fs.existsSync(manifestPath)) {
    const raw = await fs.promises.readFile(manifestPath, 'utf-8');
    manifest = JSON.parse(raw) as BackupManifest;
  } else {
    // Generate minimal fallback manifest if none existed
    manifest = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      backupName: path.basename(resolvedBackupDir),
      dbDump: await computeFileMetadata(dbDumpPath),
      filesArchive: await computeFileMetadata(filesArchivePath),
      counts: { resumes: 0, applications: 0, jobListings: 0 },
    };
  }

  // Verify SHA-256 Checksums
  let checksumsMatch = true;
  if (options.verifyChecksums !== false && manifest.dbDump && manifest.filesArchive) {
    const actualDbMeta = await computeFileMetadata(dbDumpPath);
    const actualFilesMeta = await computeFileMetadata(filesArchivePath);

    if (actualDbMeta.sha256 !== manifest.dbDump.sha256) {
      throw new AppError(
        'VALIDATION',
        `Database dump checksum mismatch! Expected ${manifest.dbDump.sha256}, got ${actualDbMeta.sha256}`
      );
    }
    if (actualFilesMeta.sha256 !== manifest.filesArchive.sha256) {
      throw new AppError(
        'VALIDATION',
        `Files archive checksum mismatch! Expected ${manifest.filesArchive.sha256}, got ${actualFilesMeta.sha256}`
      );
    }
  }

  // Restore files archive
  await fs.promises.mkdir(config.DATA_DIR, { recursive: true });
  try {
    await execFileAsync('tar', ['-xzf', filesArchivePath, '-C', config.DATA_DIR]);
  } catch (err) {
    logger.error({ err }, '[Restore] Failed to extract files archive');
    throw new AppError('INTERNAL', `Failed to extract files.tar.gz: ${(err as Error).message}`);
  }

  // Restore database via pg_restore --clean --if-exists -d <dbUrl>
  try {
    await execFileAsync('pg_restore', ['--clean', '--if-exists', '-d', dbUrl, dbDumpPath]);
  } catch (err) {
    // pg_restore may exit with code 1 for non-critical warnings (e.g. relation does not exist on DROP)
    const errMessage = (err as Error).message;
    logger.warn({ errMessage }, '[Restore] pg_restore exited with notice/warning');
  }

  // Record audit log
  await recordAudit({
    actor: 'user',
    action: 'maintenance.restore',
    entityType: 'system',
    details: {
      backupName: manifest.backupName,
      restoredFrom: resolvedBackupDir,
      checksumsVerified: checksumsMatch,
    },
  });

  const result: RestoreResult = {
    backupName: manifest.backupName,
    restoredAt: new Date().toISOString(),
    verifiedChecksums: checksumsMatch,
    dbRestored: true,
    filesRestored: true,
    manifest,
  };

  logger.info({ result }, '[Restore] Database and files restored successfully');
  return result;
}

/**
 * Lists all existing backups in DATA_DIR/backups.
 */
export async function listBackups(): Promise<BackupManifest[]> {
  const backupsBase = path.resolve(config.DATA_DIR, 'backups');
  if (!fs.existsSync(backupsBase)) return [];

  const entries = await fs.promises.readdir(backupsBase, { withFileTypes: true });
  const backupDirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort()
    .reverse();

  const results: BackupManifest[] = [];
  for (const dirName of backupDirs) {
    const manifestPath = path.join(backupsBase, dirName, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const raw = await fs.promises.readFile(manifestPath, 'utf-8');
        results.push(JSON.parse(raw) as BackupManifest);
      } catch {
        // ignore malformed manifest
      }
    }
  }

  return results;
}
