import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AtsFixtureServer } from '../../fixtures/ats-site/server';
import {
  getDriverForUrl,
  GreenhouseDriver,
  LeverDriver,
  AshbyDriver,
  GenericDriver,
  computeFieldKey,
  normalizeLabel,
  classifyFieldCategory,
  createSubmitToken,
  SubmitToken,
} from '@/modules/browser';
import { chromium, Browser } from 'playwright';

describe('Browser Module & Portal Drivers', () => {
  let fixtureServer: AtsFixtureServer;
  let baseUrl: string;
  let browser: Browser;

  beforeAll(async () => {
    fixtureServer = new AtsFixtureServer();
    baseUrl = await fixtureServer.start();
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });

  afterAll(async () => {
    await browser.close().catch(() => {});
    await fixtureServer.stop().catch(() => {});
  });

  describe('Driver Registry & Matching', () => {
    it('matches Greenhouse portal URLs', () => {
      const driver = getDriverForUrl('https://boards.greenhouse.io/acme/jobs/12345');
      expect(driver.id).toBe('greenhouse');
    });

    it('matches Lever portal URLs', () => {
      const driver = getDriverForUrl('https://jobs.lever.co/beta/67890');
      expect(driver.id).toBe('lever');
    });

    it('matches Ashby portal URLs', () => {
      const driver = getDriverForUrl('https://jobs.ashbyhq.com/gamma/54321');
      expect(driver.id).toBe('ashby');
    });

    it('falls back to generic driver for unknown domains', () => {
      const driver = getDriverForUrl('https://careers.unknowncompany.com/openings/1');
      expect(driver.id).toBe('generic');
    });

    it('enforces submit capabilities per driver (M12)', () => {
      expect(new GreenhouseDriver().capabilities.submit).toBe(true);
      expect(new LeverDriver().capabilities.submit).toBe(true);
      expect(new AshbyDriver().capabilities.submit).toBe(true);
      expect(new GenericDriver().capabilities.submit).toBe(false);
    });
  });

  describe('Label Resolver & Category Classifier', () => {
    it('normalizes label text by trimming, collapsing spaces, and lowercase', () => {
      expect(normalizeLabel('  First Name: *  ')).toBe('first name');
      expect(normalizeLabel('Are you legally authorized to work?')).toBe('are you legally authorized to work?');
    });

    it('computes deterministic SHA-256 field keys', () => {
      const key1 = computeFieldKey('first name', 'text', []);
      const key2 = computeFieldKey('first name', 'text', []);
      const key3 = computeFieldKey('last name', 'text', []);

      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key1).toHaveLength(64);
    });

    it('classifies core protected categories correctly', () => {
      expect(classifyFieldCategory('I agree to the terms and declarations', 'checkbox')).toBe('legal');
      expect(classifyFieldCategory('Are you subject to any non-compete bond?', 'radio')).toBe('bond');
      expect(classifyFieldCategory('Consent to background verification check', 'checkbox')).toBe('consent');
      expect(classifyFieldCategory('Are you authorized to work in the US?', 'select')).toBe('work_auth');
      expect(classifyFieldCategory('Desired compensation / expected salary', 'text')).toBe('salary');
      expect(classifyFieldCategory('Voluntary self-identification of gender and race', 'select')).toBe('eeo');
      expect(classifyFieldCategory('Social Security Number (SSN)', 'text')).toBe('sensitive');
      expect(classifyFieldCategory('Your Full Name', 'text')).toBe('profile');
    });
  });

  describe('Form Extraction & Honeypot Exclusion', () => {
    it('extracts interactive fields from Greenhouse fixture while skipping honeypot', async () => {
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/greenhouse/job-123`);

      const driver = getDriverForUrl(`${baseUrl}/greenhouse/job-123`);
      expect(driver.id).toBe('greenhouse');

      const extracted = await driver.extractForm(page);

      expect(extracted.portal).toBe('greenhouse');
      expect(extracted.fields.length).toBeGreaterThan(5);

      // Verify honeypot field hp_website was NOT extracted
      const hpField = extracted.fields.find(
        (f) => f.label.toLowerCase().includes('honeypot') || f.fieldKey.includes('hp_website')
      );
      expect(hpField).toBeUndefined();

      // Verify standard fields exist
      const firstNameField = extracted.fields.find((f) => f.label.toLowerCase().includes('first name'));
      expect(firstNameField).toBeDefined();
      expect(firstNameField?.required).toBe(true);

      const emailField = extracted.fields.find((f) => f.type === 'email');
      expect(emailField).toBeDefined();
      expect(emailField?.required).toBe(true);

      const workAuthField = extracted.fields.find((f) => f.category === 'work_auth');
      expect(workAuthField).toBeDefined();
      expect(workAuthField?.options.length).toBeGreaterThanOrEqual(2);

      await page.close();
    });

    it('extracts interactive fields from Lever fixture', async () => {
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/lever/job-456`);

      const driver = getDriverForUrl(`${baseUrl}/lever/job-456`);
      expect(driver.id).toBe('lever');

      const extracted = await driver.extractForm(page);
      expect(extracted.fields.length).toBeGreaterThanOrEqual(4);

      const nameField = extracted.fields.find((f) => f.label.toLowerCase().includes('name'));
      expect(nameField).toBeDefined();

      await page.close();
    });
  });

  describe('Block & Submission Detection', () => {
    it('detects CAPTCHA block', async () => {
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/blocked/captcha`);

      const driver = getDriverForUrl(page.url());
      const block = await driver.detectBlock(page);

      expect(block).toBe('captcha');
      await page.close();
    });

    it('detects login required block', async () => {
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/blocked/login`);

      const driver = getDriverForUrl(page.url());
      const block = await driver.detectBlock(page);

      expect(block).toBe('login_required');
      await page.close();
    });

    it('detects 403 access denied block', async () => {
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/blocked/access-denied`);

      const driver = getDriverForUrl(page.url());
      const block = await driver.detectBlock(page);

      expect(block).toBe('access_denied');
      await page.close();
    });

    it('detects already applied state', async () => {
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/status/already-applied`);

      const driver = getDriverForUrl(page.url());
      const res = await driver.verifySubmission(page);

      expect(res.status).toBe('already_applied');
      await page.close();
    });

    it('verifies submission confirmation page', async () => {
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/confirmation`);

      const driver = getDriverForUrl(page.url());
      const res = await driver.verifySubmission(page);

      expect(res.status).toBe('confirmed');
      await page.close();
    });
  });

  describe('Form Filling and Read-Back', () => {
    it('fills interactive inputs and accurately reads back values', async () => {
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/greenhouse/job-123`);

      const driver = getDriverForUrl(`${baseUrl}/greenhouse/job-123`);
      const extracted = await driver.extractForm(page);

      const firstNameField = extracted.fields.find((f) => f.label.toLowerCase().includes('first name'))!;
      const lastNameField = extracted.fields.find((f) => f.label.toLowerCase().includes('last name'))!;
      const emailField = extracted.fields.find((f) => f.type === 'email')!;
      const workAuthField = extracted.fields.find((f) => f.category === 'work_auth')!;
      const agreeTermsField = extracted.fields.find((f) => f.type === 'checkbox')!;

      const fillPlan = {
        fields: [
          { fieldKey: firstNameField.fieldKey, value: 'Alice', type: 'text' },
          { fieldKey: lastNameField.fieldKey, value: 'Smith', type: 'text' },
          { fieldKey: emailField.fieldKey, value: 'alice.smith@example.com', type: 'email' },
          { fieldKey: workAuthField.fieldKey, value: 'yes', type: 'select' },
          { fieldKey: agreeTermsField.fieldKey, value: true, type: 'checkbox' },
        ],
      };

      const report = await driver.fill(page, fillPlan);

      expect(report.errors).toHaveLength(0);
      expect(report.filled.length).toBeGreaterThanOrEqual(5);

      const readBack = await driver.readBack(page, [
        firstNameField,
        lastNameField,
        emailField,
        agreeTermsField,
      ]);

      expect(readBack[firstNameField.fieldKey]).toBe('Alice');
      expect(readBack[lastNameField.fieldKey]).toBe('Smith');
      expect(readBack[emailField.fieldKey]).toBe('alice.smith@example.com');
      expect(readBack[agreeTermsField.fieldKey]).toBe(true);

      await page.close();
    });
  });

  describe('Automated Submission & Token Guard (M12)', () => {
    it('rejects submit execution without valid SubmitToken', async () => {
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/greenhouse/job-123`);

      const driver = new GreenhouseDriver();
      await expect(driver.submit(page, null as unknown as SubmitToken)).rejects.toThrow();

      await page.close();
    });

    it('rejects submit execution on driver with submit capability disabled (e.g. generic)', async () => {
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/generic/job-123`);

      const driver = new GenericDriver();
      const token = createSubmitToken({
        applicationId: 'app-test-1',
        submissionId: 'sub-test-1',
        summaryHash: 'hash-test-1',
      });

      await expect(driver.submit(page, token)).rejects.toThrow(/does not support automated submission/);

      await page.close();
    });

    it('submits form on capable driver and verifies confirmation', async () => {
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/greenhouse/job-123`);

      // Disable client-side validation constraint so test submits smoothly to /confirmation
      await page.evaluate(() => {
        const form = document.querySelector('form');
        if (form) form.noValidate = true;
      });

      const driver = new GreenhouseDriver();
      const token = createSubmitToken({
        applicationId: 'app-test-1',
        submissionId: 'sub-test-1',
        summaryHash: 'hash-test-1',
      });

      const [_navResult] = await Promise.all([
        page.waitForNavigation({ waitUntil: 'load' }).catch(() => null),
        driver.submit(page, token),
      ]);

      const verification = await driver.verifySubmission(page);
      expect(verification.status).toBe('confirmed');

      await page.close();
    });
  });
});
