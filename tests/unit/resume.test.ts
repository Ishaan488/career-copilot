import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  uploadResume,
  getResumes,
  getResume,
  getResumeFileBuffer,
  setDefaultResume,
  deleteResume,
  recordResumeAttachment,
  validatePdfBytes,
  computeSha256,
  MAX_RESUME_SIZE_BYTES,
} from '@/modules/resume';
import { resumes, resumeVersions, resumeAttachments } from '@/db/schema/resumes';
import { getDb, closeDbPool } from '@/shared/db';
import { AppError } from '@/shared/errors';
import fs from 'node:fs';
import path from 'node:path';

// Valid minimal PDF bytes: %PDF-1.4 ... %%EOF
const VALID_PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n165\n%%EOF'
);

// Second distinct valid PDF
const VALID_PDF_BYTES_2 = Buffer.from(
  '%PDF-1.5\n% Distinct second resume\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000035 00000 n \n0000000084 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n140\n%%EOF'
);

describe('Resume Manager Module (PDF Storage, Selection, & Immutability)', () => {
  beforeAll(async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    const db = getDb();
    await db.delete(resumeAttachments);
    await db.delete(resumeVersions);
    await db.delete(resumes);
  });

  afterAll(async () => {
    await closeDbPool();
  });

  describe('PDF Magic Bytes & Integrity Validation', () => {
    it('accepts valid PDF starting with %PDF-', () => {
      expect(() => validatePdfBytes(VALID_PDF_BYTES)).not.toThrow();
    });

    it('rejects empty files', () => {
      expect(() => validatePdfBytes(Buffer.alloc(0))).toThrowError(AppError);
    });

    it('rejects non-PDF files (e.g. DOCX, HTML, plain text)', () => {
      const textBuffer = Buffer.from('This is a plain text resume');
      expect(() => validatePdfBytes(textBuffer)).toThrowError(AppError);

      const htmlBuffer = Buffer.from('<html><body>Resume</body></html>');
      expect(() => validatePdfBytes(htmlBuffer)).toThrowError(AppError);
    });

    it('rejects files exceeding 10 MB limit', () => {
      const largeBuffer = Buffer.alloc(MAX_RESUME_SIZE_BYTES + 1024);
      largeBuffer.set(Buffer.from('%PDF-'), 0);
      expect(() => validatePdfBytes(largeBuffer)).toThrowError(AppError);
    });
  });

  describe('Upload, Deduplication, & Versioning', () => {
    let createdResumeId: string;
    let version1Id: string;

    it('uploads a valid PDF resume and stores it unmodified', async () => {
      const result = await uploadResume(VALID_PDF_BYTES, 'Jane_Doe_Resume_2025.pdf', {
        label: 'Senior Backend Engineer',
        notes: 'Primary backend resume version',
        isDefault: true,
      });

      expect(result.isDuplicate).toBe(false);
      expect(result.version).toBeDefined();
      expect(result.version.versionNo).toBe(1);
      expect(result.version.originalFilename).toBe('Jane_Doe_Resume_2025.pdf');
      expect(result.version.sha256).toBe(computeSha256(VALID_PDF_BYTES));

      createdResumeId = result.version.resumeId;
      version1Id = result.version.id;

      // Verify file exists on disk and bytes match exactly
      const retrieved = await getResumeFileBuffer(version1Id);
      expect(retrieved.buffer.equals(VALID_PDF_BYTES)).toBe(true);
      expect(retrieved.version.sha256).toBe(computeSha256(VALID_PDF_BYTES));
    });

    it('detects duplicate PDF upload by SHA-256 and offers existing version', async () => {
      const duplicateResult = await uploadResume(VALID_PDF_BYTES, 'Jane_Doe_Duplicate.pdf', {
        label: 'Another Label',
      });

      expect(duplicateResult.isDuplicate).toBe(true);
      expect(duplicateResult.version.id).toBe(version1Id);
      expect(duplicateResult.version.versionNo).toBe(1);
    });

    it('adds a new version to an existing resume group', async () => {
      const v2Result = await uploadResume(VALID_PDF_BYTES_2, 'Jane_Doe_v2.pdf', {
        label: 'Senior Backend Engineer v2',
        resumeId: createdResumeId,
      });

      expect(v2Result.isDuplicate).toBe(false);
      expect(v2Result.version.versionNo).toBe(2);
      expect(v2Result.version.resumeId).toBe(createdResumeId);

      const resumeGroup = await getResume(createdResumeId);
      expect(resumeGroup.versions.length).toBe(2);
      expect(resumeGroup.latestVersion?.versionNo).toBe(2);
    });
  });

  describe('Default Selection & Attachment Provenance', () => {
    let resumeAId: string;
    let resumeBId: string;
    let versionBId: string;

    beforeAll(async () => {
      const p3 = Buffer.from('%PDF-1.4\n% Resume A\n%%EOF');
      const p4 = Buffer.from('%PDF-1.4\n% Resume B\n%%EOF');

      const resA = await uploadResume(p3, 'ResumeA.pdf', { label: 'Resume A', isDefault: true });
      const resB = await uploadResume(p4, 'ResumeB.pdf', { label: 'Resume B', isDefault: false });

      resumeAId = resA.version.resumeId;
      resumeBId = resB.version.resumeId;
      versionBId = resB.version.id;
    });

    it('enforces single default resume when setting new default', async () => {
      await setDefaultResume(resumeBId);

      const resumesList = await getResumes();
      const resumeA = resumesList.find((r) => r.id === resumeAId);
      const resumeB = resumesList.find((r) => r.id === resumeBId);

      expect(resumeB?.isDefault).toBe(true);
      expect(resumeA?.isDefault).toBe(false);
    });

    it('records application attachment snapshot and blocks deletion of attached resume', async () => {
      const testApplicationId = '00000000-0000-0000-0000-000000000001';

      const attachment = await recordResumeAttachment(testApplicationId, versionBId);
      expect(attachment!.applicationId).toBe(testApplicationId);
      expect(attachment!.resumeVersionId).toBe(versionBId);
      expect(attachment!.attachedSha256).toBeDefined();
      expect(attachment!.labelSnapshot).toBe('Resume B');

      // Attempting to delete resumeB must be rejected with CONFLICT
      await expect(deleteResume(resumeBId)).rejects.toThrowError(AppError);
    });

    it('allows deleting an unattached resume', async () => {
      await expect(deleteResume(resumeAId)).resolves.not.toThrow();
      await expect(getResume(resumeAId)).rejects.toThrowError(AppError);
    });
  });

  describe('FR-RES-7: Zero Resume Generation / Modification Invariant Guard', () => {
    it('verifies no PDF generation or document rewriting libraries exist in dependencies', () => {
      const packageJsonPath = path.resolve(process.cwd(), 'package.json');
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      const forbiddenLibs = [
        'pdfkit',
        'jspdf',
        'pdf-lib',
        'docx',
        'html-pdf',
        'puppeteer-pdf',
        'react-pdf',
        '@react-pdf/renderer',
      ];

      for (const lib of forbiddenLibs) {
        expect(allDeps[lib]).toBeUndefined();
      }
    });
  });
});
