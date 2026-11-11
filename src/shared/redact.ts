const SENSITIVE_KEY_REGEX = /^(password|passcode|token|secret|authorization|cookie|set-cookie|api[_-]?key|bearer|smtp_pass|imap_pass)$/i;

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const API_KEY_REGEX = /\b(AIza[0-9A-Za-z_\-]{30,50}|sk-[A-Za-z0-9_\-]{20,}|bot\d+:[A-Za-z0-9_\-]{30,50})\b/g;

export function redactString(text: string): string {
  return text
    .replace(EMAIL_REGEX, (match) => {
      const [local, domain] = match.split('@');
      if (!local || !domain) return '[EMAIL_REDACTED]';
      const maskedLocal = local.length > 2 ? `${local[0]}***${local[local.length - 1]}` : `${local[0]}***`;
      const domainParts = domain.split('.');
      const maskedDomain = domainParts[0] ? `${domainParts[0][0]}***.${domainParts.slice(1).join('.')}` : domain;
      return `${maskedLocal}@${maskedDomain}`;
    })
    .replace(PHONE_REGEX, (match) => {
      const clean = match.replace(/\D/g, '');
      if (clean.length < 4) return '[PHONE_REDACTED]';
      return `***${clean.slice(-4)}`;
    })
    .replace(API_KEY_REGEX, '[KEY_REDACTED]');
}

export function redactObject<T>(obj: T, depth = 0): T {
  if (depth > 10 || obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return redactString(obj) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'string' && key.toLowerCase().includes('resume') && value.length > 200) {
        result[key] = `[TEXT_REDACTED length=${value.length}]`;
      } else {
        result[key] = redactObject(value, depth + 1);
      }
    }
    return result as T;
  }

  return obj;
}
