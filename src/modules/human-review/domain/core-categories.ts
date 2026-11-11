import { ResponseSchema, ReviewCategory } from './types';

export const CORE_REVIEW_CATEGORIES: ReadonlySet<string> = new Set([
  'legal',
  'consent',
  'bond',
  'work_auth',
  'salary',
  'eeo',
  'sensitive',
]);

/**
 * Returns true if the review category is protected and must NEVER be filled
 * automatically by AI or without explicit human authorization (Doc 03 §HIT, Doc 08 §76).
 */
export function isCoreCategory(category: string): boolean {
  return CORE_REVIEW_CATEGORIES.has(category.toLowerCase());
}

/**
 * Ensures AI-derived answers are never attached to core review categories.
 */
export function sanitizeReviewSuggestion(
  category: ReviewCategory | string,
  suggestedAnswer: unknown
): unknown {
  if (isCoreCategory(category)) {
    // Zero AI suggestions for legal declarations, bonds, non-competes, work auth, EEO, salary
    return null;
  }
  return suggestedAnswer;
}

/**
 * Validates a user review response against its declared schema.
 */
export function validateReviewResponse(
  schema: ResponseSchema,
  answer: unknown
): { valid: boolean; error?: string } {
  if (schema.required && (answer === undefined || answer === null || answer === '')) {
    return { valid: false, error: 'Answer is required for this review item.' };
  }

  if (answer === undefined || answer === null || answer === '') {
    return { valid: true };
  }

  switch (schema.type) {
    case 'boolean': {
      if (typeof answer !== 'boolean') {
        return { valid: false, error: 'Answer must be a boolean (true/false).' };
      }
      break;
    }

    case 'number': {
      const num = Number(answer);
      if (isNaN(num)) {
        return { valid: false, error: 'Answer must be a valid number.' };
      }
      if (schema.min !== undefined && num < schema.min) {
        return { valid: false, error: `Value must be at least ${schema.min}.` };
      }
      if (schema.max !== undefined && num > schema.max) {
        return { valid: false, error: `Value must not exceed ${schema.max}.` };
      }
      break;
    }

    case 'select':
    case 'radio': {
      if (schema.options && schema.options.length > 0) {
        const allowed = schema.options.map((o) => String(o.value));
        if (!allowed.includes(String(answer))) {
          return {
            valid: false,
            error: `Selected value must be one of: ${schema.options.map((o) => o.label).join(', ')}`,
          };
        }
      }
      break;
    }

    case 'multiselect': {
      if (!Array.isArray(answer)) {
        return { valid: false, error: 'Answer must be an array of selections.' };
      }
      if (schema.options && schema.options.length > 0) {
        const allowed = new Set(schema.options.map((o) => String(o.value)));
        for (const item of answer) {
          if (!allowed.has(String(item))) {
            return { valid: false, error: `Invalid option selected: ${item}` };
          }
        }
      }
      break;
    }

    case 'text':
    default: {
      if (typeof answer !== 'string') {
        return { valid: false, error: 'Answer must be a string text.' };
      }
      break;
    }
  }

  return { valid: true };
}
