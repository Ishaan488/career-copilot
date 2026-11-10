import { describe, it, expect } from 'vitest';
import { chromium } from '@playwright/test';

describe('Playwright Chromium Launch Smoke Test', () => {
  it('launches and closes Chromium in headless mode', async () => {
    const browser = await chromium.launch({ headless: true });
    expect(browser.isConnected()).toBe(true);
    const version = browser.version();
    expect(version).toBeTruthy();
    await browser.close();
  });
});
