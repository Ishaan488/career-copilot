import { describe, it, expect } from 'vitest';
import {
  cleanJobTitle,
  extractSeniority,
  normalizeJobTitle,
  htmlToText,
  parseLocationAndWorkMode,
  parseEmploymentType,
  parseCompensation,
  hashJobDescription,
} from '@/modules/discovery';

describe('Discovery Normalization (Pure Domain)', () => {
  describe('cleanJobTitle', () => {
    it('strips bracketed requisition IDs', () => {
      expect(cleanJobTitle('Staff Software Engineer [REQ-10492]')).toBe('Staff Software Engineer');
      expect(cleanJobTitle('Backend Developer (Req #5678)')).toBe('Backend Developer');
      expect(cleanJobTitle('Frontend Engineer [12345]')).toBe('Frontend Engineer');
    });

    it('strips trailing requisition numbers', () => {
      expect(cleanJobTitle('Account Executive - 1451')).toBe('Account Executive');
      expect(cleanJobTitle('Product Designer #9876')).toBe('Product Designer');
    });

    it('collapses multiple spaces', () => {
      expect(cleanJobTitle('  Senior   Fullstack   Engineer  ')).toBe('Senior Fullstack Engineer');
    });
  });

  describe('extractSeniority', () => {
    it('extracts intern/junior/mid/senior/lead/staff/principal/director/executive correctly', () => {
      expect(extractSeniority('Engineering Intern (Summer 2026)')).toBe('intern');
      expect(extractSeniority('Associate Software Engineer')).toBe('junior');
      expect(extractSeniority('Mid-level Backend Developer')).toBe('mid');
      expect(extractSeniority('Senior Frontend Engineer')).toBe('senior');
      expect(extractSeniority('Tech Lead - Platform')).toBe('lead');
      expect(extractSeniority('Staff Software Engineer')).toBe('staff');
      expect(extractSeniority('Principal Architect')).toBe('principal');
      expect(extractSeniority('Director of Engineering')).toBe('director');
      expect(extractSeniority('VP of Technology')).toBe('executive');
      expect(extractSeniority('Chief Technology Officer')).toBe('executive');
    });

    it('returns null when no seniority indicator is present', () => {
      expect(extractSeniority('Software Engineer')).toBe(null);
    });
  });

  describe('normalizeJobTitle', () => {
    it('normalizes titles for comparison by lowercasing and removing punctuation', () => {
      expect(normalizeJobTitle('Sr. Backend Engineer - Cloud & Infrastructure [REQ-99]')).toBe(
        'sr backend engineer cloud infrastructure'
      );
    });
  });

  describe('htmlToText and decodeHtmlEntities', () => {
    it('decodes entities and formats HTML into plain text with structure', () => {
      const html = '&lt;p&gt;We are hiring a &lt;strong&gt;Developer&lt;/strong&gt;.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Build APIs&lt;/li&gt;&lt;li&gt;Write tests&lt;/li&gt;&lt;/ul&gt;';
      const text = htmlToText(html);
      expect(text).toContain('We are hiring a Developer.');
      expect(text).toContain('• Build APIs');
      expect(text).toContain('• Write tests');
    });
  });

  describe('parseLocationAndWorkMode', () => {
    it('detects remote work mode and India location', () => {
      const res = parseLocationAndWorkMode('Remote - India');
      expect(res.workMode).toBe('remote');
      expect(res.country).toBe('India');
    });

    it('detects hybrid and Indian city', () => {
      const res = parseLocationAndWorkMode('Bengaluru, Karnataka, India', 'hybrid');
      expect(res.workMode).toBe('hybrid');
      expect(res.city).toBe('Bengaluru');
      expect(res.country).toBe('India');
    });

    it('detects US cities and onsite', () => {
      const res = parseLocationAndWorkMode('San Francisco, CA • New York, NY • United States', 'onsite');
      expect(res.workMode).toBe('onsite');
      expect(res.city).toBe('San Francisco');
      expect(res.country).toBe('United States');
    });
  });

  describe('parseEmploymentType', () => {
    it('parses employment types', () => {
      expect(parseEmploymentType('Regular Full Time (Salary)')).toBe('full_time');
      expect(parseEmploymentType('Part-Time Contractor')).toBe('part_time');
      expect(parseEmploymentType('Internship')).toBe('internship');
      expect(parseEmploymentType('Contract')).toBe('contract');
    });
  });

  describe('parseCompensation', () => {
    it('parses Indian LPA format', () => {
      const res = parseCompensation(null, 'Compensation package: ₹15–25 LPA plus equity.');
      expect(res.compDisclosed).toBe(true);
      expect(res.compCurrency).toBe('INR');
      expect(res.compPeriod).toBe('yearly');
      expect(res.compMin).toBe('1500000');
      expect(res.compMax).toBe('2500000');
    });

    it('parses USD k format', () => {
      const res = parseCompensation(null, 'Base salary: $140k - $180k per annum.');
      expect(res.compDisclosed).toBe(true);
      expect(res.compCurrency).toBe('USD');
      expect(res.compPeriod).toBe('yearly');
      expect(res.compMin).toBe('140000');
      expect(res.compMax).toBe('180000');
    });

    it('parses full USD salary range', () => {
      const res = parseCompensation(null, 'Annual Base Salary Range: $165,000 — $190,000 USD');
      expect(res.compDisclosed).toBe(true);
      expect(res.compCurrency).toBe('USD');
      expect(res.compPeriod).toBe('yearly');
      expect(res.compMin).toBe('165000');
      expect(res.compMax).toBe('190000');
    });

    it('parses hourly rate', () => {
      const res = parseCompensation(null, 'Pay rate: $60 - $80 / hr');
      expect(res.compDisclosed).toBe(true);
      expect(res.compCurrency).toBe('USD');
      expect(res.compPeriod).toBe('hourly');
      expect(res.compMin).toBe('60');
      expect(res.compMax).toBe('80');
    });

    it('handles structured compensation objects', () => {
      const res = parseCompensation({
        min: 120000,
        max: 150000,
        currency: 'USD',
        interval: 'year',
      });
      expect(res.compDisclosed).toBe(true);
      expect(res.compMin).toBe('120000');
      expect(res.compMax).toBe('150000');
      expect(res.compCurrency).toBe('USD');
    });

    it('returns undisclosed when no compensation is mentioned', () => {
      const res = parseCompensation(null, 'Competitive compensation package with great health benefits.');
      expect(res.compDisclosed).toBe(false);
      expect(res.compMin).toBe(null);
    });
  });

  describe('hashJobDescription', () => {
    it('generates consistent SHA-256 hash ignoring surrounding whitespace', () => {
      const hash1 = hashJobDescription('Software Engineer\nBuild distributed systems.');
      const hash2 = hashJobDescription('  Software Engineer  Build distributed systems.  ');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });
});
