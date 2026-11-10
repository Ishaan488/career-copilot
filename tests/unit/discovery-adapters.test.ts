import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  GreenhouseAdapter,
  LeverAdapter,
  AshbyAdapter,
  SmartRecruitersAdapter,
  RssFeedAdapter,
  ManualPasteAdapter,
  createManualListing,
} from '@/modules/discovery';

const fixturesDir = path.resolve(process.cwd(), 'fixtures/jobs');

describe('Discovery Source Adapters (Live Fixtures)', () => {
  describe('Greenhouse Adapter', () => {
    it('extracts real job posting from Greenhouse fixture', () => {
      const adapter = new GreenhouseAdapter();
      const rawJson = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'greenhouse.json'), 'utf8')
      );
      const rawJob = rawJson.jobs[0];

      const rawListing = {
        externalId: String(rawJob.id),
        url: rawJob.absolute_url,
        title: rawJob.title,
        rawPayload: rawJob,
        contentHash: 'hash-1',
      };

      const extracted = adapter.extract(rawListing);

      expect(extracted.externalId).toBe('5426468004');
      expect(extracted.title).toBe('Account Executive, Enterprise');
      expect(extracted.normalizedTitle).toContain('account executive enterprise');
      expect(extracted.seniority).toBe(null); // Account Executive is a sales role, not C-suite executive
      expect(extracted.applicationUrl).toContain('boards.greenhouse.io');
      expect(extracted.canonicalUrl).toBe('https://boards.greenhouse.io/figma/jobs/5426468004');
      expect(extracted.compDisclosed).toBe(true);
      expect(extracted.compMin).toBe('165000');
      expect(extracted.compMax).toBe('190000');
      expect(extracted.compCurrency).toBe('USD');
      expect(extracted.descriptionText).toContain('Figma is growing our team');
    });

    it('detects change when content hash changes', () => {
      const adapter = new GreenhouseAdapter();
      const listing = {
        externalId: '1',
        url: '',
        title: 'Eng',
        rawPayload: {},
        contentHash: 'hash-new',
      };

      expect(adapter.detectChange(undefined, listing)).toBe('new');
      expect(adapter.detectChange({ contentHash: 'hash-new' }, listing)).toBe('unchanged');
      expect(adapter.detectChange({ contentHash: 'hash-old' }, listing)).toBe('changed');
    });
  });

  describe('Lever Adapter', () => {
    it('extracts real job posting from Lever fixture', () => {
      const adapter = new LeverAdapter();
      const rawJson = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'lever.json'), 'utf8')
      );
      const rawJob = rawJson[0];

      const rawListing = {
        externalId: rawJob.id,
        url: rawJob.hostedUrl,
        title: rawJob.text,
        rawPayload: rawJob,
        contentHash: 'hash-lever',
      };

      const extracted = adapter.extract(rawListing);

      expect(extracted.externalId).toBeDefined();
      expect(extracted.title).toBeDefined();
      expect(extracted.locationRaw).toBe('Atlanta, Georgia');
      expect(extracted.employmentType).toBe('full_time');
      expect(extracted.descriptionText).toContain('test job');
    });
  });

  describe('Ashby Adapter', () => {
    it('extracts real job posting from Ashby fixture', () => {
      const adapter = new AshbyAdapter();
      const rawJson = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'ashby.json'), 'utf8')
      );
      const rawJob = rawJson.jobs[0];

      const rawListing = {
        externalId: rawJob.id,
        url: rawJob.jobUrl || '',
        title: rawJob.title,
        rawPayload: rawJob,
        contentHash: 'hash-ashby',
      };

      const extracted = adapter.extract(rawListing);

      expect(extracted.externalId).toBe('d3bc1ced-3ce4-4086-a050-555055dbb1ff');
      expect(extracted.title).toBe('Senior / Staff Fullstack Engineer');
      expect(extracted.seniority).toBe('staff');
      expect(extracted.employmentType).toBe('full_time');
      expect(extracted.locationRaw).toBe('Europe');
    });
  });

  describe('SmartRecruiters Adapter', () => {
    it('extracts real job posting from SmartRecruiters fixture', () => {
      const adapter = new SmartRecruitersAdapter();
      const rawJson = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'smartrecruiters.json'), 'utf8')
      );
      const rawJob = rawJson.content[0];

      const rawListing = {
        externalId: rawJob.id,
        url: 'https://jobs.smartrecruiters.com/smartrecruiters/' + rawJob.id,
        title: rawJob.name,
        rawPayload: rawJob,
        contentHash: 'hash-sr',
      };

      const extracted = adapter.extract(rawListing);

      expect(extracted.externalId).toBe('744000158320111');
      expect(extracted.title).toBe('Senior / Lead Engineering Operations Manager');
      expect(extracted.seniority).toBe('lead');
      expect(extracted.descriptionText).toContain('Engineering Operations');
    });
  });

  describe('Rss Feed Adapter', () => {
    it('extracts structured jobs from RSS fixture', () => {
      const adapter = new RssFeedAdapter();
      const rawListing = {
        externalId: 'job-101-rss',
        url: 'https://example.com/jobs/backend-engineer-101',
        title: 'Senior Backend Engineer (Go / Distributed Systems)',
        rawPayload: {
          title: 'Senior Backend Engineer (Go / Distributed Systems)',
          link: 'https://example.com/jobs/backend-engineer-101',
          guid: 'job-101-rss',
          description: '<p>We are seeking a <strong>Senior Backend Engineer</strong> to design high-throughput microservices. Remote - India or Hybrid Bangalore.</p>',
          pubDate: 'Mon, 10 Nov 2026 12:00:00 GMT',
        },
        contentHash: 'hash-rss',
      };

      const extracted = adapter.extract(rawListing);

      expect(extracted.title).toBe('Senior Backend Engineer (Go / Distributed Systems)');
      expect(extracted.seniority).toBe('senior');
      expect(extracted.workMode).toBe('remote');
      expect(extracted.country).toBe('India');
    });
  });

  describe('Manual Paste Adapter', () => {
    it('wraps and extracts manual job input', () => {
      const adapter = new ManualPasteAdapter();
      const rawListing = createManualListing({
        title: 'Staff Platform Engineer',
        descriptionText: 'Lead our core cloud infrastructure on AWS. Compensation: ₹30–45 LPA.',
        locationRaw: 'Bengaluru, India',
        workMode: 'hybrid',
      });

      const extracted = adapter.extract(rawListing);

      expect(extracted.title).toBe('Staff Platform Engineer');
      expect(extracted.seniority).toBe('staff');
      expect(extracted.workMode).toBe('hybrid');
      expect(extracted.compDisclosed).toBe(true);
      expect(extracted.compCurrency).toBe('INR');
      expect(extracted.compMin).toBe('3000000');
      expect(extracted.compMax).toBe('4500000');
    });
  });
});
