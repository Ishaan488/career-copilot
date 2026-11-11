import type { Page, Locator } from 'playwright';
import {
  BlockType,
  ExtractedField,
  ExtractedForm,
  ExtractedFieldOption,
  FieldType,
  FillPlan,
  FillReport,
  PortalDriver,
  PortalDriverCapabilities,
  PrepareResult,
  SubmissionVerificationResult,
  SubmitToken,
} from '../types';
import { isHoneypotElement } from '../honeypot';
import {
  computeFieldKey,
  normalizeLabel,
  resolveElementLabel,
  classifyFieldCategory,
} from '../label-resolver';
import { BrowserError } from '../errors';
import { logger } from '@/shared/logger';

export abstract class BasePortalDriver implements PortalDriver {
  abstract id: 'greenhouse' | 'lever' | 'ashby' | 'generic';
  abstract matches(url: URL): boolean;

  // Invariant (Doc 12 §3, Doc 17 §M11): submit capability is strictly false through Milestone 11
  readonly capabilities: PortalDriverCapabilities = {
    extract: true,
    fill: true,
    submit: false,
    verify: true,
  };

  /**
   * Prepares the page: dismisses standard cookie consent banners and checks for blocks.
   */
  async prepare(page: Page): Promise<PrepareResult> {
    let dismissedBanner = false;

    // Check for cookie banners and dismiss them (only necessary/dismiss/accept)
    try {
      const bannerSelectors = [
        'button#onetrust-accept-btn-handler',
        'button#onetrust-reject-all-handler',
        'button:has-text("Accept all")',
        'button:has-text("Accept Cookies")',
        'button:has-text("I agree")',
        'button:has-text("Dismiss")',
        'button:has-text("Close")',
      ];

      for (const sel of bannerSelectors) {
        const btn = page.locator(sel).first();
        if ((await btn.count()) > 0 && (await btn.isVisible())) {
          await btn.click({ timeout: 2000 }).catch(() => {});
          dismissedBanner = true;
          break;
        }
      }
    } catch {
      // Ignore banner dismissal errors
    }

    const blocked = await this.detectBlock(page);

    return {
      ready: blocked === null,
      blocked,
      dismissedBanner,
    };
  }

  /**
   * Detects portal anti-bot blocks, CAPTCHAs, 403 access denied, or login walls.
   */
  async detectBlock(page: Page): Promise<BlockType | null> {
    try {
      const pageContent = await page.content().then((c) => c.toLowerCase());
      const title = (await page.title()).toLowerCase();

      // CAPTCHA checks
      if (
        pageContent.includes('g-recaptcha') ||
        pageContent.includes('cf-turnstile') ||
        pageContent.includes('hcaptcha') ||
        title.includes('just a moment') ||
        title.includes('robot check') ||
        pageContent.includes('verify you are human')
      ) {
        return 'captcha';
      }

      // Access Denied / 403
      if (
        title.includes('access denied') ||
        title.includes('403 forbidden') ||
        pageContent.includes('access denied') ||
        pageContent.includes('error 1020')
      ) {
        return 'access_denied';
      }

      // Rate Limited / 429
      if (
        title.includes('too many requests') ||
        title.includes('429') ||
        pageContent.includes('rate limit exceeded')
      ) {
        return 'rate_limited';
      }

      // Login Required
      if (
        title.includes('sign in') ||
        title.includes('log in') ||
        (pageContent.includes('please log in to apply') && !pageContent.includes('apply for this job'))
      ) {
        return 'login_required';
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extracts visible, interactive controls from the application page, excluding honeypots.
   */
  async extractForm(page: Page): Promise<ExtractedForm> {
    const rawElements = await page.$$(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea'
    );

    const fields: ExtractedField[] = [];
    const seenFieldKeys = new Set<string>();

    for (const el of rawElements) {
      // 1. Check if honeypot
      const isHoneypot = await isHoneypotElement(el);
      if (isHoneypot) {
        continue;
      }

      // 2. Resolve label & strategies
      const { label, strategy } = await resolveElementLabel(el);
      const normalized = normalizeLabel(label);

      // 3. Determine field type
      const tag = await el.evaluate((e) => e.tagName.toLowerCase());
      const rawType = (await el.getAttribute('type')) || '';
      let type: FieldType = 'text';

      if (tag === 'textarea') {
        type = 'textarea';
      } else if (tag === 'select') {
        const multiple = await el.evaluate((e) => (e as HTMLSelectElement).multiple);
        type = multiple ? 'multiselect' : 'select';
      } else if (rawType === 'email') {
        type = 'email';
      } else if (rawType === 'tel' || rawType === 'phone') {
        type = 'phone';
      } else if (rawType === 'number') {
        type = 'number';
      } else if (rawType === 'date') {
        type = 'date';
      } else if (rawType === 'radio') {
        type = 'radio';
      } else if (rawType === 'checkbox') {
        type = 'checkbox';
      } else if (rawType === 'file') {
        type = 'file';
      } else {
        type = 'text';
      }

      // 4. Required check
      const required = await el.evaluate((e) => {
        return (
          e.hasAttribute('required') ||
          e.getAttribute('aria-required') === 'true' ||
          Boolean(e.closest('label')?.textContent?.includes('*')) ||
          Boolean(e.parentElement?.textContent?.includes('*'))
        );
      });

      // 5. Options extraction
      const options: ExtractedFieldOption[] = [];
      if (tag === 'select') {
        const optValues = await el.evaluate((e) => {
          const select = e as HTMLSelectElement;
          return Array.from(select.options).map((opt) => ({
            label: opt.text.trim(),
            value: opt.value.trim(),
          }));
        });
        options.push(...optValues.filter((o) => o.value !== ''));
      }

      // 6. Name attribute
      const name = (await el.getAttribute('name')) || undefined;

      // 7. Field Key computation
      const fieldKey = computeFieldKey(normalized, type, options);

      // Deduplicate multiple radio buttons or checkboxes of the same group
      if (seenFieldKeys.has(fieldKey)) {
        continue;
      }
      seenFieldKeys.add(fieldKey);

      // 8. Classification
      const category = classifyFieldCategory(label, type, name);

      fields.push({
        fieldKey,
        label,
        type,
        required,
        options,
        selectorStrategy: strategy,
        category,
        pageIndex: 0,
        isHoneypot: false,
      });
    }

    const submitControl = await this.findSubmitControl(page);

    return {
      portal: this.id,
      pages: 1,
      fields,
      hasSubmit: submitControl !== null,
    };
  }

  /**
   * Fills form fields using user-like Playwright interactions.
   */
  async fill(page: Page, plan: FillPlan): Promise<FillReport> {
    const report: FillReport = {
      filled: [],
      skipped: [],
      errors: [],
    };

    const extracted = await this.extractForm(page);
    const fieldMap = new Map(extracted.fields.map((f) => [f.fieldKey, f]));

    for (const planItem of plan.fields) {
      const field = fieldMap.get(planItem.fieldKey);
      if (!field) {
        report.skipped.push(planItem.fieldKey);
        continue;
      }

      if (planItem.decision === 'declined' || planItem.decision === 'left_blank') {
        report.filled.push({
          fieldKey: planItem.fieldKey,
          success: true,
          valueAttempted: null,
        });
        continue;
      }

      if (planItem.value === undefined || planItem.value === null) {
        report.skipped.push(planItem.fieldKey);
        continue;
      }

      try {
        const locator = await this.resolveLocatorForField(page, field);
        if (!locator || (await locator.count()) === 0) {
          throw new BrowserError('ELEMENT_NOT_FOUND', `Could not locate control for field '${field.label}'`);
        }

        const value = planItem.value;

        switch (field.type) {
          case 'textarea':
          case 'text':
          case 'email':
          case 'phone':
          case 'number':
          case 'date': {
            await locator.first().fill(String(value));
            break;
          }

          case 'select': {
            const strVal = String(value);
            // Match by exact value or label
            const matchedOpt = field.options.find(
              (o) => o.value.toLowerCase() === strVal.toLowerCase() || o.label.toLowerCase() === strVal.toLowerCase()
            );
            if (matchedOpt) {
              await locator.first().selectOption({ value: matchedOpt.value });
            } else {
              await locator.first().selectOption({ label: strVal }).catch(async () => {
                await locator.first().selectOption({ value: strVal });
              });
            }
            break;
          }

          case 'checkbox': {
            const shouldCheck = Boolean(value);
            if (shouldCheck) {
              await locator.first().check();
            } else {
              await locator.first().uncheck();
            }
            break;
          }

          case 'radio': {
            const strVal = String(value).toLowerCase();
            const radioLocator = page.locator(`input[type="radio"][value="${strVal}"]`).first();
            if ((await radioLocator.count()) > 0) {
              await radioLocator.check();
            } else {
              await locator.first().check();
            }
            break;
          }

          case 'file': {
            if (plan.resumeFilePath) {
              await this.uploadFile(page, field.fieldKey, plan.resumeFilePath);
            }
            break;
          }

          default: {
            await locator.first().fill(String(value));
            break;
          }
        }

        report.filled.push({
          fieldKey: field.fieldKey,
          success: true,
          valueAttempted: value,
        });
      } catch (err: unknown) {
        const errMsg = (err as Error).message || 'Failed to fill field';
        report.errors.push({
          fieldKey: field.fieldKey,
          error: errMsg,
        });
        report.filled.push({
          fieldKey: field.fieldKey,
          success: false,
          valueAttempted: planItem.value,
          error: errMsg,
        });
      }
    }

    // Handle resume file upload if not handled above
    if (plan.resumeFilePath) {
      const fileField = extracted.fields.find((f) => f.type === 'file');
      if (fileField) {
        try {
          await this.uploadFile(page, fileField.fieldKey, plan.resumeFilePath);
          report.filled.push({
            fieldKey: fileField.fieldKey,
            success: true,
            valueAttempted: plan.resumeFileName || 'resume.pdf',
          });
        } catch (err: unknown) {
          report.errors.push({
            fieldKey: fileField.fieldKey,
            error: (err as Error).message || 'Resume upload failed',
          });
        }
      }
    }

    return report;
  }

  /**
   * Reads back values from the live page for read-back verification.
   */
  async readBack(page: Page, fields: ExtractedField[]): Promise<Record<string, unknown>> {
    const results: Record<string, unknown> = {};

    for (const field of fields) {
      try {
        const locator = await this.resolveLocatorForField(page, field);
        if (!locator || (await locator.count()) === 0) {
          results[field.fieldKey] = null;
          continue;
        }

        const el = locator.first();

        switch (field.type) {
          case 'checkbox': {
            results[field.fieldKey] = await el.isChecked();
            break;
          }

          case 'radio': {
            results[field.fieldKey] = await el.isChecked();
            break;
          }

          case 'select': {
            results[field.fieldKey] = await el.inputValue();
            break;
          }

          case 'file': {
            results[field.fieldKey] = await el.inputValue();
            break;
          }

          default: {
            results[field.fieldKey] = await el.inputValue();
            break;
          }
        }
      } catch {
        results[field.fieldKey] = null;
      }
    }

    return results;
  }

  /**
   * Uploads an untouched original PDF resume using setInputFiles.
   */
  async uploadFile(page: Page, _fieldKey: string, filePath: string): Promise<void> {
    const fileInput = page.locator('input[type="file"]').first();
    const count = await fileInput.count();

    if (count === 0) {
      throw new BrowserError('UPLOAD_FAILED', 'No file upload control found on the page');
    }

    await fileInput.setInputFiles(filePath);
    logger.info({ filePath }, '[BasePortalDriver] Attached file via setInputFiles');
  }

  /**
   * Locates submit button/control on the application form.
   */
  async findSubmitControl(page: Page): Promise<Locator | null> {
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Submit Application")',
      'button:has-text("Submit")',
      'button:has-text("Apply")',
      'a:has-text("Submit Application")',
    ];

    for (const sel of submitSelectors) {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0) {
        return loc;
      }
    }

    return null;
  }

  /**
   * Executes the submission by clicking the submit control with a valid SubmitToken guard.
   * Enforces type-level and runtime token check (Doc 13 §8).
   */
  async submit(page: Page, token: SubmitToken): Promise<{ submitted: boolean }> {
    if (!token) {
      throw new BrowserError('BLOCKED_BY_PORTAL', 'Automated submission requires a valid SubmitToken', { retryable: false });
    }
    if (!this.capabilities.submit) {
      throw new BrowserError(
        'BLOCKED_BY_PORTAL',
        `Driver '${this.id}' does not support automated submission. Manual handover required.`,
        { retryable: false }
      );
    }

    const submitControl = await this.findSubmitControl(page);
    if (!submitControl) {
      throw new BrowserError('ELEMENT_NOT_FOUND', 'Submit control not found on portal page', { retryable: false });
    }

    logger.info({ driver: this.id, applicationId: token.applicationId }, '[PortalDriver] Dispatching submit click');
    await submitControl.click({ timeout: 10000 });
    return { submitted: true };
  }

  /**
   * Verifies submission evidence on the page (confirmation text, URL pattern, DOM elements).
   */
  async verifySubmission(page: Page): Promise<SubmissionVerificationResult> {
    try {
      const url = page.url().toLowerCase();
      const content = await page.content().then((c) => c.toLowerCase());

      // Already applied check
      if (
        content.includes('already applied') ||
        content.includes('already submitted an application') ||
        content.includes('duplicate application')
      ) {
        return {
          status: 'already_applied',
          evidence: { url, matchedText: 'already applied' },
        };
      }

      // Confirmation URL check
      if (url.includes('/confirmation') || url.includes('/thanks') || url.includes('/applied')) {
        return {
          status: 'confirmed',
          evidence: { url, match: 'url_pattern' },
        };
      }

      // Confirmation Text check
      if (
        content.includes('thank you for applying') ||
        content.includes('application has been submitted') ||
        content.includes('application received') ||
        content.includes('we received your application')
      ) {
        return {
          status: 'confirmed',
          evidence: { url, match: 'text_pattern' },
        };
      }

      return {
        status: 'not_confirmed',
      };
    } catch {
      return {
        status: 'unknown',
      };
    }
  }

  /**
   * Resolves a Locator for a given ExtractedField using its ordered selector strategies.
   */
  protected async resolveLocatorForField(page: Page, field: ExtractedField): Promise<Locator | null> {
    for (const strat of field.selectorStrategy) {
      try {
        if (strat.kind === 'label' && strat.name) {
          const loc = page.getByLabel(strat.name, { exact: false });
          if ((await loc.count()) > 0) return loc;
        }

        if (strat.kind === 'css' && strat.sel) {
          const loc = page.locator(strat.sel);
          if ((await loc.count()) > 0) return loc;
        }
      } catch {
        continue;
      }
    }

    // Fallback: match by label text or aria-label
    try {
      const fallback = page.getByLabel(field.label, { exact: false });
      if ((await fallback.count()) > 0) return fallback;
    } catch {
      // ignore
    }

    return null;
  }
}
