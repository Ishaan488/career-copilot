import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeFileMetadata,
  pruneOldBackups,
  createDatabaseBackup,
  restoreDatabaseBackup,
  listBackups,
} from '@/modules/maintenance';
import { config } from '@/shared/config';
import { AppError } from '@/shared/errors';

describe('Database & Files Backup & Restore (Doc 16 §7, Doc 15 §7)', () => {
  const testBackupsBase = path.join(config.DATA_DIR, 'test_backups');
  const testMirrorBase = path.join(config.DATA_DIR, 'test_mirror');

  beforeEach(async () => {
    await fs.promises.mkdir(testBackupsBase, { recursive: true });
    await fs.promises.mkdir(testMirrorBase, { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(testBackupsBase, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(testMirrorBase, { recursive: true, force: true }).catch(() => {});
  });

  it('computes accurate SHA-256 and byte sizes for files', async () => {
    const samplePath = path.join(testBackupsBase, 'sample.txt');
    await fs.promises.writeFile(samplePath, 'Career Copilot Backup Test');

    const meta = await computeFileMetadata(samplePath);
    expect(meta.fileName).toBe('sample.txt');
    expect(meta.sizeBytes).toBe(26);
    expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('prunes backup directories retaining only the newest N versions', async () => {
    // Create 18 pseudo-backup directories
    for (let i = 1; i <= 18; i++) {
      const pad = String(i).padStart(2, '0');
      const dirPath = path.join(testBackupsBase, `2026-11-${pad}T10-00-00-000Z`);
      await fs.promises.mkdir(dirPath, { recursive: true });
      await fs.promises.writeFile(path.join(dirPath, 'manifest.json'), '{}');
    }

    const initialEntries = await fs.promises.readdir(testBackupsBase);
    expect(initialEntries.length).toBe(18);

    // Prune with maxRetained = 14
    const pruned = await pruneOldBackups(testBackupsBase, 14);
    expect(pruned).toBe(4);

    const remaining = await fs.promises.readdir(testBackupsBase);
    expect(remaining.length).toBe(14);
    // Oldest ones (1 to 4) should be pruned
    expect(remaining).not.toContain('2026-11-01T10-00-00-000Z');
    expect(remaining).not.toContain('2026-11-04T10-00-00-000Z');
    // Newest ones (5 to 18) should remain
    expect(remaining).toContain('2026-11-18T10-00-00-000Z');
    expect(remaining).toContain('2026-11-05T10-00-00-000Z');
  });

  it('executes backup against database producing db.dump, files.tar.gz and manifest.json', async () => {
    // Ensure test resume exists
    const resumesDir = path.join(config.DATA_DIR, 'resumes');
    await fs.promises.mkdir(resumesDir, { recursive: true });
    await fs.promises.writeFile(path.join(resumesDir, 'test-resume.pdf'), '%PDF-1.4 Fake PDF');

    const { backupDir, manifest } = await createDatabaseBackup({
      databaseUrl: config.TEST_DATABASE_URL,
      mirrorDir: testMirrorBase,
      maxRetained: 14,
    });

    expect(fs.existsSync(backupDir)).toBe(true);
    expect(fs.existsSync(path.join(backupDir, 'db.dump'))).toBe(true);
    expect(fs.existsSync(path.join(backupDir, 'files.tar.gz'))).toBe(true);
    expect(fs.existsSync(path.join(backupDir, 'manifest.json'))).toBe(true);

    expect(manifest.version).toBe('1.0');
    expect(manifest.dbDump.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.filesArchive.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.counts).toHaveProperty('resumes');
    expect(manifest.counts).toHaveProperty('applications');

    // Verify mirror was copied
    const mirrorBackups = await fs.promises.readdir(testMirrorBase);
    expect(mirrorBackups).toContain(path.basename(backupDir));

    // Verify listBackups sees the created backup
    const backups = await listBackups();
    expect(backups.length).toBeGreaterThanOrEqual(1);
  });

  it('restore fails if explicit confirmation is missing', async () => {
    await expect(
      // @ts-expect-error Testing missing confirmation flag
      restoreDatabaseBackup('fake-backup-dir', {})
    ).rejects.toThrow(AppError);
  });

  it('restore fails with validation error if backup checksum is tampered', async () => {
    // Create a temporary pseudo backup
    const mockBackupDir = path.join(testBackupsBase, 'tampered-backup');
    await fs.promises.mkdir(mockBackupDir, { recursive: true });

    const dumpFile = path.join(mockBackupDir, 'db.dump');
    const filesArchive = path.join(mockBackupDir, 'files.tar.gz');
    await fs.promises.writeFile(dumpFile, 'valid-dump-content');
    await fs.promises.writeFile(filesArchive, 'valid-archive-content');

    const manifest = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      backupName: 'tampered-backup',
      dbDump: { fileName: 'db.dump', sha256: 'tampered_sha256_hash_here', sizeBytes: 18 },
      filesArchive: { fileName: 'files.tar.gz', sha256: 'valid_sha', sizeBytes: 21 },
      counts: { resumes: 0, applications: 0, jobListings: 0 },
    };
    await fs.promises.writeFile(
      path.join(mockBackupDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    await expect(
      restoreDatabaseBackup(mockBackupDir, { confirm: true, verifyChecksums: true })
    ).rejects.toThrow(/checksum mismatch/);
  });

  it('executes full restore on valid backup directory', async () => {
    // Create backup first
    const { backupDir, manifest } = await createDatabaseBackup({
      databaseUrl: config.TEST_DATABASE_URL,
      maxRetained: 14,
    });

    const restoreRes = await restoreDatabaseBackup(backupDir, {
      databaseUrl: config.TEST_DATABASE_URL,
      confirm: true,
      verifyChecksums: true,
    });

    expect(restoreRes.backupName).toBe(manifest.backupName);
    expect(restoreRes.verifiedChecksums).toBe(true);
    expect(restoreRes.dbRestored).toBe(true);
    expect(restoreRes.filesRestored).toBe(true);
  });
});
