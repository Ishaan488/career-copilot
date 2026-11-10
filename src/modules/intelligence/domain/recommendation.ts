import { OverallEligibility } from './eligibility';
import { RiskLevel, RiskFactor } from './risk';
import { SuitabilityBreakdown } from './scoring';

export type JobRecommendation =
  | 'strongly_recommended'
  | 'recommended'
  | 'consider'
  | 'low_priority'
  | 'not_eligible'
  | 'high_risk'
  | 'insufficient_information';

export interface RecommendationInput {
  hasDescriptionText: boolean;
  eligibility: OverallEligibility;
  suitabilityTotal: number;
  breakdown: SuitabilityBreakdown;
  riskLevel: RiskLevel;
  riskFactors: RiskFactor[];
}

/**
 * Pure Recommendation Function (Doc 03 FR-INT-7, Doc 07 §85, Doc 02 PRD §9).
 *
 * PRECEDENCE TABLE (Strict Invariant):
 * 1. Ineligible -> not_eligible (Property: Ineligible is NEVER positive or recommended)
 * 2. Risk high -> high_risk
 * 3. Critical info missing (no JD text, or mandatory eligibility unknown) -> insufficient_information
 * 4. Thresholds:
 *    - >= 85: strongly_recommended
 *    - >= 70: recommended
 *    - >= 55: consider
 *    - < 55:  low_priority
 */
export function deriveRecommendation(input: RecommendationInput): {
  recommendation: JobRecommendation;
  explanation: string;
} {
  // 1. Mandatory Eligibility Check (Invariant: Ineligible is NEVER recommended)
  if (input.eligibility === 'ineligible') {
    return {
      recommendation: 'not_eligible',
      explanation:
        'This job was marked Not Eligible because one or more mandatory eligibility requirements (e.g. mandatory skills, experience years, or work authorization) failed verification.',
    };
  }

  // 2. High Risk Check
  if (input.riskLevel === 'high') {
    const highRiskNotes = input.riskFactors
      .filter((f) => f.severity === 'high')
      .map((f) => f.detail)
      .join(' ');
    return {
      recommendation: 'high_risk',
      explanation: `Flagged as High Risk due to security or legitimacy concerns: ${highRiskNotes || 'Critical risks detected in listing.'}`,
    };
  }

  // 3. Insufficient Information Check
  if (!input.hasDescriptionText || input.eligibility === 'unknown') {
    return {
      recommendation: 'insufficient_information',
      explanation:
        'Insufficient information to complete recommendation. Either the job description text is empty or mandatory eligibility conditions require user clarification.',
    };
  }

  // 4. Score Threshold Mapping (PRD §9)
  let recommendation: JobRecommendation;
  if (input.suitabilityTotal >= 85) {
    recommendation = 'strongly_recommended';
  } else if (input.suitabilityTotal >= 70) {
    recommendation = 'recommended';
  } else if (input.suitabilityTotal >= 55) {
    recommendation = 'consider';
  } else {
    recommendation = 'low_priority';
  }

  // Formulate Explainable Narrative
  const tech = input.breakdown.technical;
  const matchedSkillsPreview =
    tech.matched.length > 0 ? tech.matched.slice(0, 3).join(', ') : 'None';
  const missingSkillsPreview =
    tech.missing.length > 0 ? tech.missing.slice(0, 3).join(', ') : 'None';

  const explanation = [
    `Evaluation completed with an overall Suitability Score of ${input.suitabilityTotal.toFixed(1)}/100 (${recommendation.replace('_', ' ')}).`,
    `Technical overlap: ${tech.matched.length} matched (${matchedSkillsPreview}), ${tech.missing.length} missing (${missingSkillsPreview}).`,
    `Role domain score: ${input.breakdown.role.score}/100.`,
    `Experience fit: ${input.breakdown.experience.notes}`,
    tech.isUnknownNeutral ? 'Compensation neutral (not disclosed).' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    recommendation,
    explanation,
  };
}
