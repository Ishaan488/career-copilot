export type RiskLevel = 'low' | 'medium' | 'high' | 'unknown';

export interface RiskFactor {
  code: string;
  severity: 'low' | 'medium' | 'high';
  detail: string;
  evidenceIds?: string[];
}

export interface JobRiskContext {
  title: string;
  descriptionText?: string;
  ambiguities?: string[];
  injectionSuspected?: boolean;
  compMentions?: Array<{ text: string; min?: number; max?: number }>;
  locationConstraints?: string[];
  workMode?: string | null;
  companyLegitimacyLevel?: 'no_concerns_found' | 'some_concerns' | 'high_concern' | 'insufficient_evidence';
}

/**
 * Pure Risk Assessment (Doc 07 §84, Doc 15 T-RISK).
 *
 * Invariants:
 * - Insufficient evidence != low risk (it evaluates to 'unknown' or 'medium' with explanation).
 * - Severe contradictions or prompt injection attempts trigger high risk.
 */
export function assessRisk(job: JobRiskContext): {
  level: RiskLevel;
  factors: RiskFactor[];
} {
  const factors: RiskFactor[] = [];

  // 1. Prompt Injection or Untrusted Content Threat
  if (job.injectionSuspected) {
    factors.push({
      code: 'SUSPICIOUS_PROMPT_INJECTION',
      severity: 'high',
      detail:
        'Job description contains adversarial instructions or attempts to alter AI evaluation behavior.',
    });
  }

  // 2. High Ambiguity
  if (job.ambiguities && job.ambiguities.length >= 3) {
    factors.push({
      code: 'HIGH_AMBIGUITY',
      severity: 'medium',
      detail: `Job description has ${job.ambiguities.length} critical ambiguities identified during analysis.`,
    });
  }

  // 3. Contradictory Work Mode / Location
  const desc = (job.descriptionText || '').toLowerCase();
  const isMarkedRemote = (job.workMode || '').toLowerCase() === 'remote';
  const hasStrictOfficeMention =
    desc.includes('in-office every day') ||
    desc.includes('must be in the office 5 days') ||
    desc.includes('relocation to our headquarters is mandatory');

  if (isMarkedRemote && hasStrictOfficeMention) {
    factors.push({
      code: 'CONTRADICTORY_WORK_MODE',
      severity: 'medium',
      detail: 'Listing is marked as Remote but text explicitly dictates mandatory in-office presence.',
    });
  }

  // 4. Company Legitimacy Signals
  if (job.companyLegitimacyLevel === 'high_concern') {
    factors.push({
      code: 'COMPANY_LEGITIMACY_CONCERN',
      severity: 'high',
      detail: 'Company legitimacy checks flagged critical concerns.',
    });
  } else if (job.companyLegitimacyLevel === 'some_concerns') {
    factors.push({
      code: 'COMPANY_LEGITIMACY_CONCERN',
      severity: 'medium',
      detail: 'Company legitimacy checks identified minor concerns.',
    });
  } else if (job.companyLegitimacyLevel === 'insufficient_evidence') {
    factors.push({
      code: 'INSUFFICIENT_EVIDENCE',
      severity: 'medium',
      detail: 'Insufficient public evidence available to verify employer background.',
    });
  }

  // Determine Overall Risk Level:
  const hasHigh = factors.some((f) => f.severity === 'high');
  const hasMedium = factors.some((f) => f.severity === 'medium');

  let level: RiskLevel = 'low';
  if (hasHigh) {
    level = 'high';
  } else if (hasMedium) {
    level = 'medium';
  } else if (job.companyLegitimacyLevel === 'insufficient_evidence') {
    level = 'unknown';
  }

  return {
    level,
    factors,
  };
}
