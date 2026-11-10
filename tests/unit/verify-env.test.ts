import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verifyEnv } from '../../scripts/verify-env';

describe('verify-env', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('passes when required environment variables are set', () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_ORIGIN = 'http://127.0.0.1:3000';
    process.env.DATABASE_URL = 'postgres://career:career_password@127.0.0.1:5432/career_copilot';
    process.env.TEST_DATABASE_URL = 'postgres://career:career_password@127.0.0.1:5432/career_copilot_test';
    process.env.DATA_DIR = './data';

    const result = verifyEnv();
    expect(result).toBe(true);
  });

  it('fails when a required variable is missing', () => {
    delete process.env.DATABASE_URL;
    const result = verifyEnv();
    expect(result).toBe(false);
  });
});
