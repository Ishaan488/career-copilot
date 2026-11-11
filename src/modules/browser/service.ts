import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@/shared/logger';
import { BrowserError } from './errors';
import { captureRedactedScreenshot } from './redact';
import { getDriverForUrl } from './drivers';
import { BrowserSessionOptions, PortalDriver } from './types';

export class BrowserService {
  private browserInstance: Browser | null = null;

  /**
   * Returns or launches the shared Chromium browser instance.
   */
  async getBrowser(): Promise<Browser> {
    if (!this.browserInstance || !this.browserInstance.isConnected()) {
      const isHeadless = process.env.BROWSER_HEADLESS !== 'false';
      this.browserInstance = await chromium.launch({
        headless: isHeadless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
      logger.info({ headless: isHeadless }, '[BrowserService] Launched Playwright Chromium');
    }

    return this.browserInstance;
  }

  /**
   * Executes an action callback with an isolated context and page.
   * Cleans up temporary browser directory and handles errors/redacted screenshots.
   */
  async withPage<T>(
    urlStr: string,
    options: BrowserSessionOptions,
    action: (page: Page, driver: PortalDriver) => Promise<T>
  ): Promise<T> {
    const browser = await this.getBrowser();
    const tempDir = path.resolve(process.cwd(), 'data', 'tmp', 'browser', options.workflowId);
    await fs.mkdir(tempDir, { recursive: true });

    let context: BrowserContext | null = null;
    let page: Page | null = null;
    const driver = getDriverForUrl(urlStr);

    try {
      context = await browser.newContext({
        viewport: { width: 1366, height: 900 },
        locale: options.locale || 'en-US',
        timezoneId: options.timezone || 'UTC',
        acceptDownloads: false,
        permissions: [],
        serviceWorkers: 'block',
      });

      // Set default timeouts (Doc 12 §2: navigation 30s, action 10s)
      context.setDefaultNavigationTimeout(30000);
      context.setDefaultTimeout(10000);

      page = await context.newPage();

      // Navigate to target URL
      logger.info({ url: urlStr, driver: driver.id }, '[BrowserService] Navigating to portal URL');
      await page.goto(urlStr, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Run driver preparation
      const prep = await driver.prepare(page);
      if (prep.blocked) {
        throw new BrowserError(
          'BLOCKED_BY_PORTAL',
          `Portal blocked access with reason '${prep.blocked}'`,
          { details: { blocked: prep.blocked } }
        );
      }

      // Execute user action with the configured driver
      return await action(page, driver);
    } catch (err: unknown) {
      if (page) {
        const screenshotPath = await captureRedactedScreenshot(
          page,
          options.applicationId,
          'error-step'
        );
        logger.warn(
          { err, screenshotPath, workflowId: options.workflowId },
          '[BrowserService] Captured redacted error screenshot'
        );
      }

      if (err instanceof BrowserError) {
        throw err;
      }

      const errMsg = (err as Error).message || '';
      if (errMsg.includes('Timeout') || errMsg.includes('timeout')) {
        throw new BrowserError('NAVIGATION_TIMEOUT', errMsg, { cause: err });
      }
      if (errMsg.includes('Target page, context or browser has been closed') || errMsg.includes('Crash')) {
        throw new BrowserError('BROWSER_CRASHED', errMsg, { cause: err });
      }

      throw new BrowserError('UNKNOWN', errMsg, { cause: err });
    } finally {
      if (context) {
        await context.close().catch(() => {});
      }
      // Clean up temporary session directory (Doc 12 §6)
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Sweeps orphaned temporary browser session directories older than 1 hour (Doc 12 §6).
   */
  async sweepOrphanTempDirs(): Promise<number> {
    try {
      const baseDir = path.resolve(process.cwd(), 'data', 'tmp', 'browser');
      const entries = await fs.readdir(baseDir, { withFileTypes: true }).catch(() => []);
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      let removed = 0;

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const entryPath = path.join(baseDir, entry.name);
          const stat = await fs.stat(entryPath);
          if (stat.mtimeMs < oneHourAgo) {
            await fs.rm(entryPath, { recursive: true, force: true }).catch(() => {});
            removed++;
          }
        }
      }

      if (removed > 0) {
        logger.info({ removed }, '[BrowserService] Swept orphaned browser temporary directories');
      }

      return removed;
    } catch {
      return 0;
    }
  }

  /**
   * Graceful shutdown of Chromium instance.
   */
  async close(): Promise<void> {
    if (this.browserInstance) {
      await this.browserInstance.close().catch(() => {});
      this.browserInstance = null;
    }
  }
}

export const browserService = new BrowserService();
