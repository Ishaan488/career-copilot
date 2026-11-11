import {
  EvidenceItem,
  LegitimacyAssessmentResult,
  LegitimacyRiskFactor,
  LegitimacyStatus,
  ResearchSignals,
} from './types';

/**
 * Pure Company Legitimacy Assessment Engine (Doc 07 §84, User Q3).
 *
 * Invariants:
 * - Insufficient evidence != low risk (evaluates explicitly to 'insufficient_evidence').
 * - Zero fabrication: missing signals remain explicitly absent / unknown.
 * - Severe inconsistencies (unreachable domain, empty shell, insecure HTTP) escalate risk.
 */
export function assessCompanyLegitimacy(
  signals: ResearchSignals,
  evidence: EvidenceItem[]
): LegitimacyAssessmentResult {
  const riskFactors: LegitimacyRiskFactor[] = [];
  const verifiedSignals: string[] = [];
  let score = 0;

  // 1. Evidence Check
  if (evidence.length === 0 || signals.isUnknown) {
    return {
      status: 'insufficient_evidence',
      score: 0,
      riskFactors: [
        {
          code: 'INSUFFICIENT_EVIDENCE',
          severity: 'low',
          description: 'No verifiable evidence collected yet for this company.',
        },
      ],
      summary: 'Insufficient public evidence available to assess company legitimacy.',
      verifiedSignals: [],
    };
  }

  // 2. Official Domain & Protocol
  if (signals.hasOfficialDomain) {
    score += 15;
    verifiedSignals.push('Official Domain Active');

    if (signals.isHttps) {
      score += 10;
      verifiedSignals.push('HTTPS / TLS Enforced');
    } else {
      riskFactors.push({
        code: 'INSECURE_HTTP',
        severity: 'medium',
        description: 'Official website does not enforce secure HTTPS/TLS encryption.',
      });
    }
  } else {
    riskFactors.push({
      code: 'NO_OFFICIAL_DOMAIN',
      severity: 'high',
      description: 'No verified official website or primary domain could be reached.',
    });
  }

  // 3. Career Presence & ATS Integration
  if (signals.hasCareerPage) {
    score += 25;
    const atsLabel = signals.atsType && signals.atsType !== 'unknown'
      ? ` (${signals.atsType})`
      : '';
    verifiedSignals.push(`Career Portal Verified${atsLabel}`);
  }

  // 4. About Us & Company Background
  if (signals.hasAboutPage) {
    score += 15;
    verifiedSignals.push('About Us / Mission Verified');
  }

  // 5. Contact Details & Physical Presence
  if (signals.hasPhysicalAddress) {
    score += 10;
    verifiedSignals.push('Physical Location Disclosed');
  }

  if (signals.hasContactEmailOrPhone) {
    score += 10;
    verifiedSignals.push('Direct Contact Methods Verified');
  }

  // 6. Social & Industry Presence
  if (signals.socialLinks && signals.socialLinks.length > 0) {
    score += 10;
    verifiedSignals.push(`Social Presence Verified (${signals.socialLinks.length} channels)`);
  }

  if (signals.industry) {
    score += 5;
  }

  // 7. Check for Empty Shell Site
  if (
    signals.hasOfficialDomain &&
    !signals.hasCareerPage &&
    !signals.hasAboutPage &&
    !signals.hasContactEmailOrPhone &&
    !signals.hasPhysicalAddress
  ) {
    riskFactors.push({
      code: 'EMPTY_SHELL_SITE',
      severity: 'high',
      description: 'Website appears to be a minimal or empty placeholder with no verifiable company history, staff, or contact information.',
    });
    score = Math.max(0, score - 30);
  }

  // 8. Domain Age Check
  if (signals.domainAgeDays !== undefined && signals.domainAgeDays < 30) {
    riskFactors.push({
      code: 'RECENTLY_REGISTERED_DOMAIN',
      severity: 'medium',
      description: `Domain was registered very recently (${signals.domainAgeDays} days ago).`,
    });
    score = Math.max(0, score - 20);
  }

  // Clamp score between 0 and 100
  const finalScore = Math.min(100, Math.max(0, Math.round(score)));

  // Determine Status based on rules and severity
  const hasHighRisk = riskFactors.some((f) => f.severity === 'high');
  let status: LegitimacyStatus;

  if (hasHighRisk) {
    status = 'high_concern';
  } else if (finalScore >= 70) {
    status = 'verified';
  } else if (finalScore >= 40) {
    status = 'some_concerns';
  } else {
    status = 'high_concern';
  }

  // Formulate Explainable Summary
  let summary: string;
  if (status === 'verified') {
    summary = `Company verified with legitimacy score of ${finalScore}/100. Signals confirmed: ${verifiedSignals.join(', ')}.`;
  } else if (status === 'some_concerns') {
    const issues = riskFactors.map((f) => f.description).join(' ');
    summary = `Company scored ${finalScore}/100 with moderate concerns: ${issues || 'Limited verifiable operational signals.'}`;
  } else {
    const highRisks = riskFactors.map((f) => f.description).join(' ');
    summary = `High legitimacy concern (Score ${finalScore}/100): ${highRisks || 'Significant operational red flags detected.'}`;
  }

  return {
    status,
    score: finalScore,
    riskFactors,
    summary,
    verifiedSignals,
  };
}
