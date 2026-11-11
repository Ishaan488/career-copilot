import { StepContext, StepResult } from './types';

export const KNOWN_ATS_DOMAINS: ReadonlySet<string> = new Set([
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'jobs.lever.co',
  'jobs.ashbyhq.com',
  'jobs.smartrecruiters.com',
  'apply.workable.com',
]);

/**
 * Checks whether an application domain is recognized as an authoritative ATS
 * or matches the company's verified primary domain (Doc 10 §4 Step 2).
 */
export function isDomainVerified(
  urlStr: string,
  companyPrimaryDomain?: string | null
): boolean {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();

    if (KNOWN_ATS_DOMAINS.has(host)) {
      return true;
    }

    if (process.env.NODE_ENV === 'test' && (host === '127.0.0.1' || host === 'localhost')) {
      return true;
    }

    if (companyPrimaryDomain) {
      const cleanCompanyDomain = companyPrimaryDomain.toLowerCase().replace(/^www\./, '');
      if (host === cleanCompanyDomain || host.endsWith(`.${cleanCompanyDomain}`)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Determines the next step or pause requirement for resolve_url.
 */
export function executeResolveUrlStep(
  jobUrl: string | null | undefined,
  ctx: StepContext
): StepResult {
  if (!jobUrl || !jobUrl.trim()) {
    return {
      type: 'pause',
      reason: 'review',
      message: 'Application URL is missing for this position.',
      reviewRequests: [
        {
          category: 'missing_profile',
          question: 'No valid application URL found. Please provide or verify the official application portal link.',
          requiredAction: 'answer',
          responseSchema: { type: 'text' },
          context: { jobId: ctx.jobId },
        },
      ],
    };
  }

  return {
    type: 'next',
    nextStep: 'verify_domain',
    stateUpdates: { applicationUrl: jobUrl.trim() },
  };
}

/**
 * Determines the next step or pause requirement for verify_domain.
 */
export function executeVerifyDomainStep(
  applicationUrl: string,
  companyDomain: string | null | undefined,
  ctx: StepContext
): StepResult {
  const verified = isDomainVerified(applicationUrl, companyDomain);

  if (!verified) {
    let hostname = 'unknown';
    try {
      hostname = new URL(applicationUrl).hostname;
    } catch {
      // invalid URL
    }

    return {
      type: 'pause',
      reason: 'review',
      message: `Application portal host '${hostname}' is unverified.`,
      reviewRequests: [
        {
          category: 'company_legitimacy',
          question: `Application portal host '${hostname}' does not match known authoritative ATS hosts or verified company domains. Confirm whether to proceed.`,
          requiredAction: 'authorize',
          responseSchema: {
            type: 'radio',
            options: [
              { label: 'Yes, domain is legitimate — proceed', value: true },
              { label: 'No, reject this portal link', value: false },
            ],
          },
          context: { applicationUrl, hostname, jobId: ctx.jobId },
        },
      ],
      stateUpdates: { verifiedDomain: false },
    };
  }

  return {
    type: 'next',
    nextStep: 'select_resume',
    stateUpdates: { verifiedDomain: true },
  };
}

/**
 * Determines the next step or pause requirement for select_resume.
 */
export function executeSelectResumeStep(
  selectedResumeVersionId: string | null | undefined,
  defaultResumeVersionId: string | null | undefined,
  ctx: StepContext
): StepResult {
  const chosenVersionId = selectedResumeVersionId || defaultResumeVersionId;

  if (!chosenVersionId) {
    return {
      type: 'pause',
      reason: 'review',
      message: 'No resume selected for application.',
      reviewRequests: [
        {
          category: 'missing_profile',
          question: 'Please select an uploaded, immutable PDF resume version to attach to this application.',
          requiredAction: 'decide',
          responseSchema: { type: 'text' },
          context: { jobId: ctx.jobId, applicationId: ctx.applicationId },
        },
      ],
    };
  }

  return {
    type: 'next',
    nextStep: 'detect_platform',
    stateUpdates: { resumeVersionId: chosenVersionId },
  };
}

/**
 * Determines ATS platform type from the URL.
 */
export function detectAtsPlatform(urlStr: string): 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'generic' {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();

    if (host.includes('greenhouse.io')) return 'greenhouse';
    if (host.includes('lever.co')) return 'lever';
    if (host.includes('ashbyhq.com')) return 'ashby';
    if (host.includes('smartrecruiters.com')) return 'smartrecruiters';

    return 'generic';
  } catch {
    return 'generic';
  }
}

/**
 * Determines the next step for detect_platform.
 */
export function executeDetectPlatformStep(applicationUrl: string): StepResult {
  const platform = detectAtsPlatform(applicationUrl);
  return {
    type: 'next',
    nextStep: 'open_portal',
    stateUpdates: { platform },
  };
}

/**
 * Determines the next step or pause for await_submission_decision.
 * Default is manual handover (Doc 10 §4 Step 12).
 */
export function executeAwaitSubmissionDecisionStep(
  applicationUrl: string,
  summaryHash: string,
  _ctx: StepContext
): StepResult {
  return {
    type: 'pause',
    reason: 'manual_handover',
    message: 'Application is prefilled and verified. Ready for manual browser handover and submission.',
    stateUpdates: {
      handoverReady: true,
      summaryHash,
      applicationUrl,
    },
  };
}
