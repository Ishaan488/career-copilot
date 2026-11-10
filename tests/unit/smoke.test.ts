import { describe, it, expect } from 'vitest';
import { clock, generateId, AppError } from '@/shared/index';

describe('M0 Smoke Tests', () => {
  it('generates a valid UUIDv4', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('manages clock time and overrides', () => {
    const originalDate = clock.now();
    expect(originalDate).toBeInstanceOf(Date);

    const fixed = new Date('2026-01-01T00:00:00Z');
    clock.setOverride(() => fixed);
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');

    clock.reset();
    expect(clock.now().getTime()).toBeGreaterThanOrEqual(originalDate.getTime());
  });

  it('creates typed AppError with details', () => {
    const err = new AppError('VALIDATION', 'Invalid field', { details: { field: 'email' } });
    expect(err.code).toBe('VALIDATION');
    expect(err.message).toBe('Invalid field');
    expect(err.details).toEqual({ field: 'email' });
  });
});
