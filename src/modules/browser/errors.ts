export type BrowserErrorClass =
  | 'NAVIGATION_TIMEOUT'
  | 'ELEMENT_NOT_FOUND'
  | 'LAYOUT_CHANGED'
  | 'BLOCKED_BY_PORTAL'
  | 'SESSION_EXPIRED'
  | 'FILL_MISMATCH'
  | 'VALIDATION_ERROR_ON_PORTAL'
  | 'UPLOAD_FAILED'
  | 'BROWSER_CRASHED'
  | 'SUBMIT_UNCERTAIN'
  | 'ALREADY_APPLIED'
  | 'UNKNOWN';

export class BrowserError extends Error {
  public readonly errorClass: BrowserErrorClass;
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    errorClass: BrowserErrorClass,
    message: string,
    options?: { retryable?: boolean; details?: Record<string, unknown>; cause?: unknown }
  ) {
    super(message);
    this.name = 'BrowserError';
    this.errorClass = errorClass;
    this.details = options?.details;
    if (options?.cause) {
      this.cause = options.cause;
    }

    if (options?.retryable !== undefined) {
      this.retryable = options.retryable;
    } else {
      this.retryable = isRetryableErrorClass(errorClass);
    }
  }
}

export function isRetryableErrorClass(errorClass: BrowserErrorClass): boolean {
  switch (errorClass) {
    case 'NAVIGATION_TIMEOUT':
    case 'ELEMENT_NOT_FOUND':
    case 'BROWSER_CRASHED':
    case 'UPLOAD_FAILED':
      return true;
    case 'BLOCKED_BY_PORTAL':
    case 'LAYOUT_CHANGED':
    case 'SUBMIT_UNCERTAIN':
    case 'FILL_MISMATCH':
    case 'SESSION_EXPIRED':
    case 'VALIDATION_ERROR_ON_PORTAL':
    case 'ALREADY_APPLIED':
    case 'UNKNOWN':
    default:
      return false;
  }
}
