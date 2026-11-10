import { describe, it, expect } from 'vitest';
import { redactString, redactObject } from '@/shared/redact';

describe('T-REDACT: Sensitive data redaction', () => {
  it('masks emails in strings', () => {
    const raw = 'Contact user at john.doe@example.com for inquiries';
    const redacted = redactString(raw);
    expect(redacted).not.toContain('john.doe@example.com');
    expect(redacted).toContain('j***e@e***.com');
  });

  it('masks phone numbers in strings', () => {
    const raw = 'Call +1 (555) 123-4567 immediately';
    const redacted = redactString(raw);
    expect(redacted).not.toContain('555');
    expect(redacted).toContain('***4567');
  });

  it('redacts Google and OpenAI API keys in strings', () => {
    const geminiKey = 'AIzaSyD-1234567890abcdef1234567890abcde';
    expect(redactString(`Key is ${geminiKey}`)).toBe('Key is [KEY_REDACTED]');
  });

  it('redacts sensitive keys in objects', () => {
    const data = {
      user: 'alice',
      password: 'superSecretPassword123!',
      token: 'bearer_token_xyz',
      nested: {
        authorization: 'Bearer secret_token',
        apiKey: 'some_api_key',
        email: 'alice@company.org',
      },
    };

    const redacted = redactObject(data);
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.token).toBe('[REDACTED]');
    expect(redacted.nested.authorization).toBe('[REDACTED]');
    expect(redacted.nested.apiKey).toBe('[REDACTED]');
    expect(redacted.nested.email).toContain('a***e@c***.org');
  });

  it('truncates long resume text bodies in objects', () => {
    const longResume = 'Experience summary: '.repeat(20);
    const data = { resumeText: longResume };
    const redacted = redactObject(data);
    expect(redacted.resumeText).toContain('[TEXT_REDACTED length=');
  });
});
