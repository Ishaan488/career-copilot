import { test, expect } from '@playwright/test';

test.describe('Playwright Chromium Launch Smoke Test', () => {
  test('launches and closes Chromium in headless mode', async ({ page }) => {
    await page.goto('about:blank');
    expect(page.url()).toBe('about:blank');
  });
});
