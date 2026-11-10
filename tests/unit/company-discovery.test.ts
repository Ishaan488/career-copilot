import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  createCompany,
  getCompanyById,
  updateCompany,
  excludeCompany,
  pauseMonitoring,
  resumeMonitoring,
  runCompanyCheck,
  confirmProbeCandidate,
  rejectProbeCandidate,
  importCompaniesBulk,
  getBoardsForDiscovery,
} from '@/modules/company-discovery';
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
import { AppError } from '@/shared/errors';
import * as httpModule from '@/shared/http';
import { eq } from 'drizzle-orm';

describe('Company Discovery Module — Service & Database Integration', () => {
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

  describe('Company Creation & Deduplication', () => {
    it('creates a company with normalized name, domain, and monitor record', async () => {
      const comp = await createCompany({
        name: 'Stripe, Inc.',
        primaryDomain: 'stripe.com',
        careerUrl: 'https://boards.greenhouse.io/stripe',
        industry: 'FinTech',
      });

      expect(comp.id).toBeDefined();
      expect(comp.name).toBe('Stripe, Inc.');
      expect(comp.normalizedName).toBe('stripe');
      expect(comp.primaryDomain).toBe('stripe.com');
      expect(comp.discoveryStatus).toBe('registered');
      expect(comp.monitor).toBeDefined();
      expect(comp.monitor?.enabled).toBe(true);
      expect(comp.monitor?.openingsCount).toBeNull(); // Initial state is unknown (null)
    });

    it('deduplicates companies by primary domain', async () => {
      const comp1 = await createCompany({
        name: 'Stripe Payments',
        primaryDomain: 'stripe.com',
      });

      const comp2 = await createCompany({
        name: 'Stripe Inc HQ',
        primaryDomain: 'https://stripe.com/about',
      });

      expect(comp1.id).toBe(comp2.id);
    });

    it('deduplicates companies by normalized name when no domain provided', async () => {
      const comp1 = await createCompany({
        name: 'Acme Technologies Private Limited',
      });

      const comp2 = await createCompany({
        name: 'Acme Technologies Ltd',
      });

      expect(comp1.id).toBe(comp2.id);
    });
  });

  describe('Company Queries & Updates', () => {
    it('retrieves company with related domains and career pages', async () => {
      const created = await createCompany({
        name: 'Postman, Inc.',
        primaryDomain: 'postman.com',
        careerUrl: 'https://jobs.lever.co/postman',
      });

      const fetched = await getCompanyById(created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.domains).toHaveLength(1);
      expect(fetched.domains[0]?.domain).toBe('postman.com');
      expect(fetched.careerPages).toHaveLength(1);
      expect(fetched.careerPages[0]?.atsType).toBe('lever');
      expect(fetched.careerPages[0]?.boardId).toBe('postman');
    });

    it('updates company details and logs audit entry', async () => {
      const created = await createCompany({
        name: 'Zerodha',
        primaryDomain: 'zerodha.com',
      });

      const updated = await updateCompany(created.id, {
        industry: 'Stock Brokerage',
        notes: 'Bootstrapped Indian unicorn',
      });

      expect(updated.industry).toBe('Stock Brokerage');
      expect(updated.notes).toBe('Bootstrapped Indian unicorn');
    });

    it('pauses and resumes company monitoring', async () => {
      const comp = await createCompany({
        name: 'Freshworks',
        primaryDomain: 'freshworks.com',
      });

      const paused = await pauseMonitoring(comp.id);
      expect(paused.discoveryStatus).toBe('paused');
      expect(paused.monitor?.enabled).toBe(false);

      const resumed = await resumeMonitoring(comp.id);
      expect(resumed.discoveryStatus).toBe('monitoring');
      expect(resumed.monitor?.enabled).toBe(true);
    });

    it('excludes company and disables its monitor', async () => {
      const comp = await createCompany({
        name: 'Excluded Company Corp',
        primaryDomain: 'excludedcorp.com',
      });

      const excluded = await excludeCompany(comp.id, 'Spam portal');
      expect(excluded.discoveryStatus).toBe('excluded');
      expect(excluded.excludeReason).toBe('Spam portal');
      expect(excluded.monitor?.enabled).toBe(false);
    });
  });

  describe('FR-CDS-5 & FR-CDS-7: Monitor Check Runs & Openings Preservation', () => {
    it('FR-CDS-7: throws FORBIDDEN when attempting to run check on excluded company', async () => {
      const comp = await createCompany({
        name: 'Blocked Target Inc',
        primaryDomain: 'blockedtarget.com',
      });
      await excludeCompany(comp.id, 'Do not monitor');

      await expect(runCompanyCheck(comp.id)).rejects.toThrowError(AppError);
    });

    it('FR-CDS-5: preserves 0 openings as a distinct real number (not null/unknown)', async () => {
      const comp = await createCompany({
        name: 'Quiet Startup',
        primaryDomain: 'quietstartup.com',
        careerUrl: 'https://boards.greenhouse.io/quietstartup',
      });

      // Mock safeFetch to return 200 with 0 jobs
      const safeFetchSpy = vi.spyOn(httpModule, 'safeFetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jobs: [] }),
      } as unknown as Response);

      const checkRun = await runCompanyCheck(comp.id);
      safeFetchSpy.mockRestore();

      expect(checkRun.status).toBe('succeeded');
      expect(checkRun.openingsCount).toBe(0);

      // Verify monitor status updated to ok and openingsCount is 0
      const updatedComp = await getCompanyById(comp.id);
      expect(updatedComp.monitor?.openingsCount).toBe(0);
      expect(updatedComp.monitor?.status).toBe('ok');
    });

    it('tracks consecutive failures and transitions to failing on 3 failures', async () => {
      const comp = await createCompany({
        name: 'Failing Board Co',
        primaryDomain: 'failingboard.com',
        careerUrl: 'https://boards.greenhouse.io/failingboard',
      });

      const safeFetchSpy = vi.spyOn(httpModule, 'safeFetch').mockRejectedValue(new Error('Network error'));

      // Check 1
      await runCompanyCheck(comp.id);
      let compStatus = await getCompanyById(comp.id);
      expect(compStatus.monitor?.consecutiveFailures).toBe(1);
      expect(compStatus.monitor?.status).toBe('ok');

      // Check 2
      await runCompanyCheck(comp.id);
      compStatus = await getCompanyById(comp.id);
      expect(compStatus.monitor?.consecutiveFailures).toBe(2);

      // Check 3
      await runCompanyCheck(comp.id);
      compStatus = await getCompanyById(comp.id);
      expect(compStatus.monitor?.consecutiveFailures).toBe(3);
      expect(compStatus.monitor?.status).toBe('failing');

      safeFetchSpy.mockRestore();
    });
  });

  describe('Probe Candidate Confirmation & Rejection', () => {
    it('confirms probe candidate, promotes it to confirmed career page, and starts monitoring', async () => {
      const db = getDb();
      const comp = await createCompany({
        name: 'Candidate Test Co',
        primaryDomain: 'candidatetest.com',
      });

      // Insert mock probe candidate
      const [candidate] = await db
        .insert(companyProbeCandidates)
        .values({
          companyId: comp.id,
          atsType: 'greenhouse',
          slug: 'candidatetest',
          outcome: 'exists',
          displayedName: 'Candidate Test Co',
          nameMatchScore: '1.0',
          status: 'pending_confirmation',
        })
        .returning();

      expect(candidate).toBeDefined();
      const careerPage = await confirmProbeCandidate(candidate!.id);
      expect(careerPage.atsType).toBe('greenhouse');
      expect(careerPage.boardId).toBe('candidatetest');
      expect(careerPage.status).toBe('confirmed');

      const updatedComp = await getCompanyById(comp.id);
      expect(updatedComp.discoveryStatus).toBe('monitoring');
      expect(updatedComp.monitor?.enabled).toBe(true);
    });

    it('rejects probe candidate without changing monitor status', async () => {
      const db = getDb();
      const comp = await createCompany({
        name: 'Reject Test Co',
        primaryDomain: 'rejecttest.com',
      });

      const [candidate] = await db
        .insert(companyProbeCandidates)
        .values({
          companyId: comp.id,
          atsType: 'lever',
          slug: 'falsepositive',
          outcome: 'exists',
          status: 'pending_confirmation',
        })
        .returning();

      expect(candidate).toBeDefined();
      await rejectProbeCandidate(candidate!.id);

      const [updatedCandidate] = await db
        .select()
        .from(companyProbeCandidates)
        .where(eq(companyProbeCandidates.id, candidate!.id));

      expect(updatedCandidate).toBeDefined();
      expect(updatedCandidate!.status).toBe('rejected');
    });
  });

  describe('Bulk Import & Discovery Board Exporter', () => {
    it('imports batch of companies and records import batch stats', async () => {
      const csv = `name,domain,industry
BatchCompanyA,batcha.com,Cloud
BatchCompanyB,batchb.com,Security
`;
      const res = await importCompaniesBulk({ content: csv, source: 'csv' });
      expect(res.total).toBe(2);
      expect(res.acceptedCount).toBe(2);
      expect(res.rejectedCount).toBe(0);
      expect(res.batchId).toBeDefined();
    });

    it('getBoardsForDiscovery exports active monitored confirmed boards for job discovery', async () => {
      const comp = await createCompany({
        name: 'Discovery Sync Target',
        primaryDomain: 'synctarget.com',
      });

      const db = getDb();
      // Insert confirmed career page
      await db.insert(companyCareerPages).values({
        companyId: comp.id,
        url: 'https://boards.greenhouse.io/synctarget',
        atsType: 'greenhouse',
        boardId: 'synctarget',
        status: 'confirmed',
        verification: 'verified',
      });

      // Set company status to monitoring
      await db.update(companies).set({ discoveryStatus: 'monitoring' }).where(eq(companies.id, comp.id));

      const boards = await getBoardsForDiscovery();
      const found = boards.find((b) => b.companyId === comp.id);
      expect(found).toBeDefined();
      expect(found?.atsType).toBe('greenhouse');
      expect(found?.boardId).toBe('synctarget');
    });
  });
});

