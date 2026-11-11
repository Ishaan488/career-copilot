import { describe, it, expect } from 'vitest';
import {
  canTransitionLifecycle,
  getPipelineStage,
  PIPELINE_STAGES,
  ApplicationStatus,
} from '@/modules/tracking/domain/lifecycle';

describe('Tracking Lifecycle State Machine (Doc 10 §3, Doc 03 FR-TRK-1, FR-TRK-3)', () => {
  it('allows valid sequential transitions from submitted through interview to offer', () => {
    // submitted -> under_review
    expect(canTransitionLifecycle('submitted', 'under_review', 'user').allowed).toBe(true);

    // under_review -> interview_scheduled
    expect(canTransitionLifecycle('under_review', 'interview_scheduled', 'user').allowed).toBe(true);

    // interview_scheduled -> interview_completed
    expect(canTransitionLifecycle('interview_scheduled', 'interview_completed', 'user').allowed).toBe(true);

    // interview_completed -> offer_received
    expect(canTransitionLifecycle('interview_completed', 'offer_received', 'user').allowed).toBe(true);

    // offer_received -> closed
    expect(canTransitionLifecycle('offer_received', 'closed', 'user').allowed).toBe(true);
  });

  it('rejects illegal transitions that skip lifecycle stages', () => {
    // Cannot jump from preparing directly to offer_received
    const check1 = canTransitionLifecycle('preparing', 'offer_received', 'user');
    expect(check1.allowed).toBe(false);
    expect(check1.reason).toContain('Cannot transition');

    // Cannot jump from interested directly to submitted
    const check2 = canTransitionLifecycle('interested', 'submitted', 'user');
    expect(check2.allowed).toBe(false);
  });

  it('enforces FR-TRK-3 Invariant: Zero inference of rejection from silence or policy', () => {
    // Policy actor attempting to mark as rejected is strictly disallowed
    const policyRejection = canTransitionLifecycle('under_review', 'rejected', 'policy');
    expect(policyRejection.allowed).toBe(false);
    expect(policyRejection.reason).toContain('FR-TRK-3 Invariant');

    // Human user marking as rejected is permitted
    const userRejection = canTransitionLifecycle('under_review', 'rejected', 'user');
    expect(userRejection.allowed).toBe(true);
  });

  it('allows re-opening from withdrawn/closed to preparing only by explicit user action', () => {
    // User can reopen
    expect(canTransitionLifecycle('withdrawn', 'preparing', 'user').allowed).toBe(true);
    expect(canTransitionLifecycle('closed', 'preparing', 'user').allowed).toBe(true);

    // Automated system cannot reopen
    const systemReopen = canTransitionLifecycle('withdrawn', 'preparing', 'system');
    expect(systemReopen.allowed).toBe(false);
    expect(systemReopen.reason).toContain('explicit user confirmation');
  });

  it('accurately maps all application statuses to high-level pipeline stages', () => {
    expect(getPipelineStage('preparing')).toBe('draft_review');
    expect(getPipelineStage('ready_to_submit')).toBe('draft_review');
    expect(getPipelineStage('submitted')).toBe('applied');
    expect(getPipelineStage('under_review')).toBe('applied');
    expect(getPipelineStage('interview_scheduled')).toBe('interviewing');
    expect(getPipelineStage('interview_completed')).toBe('interviewing');
    expect(getPipelineStage('offer_received')).toBe('offer');
    expect(getPipelineStage('rejected')).toBe('closed');
    expect(getPipelineStage('withdrawn')).toBe('closed');
  });

  it('ensures all defined statuses exist across pipeline stage sets without gaps', () => {
    const allConfiguredStatuses = Object.values(PIPELINE_STAGES).flatMap((s) => s.statuses);
    const expectedStatuses: ApplicationStatus[] = [
      'draft',
      'interested',
      'shortlisted',
      'preparing',
      'awaiting_review',
      'ready_to_submit',
      'submitted',
      'submission_unverified',
      'under_review',
      'assessment_received',
      'interview_scheduled',
      'interview_completed',
      'offer_received',
      'rejected',
      'withdrawn',
      'closed',
    ];

    for (const status of expectedStatuses) {
      expect(allConfiguredStatuses).toContain(status);
    }
  });
});
