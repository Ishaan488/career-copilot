import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hashPasscode,
  verifyPasscode,
  setupPasscode,
  loginWithPasscode,
  validateSessionToken,
  destroySession,
  isSetupRequired,
} from '@/shared/auth';
import { getDb, closeDbPool } from '@/shared/db';
import { authCredentials, authSessions } from '@/db/schema/infra';

describe('Authentication & Lockout Tests', () => {
  beforeAll(async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    const db = getDb();
    await db.delete(authSessions);
    await db.delete(authCredentials);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(authSessions);
    await db.delete(authCredentials);
    await closeDbPool();
  });

  it('scrypt hashes and verifies passcode correctly', async () => {
    const passcode = 'MySecurePasscode123!';
    const { hash, salt } = await hashPasscode(passcode);

    const match = await verifyPasscode(passcode, hash, salt);
    expect(match).toBe(true);

    const wrongMatch = await verifyPasscode('WrongPassword456!', hash, salt);
    expect(wrongMatch).toBe(false);
  });

  it('enforces 12-character minimum on initial setup', async () => {
    await expect(setupPasscode('short')).rejects.toThrow('at least 12 characters');
  });

  it('allows setup once and blocks subsequent setup attempts', async () => {
    expect(await isSetupRequired()).toBe(true);

    await setupPasscode('MasterPasscode123!');
    expect(await isSetupRequired()).toBe(false);

    // Second setup attempt must fail with CONFLICT
    await expect(setupPasscode('AnotherPasscode456!')).rejects.toThrow('already configured');
  });

  it('authenticates correct passcode and issues session token', async () => {
    const token = await loginWithPasscode('MasterPasscode123!', '127.0.0.1');
    expect(token).toHaveLength(64);

    const valid = await validateSessionToken(token);
    expect(valid).toBe(true);

    await destroySession(token);
    const validAfterDestroy = await validateSessionToken(token);
    expect(validAfterDestroy).toBe(false);
  });

  it('triggers lockout after 5 consecutive failed login attempts', async () => {
    const testIp = '10.99.99.99';

    for (let i = 0; i < 4; i++) {
      await expect(loginWithPasscode('wrong_pass', testIp)).rejects.toThrow('Invalid passcode');
    }

    // 5th attempt locks out
    await expect(loginWithPasscode('wrong_pass', testIp)).rejects.toThrow('Invalid passcode');

    // 6th attempt is rejected immediately with RATE_LIMITED
    await expect(loginWithPasscode('wrong_pass', testIp)).rejects.toThrow('Too many failed attempts');
  });
});
