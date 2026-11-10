import { describe, it, expect } from 'vitest';
import { validateJobTransition } from '@/modules/discovery';
import { AppError } from '@/shared/errors';

describe('Discovery State Machine (Pure Domain)', () => {
  it('allows valid transitions for user actor', () => {
    expect(() => validateJobTransition('new', 'under_analysis', 'user')).not.toThrow();
    expect(() => validateJobTransition('new', 'saved', 'user')).not.toThrow();
    expect(() => validateJobTransition('new', 'rejected', 'user')).not.toThrow();
    expect(() => validateJobTransition('recommended', 'shortlisted', 'user')).not.toThrow();
    expect(() => validateJobTransition('shortlisted', 'applied', 'user')).not.toThrow();
    expect(() => validateJobTransition('saved', 'shortlisted', 'user')).not.toThrow();
    expect(() => validateJobTransition('rejected', 'new', 'user')).not.toThrow();
    expect(() => validateJobTransition('archived', 'new', 'user')).not.toThrow();
  });

  it('rejects invalid transitions across non-connected states', () => {
    // new -> applied is not allowed directly
    expect(() => validateJobTransition('new', 'applied', 'user')).toThrowError(AppError);
    // rejected -> shortlisted is not allowed directly (must undo to new first)
    expect(() => validateJobTransition('rejected', 'shortlisted', 'user')).toThrowError(AppError);
    // applied -> recommended is not allowed
    expect(() => validateJobTransition('applied', 'recommended', 'user')).toThrowError(AppError);
  });

  it('enforces system actor permission boundaries', () => {
    // System can close or expire jobs
    expect(() => validateJobTransition('recommended', 'closed', 'system')).not.toThrow();
    expect(() => validateJobTransition('shortlisted', 'expired', 'system')).not.toThrow();

    // System can transition new -> under_analysis
    expect(() => validateJobTransition('new', 'under_analysis', 'system')).not.toThrow();

    // System cannot arbitrarily shortlist jobs
    expect(() => validateJobTransition('recommended', 'shortlisted', 'system')).toThrowError(
      'System actor is not authorized'
    );
  });

  it('enforces policy actor constraints', () => {
    // Policy can transition recommended -> shortlisted ONLY if autonomy allows
    expect(() =>
      validateJobTransition('recommended', 'shortlisted', 'policy', {
        isAutonomyShortlistAllowed: true,
      })
    ).not.toThrow();

    expect(() =>
      validateJobTransition('recommended', 'shortlisted', 'policy', {
        isAutonomyShortlistAllowed: false,
      })
    ).toThrowError('autonomy policy does not permit it');

    // Policy cannot transition new -> applied
    expect(() => validateJobTransition('new', 'applied', 'policy')).toThrowError(AppError);
  });

  it('treats transition to same status as a no-op', () => {
    expect(() => validateJobTransition('saved', 'saved', 'user')).not.toThrow();
  });
});
