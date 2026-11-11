import type { Page, Locator } from 'playwright';
import { BasePortalDriver } from './base';

export class LeverDriver extends BasePortalDriver {
  readonly id = 'lever' as const;

  matches(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    if (host === 'jobs.lever.co') {
      return true;
    }

    if (
      (host === 'localhost' || host === '127.0.0.1') &&
      (url.pathname.includes('lever') || url.searchParams.get('ats') === 'lever')
    ) {
      return true;
    }

    return false;
  }

  override async findSubmitControl(page: Page): Promise<Locator | null> {
    const specificSelectors = [
      'button[data-qa="btn-submit"]',
      '#btn-submit',
      '.template-btn-submit',
      'button:has-text("Submit application")',
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
