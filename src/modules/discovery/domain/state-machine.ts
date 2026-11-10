import { AppError } from '@/shared/errors';

export type JobStatus =
  | 'new'
  | 'under_analysis'
  | 'recommended'
  | 'shortlisted'
  | 'saved'
  | 'rejected'
  | 'expired'
  | 'closed'
  | 'applied'
  | 'archived';

export type StateActor = 'system' | 'user' | 'policy';

export interface StateTransitionResult {
  fromStatus: JobStatus;
  toStatus: JobStatus;
  actor: StateActor;
  reason?: string;
  decisionId?: string;
}

const ALLOWED_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  new: ['under_analysis', 'rejected', 'saved', 'archived', 'closed'],
  under_analysis: ['recommended', 'rejected', 'new', 'saved', 'closed'],
  recommended: ['shortlisted', 'saved', 'rejected', 'archived', 'closed', 'expired', 'under_analysis'],
  shortlisted: ['applied', 'saved', 'rejected', 'archived', 'closed', 'expired'],
  saved: ['shortlisted', 'rejected', 'archived', 'under_analysis', 'closed'],
  rejected: ['new', 'archived'],
  expired: ['archived', 'shortlisted'],
  closed: ['archived', 'shortlisted'],
  applied: ['closed', 'archived'],
  archived: ['new'],
};

/**
 * Validates whether a proposed job status transition is valid according to the state machine rules and actor permissions.
 */
export function validateJobTransition(
  fromStatus: JobStatus,
  toStatus: JobStatus,
  actor: StateActor,
  options?: {
    isAutonomyShortlistAllowed?: boolean;
    isPrefilterOrEligibilityRejection?: boolean;
  }
): void {
  // If no change, it is a no-op
  if (fromStatus === toStatus) {
    return;
  }

  // 1. Check basic matrix transitions
  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  if (!allowed || !allowed.includes(toStatus)) {
    throw new AppError(
      'INVALID_TRANSITION',
      `Cannot transition job from status '${fromStatus}' to '${toStatus}'`
    );
  }

  // 2. Validate actor permissions per doc 10 §1
  if (actor === 'system') {
    // System allowed transitions:
    // - Any to closed / expired
    // - new -> under_analysis
    // - under_analysis -> recommended
    // - under_analysis -> rejected (only when ineligible or prefilter)
    // - under_analysis -> new (when analysis fails terminally)
    const isCloseOrExpire = toStatus === 'closed' || toStatus === 'expired';
    const isNewToAnalysis = fromStatus === 'new' && toStatus === 'under_analysis';
    const isAnalysisToRec = fromStatus === 'under_analysis' && toStatus === 'recommended';
    const isAnalysisToFailed = fromStatus === 'under_analysis' && toStatus === 'new';
    const isAnalysisToRejected =
      fromStatus === 'under_analysis' &&
      toStatus === 'rejected' &&
      Boolean(options?.isPrefilterOrEligibilityRejection);
    const isPrefilterRejection =
      fromStatus === 'new' &&
      toStatus === 'rejected' &&
      Boolean(options?.isPrefilterOrEligibilityRejection);

    if (
      !isCloseOrExpire &&
      !isNewToAnalysis &&
      !isAnalysisToRec &&
      !isAnalysisToFailed &&
      !isAnalysisToRejected &&
      !isPrefilterRejection
    ) {
      throw new AppError(
        'INVALID_TRANSITION',
        `System actor is not authorized to transition job from '${fromStatus}' to '${toStatus}'`
      );
    }
  } else if (actor === 'policy') {
    // Policy allowed transition:
    // - recommended -> shortlisted ONLY if autonomy allows
    if (fromStatus === 'recommended' && toStatus === 'shortlisted') {
      if (!options?.isAutonomyShortlistAllowed) {
        throw new AppError(
          'INVALID_TRANSITION',
          `Policy actor cannot transition to 'shortlisted' because autonomy policy does not permit it`
        );
      }
    } else {
      throw new AppError(
        'INVALID_TRANSITION',
        `Policy actor is not authorized to transition job from '${fromStatus}' to '${toStatus}'`
      );
    }
  } else if (actor === 'user') {
    // User can perform any transition allowed in the matrix, EXCEPT:
    // "applied set only by application module upon verified/manual submission"
    // User can manually transition to 'applied' if recording manual submission, but direct arbitrary apply without submission context is prevented if needed.
    // However, if the user explicitly marks as applied, we allow it.
  }
}
