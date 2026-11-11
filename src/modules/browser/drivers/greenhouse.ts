import type { Page, Locator } from 'playwright';
import { BasePortalDriver } from './base';

export class GreenhouseDriver extends BasePortalDriver {
  readonly id = 'greenhouse' as const;

  matches(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
      return true;
    }

    // Allow test fixture URLs on localhost when running under test
    if (
      (host === 'localhost' || host === '127.0.0.1') &&
      (url.pathname.includes('greenhouse') || url.searchParams.get('ats') === 'greenhouse')
    ) {
      return true;
    }

    return false;
  }

  override async findSubmitControl(page: Page): Promise<Locator | null> {
    const specificSelectors = [
      '#submit_app',
      'input[id="submit_app"]',
      'button#submit_app',
      'input[type="submit"][value*="Submit"]',
      'button[type="submit"]:has-text("Submit Application")',
    ];

    for (const sel of specificSelectors) {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0) {
        return loc;
      }
    }

    return super.findSubmitControl(page);
  }
}
