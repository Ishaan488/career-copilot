import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getResumes, POST as postResume } from '@/app/api/resumes/route';
import { GET as getResume, DELETE as deleteResume } from '@/app/api/resumes/[id]/route';
import { POST as postDefault } from '@/app/api/resumes/[id]/default/route';
import { GET as getPreview } from '@/app/api/resumes/versions/[versionId]/preview/route';
import { GET as getDownload } from '@/app/api/resumes/versions/[versionId]/download/route';
import { resumes, resumeVersions, resumeAttachments } from '@/db/schema/resumes';
import { getDb, closeDbPool } from '@/shared/db';

const SAMPLE_PDF = Buffer.from('%PDF-1.4\n% Test Resume API\n%%EOF');

describe('Resume API Endpoints', () => {
  let createdResumeId: string;
  let createdVersionId: string;

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

  it('uploads a PDF resume via multipart POST /api/resumes', async () => {
    const formData = new FormData();
    const file = new File([SAMPLE_PDF], 'my_resume.pdf', { type: 'application/pdf' });
    formData.append('file', file);
    formData.append('label', 'API Test Resume');
    formData.append('isDefault', 'true');

    const req = new NextRequest('http://127.0.0.1:3000/api/resumes', {
      method: 'POST',
      body: formData,
    });

    const res = await postResume(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.isDuplicate).toBe(false);
    expect(data.version.label).toBe('API Test Resume');

    createdResumeId = data.version.resumeId;
    createdVersionId = data.version.id;
  });

  it('fetches resumes list via GET /api/resumes', async () => {
    const res = await getResumes();
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].id).toBe(createdResumeId);
  });

  it('fetches single resume via GET /api/resumes/[id]', async () => {
    const req = new NextRequest(`http://127.0.0.1:3000/api/resumes/${createdResumeId}`);
    const res = await getResume(req, { params: Promise.resolve({ id: createdResumeId }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(createdResumeId);
    expect(data.versions.length).toBe(1);
  });

  it('serves inline preview with application/pdf header via GET /api/resumes/versions/[versionId]/preview', async () => {
    const req = new NextRequest(`http://127.0.0.1:3000/api/resumes/versions/${createdVersionId}/preview`);
    const res = await getPreview(req, { params: Promise.resolve({ versionId: createdVersionId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('inline');

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    expect(buffer.equals(SAMPLE_PDF)).toBe(true);
  });

  it('serves attachment download via GET /api/resumes/versions/[versionId]/download', async () => {
    const req = new NextRequest(`http://127.0.0.1:3000/api/resumes/versions/${createdVersionId}/download`);
    const res = await getDownload(req, { params: Promise.resolve({ versionId: createdVersionId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
  });

  it('sets default resume via POST /api/resumes/[id]/default', async () => {
    const req = new NextRequest(`http://127.0.0.1:3000/api/resumes/${createdResumeId}/default`, { method: 'POST' });
    const res = await postDefault(req, { params: Promise.resolve({ id: createdResumeId }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isDefault).toBe(true);
  });

  it('deletes resume via DELETE /api/resumes/[id]', async () => {
    const req = new NextRequest(`http://127.0.0.1:3000/api/resumes/${createdResumeId}`, { method: 'DELETE' });
    const res = await deleteResume(req, { params: Promise.resolve({ id: createdResumeId }) });
    expect(res.status).toBe(200);
  });
});
