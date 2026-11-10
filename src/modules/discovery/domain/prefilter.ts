export interface PrefilterPreferences {
  excludedCompanies?: string[];
  excludedTitles?: string[];
  requiredWorkModes?: string[];
  minimumComp?: {
    amount: number;
    currency: string;
    period: 'yearly' | 'monthly' | 'hourly';
  } | null;
}

export interface PrefilterJobCandidate {
  companyName?: string | null;
  normalizedTitle: string;
  workMode: string;
  compDisclosed: boolean;
  compMin?: string | null;
  compMax?: string | null;
  compCurrency?: string | null;
  compPeriod?: string | null;
}

export interface PrefilterResult {
  passed: boolean;
  reasons: string[];
}

/**
 * Evaluates deterministic pre-filter rules against hard user preferences.
 * All decisions are strictly traceable with zero fabrication.
 */
export function evaluatePrefilter(
  job: PrefilterJobCandidate,
  preferences?: PrefilterPreferences
): PrefilterResult {
  const reasons: string[] = [];

  if (!preferences) {
    return { passed: true, reasons: [] };
  }

  // 1. Excluded companies check
  if (preferences.excludedCompanies && preferences.excludedCompanies.length > 0 && job.companyName) {
    const compLower = job.companyName.toLowerCase();
    for (const excluded of preferences.excludedCompanies) {
      if (compLower.includes(excluded.toLowerCase())) {
        reasons.push(`Company '${job.companyName}' matches excluded company pattern '${excluded}'`);
      }
    }
  }

  // 2. Excluded title keywords check
  if (preferences.excludedTitles && preferences.excludedTitles.length > 0) {
    const title = job.normalizedTitle;
    for (const kw of preferences.excludedTitles) {
      const kwLower = kw.toLowerCase().trim();
      if (kwLower && title.includes(kwLower)) {
        reasons.push(`Job title matches excluded keyword '${kw}'`);
      }
    }
  }

  // 3. Work mode requirements check
  if (
    preferences.requiredWorkModes &&
    preferences.requiredWorkModes.length > 0 &&
    job.workMode !== 'unknown'
  ) {
    const allowed = preferences.requiredWorkModes.map((m) => m.toLowerCase());
    if (!allowed.includes(job.workMode.toLowerCase())) {
      reasons.push(
        `Job work mode '${job.workMode}' is not among required work modes: [${allowed.join(', ')}]`
      );
    }
  }

  // 4. Disclosed compensation minimum floor check
  if (
    preferences.minimumComp &&
    job.compDisclosed &&
    job.compMax &&
    job.compCurrency &&
    job.compPeriod
  ) {
    const jobCur = job.compCurrency.toUpperCase();
    const prefCur = preferences.minimumComp.currency.toUpperCase();

    // Check if currencies and periods match for direct comparison
    if (jobCur === prefCur && job.compPeriod === preferences.minimumComp.period) {
      const maxOffer = parseFloat(job.compMax);
      if (!isNaN(maxOffer) && maxOffer < preferences.minimumComp.amount) {
        reasons.push(
          `Disclosed maximum compensation (${jobCur} ${maxOffer.toLocaleString()}/${job.compPeriod}) is below configured minimum (${prefCur} ${preferences.minimumComp.amount.toLocaleString()}/${preferences.minimumComp.period})`
        );
      }
    }
  }

  return {
    passed: reasons.length === 0,
    reasons,
  };
}
