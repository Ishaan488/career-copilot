import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '@/shared/db';
import {
  companies,
  companyCareerPages,
  companyMonitors,
  jobSources,
  jobs,
  jobSourceListings,
  jobStatusHistory,
} from '@/db/schema';
import {
  reconcileSources,
  createManualJob,
  searchJobs,
  getJob,
  transitionJobStatus,
  runSourceSync,
  createManualSource,
  listSources,
} from '@/modules/discovery';
import { eq } from 'drizzle-orm';

describe('Discovery Service Integration', () => {
  const db = getDb();

  beforeEach(async () => {
    // Clean up relevant tables
    await db.delete(jobStatusHistory);
    await db.delete(jobSourceListings);
    await db.delete(jobs);
    await db.delete(jobSources);
    await db.delete(companyCareerPages);
    await db.delete(companyMonitors);
    await db.delete(companies);
  });

  describe('reconcileSources', () => {
    it('creates derived job_sources from confirmed company career pages', async () => {
      // 1. Create company
      const [company] = await db
        .insert(companies)
        .values({
          name: 'Stripe Inc',
          normalizedName: 'stripe inc',
          primaryDomain: 'stripe.com',
          discoveryStatus: 'monitoring',
        })
        .returning();

      // 2. Create monitor
      await db.insert(companyMonitors).values({
        companyId: company.id,
        enabled: true,
      });

      // 3. Create confirmed career page
      const [careerPage] = await db
        .insert(companyCareerPages)
        .values({
          companyId: company.id,
          url: 'https://boards.greenhouse.io/stripe',
          atsType: 'greenhouse',
          boardId: 'stripe',
          status: 'confirmed',
        })
        .returning();

      // 4. Run reconcile
      const res = await reconcileSources();
      expect(res.createdCount).toBe(1);
      expect(res.reconciledCount).toBe(1);

      // Verify job_sources row
      const [source] = await db
        .select()
        .from(jobSources)
        .where(eq(jobSources.careerPageId, careerPage.id));

      expect(source).toBeDefined();
      expect(source.name).toBe('Stripe Inc (greenhouse)');
      expect(source.type).toBe('greenhouse');
      expect(source.origin).toBe('derived_from_company');
      expect(source.companyId).toBe(company.id);
    });
  });

  describe('createManualJob and getJob', () => {
    it('creates a canonical job with listing and status history', async () => {
      const { job, listing } = await createManualJob({
        title: 'Lead Site Reliability Engineer',
        descriptionText: 'Maintain Kubernetes clusters and global multi-region telemetry. ₹35–50 LPA.',
        locationRaw: 'Bengaluru, India',
        workMode: 'hybrid',
      });

      expect(job.id).toBeDefined();
      expect(job.title).toBe('Lead Site Reliability Engineer');
      expect(job.seniority).toBe('lead');
      expect(job.workMode).toBe('hybrid');
      expect(job.compDisclosed).toBe(true);
      expect(job.status).toBe('new');

      expect(listing.jobId).toBe(job.id);
      expect(listing.status).toBe('active');

      // Fetch via getJob
      const fetched = await getJob(job.id);
      expect(fetched.id).toBe(job.id);
      expect(fetched.listings).toHaveLength(1);
      expect(fetched.history).toHaveLength(1);
      expect(fetched.history[0]?.toStatus).toBe('new');
    });
  });

  describe('searchJobs', () => {
    it('searches and filters jobs by status and search terms', async () => {
      await createManualJob({
        title: 'Senior Frontend Engineer',
        descriptionText: 'React, TypeScript and Tailwind CSS application development.',
        locationRaw: 'Remote - India',
        workMode: 'remote',
      });

      await createManualJob({
        title: 'Junior QA Tester',
        descriptionText: 'Manual test plans and API automation.',
        locationRaw: 'Onsite Mumbai',
        workMode: 'onsite',
      });

      const resAll = await searchJobs();
      expect(resAll.total).toBe(2);

      const resRemote = await searchJobs({ workMode: 'remote' });
      expect(resRemote.total).toBe(1);
      expect(resRemote.jobs[0]?.title).toBe('Senior Frontend Engineer');

      const resSearch = await searchJobs({ searchTerm: 'React' });
      expect(resSearch.total).toBe(1);
      expect(resSearch.jobs[0]?.title).toBe('Senior Frontend Engineer');
    });
  });

  describe('transitionJobStatus', () => {
    it('transitions job status and appends history', async () => {
      const { job } = await createManualJob({
        title: 'Backend Engineer',
        descriptionText: 'Node.js and PostgreSQL microservices.',
      });

      // Transition new -> saved -> shortlisted per state machine
      await transitionJobStatus(job.id, 'saved', 'user', 'Saved for review');
      const updated = await transitionJobStatus(job.id, 'shortlisted', 'user', 'Fits primary stack');
      expect(updated.status).toBe('shortlisted');
      expect(updated.statusReason).toBe('Fits primary stack');

      const fetched = await getJob(job.id);
      expect(fetched.status).toBe('shortlisted');
      expect(fetched.history).toHaveLength(3);
      expect(fetched.history[0]?.toStatus).toBe('shortlisted');
      expect(fetched.history[0]?.reason).toBe('Fits primary stack');
    });
  });

  describe('listSources and manual source creation', () => {
    it('creates and lists custom RSS source', async () => {
      const source = await createManualSource({
        name: 'Tech Job Feed',
        type: 'rss_feed',
        config: { feedUrl: 'https://example.com/feed.xml' },
      });

      expect(source.id).toBeDefined();
      expect(source.type).toBe('rss_feed');

      const sources = await listSources();
      expect(sources.length).toBeGreaterThanOrEqual(1);
      const found = sources.find((s) => s.id === source.id);
      expect(found).toBeDefined();
    });
  });
});
