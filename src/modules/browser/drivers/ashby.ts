import type { Page, Locator } from 'playwright';
import { BasePortalDriver } from './base';

export class AshbyDriver extends BasePortalDriver {
  readonly id = 'ashby' as const;

  matches(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    if (host === 'jobs.ashbyhq.com') {
      return true;
    }

    if (
      (host === 'localhost' || host === '127.0.0.1') &&
      (url.pathname.includes('ashby') || url.searchParams.get('ats') === 'ashby')
    ) {
      return true;
    }

    return false;
  }

  override async findSubmitControl(page: Page): Promise<Locator | null> {
    const specificSelectors = [
      'button[data-qa="application-submit-button"]',
      'button[type="submit"]',
      'button:has-text("Submit Application")',
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
