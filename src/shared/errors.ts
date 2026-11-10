export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'INVALID_TRANSITION'
  | 'EXTERNAL_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'BLOCKED_BY_PORTAL'
  | 'AI_INVALID_OUTPUT'
  | 'BUDGET_EXCEEDED'
  | 'UNAUTHORIZED'
  | 'INTERNAL'
  | 'DUPLICATE_APPLICATION'
  | 'HEADED_UNAVAILABLE'
  | 'SUBMISSION_DISABLED'
  | 'AI_UNAVAILABLE';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown; details?: Record<string, unknown> }) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = options?.details;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}
