import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { companyResearchService } from '@/modules/companies/service';
import { CompanyResearchProvider, CompanyTargetInput, CompanyResearchResult } from '@/modules/companies/domain/types';
import { companies, companyResearch, companyResearchEvidence } from '@/db/schema/companies';
import { getDb, closeDbPool } from '@/shared/db';
import { GET as getCompanyResearchRoute, POST as postCompanyResearchRoute } from '@/app/api/companies/[id]/research/route';
import { eq } from 'drizzle-orm';

class MockResearchProvider implements CompanyResearchProvider {
  name = 'mock-provider';
  callCount = 0;

  async research(target: CompanyTargetInput): Promise<CompanyResearchResult> {
    this.callCount += 1;
    return {
      provider: 'mock-provider',
      companyId: target.id,
      companyName: target.name,
      domain: target.primaryDomain || 'acme-test.org',
      signals: {
        hasOfficialDomain: true,
        isHttps: true,
        hasCareerPage: true,
        atsType: 'greenhouse',
        hasAboutPage: true,
        hasPhysicalAddress: true,
        hasContactEmailOrPhone: true,
        socialLinks: ['https://linkedin.com/company/acmetest'],
        industry: 'Technology',
      },
      evidence: [
        {
          signalType: 'official_domain',
          sourceUrl: `https://${target.primaryDomain || 'acme-test.org'}`,
          contentSnippet: `${target.name} - Official Technology Organization`,
          confidence: 0.95,
          capturedAt: new Date(),
        },
        {
          signalType: 'contact_info',
          sourceUrl: `https://${target.primaryDomain || 'acme-test.org'}/contact`,
          contentSnippet: 'Direct Inquiry: contact@acme-test.org',
          confidence: 0.9,
          capturedAt: new Date(),
        },
        {
          signalType: 'careers_portal',
          sourceUrl: `https://${target.primaryDomain || 'acme-test.org'}/careers`,
          contentSnippet: 'Explore careers at Acme Test',
          confidence: 0.9,
          capturedAt: new Date(),
        },
      ],
      researchedAt: new Date(),
    };
  }
}

describe('Company Research Service & API Endpoints (Milestone 8)', () => {
  let testCompanyId: string;
  const mockProvider = new MockResearchProvider();

  beforeAll(async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    companyResearchService.setProvider(mockProvider);

    const db = getDb();
    await db.delete(companyResearchEvidence);
    await db.delete(companyResearch);
    await db.delete(companies);

    const [inserted] = await db
      .insert(companies)
      .values({
        name: 'Acme Test Corp',
        normalizedName: 'acmetestcorp',
        primaryDomain: 'acme-test.org',
        origin: 'manual',
        discoveryStatus: 'registered',
      })
      .returning();

    if (!inserted) throw new Error('Failed to insert test company');
    testCompanyId = inserted.id;
  });

  afterAll(async () => {
    await closeDbPool();
  });

  it('performs company research, persists assessment and verifiable evidence with 180-day retention', async () => {
    const report = await companyResearchService.researchCompany(testCompanyId, { force: true });

    expect(report.companyId).toBe(testCompanyId);
    expect(report.legitimacyStatus).toBe('verified');
    expect(report.legitimacyScore).toBeGreaterThanOrEqual(70);
    expect(report.result.provider).toBe('mock-provider');
    expect(report.result.evidence.length).toBe(3);
    expect(mockProvider.callCount).toBe(1);

    // Verify DB persistence
    const db = getDb();
    const [dbRecord] = await db
      .select()
      .from(companyResearch)
      .where(eq(companyResearch.companyId, testCompanyId));

    expect(dbRecord).toBeDefined();
    if (!dbRecord) throw new Error('Missing dbRecord');
    expect(dbRecord.legitimacyStatus).toBe('verified');
    expect(Number(dbRecord.legitimacyScore)).toBeGreaterThanOrEqual(70);

    // Retention invariant: expiresAt should be roughly 180 days in future
    const expectedExpiration = new Date();
    expectedExpiration.setDate(expectedExpiration.getDate() + 179);
    expect(new Date(dbRecord.expiresAt).getTime()).toBeGreaterThan(expectedExpiration.getTime());

    // Verify evidence items persisted
    const evidenceRows = await db
      .select()
      .from(companyResearchEvidence)
      .where(eq(companyResearchEvidence.researchId, dbRecord.id));

    expect(evidenceRows.length).toBe(3);
    expect(evidenceRows[0]?.signalType).toBe('official_domain');
    expect(evidenceRows[0]?.sourceUrl).toContain('acme-test.org');
    expect(evidenceRows[0]?.contentSnippet).toContain('Acme Test');
  });

  it('returns cached research record on subsequent calls unless force is specified', async () => {
    const initialCallCount = mockProvider.callCount;

    // Run research without force
    const cached = await companyResearchService.researchCompany(testCompanyId);

    expect(cached.companyId).toBe(testCompanyId);
    expect(cached.legitimacyStatus).toBe('verified');
    // Provider should NOT have been called again
    expect(mockProvider.callCount).toBe(initialCallCount);
  });

  it('forces re-research when force: true is provided', async () => {
    const initialCallCount = mockProvider.callCount;

    const fresh = await companyResearchService.researchCompany(testCompanyId, { force: true });

    expect(fresh.companyId).toBe(testCompanyId);
    expect(mockProvider.callCount).toBe(initialCallCount + 1);
  });

  it('retrieves full research report including evidence via getCompanyResearch', async () => {
    const fullReport = await companyResearchService.getCompanyResearch(testCompanyId);

    expect(fullReport).not.toBeNull();
    expect(fullReport?.companyId).toBe(testCompanyId);
    expect(fullReport?.companyName).toBe('Acme Test Corp');
    expect(fullReport?.legitimacyStatus).toBe('verified');
    expect(fullReport?.evidence.length).toBe(3);
    expect(fullReport?.evidence[0]?.contentSnippet).toBeDefined();
  });

  it('lists recent company research via listRecentResearch', async () => {
    const recent = await companyResearchService.listRecentResearch(10);

    expect(recent.length).toBeGreaterThanOrEqual(1);
    expect(recent[0]?.companyId).toBe(testCompanyId);
    expect(recent[0]?.companyName).toBe('Acme Test Corp');
    expect(recent[0]?.legitimacyStatus).toBe('verified');
  });

  it('serves research report via GET /api/companies/[id]/research', async () => {
    const req = new NextRequest(`http://127.0.0.1:3000/api/companies/${testCompanyId}/research`);
    const params = Promise.resolve({ id: testCompanyId });

    const res = await getCompanyResearchRoute(req, { params });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.companyId).toBe(testCompanyId);
    expect(body.legitimacyStatus).toBe('verified');
    expect(body.evidence).toHaveLength(3);
  });

  it('triggers on-demand research via POST /api/companies/[id]/research', async () => {
    const req = new NextRequest(`http://127.0.0.1:3000/api/companies/${testCompanyId}/research`, {
      method: 'POST',
    });
    const params = Promise.resolve({ id: testCompanyId });

    const res = await postCompanyResearchRoute(req, { params });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.companyId).toBe(testCompanyId);
    expect(body.legitimacyStatus).toBe('verified');
    expect(body.result.provider).toBe('mock-provider');
  });

  it('returns 404 for unknown company ID on GET /api/companies/[id]/research', async () => {
    const req = new NextRequest('http://127.0.0.1:3000/api/companies/00000000-0000-0000-0000-000000000000/research');
    const params = Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' });

    const res = await getCompanyResearchRoute(req, { params });
    expect(res.status).toBe(404);
  });
});
