// Browser automation primitives and portal drivers public API
export * from './types';
export * from './errors';
export * from './redact';
export * from './honeypot';
export * from './label-resolver';
export * from './drivers';
export * from './service';

import type { SubmitToken } from './types';

/**
 * Creates a branded SubmitToken after committing the submission intent (Doc 13 §8).
 */
export function createSubmitToken(params: {
  applicationId: string;
  submissionId: string;
  summaryHash: string;
}): SubmitToken {
  return {
    applicationId: params.applicationId,
    submissionId: params.submissionId,
    summaryHash: params.summaryHash,
    issuedAt: Date.now(),
  } as SubmitToken;
}
