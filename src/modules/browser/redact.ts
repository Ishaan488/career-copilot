import type { Page } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@/shared/logger';

export const REDACTION_CSS = `
  /* Redaction overlay for sensitive form inputs and labels */
  input, textarea, select {
    color: transparent !important;
    text-shadow: 0 0 10px rgba(0, 0, 0, 0.8) !important;
    background-color: #71717a !important;
  }

  input[type="password"],
  input[type="email"],
  input[type="tel"],
  [data-sensitive="true"] {
    color: transparent !important;
    background-color: #18181b !important;
    text-shadow: none !important;
  }

  /* Blur out sensitive label text or container text if matching patterns */
  .redact-sensitive {
    filter: blur(8px) !important;
  }
`;

/**
 * Injects redaction styling and DOM sanitization into the active page before capturing screenshots.
 */
export async function injectRedaction(page: Page): Promise<void> {
  try {
    await page.addStyleTag({ content: REDACTION_CSS });

    await page.evaluate(() => {
      const sensitiveKeywords = [
        'email',
        'phone',
        'mobile',
        'address',
        'street',
        'zip',
        'postal',
        'salary',
        'compensation',
        'pay',
        'ssn',
        'social security',
        'passport',
        'dob',
        'birth',
        'gender',
        'race',
        'ethnicity',
        'veteran',
        'disability',
      ];

      // Mark labels matching sensitive keywords
      const labels = document.querySelectorAll('label, legend, span, p');
      labels.forEach((el) => {
        const text = (el.textContent || '').toLowerCase();
        if (sensitiveKeywords.some((kw) => text.includes(kw))) {
          el.classList.add('redact-sensitive');
        }
      });
    });
  } catch (err) {
    logger.warn({ err }, '[Browser:Redact] Failed to inject redaction styles before screenshot');
  }
}

/**
 * Captures a redacted screenshot to the configured screenshot storage path.
 */
export async function captureRedactedScreenshot(
  page: Page,
  applicationId: string,
  stepName: string
): Promise<string | null> {
  try {
    const timestamp = Date.now();
    const screenshotDir = path.resolve(process.cwd(), 'data', 'screenshots', applicationId);
    await fs.mkdir(screenshotDir, { recursive: true });

    const fileName = `${timestamp}-${stepName.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    const fullPath = path.join(screenshotDir, fileName);

    await injectRedaction(page);
    await page.screenshot({ path: fullPath, fullPage: true });

    return fullPath;
  } catch (err) {
    logger.warn({ err, applicationId, stepName }, '[Browser:Redact] Failed to capture redacted screenshot');
    return null;
  }
}
