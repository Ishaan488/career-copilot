export type ReviewCategory =
  | 'legal'
  | 'consent'
  | 'bond'
  | 'work_auth'
  | 'salary'
  | 'eeo'
  | 'sensitive'
  | 'company_legitimacy'
  | 'missing_profile'
  | 'custom_question'
  | 'other';

export type ReviewStatus =
  | 'pending'
  | 'answered'
  | 'approved'
  | 'rejected'
  | 'deferred'
  | 'cancelled'
  | 'expired';

export type RequiredAction = 'answer' | 'approve' | 'authorize' | 'decide';

export interface ResponseSchema {
  type: 'text' | 'select' | 'radio' | 'boolean' | 'number' | 'multiselect';
  options?: Array<{ label: string; value: string | boolean | number }>;
  required?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
}

export interface CreateReviewRequestInput {
  workflowId?: string;
  jobId: string;
  applicationId?: string;
  fieldId?: string;
  category: ReviewCategory;
  question: string;
  context?: Record<string, unknown>;
  uncertaintyReason?: string;
  evidence?: Array<Record<string, unknown>>;
  suggestedAnswer?: unknown;
  suggestionConfidence?: number;
  suggestionRationale?: string;
  requiredAction: RequiredAction;
  responseSchema?: ResponseSchema;
  checkpointStep?: string;
  expiresAt?: Date;
}

export interface RespondReviewRequestInput {
  answer: unknown;
  saveReusable?: boolean;
  reusableKey?: string;
  reusableScope?: { atsTypes?: string[]; companyIds?: string[] };
  notes?: string;
}

export interface DeferReviewRequestInput {
  snoozeUntil: Date;
  reason?: string;
}

export interface ReviewItem {
  id: string;
  workflowId?: string | null;
  jobId: string;
  jobTitle?: string;
  companyName?: string;
  applicationId?: string | null;
  fieldId?: string | null;
  category: ReviewCategory;
  isCoreCategory: boolean;
  question: string;
  context: Record<string, unknown>;
  uncertaintyReason?: string | null;
  evidence: Array<Record<string, unknown>>;
  suggestedAnswer?: unknown;
  suggestionConfidence?: number | null;
  suggestionRationale?: string | null;
  requiredAction: RequiredAction;
  responseSchema: ResponseSchema;
  status: ReviewStatus;
  userAnswer?: unknown;
  snoozedUntil?: Date | null;
  expiresAt?: Date | null;
  checkpointStep?: string | null;
  createdAt: Date;
  resolvedAt?: Date | null;
}
