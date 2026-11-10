import { describe, it, expect } from 'vitest';
import {
  normalizeCanonicalUrl,
  getWordShingles,
  calculateJaccardSimilarity,
  evaluateDeduplication,
} from '@/modules/discovery';

describe('Discovery Deduplication (Pure Domain)', () => {
  describe('normalizeCanonicalUrl', () => {
    it('strips tracking parameters and fragments', () => {
      const url = 'https://boards.greenhouse.io/figma/jobs/5426468004?gh_jid=5426468004&utm_source=linkedin&utm_campaign=hiring#apply';
      const normalized = normalizeCanonicalUrl(url);
      expect(normalized).toBe('https://boards.greenhouse.io/figma/jobs/5426468004');
    });

    it('normalizes uppercase hostnames and trailing slashes', () => {
      const url = 'HTTPS://JOBS.LEVER.CO/ACME/12345/';
      const normalized = normalizeCanonicalUrl(url);
      expect(normalized).toBe('https://jobs.lever.co/acme/12345');
    });
  });

  describe('Shingle and Jaccard similarity', () => {
    it('calculates 1.0 similarity for identical text', () => {
      const s1 = getWordShingles('We are looking for a senior backend engineer with deep Go experience.');
      const s2 = getWordShingles('We are looking for a senior backend engineer with deep Go experience.');
      expect(calculateJaccardSimilarity(s1, s2)).toBe(1.0);
    });

    it('calculates high similarity for minor differences', () => {
      const text1 = 'We are seeking a senior backend engineer to build scalable microservices using Go and PostgreSQL. Candidates must have at least 5 years of experience.';
      const text2 = 'We are seeking a senior backend engineer to build scalable microservices using Go and PostgreSQL database. Candidates must have at least 5 years of experience.';
      const s1 = getWordShingles(text1, 5);
      const s2 = getWordShingles(text2, 5);
      const sim = calculateJaccardSimilarity(s1, s2);
      expect(sim).toBeGreaterThanOrEqual(0.60);
    });

    it('calculates 0.0 similarity for disjoint text', () => {
      const s1 = getWordShingles('Backend engineer designing distributed database systems.');
      const s2 = getWordShingles('Product marketing manager driving digital customer campaigns.');
      expect(calculateJaccardSimilarity(s1, s2)).toBe(0);
    });
  });

  describe('evaluateDeduplication', () => {
    const baseExisting = {
      id: 'job-101',
      canonicalUrl: 'https://boards.greenhouse.io/figma/jobs/101',
      companyId: 'comp-1',
      normalizedTitle: 'senior backend engineer',
      locationRaw: 'San Francisco, CA',
      descriptionText: 'We are looking for a senior backend engineer to design scalable microservices using Go and PostgreSQL. You will collaborate with product designers and frontend teams to deliver robust cloud solutions.',
    };

    it('matches exact canonical URLs', () => {
      const decision = evaluateDeduplication({
        incoming: {
          url: 'https://boards.greenhouse.io/figma/jobs/101?gh_jid=101&utm_source=twitter',
          normalizedTitle: 'senior backend engineer',
          descriptionText: 'Different description text entirely',
        },
        existing: baseExisting,
      });

      expect(decision.type).toBe('exact_url');
      if (decision.type === 'exact_url') {
        expect(decision.jobId).toBe('job-101');
      }
    });

    it('merges identical jobs with same company, title, location and >= 92% similarity', () => {
      const decision = evaluateDeduplication({
        incoming: {
          url: 'https://other-board.com/postings/999',
          companyId: 'comp-1',
          normalizedTitle: 'senior backend engineer',
          locationRaw: 'San Francisco, CA',
          descriptionText: 'We are looking for a senior backend engineer to design scalable microservices using Go and PostgreSQL. You will collaborate with product designers and frontend teams to deliver robust cloud solutions.',
        },
        existing: baseExisting,
      });

      expect(decision.type).toBe('merge_match');
      if (decision.type === 'merge_match') {
        expect(decision.similarity).toBeGreaterThanOrEqual(0.92);
      }
    });

    it('flags possible_duplicate when same company and title but different location', () => {
      const decision = evaluateDeduplication({
        incoming: {
          url: 'https://other-board.com/postings/102',
          companyId: 'comp-1',
          normalizedTitle: 'senior backend engineer',
          locationRaw: 'Bengaluru, India',
          descriptionText: 'Short summary of responsibilities.',
        },
        existing: baseExisting,
      });

      expect(decision.type).toBe('possible_duplicate');
    });

    it('flags possible_duplicate when similarity is in [0.80, 0.92)', () => {
      const slightlyDifferentText = 'We are looking for a senior backend engineer to design scalable microservices using Go and PostgreSQL. You will collaborate with product designers and frontend teams to deliver cloud solutions on AWS infrastructure.';
      const decision = evaluateDeduplication({
        incoming: {
          companyId: 'comp-1',
          normalizedTitle: 'senior software engineer',
          locationRaw: 'San Francisco, CA',
          descriptionText: slightlyDifferentText,
        },
        existing: baseExisting,
      });

      expect(decision.type).toBe('possible_duplicate');
    });

    it('returns distinct for unrelated positions', () => {
      const decision = evaluateDeduplication({
        incoming: {
          companyId: 'comp-2',
          normalizedTitle: 'lead product designer',
          locationRaw: 'London, UK',
          descriptionText: 'Design intuitive design systems in Figma for our web platform.',
        },
        existing: baseExisting,
      });

      expect(decision.type).toBe('distinct');
    });
  });
});
