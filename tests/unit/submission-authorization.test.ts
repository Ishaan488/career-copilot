import { describe, it, expect } from 'vitest';
import {
  checkSubmissionAuthorization,
  SubmissionAuthCheckInput,
} from '@/modules/application/domain/authorization';

describe('Submission Authorization Matrix (T-AUTH)', () => {
  const baseValidInput: SubmissionAuthCheckInput = {
    applicationId: 'app-123',
    status: 'ready_to_submit',
    verifiedDomain: true,
    currentSummaryHash: 'sha256_summary_abc123',
    envSubmissionEnabled: true,
    settingsSubmissionEnabled: true,
    activeSubmissionExists: false,
    duplicateSubmittedAppExists: false,
    resume: {
      storedSha256: 'sha256_resume_xyz',
      expectedSha256: 'sha256_resume_xyz',
    },
    authorization: {
      id: 'auth-1',
      kind: 'submission',
      summaryHash: 'sha256_summary_abc123',
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000), // 24h in future
      revokedAt: null,
    },
    answers: [
      {
        fieldKey: 'first_name',
        category: 'profile',
        status: 'approved',
        source: 'profile',
        decision: 'answered',
      },
      {
        fieldKey: 'authorized_to_work',
        category: 'work_auth',
        status: 'approved',
        source: 'human',
        decision: 'answered',
      },
      {
        fieldKey: 'eeo_gender',
        category: 'eeo',
        status: 'approved',
        source: 'human',
        decision: 'declined',
      },
    ],
  };

  it('passes cleanly when all security gates, hash binding, and approvals are valid', () => {
    const res = checkSubmissionAuthorization(baseValidInput);
    expect(res.ok).toBe(true);
    expect(res.reasons).toHaveLength(0);
  });

  it('fails when environment gate SUBMISSION_ENABLED is false', () => {
    const res = checkSubmissionAuthorization({
      ...baseValidInput,
      envSubmissionEnabled: false,
    });
    expect(res.ok).toBe(false);
    expect(res.reasons[0]).toContain('ENVIRONMENT_DISABLED');
  });

  it('fails when settings toggle is disabled', () => {
    const res = checkSubmissionAuthorization({
      ...baseValidInput,
      settingsSubmissionEnabled: false,
    });
    expect(res.ok).toBe(false);
    expect(res.reasons[0]).toContain('SETTINGS_DISABLED');
  });

  it('fails when application status is not ready_to_submit', () => {
    const res = checkSubmissionAuthorization({
      ...baseValidInput,
      status: 'preparing',
    });
    expect(res.ok).toBe(false);
    expect(res.reasons[0]).toContain('INVALID_STATUS');
  });

  it('fails when domain is not verified', () => {
    const res = checkSubmissionAuthorization({
      ...baseValidInput,
      verifiedDomain: false,
    });
    expect(res.ok).toBe(false);
    expect(res.reasons[0]).toContain('UNVERIFIED_DOMAIN');
  });

  it('fails when authorization record is missing', () => {
    const res = checkSubmissionAuthorization({
      ...baseValidInput,
      authorization: null,
    });
    expect(res.ok).toBe(false);
    expect(res.reasons[0]).toContain('NO_AUTHORIZATION');
  });

  it('fails when authorization is revoked', () => {
    const res = checkSubmissionAuthorization({
      ...baseValidInput,
      authorization: {
        ...baseValidInput.authorization!,
        revokedAt: new Date(Date.now() - 60000),
      },
    });
    expect(res.ok).toBe(false);
    expect(res.reasons[0]).toContain('AUTHORIZATION_REVOKED');
  });

  it('fails when authorization has expired (>24 hours)', () => {
    const res = checkSubmissionAuthorization({
      ...baseValidInput,
      authorization: {
        ...baseValidInput.authorization!,
        expiresAt: new Date(Date.now() - 1000), // expired 1s ago
      },
    });
    expect(res.ok).toBe(false);
    expect(res.reasons[0]).toContain('AUTHORIZATION_EXPIRED');
  });

  it('fails when summaryHash does not match authorization bound hash', () => {
    const res = checkSubmissionAuthorization({
      ...baseValidInput,
      currentSummaryHash: 'sha256_changed_after_user_authorization',
    });
    expect(res.ok).toBe(false);
    expect(res.reasons[0]).toContain('SUMMARY_HASH_MISMATCH');
  });

  it('fails when an answer has not been approved', () => {
    const res = checkSubmissionAuthorization({
      ...baseValidInput,
      answers: [
        ...baseValidInput.answers,
        {
          fieldKey: 'salary_expectations',
          category: 'salary',
          status: 'needs_review',
          source: 'human',
        },
      ],
    });
    expect(res.ok).toBe(false);
    expect(res.reasons[0]).toContain('UNAPPROVED_ANSWER');
  });

  it('fails when a core category field (work_auth, legal, eeo) uses unreviewed AI source', () => {
    const res = checkSubmissionAuthorization({
      ...baseValidInput,
      answers: [
        {
          fieldKey: 'work_auth',
          category: 'work_auth',
          status: 'approved',
          source: 'ai', // Illegal: core categories must never use AI source
        },
      ],
    });
    expect(res.ok).toBe(false);
    expect(res.reasons[0]).toContain('CORE_CATEGORY_AI_SOURCE');
  });

  it('fails when resume file sha256 does not match recorded version hash', () => {
    const res = checkSubmissionAuthorization({
      ...baseValidInput,
      resume: {
        storedSha256: 'sha256_tampered_or_corrupted',
        expectedSha256: 'sha256_resume_xyz',
      },
    });
    expect(res.ok).toBe(false);
    expect(res.reasons[0]).toContain('RESUME_INTEGRITY_MISMATCH');
  });

  it('fails when an active submission attempt is already in progress', () => {
    const res = checkSubmissionAuthorization({
      ...baseValidInput,
      activeSubmissionExists: true,
    });
    expect(res.ok).toBe(false);
    expect(res.reasons[0]).toContain('ACTIVE_SUBMISSION_EXISTS');
  });

  it('fails when a duplicate submitted application already exists for the job', () => {
    const res = checkSubmissionAuthorization({
      ...baseValidInput,
      duplicateSubmittedAppExists: true,
    });
    expect(res.ok).toBe(false);
    expect(res.reasons[0]).toContain('DUPLICATE_APPLICATION');
  });
});
