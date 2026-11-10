import { createHash } from 'node:crypto';
import { getDb } from '@/shared/db';
import { storage } from '@/shared/storage';
import { AppError } from '@/shared/errors';
import { recordAudit } from '@/modules/audit';
import { resumes, resumeVersions, resumeAttachments } from '@/db/schema/resumes';
import { files } from '@/db/schema/infra';
import { eq, desc, sql } from 'drizzle-orm';
import { UpdateResumeInput } from './schemas';

export const MAX_RESUME_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit per PRD
const PDF_MAGIC_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // '%PDF-'

export function validatePdfBytes(buffer: Buffer): void {
  if (buffer.length === 0) {
    throw new AppError('VALIDATION', 'Resume file is empty');
  }

  if (buffer.length > MAX_RESUME_SIZE_BYTES) {
    throw new AppError(
      'VALIDATION',
      `Resume PDF exceeds the maximum allowed size of 10 MB (${(buffer.length / (1024 * 1024)).toFixed(2)} MB)`
    );
  }

  // Check magic bytes: Must begin with '%PDF-'
  if (buffer.length < 5 || !buffer.subarray(0, 5).equals(PDF_MAGIC_BYTES)) {
    throw new AppError(
      'VALIDATION',
      'Invalid resume file format. Only standard PDF documents starting with %PDF- are permitted'
    );
  }
}

export function computeSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function uploadResume(
  fileBuffer: Buffer,
  filename: string,
  options: {
    label: string;
    notes?: string | null;
    resumeId?: string;
    isDefault?: boolean;
  }
) {
  // 1. Strict PDF validation
  validatePdfBytes(fileBuffer);

  // 2. Compute SHA-256 hash of exact unmodified bytes
  const sha256 = computeSha256(fileBuffer);
  const db = getDb();

  // 3. Deduplication check: Has this exact file been uploaded before?
  const [existingVersion] = await db
    .select()
    .from(resumeVersions)
    .where(eq(resumeVersions.sha256, sha256))
    .limit(1);

  if (existingVersion) {
    return {
      isDuplicate: true,
      version: existingVersion,
      message: `This exact PDF file has already been uploaded as "${existingVersion.label}" (v${existingVersion.versionNo}).`,
    };
  }

  // 4. Store unmodified PDF bytes
  const relativePath = `resumes/${sha256}.pdf`;
  await storage.put(relativePath, fileBuffer);

  // Register in files table
  await db
    .insert(files)
    .values({
      path: relativePath,
      kind: 'resume',
      sha256,
      sizeBytes: fileBuffer.length,
      mime: 'application/pdf',
    })
    .onConflictDoNothing();

  let targetResumeId = options.resumeId;
  let nextVersionNo = 1;

  // 5. Handle logical resume group
  if (targetResumeId) {
    const [existingResume] = await db
      .select()
      .from(resumes)
      .where(eq(resumes.id, targetResumeId))
      .limit(1);

    if (!existingResume) {
      throw new AppError('NOT_FOUND', `Resume group ${targetResumeId} not found`);
    }

    // Get next version number
    const [maxVer] = await db
      .select({ max: sql<number>`COALESCE(MAX(${resumeVersions.versionNo}), 0)` })
      .from(resumeVersions)
      .where(eq(resumeVersions.resumeId, targetResumeId));

    nextVersionNo = (maxVer?.max ?? 0) + 1;
  } else {
    // Create new logical resume
    if (options.isDefault) {
      await db.update(resumes).set({ isDefault: false });
    }

    const [newResume] = await db
      .insert(resumes)
      .values({
        label: options.label,
        notes: options.notes ?? null,
        isDefault: options.isDefault ?? false,
        status: 'active',
      })
      .returning();

    if (!newResume) {
      throw new AppError('INTERNAL', 'Failed to create resume group');
    }
    targetResumeId = newResume.id;
  }

  // 6. Create immutable version row
  const [version] = await db
    .insert(resumeVersions)
    .values({
      resumeId: targetResumeId,
      versionNo: nextVersionNo,
      originalFilename: filename,
      storedPath: relativePath,
      sha256,
      sizeBytes: fileBuffer.length,
      mime: 'application/pdf',
      label: options.label,
      notes: options.notes ?? null,
      status: 'active',
    })
    .returning();

  if (!version) {
    throw new AppError('INTERNAL', 'Failed to store resume version record');
  }

  // If this version's resume was marked as default, ensure consistency
  if (options.isDefault) {
    await setDefaultResume(targetResumeId);
  }

  await recordAudit({
    actor: 'user',
    action: 'resume.uploaded',
    entityType: 'resume_version',
    entityId: version.id,
    details: {
      resumeId: targetResumeId,
      versionNo: nextVersionNo,
      sha256,
      sizeBytes: fileBuffer.length,
      originalFilename: filename,
    },
  });

  return {
    isDuplicate: false,
    version,
    message: 'Resume PDF uploaded successfully.',
  };
}

export async function getResumes() {
  const db = getDb();
  const allResumes = await db.select().from(resumes).orderBy(desc(resumes.isDefault), desc(resumes.createdAt));

  const result = [];
  for (const r of allResumes) {
    const versions = await db
      .select()
      .from(resumeVersions)
      .where(eq(resumeVersions.resumeId, r.id))
      .orderBy(desc(resumeVersions.versionNo));

    result.push({
      ...r,
      versions,
      latestVersion: versions[0] || null,
    });
  }

  return result;
}

export async function getResume(id: string) {
  const db = getDb();
  const [resume] = await db.select().from(resumes).where(eq(resumes.id, id)).limit(1);

  if (!resume) {
    throw new AppError('NOT_FOUND', `Resume ${id} not found`);
  }

  const versions = await db
    .select()
    .from(resumeVersions)
    .where(eq(resumeVersions.resumeId, id))
    .orderBy(desc(resumeVersions.versionNo));

  return {
    ...resume,
    versions,
    latestVersion: versions[0] || null,
  };
}

export async function getResumeVersion(versionId: string) {
  const db = getDb();
  const [version] = await db
    .select()
    .from(resumeVersions)
    .where(eq(resumeVersions.id, versionId))
    .limit(1);

  if (!version) {
    throw new AppError('NOT_FOUND', `Resume version ${versionId} not found`);
  }

  return version;
}

export async function getResumeFileBuffer(versionId: string): Promise<{ buffer: Buffer; version: typeof resumeVersions.$inferSelect }> {
  const version = await getResumeVersion(versionId);
  const buffer = await storage.get(version.storedPath);

  // Tamper-evident check: verify on-disk bytes match recorded SHA-256
  const actualHash = computeSha256(buffer);
  if (actualHash !== version.sha256) {
    throw new AppError('INTERNAL', 'Integrity check failed: on-disk resume PDF does not match recorded SHA-256 hash', {
      details: { expected: version.sha256, actual: actualHash },
    });
  }

  return { buffer, version };
}

export async function setDefaultResume(resumeId: string) {
  const db = getDb();
  await db.update(resumes).set({ isDefault: false });
  const [updated] = await db
    .update(resumes)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(eq(resumes.id, resumeId))
    .returning();

  if (!updated) {
    throw new AppError('NOT_FOUND', `Resume ${resumeId} not found`);
  }

  await recordAudit({
    actor: 'user',
    action: 'resume.set_default',
    entityType: 'resumes',
    entityId: resumeId,
  });

  return updated;
}

export async function updateResume(id: string, data: UpdateResumeInput) {
  const db = getDb();
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (data.label !== undefined) updateData.label = data.label;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.status !== undefined) updateData.status = data.status;

  if (data.isDefault) {
    await setDefaultResume(id);
  }

  const [updated] = await db.update(resumes).set(updateData).where(eq(resumes.id, id)).returning();

  if (!updated) {
    throw new AppError('NOT_FOUND', `Resume ${id} not found`);
  }

  return updated;
}

export async function deleteResume(id: string) {
  const db = getDb();

  // Find all version ids of this resume
  const versions = await db
    .select({ id: resumeVersions.id, storedPath: resumeVersions.storedPath })
    .from(resumeVersions)
    .where(eq(resumeVersions.resumeId, id));

  // Check if any version is attached to active applications
  for (const v of versions) {
    const [activeAttachment] = await db
      .select()
      .from(resumeAttachments)
      .where(eq(resumeAttachments.resumeVersionId, v.id))
      .limit(1);

    if (activeAttachment) {
      throw new AppError(
        'CONFLICT',
        'Cannot delete resume version that has been attached to an application. Historical submission provenance must be preserved.'
      );
    }
  }

  // Delete resume (cascades to versions in DB)
  await db.delete(resumes).where(eq(resumes.id, id));

  // Delete physical files
  for (const v of versions) {
    await storage.delete(v.storedPath);
  }

  await recordAudit({
    actor: 'user',
    action: 'resume.deleted',
    entityType: 'resumes',
    entityId: id,
  });
}

export async function recordResumeAttachment(applicationId: string, resumeVersionId: string) {
  const { version } = await getResumeFileBuffer(resumeVersionId);
  const db = getDb();

  const [attachment] = await db
    .insert(resumeAttachments)
    .values({
      applicationId,
      resumeVersionId,
      selectedAt: new Date(),
      selectedBy: 'user',
      attachedAt: new Date(),
      attachedSha256: version.sha256,
      labelSnapshot: version.label,
      versionNoSnapshot: version.versionNo,
    })
    .returning();

  if (!attachment) {
    throw new AppError('INTERNAL', 'Failed to record resume attachment record');
  }

  await recordAudit({
    actor: 'user',
    action: 'resume.attached',
    entityType: 'resume_attachments',
    entityId: attachment.id,
    details: {
      applicationId,
      resumeVersionId,
      sha256: version.sha256,
    },
  });

  return attachment;
}
