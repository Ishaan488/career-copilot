import sanitizeHtml from 'sanitize-html';
import { PromptPart } from '../types';

export const MAX_UNTRUSTED_CONTENT_LENGTH = 30000;

/**
 * Strips HTML tags and normalizes whitespace while preserving readable line breaks.
 */
export function stripHtml(input: string): string {
  if (!input) return '';
  const clean = sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
  });
  return clean.replace(/\r\n/g, '\n').trim();
}

/**
 * Escapes closing tag delimiter so hostile input cannot break out of untrusted_content tags.
 */
export function escapeUntrustedDelimiters(text: string): string {
  return text
    .replace(/<\/untrusted_content>/gi, '[escaped_untrusted_content_close]')
    .replace(/<untrusted_content/gi, '[escaped_untrusted_content_open');
}

/**
 * Caps length at MAX_UNTRUSTED_CONTENT_LENGTH with a warning marker.
 */
export function capLength(text: string, maxLength = MAX_UNTRUSTED_CONTENT_LENGTH): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + `\n\n[TRUNCATED: Content exceeded maximum limit of ${maxLength} characters]`;
}

/**
 * Packages prompt parts using prompt sandwiching rules (Doc 11 §3).
 * Untrusted user content is stripped of HTML, delimiter-escaped, length-capped,
 * and enclosed inside XML-style <untrusted_content> tags.
 */
export function formatPromptContent(parts: PromptPart[]): string {
  return parts
    .map((part) => {
      if (part.type === 'untrusted_text') {
        const source = part.source || 'untrusted_input';
        const id = part.id ? ` id="${part.id}"` : '';
        const cleaned = capLength(stripHtml(escapeUntrustedDelimiters(part.text)));
        return `<untrusted_content source="${source}"${id}>\n${cleaned}\n</untrusted_content>`;
      }
      return part.text;
    })
    .join('\n\n');
}

/**
 * Heuristic detector for obvious injection attempts in untrusted text.
 */
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /system\s+prompt\s*:/i,
  /you\s+are\s+now\s+(in\s+)?(DAN|developer|admin)\s+mode/i,
  /print\s+(the\s+)?(hidden|system)\s+instructions/i,
  /<script[\s>]/i,
];

export function detectSuspiciousPatterns(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}
