export type WorkflowStep =
  | 'resolve_url'
  | 'verify_domain'
  | 'select_resume'
  | 'detect_platform'
  | 'open_portal'
  | 'extract_form'
  | 'map_fields'
  | 'validate_answers'
  | 'fill_form'
  | 'validate_form'
  | 'final_summary'
  | 'await_submission_decision'
  | 'submit'
  | 'verify_submission'
  | 'finalize';

export type WorkflowStatus =
  | 'running'
  | 'paused'
  | 'waiting_review'
  | 'waiting_authorization'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ApplicationStatus =
  | 'draft'
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

export interface StepContext {
  workflowId: string;
  applicationId: string;
  jobId: string;
  companyId?: string | null;
  step: WorkflowStep;
  state: Record<string, unknown>;
  version: number;
}

export type StepResult =
  | {
      type: 'next';
      nextStep: WorkflowStep;
      stateUpdates?: Record<string, unknown>;
    }
  | {
      type: 'pause';
      reason: 'review' | 'authorization' | 'blocked' | 'manual_handover';
      message?: string;
      reviewRequests?: Array<{
        category: string;
        question: string;
        fieldId?: string;
        context?: Record<string, unknown>;
        evidence?: Array<Record<string, unknown>>;
        suggestedAnswer?: unknown;
        suggestionConfidence?: number;
        suggestionRationale?: string;
        requiredAction: 'answer' | 'approve' | 'authorize' | 'decide';
        responseSchema?: Record<string, unknown>;
      }>;
      stateUpdates?: Record<string, unknown>;
    }
  | {
      type: 'done';
      stateUpdates?: Record<string, unknown>;
    }
  | {
      type: 'failed';
      errorClass: string;
      error: string;
    };
