import type { ElementHandle, Page } from 'playwright';

/**
 * Common honeypot field names or ID patterns used by anti-spam plugins and ATS systems.
 */
export const HONEYPOT_NAME_PATTERNS = [
  /honeypot/i,
  /^hp_/i,
  /_hp$/i,
  /^website$/i,
  /^url_check$/i,
  /^fax$/i,
  /^phone_confirm$/i,
  /^email_confirm$/i,
  /^hidden_field/i,
  /bot_check/i,
  /trap/i,
];

/**
 * Checks if a given input/select/textarea element is a honeypot field.
 */
export async function isHoneypotElement(element: ElementHandle<SVGElement | HTMLElement>): Promise<boolean> {
  try {
    const isVisible = await element.isVisible();
    if (!isVisible) {
      return true;
    }

    const evaluation = await element.evaluate((el) => {
      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0' ||
        style.position === 'absolute' && (parseInt(style.left, 10) < -1000 || parseInt(style.top, 10) < -1000)
      ) {
        return { isHidden: true, reason: 'css_hidden' };
      }

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return { isHidden: true, reason: 'zero_bounding_box' };
      }

      // Check aria-hidden
      if (el.getAttribute('aria-hidden') === 'true' || el.closest('[aria-hidden="true"]')) {
        return { isHidden: true, reason: 'aria_hidden' };
      }

      // Check tabindex="-1" with suspicious input attributes
      const tabIndex = el.getAttribute('tabindex');
      const name = el.getAttribute('name') || '';
      const id = el.getAttribute('id') || '';
      const className = el.getAttribute('class') || '';

      const isTrapName =
        /honeypot/i.test(name) ||
        /honeypot/i.test(id) ||
        /honeypot/i.test(className) ||
        /^hp_/i.test(name) ||
        /trap/i.test(name);

      if (tabIndex === '-1' && isTrapName) {
        return { isHidden: true, reason: 'tabindex_trap' };
      }

      if (isTrapName) {
        return { isHidden: true, reason: 'trap_name' };
      }

      return { isHidden: false };
    });

    return evaluation.isHidden;
  } catch {
    return false;
  }
}

/**
 * Scans page and returns selector or IDs of detected honeypot fields.
 */
export async function detectHoneypotFieldsOnPage(page: Page): Promise<string[]> {
  try {
    const honeypotKeys = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
      const traps: string[] = [];

      inputs.forEach((el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const name = (el.getAttribute('name') || '').toLowerCase();
        const id = (el.getAttribute('id') || '').toLowerCase();
        const cls = (el.getAttribute('class') || '').toLowerCase();

        const isHidden =
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          parseFloat(style.opacity) === 0 ||
          rect.width === 0 ||
          rect.height === 0 ||
          el.getAttribute('aria-hidden') === 'true' ||
          Boolean(el.closest('[aria-hidden="true"]'));

        const isTrapNamed =
          name.includes('honeypot') ||
          id.includes('honeypot') ||
          cls.includes('honeypot') ||
          name.startsWith('hp_') ||
          name.includes('bot_check');

        if (isHidden || isTrapNamed) {
          traps.push(id || name || el.getAttribute('placeholder') || 'anonymous_trap');
        }
      });

      return traps;
    });

    return honeypotKeys;
  } catch {
    return [];
  }
}
