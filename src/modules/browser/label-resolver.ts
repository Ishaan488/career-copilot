import crypto from 'node:crypto';
import type { ElementHandle } from 'playwright';
import { FieldType, ExtractedFieldOption, SelectorStrategy } from './types';

/**
 * Normalizes a label string by collapsing whitespace, removing asterisks/colons, and converting to lowercase.
 */
export function normalizeLabel(rawLabel: string): string {
  return rawLabel
    .replace(/[*:\s]+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Computes a deterministic SHA-256 field key per Doc 12 §4:
 * sha256(normalizedLabel|type|sortedOptions)
 */
export function computeFieldKey(
  normalizedLabel: string,
  type: FieldType,
  options: ExtractedFieldOption[] = []
): string {
  const sortedOptionValues = options
    .map((o) => `${o.value}:${o.label}`)
    .sort()
    .join(',');

  const raw = `${normalizedLabel}|${type}|${sortedOptionValues}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Resolves the visible label of an interactive element using the 6-step priority order from Doc 12 §4:
 * 1. aria-label
 * 2. <label for="...">
 * 3. wrapping <label>
 * 4. aria-labelledby
 * 5. preceding text / legend / fieldset legend
 * 6. placeholder
 */
export async function resolveElementLabel(
  element: ElementHandle<SVGElement | HTMLElement>
): Promise<{ label: string; strategy: SelectorStrategy[] }> {
  const result = await element.evaluate((el) => {
    // 1. aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) {
      return {
        label: ariaLabel.trim(),
        strategy: [{ kind: 'role', sel: `[aria-label="${ariaLabel.trim()}"]` }],
      };
    }

    // 2. <label for="...">
    const id = el.getAttribute('id');
    if (id) {
      const labelFor = document.querySelector(`label[for="${id}"]`);
      if (labelFor && labelFor.textContent?.trim()) {
        return {
          label: labelFor.textContent.trim(),
          strategy: [
            { kind: 'css', sel: `#${id}` },
            { kind: 'label', sel: `label[for="${id}"]`, name: labelFor.textContent.trim() },
          ],
        };
      }
    }

    // 3. wrapping <label>
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.textContent?.trim()) {
      // Remove the element's own text if any, grab outer label text
      const clone = parentLabel.cloneNode(true) as HTMLElement;
      const childInput = clone.querySelector('input, select, textarea');
      if (childInput) childInput.remove();
      const text = clone.textContent?.trim();
      if (text) {
        return {
          label: text,
          strategy: [{ kind: 'label', sel: 'label', name: text }],
        };
      }
    }

    // 4. aria-labelledby
    const ariaLabelledBy = el.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const referencedEl = document.getElementById(ariaLabelledBy);
      if (referencedEl && referencedEl.textContent?.trim()) {
        return {
          label: referencedEl.textContent.trim(),
          strategy: [{ kind: 'css', sel: `#${ariaLabelledBy}` }],
        };
      }
    }

    // 5. preceding text / legend / fieldset legend
    const fieldset = el.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend && legend.textContent?.trim()) {
        return {
          label: legend.textContent.trim(),
          strategy: [{ kind: 'css', sel: 'fieldset legend', name: legend.textContent.trim() }],
        };
      }
    }

    // 6. placeholder
    const placeholder = el.getAttribute('placeholder');
    if (placeholder && placeholder.trim()) {
      return {
        label: placeholder.trim(),
        strategy: [{ kind: 'css', sel: `[placeholder="${placeholder.trim()}"]` }],
      };
    }

    // Fallback: name attribute
    const name = el.getAttribute('name');
    if (name && name.trim()) {
      return {
        label: name.trim(),
        strategy: [{ kind: 'css', sel: `[name="${name.trim()}"]` }],
      };
    }

    return {
      label: 'unlabeled_field',
      strategy: [],
    };
  });

  return {
    label: result.label,
    strategy: result.strategy.map((s) => ({
      kind: s.kind as 'role' | 'label' | 'css',
      sel: s.sel,
      name: s.name,
    })),
  };
}

/**
 * Categorizes a form field into standard functional categories based on label, type, and name.
 */
export function classifyFieldCategory(label: string, type: FieldType, name?: string): string {
  const text = `${label} ${name || ''}`.toLowerCase();

  // 1. Work authorization / Visa sponsorship (checked before general consent)
  if (
    /sponsorship|work authoriz|visa|legally authorized|require sponsorship|authorized to work|right to work/i.test(text)
  ) {
    return 'work_auth';
  }

  // 2. Legal / Declarations / Agreements
  if (
    /legal|declaration|disclaimer|agree|agreement|terms|privacy policy|certify|truthful|penalty of perjury/i.test(text)
  ) {
    return 'legal';
  }

  // 3. Bonds / Service agreements
  if (/bond|contractual obligation|service agreement|lock-in/i.test(text)) {
    return 'bond';
  }

  // 4. Consent / Background check authorization
  if (/consent|background check|drug test|credit check|authorize release/i.test(text)) {
    return 'consent';
  }

  // 5. Compensation / Salary expectations
  if (
    /salary|compensation|desired pay|expected ctc|current ctc|hourly rate|remuneration|wage/i.test(text)
  ) {
    return 'salary';
  }

  // 6. EEO / Demographics
  if (
    /gender|race|ethnicity|veteran|disability|hispanic|latino|voluntary self-identification|eeo/i.test(text)
  ) {
    return 'eeo';
  }

  // 7. Sensitive / Identity
  if (/ssn|social security|passport|national id|aadhaar|date of birth|dob/i.test(text)) {
    return 'sensitive';
  }

  // 8. Notice period / Availability
  if (/notice period|how soon|availability|start date|when can you start/i.test(text)) {
    return 'notice';
  }

  // 9. Relocation / Location preferences
  if (/relocat|willing to relocate|commute|remote/i.test(text)) {
    return 'relocation';
  }

  // 10. Profile basics
  if (
    /first name|last name|full name|email|phone|mobile|resume|cv|linkedin|github|portfolio|website/i.test(text) ||
    type === 'email' ||
    type === 'phone' ||
    type === 'file'
  ) {
    return 'profile';
  }

  return 'other';
}
