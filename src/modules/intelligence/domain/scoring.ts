import { normalizeSkillName } from '../../ai';
import { AppError } from '../../../shared/errors';
import { CandidateProfileSnapshot, CandidatePreferencesSnapshot } from './eligibility';

export interface ScoringWeights {
  technical: number;
  role: number;
  experience: number;
  compensation: number;
  location: number;
  company: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  technical: 30,
  role: 20,
  experience: 15,
  compensation: 15,
  location: 10,
  company: 10,
};

export interface ComponentBreakdown {
  score: number;
  weight: number;
  matched: string[];
  missing: string[];
  notes: string;
  isUnknownNeutral?: boolean;
}

export interface SuitabilityBreakdown {
  technical: ComponentBreakdown;
  role: ComponentBreakdown;
  experience: ComponentBreakdown;
  compensation: ComponentBreakdown;
  location: ComponentBreakdown;
  company: ComponentBreakdown;
}

export interface JobScoringContext {
  title: string;
  descriptionText?: string;
  responsibilities?: string[];
  seniority?: string | null;
  experienceMinYears?: number | null;
  experienceMaxYears?: number | null;
  workMode?: string | null;
  location?: string | null;
  compMin?: number | null;
  compMax?: number | null;
  compCurrency?: string | null;
  compPeriod?: string | null;
  compDisclosed?: boolean;
  skills: Array<{
    name: string;
    normalizedName: string;
    level: string; // 'required' | 'preferred'
  }>;
  companyName?: string;
  isPreferredCompany?: boolean;
  aiRoleSemanticScore?: number | null; // optional AI semantic score
}

/**
 * Validates that scoring weights sum to 100 ± 0.01.
 */
export function validateScoringWeights(weights: ScoringWeights): void {
  const sum =
    weights.technical +
    weights.role +
    weights.experience +
    weights.compensation +
    weights.location +
    weights.company;

  if (Math.abs(sum - 100) > 0.01) {
    throw new AppError(
      'VALIDATION',
      `Scoring weights must sum to 100±0.01, received total: ${sum.toFixed(2)}`
    );
  }

  for (const [key, val] of Object.entries(weights)) {
    if (val < 0) {
      throw new AppError('VALIDATION', `Scoring weight for ${key} cannot be negative.`);
    }
  }
}

/**
 * Calculates candidate skill proficiency factor.
 */
function getProficiencyMultiplier(level?: string): number {
  switch ((level || '').toLowerCase()) {
    case 'expert':
      return 1.0;
    case 'advanced':
      return 0.9;
    case 'intermediate':
      return 0.75;
    case 'beginner':
      return 0.5;
    default:
      return 0.8;
  }
}

/**
 * Pure Suitability Scoring Engine (Doc 03 FR-INT-3, Doc 07 §83, Doc 02 PRD §9).
 */
export function calculateSuitability(
  job: JobScoringContext,
  candidateProfile?: CandidateProfileSnapshot | null,
  candidatePreferences?: CandidatePreferencesSnapshot | null,
  customWeights?: ScoringWeights
): {
  suitabilityTotal: number;
  breakdown: SuitabilityBreakdown;
} {
  const weights = customWeights || DEFAULT_SCORING_WEIGHTS;
  validateScoringWeights(weights);

  // 1. Technical Match Component
  const candidateSkillsMap = new Map<string, string>();
  for (const s of candidateProfile?.skills || []) {
    const norm = s.normalizedName || normalizeSkillName(s.name);
    candidateSkillsMap.set(norm, s.level || 'intermediate');
  }

  let technicalPointsEarned = 0;
  let technicalMaxPoints = 0;
  const techMatched: string[] = [];
  const techMissing: string[] = [];

  if (job.skills.length === 0) {
    // If no specific skills listed, default to neutral 70
    technicalPointsEarned = 70;
    technicalMaxPoints = 100;
  } else {
    for (const skill of job.skills) {
      const isRequired = skill.level === 'required';
      const pointWeight = isRequired ? 2 : 1;
      technicalMaxPoints += pointWeight;

      if (candidateSkillsMap.has(skill.normalizedName)) {
        const factor = getProficiencyMultiplier(candidateSkillsMap.get(skill.normalizedName));
        technicalPointsEarned += pointWeight * factor;
        techMatched.push(skill.name);
      } else {
        techMissing.push(skill.name);
      }
    }
  }

  const technicalScore =
    technicalMaxPoints > 0
      ? Math.min(100, Math.round((technicalPointsEarned / technicalMaxPoints) * 100))
      : 70;

  // 2. Role Match Component
  // Keyword overlap between title/responsibilities and candidate background
  const jobTitleTokens = new Set(
    job.title
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2)
  );

  const candidateTitleTokens = new Set<string>();
  if (candidateProfile?.skills) {
    for (const s of candidateProfile.skills) {
      for (const t of s.name.toLowerCase().split(/\W+/)) {
        if (t.length > 2) candidateTitleTokens.add(t);
      }
    }
  }
  if (candidatePreferences?.preferredRoles) {
    for (const r of candidatePreferences.preferredRoles) {
      for (const t of r.toLowerCase().split(/\W+/)) {
        if (t.length > 2) candidateTitleTokens.add(t);
      }
    }
  }

  let overlapCount = 0;
  for (const token of jobTitleTokens) {
    if (candidateTitleTokens.has(token)) overlapCount++;
  }

  const deterministicRoleScore =
    jobTitleTokens.size > 0
      ? Math.min(100, Math.round((overlapCount / jobTitleTokens.size) * 100))
      : 70;

  // If AI semantic score is present, blend 50/50
  let roleScore = deterministicRoleScore;
  if (
    typeof job.aiRoleSemanticScore === 'number' &&
    job.aiRoleSemanticScore >= 0 &&
    job.aiRoleSemanticScore <= 100
  ) {
    roleScore = Math.round((job.aiRoleSemanticScore + deterministicRoleScore) / 2);
  }

  // 3. Experience Match Component (Optimal fit curve)
  const candidateYears = candidateProfile?.experienceYears ?? null;
  let experienceScore = 70;
  let experienceNotes = 'Experience fit evaluated.';

  if (typeof candidateYears === 'number') {
    const minY = job.experienceMinYears ?? 0;
    const maxY = job.experienceMaxYears ?? minY + 5;

    if (candidateYears >= minY && candidateYears <= maxY) {
      experienceScore = 100;
      experienceNotes = `Exact fit: candidate has ${candidateYears} yrs for target range [${minY}, ${maxY}].`;
    } else if (candidateYears < minY) {
      const ratio = minY > 0 ? candidateYears / minY : 1;
      experienceScore = Math.max(0, Math.min(95, Math.round(ratio * 100)));
      experienceNotes = `Under requirement: candidate has ${candidateYears} yrs vs ${minY}+ yrs required.`;
    } else {
      // Overqualified mild decay (capped at min 70)
      const overYears = candidateYears - maxY;
      experienceScore = Math.max(70, Math.round(100 - overYears * 4));
      experienceNotes = `Exceeds max range: candidate has ${candidateYears} yrs vs max ${maxY} yrs (mild decay).`;
    }
  } else {
    experienceScore = 50;
    experienceNotes = 'Candidate experience years not recorded in profile.';
  }

  // 4. Compensation Match Component (Doc 07 §83: unknown -> neutral 50 flagged)
  let compScore = 50;
  let isCompUnknown = false;
  let compNotes = '';

  const hasJobComp = Boolean(
    job.compDisclosed !== false &&
    (typeof job.compMin === 'number' || typeof job.compMax === 'number')
  );
  const hasPrefComp = typeof candidatePreferences?.minSalary === 'number';

  if (!hasJobComp || !hasPrefComp) {
    compScore = 50;
    isCompUnknown = true;
    compNotes = !hasJobComp
      ? 'Compensation not disclosed in listing; scored neutral 50.'
      : 'Target compensation preferences not configured; scored neutral 50.';
  } else {
    const targetMin = candidatePreferences?.minSalary || 0;
    const targetPref = candidatePreferences?.preferredSalary || targetMin * 1.2;
    const offerMax = job.compMax || job.compMin || 0;

    if (offerMax >= targetPref) {
      compScore = 100;
      compNotes = `Offered compensation (${offerMax}) meets or exceeds preferred target (${targetPref}).`;
    } else if (offerMax >= targetMin) {
      const range = targetPref - targetMin;
      const progress = range > 0 ? (offerMax - targetMin) / range : 1;
      compScore = Math.round(50 + progress * 50);
      compNotes = `Offered compensation (${offerMax}) satisfies minimum requirement (${targetMin}).`;
    } else {
      const ratio = targetMin > 0 ? offerMax / targetMin : 0;
      compScore = Math.max(0, Math.min(45, Math.round(ratio * 50)));
      compNotes = `Offered compensation (${offerMax}) is below target minimum (${targetMin}).`;
    }
  }

  // 5. Location / Work Mode Component
  const candidateWorkModes = candidatePreferences?.workModes || [];
  const jobWorkMode = (job.workMode || '').toLowerCase();
  let locationScore = 75;
  let locationNotes = 'Standard location fit.';

  if (candidateWorkModes.length > 0 && jobWorkMode) {
    if (jobWorkMode === 'remote' && candidateWorkModes.includes('remote')) {
      locationScore = 100;
      locationNotes = 'Remote position matches remote preference.';
    } else if (candidateWorkModes.includes(jobWorkMode)) {
      locationScore = 90;
      locationNotes = `Work mode (${jobWorkMode}) matches candidate preference.`;
    } else if (candidatePreferences?.willingToRelocate) {
      locationScore = 75;
      locationNotes = 'Candidate is open to relocation for this position.';
    } else {
      locationScore = 30;
      locationNotes = `Work mode (${jobWorkMode}) does not align with preferred modes (${candidateWorkModes.join(', ')}).`;
    }
  }

  // 6. Company Attractiveness Component
  let companyScore = 50;
  let isCompanyUnknown = false;
  let companyNotes = 'Neutral company attractiveness.';

  if (job.isPreferredCompany) {
    companyScore = 100;
    companyNotes = 'Company is on your priority target list.';
  } else {
    companyScore = 50;
    isCompanyUnknown = true;
    companyNotes = 'Standard / neutral company profile; scored neutral 50.';
  }

  // Assemble Breakdown
  const breakdown: SuitabilityBreakdown = {
    technical: {
      score: technicalScore,
      weight: weights.technical,
      matched: techMatched,
      missing: techMissing,
      notes: `${techMatched.length} matched, ${techMissing.length} missing.`,
    },
    role: {
      score: roleScore,
      weight: weights.role,
      matched: Array.from(jobTitleTokens).filter((t) => candidateTitleTokens.has(t)),
      missing: Array.from(jobTitleTokens).filter((t) => !candidateTitleTokens.has(t)),
      notes: `Role match score based on title & domain alignment.`,
    },
    experience: {
      score: experienceScore,
      weight: weights.experience,
      matched: [],
      missing: [],
      notes: experienceNotes,
    },
    compensation: {
      score: compScore,
      weight: weights.compensation,
      matched: [],
      missing: [],
      notes: compNotes,
      isUnknownNeutral: isCompUnknown,
    },
    location: {
      score: locationScore,
      weight: weights.location,
      matched: [],
      missing: [],
      notes: locationNotes,
    },
    company: {
      score: companyScore,
      weight: weights.company,
      matched: [],
      missing: [],
      notes: companyNotes,
      isUnknownNeutral: isCompanyUnknown,
    },
  };

  // Calculate Weighted Total:
  const weightedSum =
    technicalScore * (weights.technical / 100) +
    roleScore * (weights.role / 100) +
    experienceScore * (weights.experience / 100) +
    compScore * (weights.compensation / 100) +
    locationScore * (weights.location / 100) +
    companyScore * (weights.company / 100);

  const suitabilityTotal = Math.max(0, Math.min(100, Math.round(weightedSum * 100) / 100));

  return {
    suitabilityTotal,
    breakdown,
  };
}
