import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { getDb } from './db';
import { authCredentials, authSessions } from '@/db/schema/infra';
import { eq, and, gt } from 'drizzle-orm';
import { AppError } from './errors';

const scryptAsync = promisify(scrypt);

const FAILED_ATTEMPTS = new Map<string, { count: number; lockedUntil: number }>();

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function hashPasscode(passcode: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(passcode, salt, 64)) as Buffer;
  return { hash: derivedKey.toString('hex'), salt };
}

export async function verifyPasscode(passcode: string, hash: string, salt: string): Promise<boolean> {
  const derivedKey = (await scryptAsync(passcode, salt, 64)) as Buffer;
  const hashBuffer = Buffer.from(hash, 'hex');
  if (derivedKey.length !== hashBuffer.length) {
    return false;
  }
  return timingSafeEqual(derivedKey, hashBuffer);
}

export async function isSetupRequired(): Promise<boolean> {
  const db = getDb();
  const [cred] = await db.select().from(authCredentials).limit(1);
  return !cred;
}

export async function setupPasscode(passcode: string): Promise<void> {
  if (passcode.length < 12) {
    throw new AppError('VALIDATION', 'Passcode must be at least 12 characters long');
  }

  const db = getDb();
  const exists = !(await isSetupRequired());
  if (exists) {
    throw new AppError('CONFLICT', 'Passcode is already configured. Setup not allowed.');
  }

  const { hash, salt } = await hashPasscode(passcode);
  await db.insert(authCredentials).values({
    id: 'singleton',
    passcodeHash: hash,
    salt,
  });
}

export async function loginWithPasscode(passcode: string, clientIp = '127.0.0.1'): Promise<string> {
  // Check lockout
  const now = Date.now();
  const attempt = FAILED_ATTEMPTS.get(clientIp);
  if (attempt && attempt.lockedUntil > now) {
    const remainingSecs = Math.ceil((attempt.lockedUntil - now) / 1000);
    throw new AppError('RATE_LIMITED', `Too many failed attempts. Locked out for ${remainingSecs} seconds.`);
  }

  const db = getDb();
  const [cred] = await db.select().from(authCredentials).limit(1);
  if (!cred) {
    throw new AppError('UNAUTHORIZED', 'Setup required. No passcode configured.');
  }

  const valid = await verifyPasscode(passcode, cred.passcodeHash, cred.salt);
  if (!valid) {
    const current = FAILED_ATTEMPTS.get(clientIp) || { count: 0, lockedUntil: 0 };
    current.count += 1;
    if (current.count >= 5) {
      current.lockedUntil = now + 60 * 1000 * Math.pow(2, current.count - 5);
    }
    FAILED_ATTEMPTS.set(clientIp, current);
    throw new AppError('UNAUTHORIZED', 'Invalid passcode.');
  }

  // Clear failed attempts on success
  FAILED_ATTEMPTS.delete(clientIp);

  // Generate session token (32 bytes hex)
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(authSessions).values({
    tokenHash,
    expiresAt,
    lastSeenAt: new Date(),
  });

  return token;
}

export async function validateSessionToken(token: string): Promise<boolean> {
  if (!token || token.length < 32) return false;

  const db = getDb();
  const tokenHash = hashToken(token);
  const now = new Date();

  const [session] = await db
    .select()
    .from(authSessions)
    .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, now)))
    .limit(1);

  if (!session) return false;

  // Sliding expiry
  const newExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.update(authSessions).set({ lastSeenAt: now, expiresAt: newExpires }).where(eq(authSessions.id, session.id));

  return true;
}

export async function destroySession(token: string): Promise<void> {
  const db = getDb();
  const tokenHash = hashToken(token);
  await db.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash));
}
