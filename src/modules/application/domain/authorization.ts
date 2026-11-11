import { isCoreCategory } from '@/modules/human-review';

export interface SubmissionAuthCheckInput {
  applicationId: string;
  status: string;
  verifiedDomain: boolean;
  currentSummaryHash: string;
  envSubmissionEnabled?: boolean;
  settingsSubmissionEnabled?: boolean;
  activeSubmissionExists?: boolean;
  duplicateSubmittedAppExists?: boolean;
  resume?: {
    storedSha256?: string | null;
    expectedSha256?: string | null;
  } | null;
  authorization?: {
    id: string;
    kind: string;
    summaryHash: string;
    expiresAt: Date;
    revokedAt?: Date | null;
  } | null;
  answers: Array<{
    fieldKey?: string;
    category: string;
    status: string;
    source: string;
    decision?: string;
  }>;
}

export interface SubmissionAuthCheckResult {
  ok: boolean;
  reasons: string[];
}

/**
 * Pure authorization check function implementing the T-AUTH security specification
 * (Doc 10 §6, Doc 13 §8, Doc 15 §2 T-AUTH).
 *
 * All gates must pass for automated submission to be permitted:
 * 1. Environment gate: SUBMISSION_ENABLED=true
 * 2. Settings gate: submission_enabled=true
 * 3. Application status: ready_to_submit
 * 4. Domain verified: verifiedDomain=true
 * 5. Authorization record: exists, kind='submission', unrevoked, unexpired
 * 6. Hash binding: authorization.summaryHash === currentSummaryHash
 * 7. Answer approval: all answers approved/filled
 * 8. Core categories: human/reusable source only (never unreviewed AI)
 * 9. Resume integrity: sha256 matches
 * 10. No concurrent active submission or duplicate active application
 */
export function checkSubmissionAuthorization(
  input: SubmissionAuthCheckInput
): SubmissionAuthCheckResult {
  const reasons: string[] = [];

  // Gate 1: Environment flag
  if (input.envSubmissionEnabled !== true) {
    reasons.push('ENVIRONMENT_DISABLED: Automated submission is disabled in system environment (SUBMISSION_ENABLED != true).');
  }

  // Gate 2: User Settings toggle
  if (input.settingsSubmissionEnabled !== true) {
    reasons.push('SETTINGS_DISABLED: Automated submission toggle is turned off in settings.');
  }

  // Gate 3: Application status must be ready_to_submit
  if (input.status !== 'ready_to_submit') {
    reasons.push(`INVALID_STATUS: Application status must be 'ready_to_submit' (current: '${input.status}').`);
  }

  // Gate 4: Verified portal domain
  if (!input.verifiedDomain) {
    reasons.push('UNVERIFIED_DOMAIN: Application portal domain has not been verified.');
  }

  // Gate 5: Active, valid authorization record
  if (!input.authorization) {
    reasons.push('NO_AUTHORIZATION: No explicit submission authorization record found.');
  } else {
    if (input.authorization.kind !== 'submission') {
      reasons.push(`INVALID_AUTHORIZATION_KIND: Authorization kind must be 'submission' (found: '${input.authorization.kind}').`);
    }

    if (input.authorization.revokedAt != null) {
      reasons.push('AUTHORIZATION_REVOKED: Submission authorization has been revoked.');
    }

    const now = Date.now();
    const expiresAtMs = new Date(input.authorization.expiresAt).getTime();
    if (expiresAtMs <= now) {
      reasons.push('AUTHORIZATION_EXPIRED: Submission authorization has expired (max 24 hours validity).');
    }

    // Gate 6: Summary hash binding
    if (input.authorization.summaryHash !== input.currentSummaryHash) {
      reasons.push(
        `SUMMARY_HASH_MISMATCH: Authorization bound hash '${input.authorization.summaryHash}' does not match current summary hash '${input.currentSummaryHash}'.`
      );
    }
  }

  // Gate 7 & 8: Form answers approval and core category checks
  if (!input.answers || input.answers.length === 0) {
    reasons.push('NO_ANSWERS: Application has no mapped form answers.');
  } else {
    for (const ans of input.answers) {
      // Must be approved or already filled
      const isApproved =
        ans.status === 'approved' ||
        ans.status === 'filled' ||
        ans.status === 'verified_filled';

      if (!isApproved) {
        reasons.push(`UNAPPROVED_ANSWER: Form field answer with status '${ans.status}' is not approved.`);
      }

      // Core categories (legal, consent, work_auth, salary, eeo, sensitive) require human-in-the-loop source
      if (isCoreCategory(ans.category)) {
        if (ans.source === 'ai') {
          reasons.push(
            `CORE_CATEGORY_AI_SOURCE: Core category field '${ans.category}' cannot use AI-generated answer for automated submission.`
          );
        }
      }
    }
  }

  // Gate 9: Resume sha256 integrity
  if (input.resume) {
    if (!input.resume.storedSha256 || !input.resume.expectedSha256) {
      reasons.push('RESUME_HASH_MISSING: Resume SHA-256 integrity hash is missing.');
    } else if (input.resume.storedSha256 !== input.resume.expectedSha256) {
      reasons.push('RESUME_INTEGRITY_MISMATCH: Attached resume file SHA-256 does not match recorded version hash.');
    }
  }

  // Gate 10: Concurrent active submission guard
  if (input.activeSubmissionExists === true) {
    reasons.push('ACTIVE_SUBMISSION_EXISTS: An active submission attempt is already in progress.');
  }

  // Gate 11: Duplicate active submitted application check
  if (input.duplicateSubmittedAppExists === true) {
    reasons.push('DUPLICATE_APPLICATION: An active submitted application already exists for this job/requisition.');
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}
