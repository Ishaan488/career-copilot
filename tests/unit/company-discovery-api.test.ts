import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getCompanies, POST as postCompany } from '@/app/api/companies/route';
import {
  GET as getCompany,
  PATCH as patchCompany,
  DELETE as deleteCompany,
} from '@/app/api/companies/[id]/route';
import { PUT as putMonitor } from '@/app/api/companies/[id]/monitor/route';
import { POST as postImport } from '@/app/api/companies/import/route';
import {
  companies,
  companyDomains,
  companyCareerPages,
  companyMonitors,
  companyCheckRuns,
  companyProbeCandidates,
  companyImportBatches,
} from '@/db/schema/companies';
import { getDb, closeDbPool } from '@/shared/db';

describe('Company Discovery API Endpoints', () => {
  let createdCompanyId: string;

  beforeAll(async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    const db = getDb();
    await db.delete(companyCheckRuns);
    await db.delete(companyProbeCandidates);
    await db.delete(companyCareerPages);
    await db.delete(companyMonitors);
    await db.delete(companyDomains);
    await db.delete(companyImportBatches);
    await db.delete(companies);
  });

  afterAll(async () => {
    await closeDbPool();
  });

  it('creates a new company via POST /api/companies', async () => {
    const req = new NextRequest('http://127.0.0.1:3000/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Razorpay Software',
        primaryDomain: 'razorpay.com',
        careerUrl: 'https://jobs.lever.co/razorpay',
        industry: 'FinTech',
      }),
    });

    const res = await postCompany(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.name).toBe('Razorpay Software');
    expect(data.primaryDomain).toBe('razorpay.com');
    expect(data.monitor).toBeDefined();

    createdCompanyId = data.id;
  });

  it('lists companies with search filter via GET /api/companies', async () => {
    const req = new NextRequest('http://127.0.0.1:3000/api/companies?q=razorpay');
    const res = await getCompanies(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].id).toBe(createdCompanyId);
  });

  it('retrieves detailed company info via GET /api/companies/[id]', async () => {
    const req = new NextRequest(`http://127.0.0.1:3000/api/companies/${createdCompanyId}`);
    const res = await getCompany(req, { params: Promise.resolve({ id: createdCompanyId }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(createdCompanyId);
    expect(data.careerPages).toHaveLength(1);
  });

  it('returns 404 for non-existent company via GET /api/companies/[id]', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const req = new NextRequest(`http://127.0.0.1:3000/api/companies/${fakeId}`);
    const res = await getCompany(req, { params: Promise.resolve({ id: fakeId }) });
    expect(res.status).toBe(404);
  });

  it('updates company details via PATCH /api/companies/[id]', async () => {
    const req = new NextRequest(`http://127.0.0.1:3000/api/companies/${createdCompanyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notes: 'Updated via API test',
      }),
    });

    const res = await patchCompany(req, { params: Promise.resolve({ id: createdCompanyId }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.notes).toBe('Updated via API test');
  });

  it('pauses and resumes monitoring via PUT /api/companies/[id]/monitor', async () => {
    // Pause
    const pauseReq = new NextRequest(`http://127.0.0.1:3000/api/companies/${createdCompanyId}/monitor`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    const pauseRes = await putMonitor(pauseReq, { params: Promise.resolve({ id: createdCompanyId }) });
    expect(pauseRes.status).toBe(200);
    const pausedData = await pauseRes.json();
    expect(pausedData.monitor?.enabled).toBe(false);

    // Resume
    const resumeReq = new NextRequest(`http://127.0.0.1:3000/api/companies/${createdCompanyId}/monitor`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    const resumeRes = await putMonitor(resumeReq, { params: Promise.resolve({ id: createdCompanyId }) });
    expect(resumeRes.status).toBe(200);
    const resumedData = await resumeRes.json();
    expect(resumedData.monitor?.enabled).toBe(true);
  });

  it('excludes company via DELETE /api/companies/[id]', async () => {
    const req = new NextRequest(`http://127.0.0.1:3000/api/companies/${createdCompanyId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'API exclude test' }),
    });

    const res = await deleteCompany(req, { params: Promise.resolve({ id: createdCompanyId }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.discoveryStatus).toBe('excluded');
    expect(data.excludeReason).toBe('API exclude test');
    expect(data.monitor?.enabled).toBe(false);
  });

  it('imports bulk company list via POST /api/companies/import', async () => {
    const csvContent = `name,domain
ApiImportA,apiimporta.com
ApiImportB,apiimportb.com
`;

    const req = new NextRequest('http://127.0.0.1:3000/api/companies/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: csvContent,
        source: 'csv',
      }),
    });

    const res = await postImport(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.acceptedCount).toBe(2);
    expect(data.batchId).toBeDefined();
  });
});
