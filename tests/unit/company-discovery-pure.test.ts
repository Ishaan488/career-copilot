import { describe, it, expect } from 'vitest';
import {
  generateSlugs,
  detectAtsFromUrl,
  detectAtsFromHtml,
  parseCompanyImport,
} from '@/modules/company-discovery';
import { parseRobotsTxt } from '@/shared/http';

describe('Company Discovery — Pure Functions', () => {
  describe('Slug Generation', () => {
    it('strips common corporate suffixes and generates clean slugs', () => {
      const slugs = generateSlugs('Stripe, Inc.', 'stripe.com');
      expect(slugs).toContain('stripe');
      expect(slugs.length).toBeLessThanOrEqual(8);
      for (const s of slugs) {
        expect(s).not.toContain(' ');
        expect(s.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('handles Indian corporate suffixes like Private Limited and Pvt Ltd', () => {
      const slugs = generateSlugs('Razorpay Software Private Limited', 'razorpay.com');
      expect(slugs).toContain('razorpay');
      expect(slugs).not.toContain('private');
      expect(slugs).not.toContain('limited');
    });

    it('extracts domain root correctly', () => {
      const slugs = generateSlugs('Zerodha Broking Ltd', 'https://zerodha.com');
      expect(slugs).toContain('zerodha');
    });

    it('handles hyphenated names and multi-word names', () => {
      const slugs = generateSlugs('Postman Labs', 'postman.com');
      expect(slugs).toContain('postman');
    });

    it('returns empty array when given empty inputs', () => {
      expect(generateSlugs('', null)).toEqual([]);
    });
  });

  describe('ATS Detection from URL', () => {
    it('detects Greenhouse standard URLs and tokens', () => {
      const res1 = detectAtsFromUrl('https://boards.greenhouse.io/stripe');
      expect(res1).not.toBeNull();
      expect(res1?.atsType).toBe('greenhouse');
      expect(res1?.boardId).toBe('stripe');
      expect(res1?.isSupported).toBe(true);

      const res2 = detectAtsFromUrl('https://job-boards.greenhouse.io/figma/jobs/12345');
      expect(res2?.atsType).toBe('greenhouse');
      expect(res2?.boardId).toBe('figma');

      const res3 = detectAtsFromUrl('https://boards.greenhouse.io/embed/job_board?for=stripe');
      expect(res3?.atsType).toBe('greenhouse');
      expect(res3?.boardId).toBe('stripe');
    });

    it('detects Lever job board URLs', () => {
      const res = detectAtsFromUrl('https://jobs.lever.co/spotify');
      expect(res).not.toBeNull();
      expect(res?.atsType).toBe('lever');
      expect(res?.boardId).toBe('spotify');
      expect(res?.isSupported).toBe(true);
    });

    it('detects Ashby job board URLs', () => {
      const res = detectAtsFromUrl('https://jobs.ashbyhq.com/linear');
      expect(res).not.toBeNull();
      expect(res?.atsType).toBe('ashby');
      expect(res?.boardId).toBe('linear');
      expect(res?.isSupported).toBe(true);
    });

    it('detects SmartRecruiters URLs', () => {
      const res = detectAtsFromUrl('https://jobs.smartrecruiters.com/AcmeCorp');
      expect(res).not.toBeNull();
      expect(res?.atsType).toBe('smartrecruiters');
      expect(res?.boardId).toBe('AcmeCorp');
      expect(res?.isSupported).toBe(true);
    });

    it('detects unsupported enterprise ATS platforms without throwing', () => {
      const workday = detectAtsFromUrl('https://acme.myworkdayjobs.com/careers');
      expect(workday?.atsType).toBe('workday');
      expect(workday?.isSupported).toBe(false);

      const darwinbox = detectAtsFromUrl('https://swiggy.darwinbox.in/jobs');
      expect(darwinbox?.atsType).toBe('darwinbox');
      expect(darwinbox?.isSupported).toBe(false);

      const oracle = detectAtsFromUrl('https://oracle.taleo.net/careersection/default');
      expect(oracle?.atsType).toBe('oracle');
      expect(oracle?.isSupported).toBe(false);

      const successfactors = detectAtsFromUrl('https://jobs.successfactors.com/corp');
      expect(successfactors?.atsType).toBe('successfactors');
      expect(successfactors?.isSupported).toBe(false);
    });

    it('returns null for generic non-ATS URLs', () => {
      expect(detectAtsFromUrl('https://google.com')).toBeNull();
      expect(detectAtsFromUrl('https://example.com/about')).toBeNull();
    });
  });

  describe('ATS Detection from HTML', () => {
    it('detects Greenhouse script embeds', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <script src="https://boards.greenhouse.io/embed/job_board.js?for=airbnb"></script>
          </head>
          <body>
            <div id="grnh_app"></div>
          </body>
        </html>
      `;
      const detected = detectAtsFromHtml(html);
      expect(detected).not.toBeNull();
      expect(detected?.atsType).toBe('greenhouse');
      expect(detected?.boardId).toBe('airbnb');
      expect(detected?.isSupported).toBe(true);
    });

    it('detects Lever links inside HTML body', () => {
      const html = `
        <div>
          <h1>Join our team</h1>
          <p>Explore opportunities <a href="https://jobs.lever.co/postman">at our careers board</a>.</p>
        </div>
      `;
      const detected = detectAtsFromHtml(html);
      expect(detected).not.toBeNull();
      expect(detected?.atsType).toBe('lever');
      expect(detected?.boardId).toBe('postman');
      expect(detected?.isSupported).toBe(true);
    });

    it('detects Ashby iframe embed inside HTML', () => {
      const html = `
        <div class="careers-wrapper">
          <iframe src="https://jobs.ashbyhq.com/openai" width="100%" height="800"></iframe>
        </div>
      `;
      const detected = detectAtsFromHtml(html);
      expect(detected).not.toBeNull();
      expect(detected?.atsType).toBe('ashby');
      expect(detected?.boardId).toBe('openai');
      expect(detected?.isSupported).toBe(true);
    });
  });

  describe('Bulk Import Parser', () => {
    it('parses header-driven CSV correctly', () => {
      const csv = `name,domain,career_url,industry
Stripe,stripe.com,https://boards.greenhouse.io/stripe,FinTech
Postman,postman.com,https://jobs.lever.co/postman,DevTools
`;
      const res = parseCompanyImport(csv, 'csv');
      expect(res.accepted).toHaveLength(2);
      expect(res.rejected).toHaveLength(0);
      expect(res.accepted[0]?.name).toBe('Stripe');
      expect(res.accepted[0]?.domain).toBe('stripe.com');
      expect(res.accepted[0]?.careerUrl).toBe('https://boards.greenhouse.io/stripe');
      expect(res.accepted[1]?.name).toBe('Postman');
    });

    it('parses line-by-line plaintext paste with domains and names', () => {
      const paste = `
Stripe
zerodha.com
Razorpay, razorpay.com
`;
      const res = parseCompanyImport(paste, 'paste');
      expect(res.accepted).toHaveLength(3);
      expect(res.accepted[0]?.name).toBe('Stripe');
      expect(res.accepted[1]?.domain).toBe('zerodha.com');
      expect(res.accepted[1]?.name).toBe('Zerodha');
      expect(res.accepted[2]?.name).toBe('Razorpay');
      expect(res.accepted[2]?.domain).toBe('razorpay.com');
    });

    it('rejects empty or duplicate rows within the batch', () => {
      const paste = `
Stripe, stripe.com
Stripe, stripe.com
a
`;
      const res = parseCompanyImport(paste, 'paste');
      expect(res.accepted).toHaveLength(1);
      expect(res.rejected).toHaveLength(2);
      expect(res.rejected[0]?.reason).toContain('Duplicate');
      expect(res.rejected[1]?.reason).toContain('too short');
    });
  });

  describe('Robots.txt Parser', () => {
    it('parses disallow rules for all user agents and specific bots', () => {
      const robots = `
User-agent: Googlebot
Disallow: /admin

User-agent: *
Disallow: /careers/private
Disallow: /api/
Allow: /careers/public
`;
      const disallows = parseRobotsTxt(robots, 'CareerCopilot');
      expect(disallows).toContain('/careers/private');
      expect(disallows).toContain('/api/');
      expect(disallows).not.toContain('/admin');
    });
  });
});
