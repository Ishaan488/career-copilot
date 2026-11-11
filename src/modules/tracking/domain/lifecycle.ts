// Application Lifecycle State Machine (Doc 10 §3, Doc 03 FR-TRK-1, FR-TRK-3)

export type ApplicationStatus =
  | 'draft'
  | 'interested'
  | 'shortlisted'
  | 'preparing'
  | 'awaiting_review'
  | 'ready_to_submit'
  | 'submitted'
  | 'submission_unverified'
  | 'under_review'
  | 'assessment_received'
  | 'interview_scheduled'
  | 'interview_completed'
  | 'offer_received'
  | 'rejected'
  | 'withdrawn'
  | 'closed';

export type PipelineStage = 'draft_review' | 'applied' | 'interviewing' | 'offer' | 'closed';

export const PIPELINE_STAGES: Record<PipelineStage, { label: string; statuses: ApplicationStatus[] }> = {
  draft_review: {
    label: 'Draft & Review',
    statuses: ['draft', 'interested', 'shortlisted', 'preparing', 'awaiting_review', 'ready_to_submit'],
  },
  applied: {
    label: 'Applied & Under Review',
    statuses: ['submitted', 'submission_unverified', 'under_review', 'assessment_received'],
  },
  interviewing: {
    label: 'Interviewing',
    statuses: ['interview_scheduled', 'interview_completed'],
  },
  offer: {
    label: 'Offer Received',
    statuses: ['offer_received'],
  },
  closed: {
    label: 'Closed & Archived',
    statuses: ['rejected', 'withdrawn', 'closed'],
  },
};

export function getPipelineStage(status: string): PipelineStage {
  for (const [stage, config] of Object.entries(PIPELINE_STAGES)) {
    if (config.statuses.includes(status as ApplicationStatus)) {
      return stage as PipelineStage;
    }
  }
  return 'closed';
}

const VALID_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  draft: ['interested', 'shortlisted', 'preparing', 'withdrawn', 'closed'],
  interested: ['shortlisted', 'preparing', 'withdrawn', 'closed'],
  shortlisted: ['preparing', 'withdrawn', 'closed'],
  preparing: ['awaiting_review', 'ready_to_submit', 'withdrawn', 'closed'],
  awaiting_review: ['preparing', 'ready_to_submit', 'withdrawn', 'closed'],
  ready_to_submit: ['submitted', 'submission_unverified', 'awaiting_review', 'preparing', 'withdrawn', 'closed'],
  submission_unverified: ['submitted', 'ready_to_submit', 'preparing', 'closed'],
  submitted: ['under_review', 'assessment_received', 'interview_scheduled', 'rejected', 'offer_received', 'withdrawn', 'closed'],
  under_review: ['assessment_received', 'interview_scheduled', 'rejected', 'offer_received', 'withdrawn', 'closed'],
  assessment_received: ['interview_scheduled', 'rejected', 'under_review', 'withdrawn', 'closed'],
  interview_scheduled: ['interview_completed', 'interview_scheduled', 'rejected', 'withdrawn', 'closed'],
  interview_completed: ['interview_scheduled', 'offer_received', 'rejected', 'withdrawn', 'closed'],
  offer_received: ['closed', 'withdrawn', 'rejected'],
  rejected: ['preparing'], // Re-openable only with explicit user action
  withdrawn: ['preparing'], // Re-openable with explicit user action
  closed: ['preparing'], // Re-openable with explicit user action
};

export interface TransitionCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Pure evaluation of whether a lifecycle transition is permitted under Doc 10 §3 rules.
 * Enforces the strict rule: Zero inference of rejection from silence (FR-TRK-3).
 */
export function canTransitionLifecycle(
  fromStatus: string,
  toStatus: string,
  actor: 'user' | 'system' | 'email_suggestion' | 'policy'
): TransitionCheck {
  const from = fromStatus as ApplicationStatus;
  const to = toStatus as ApplicationStatus;

  if (from === to) {
    return { allowed: true };
  }

  const allowedTargets = VALID_TRANSITIONS[from];
  if (!allowedTargets) {
    return { allowed: false, reason: `Unknown source status: ${fromStatus}` };
  }

  if (!allowedTargets.includes(to)) {
    return {
      allowed: false,
      reason: `Cannot transition from '${fromStatus}' to '${toStatus}'. Allowed transitions: ${allowedTargets.join(', ')}`,
    };
  }

  // FR-TRK-3 Invariant: Never allow automated system or timeout to mark as rejected.
  // Rejection requires explicit user confirmation or verified rejection evidence.
  if (to === 'rejected' && actor === 'policy') {
    return {
      allowed: false,
      reason: 'FR-TRK-3 Invariant: Rejection cannot be inferred automatically by policy or silence.',
    };
  }

  // Re-opening from terminal state requires human user confirmation
  if (['rejected', 'withdrawn', 'closed'].includes(from) && actor !== 'user') {
    return {
      allowed: false,
      reason: 'Reopening an application from a terminal state requires explicit user confirmation.',
    };
  }

  return { allowed: true };
}
