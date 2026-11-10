import { normalizeSkillName } from '../../ai';

export type EligibilityResult = 'pass' | 'fail' | 'unknown';
export type OverallEligibility = 'eligible' | 'ineligible' | 'unknown';

export interface EligibilityRuleResult {
  rule: string;
  result: EligibilityResult;
  mandatory: boolean;
  quote?: string;
  reason: string;
}

export interface CandidateProfileSnapshot {
  workAuthorizations?: Array<{ country: string; status: string }>;
  experienceYears?: number;
  education?: Array<{ degree: string; field?: string }>;
  skills?: Array<{ name: string; normalizedName?: string; level?: string }>;
}

export interface CandidatePreferencesSnapshot {
  preferredRoles?: string[];
  workModes?: string[];
  preferredLocations?: string[];
  willingToRelocate?: boolean;
  minSalary?: number;
  preferredSalary?: number;
  currency?: string;
}

export interface JobEvaluationContext {
  title: string;
  location?: string | null;
  workMode?: string | null;
  experienceMinYears?: number | null;
  educationRequirements?: Array<{ degree: string; field?: string; mandatory: boolean }>;
  skills: Array<{
    name: string;
    normalizedName: string;
    mandatory: boolean;
    level: string;
    quote?: string | null;
  }>;
  locationConstraints?: string[];
}

/**
 * Pure Eligibility Engine (Doc 03 FR-INT-2, Doc 07 §82).
 *
 * Rules:
 * - Each hard rule evaluates to pass | fail | unknown.
 * - Invariant: Any mandatory skill MUST cite a verbatim JD quote. If uncited, it is treated as non-mandatory.
 * - Overall:
 *   - Any fail on a mandatory condition -> 'ineligible'
 *   - No mandatory fails, but any mandatory condition is 'unknown' -> 'unknown'
 *   - Otherwise -> 'eligible'
 */
export function evaluateEligibility(
  job: JobEvaluationContext,
  candidateProfile?: CandidateProfileSnapshot | null,
  candidatePreferences?: CandidatePreferencesSnapshot | null
): {
  eligibility: OverallEligibility;
  rules: EligibilityRuleResult[];
} {
  const rules: EligibilityRuleResult[] = [];

  // 1. Work Authorization & Location Constraints
  if (job.locationConstraints && job.locationConstraints.length > 0) {
    const candidateAuthCountries = (candidateProfile?.workAuthorizations || []).map((a) =>
      a.country.toLowerCase()
    );

    const hasExplicitAuthConflict = job.locationConstraints.some((constraint) => {
      const lower = constraint.toLowerCase();
      // Check for strict citizenship / residency requirements
      if (lower.includes('citizenship required') || lower.includes('must be citizen')) {
        return !candidateAuthCountries.some((c) => lower.includes(c));
      }
      return false;
    });

    if (hasExplicitAuthConflict) {
      rules.push({
        rule: 'work_authorization',
        result: 'fail',
        mandatory: true,
        reason: `Candidate work authorization does not satisfy location constraints: ${job.locationConstraints.join(', ')}`,
      });
    } else {
      rules.push({
        rule: 'work_authorization',
        result: 'pass',
        mandatory: true,
        reason: 'No work authorization conflicts identified.',
      });
    }
  } else {
    rules.push({
      rule: 'work_authorization',
      result: 'pass',
      mandatory: false,
      reason: 'No explicit work authorization constraints specified in job listing.',
    });
  }

  // 2. Work Mode & Location Conflict
  const candidateWorkModes = candidatePreferences?.workModes || [];
  const jobWorkMode = (job.workMode || '').toLowerCase();

  if (candidateWorkModes.length > 0 && jobWorkMode) {
    const candidateAllowsRemote = candidateWorkModes.includes('remote');
    const candidateStrictlyRemote =
      candidateWorkModes.length === 1 && candidateAllowsRemote;

    if (jobWorkMode === 'remote') {
      rules.push({
        rule: 'location_and_work_mode',
        result: 'pass',
        mandatory: true,
        reason: 'Role is remote, satisfying candidate preferences.',
      });
    } else if (candidateStrictlyRemote && (jobWorkMode === 'onsite' || jobWorkMode === 'hybrid')) {
      rules.push({
        rule: 'location_and_work_mode',
        result: 'fail',
        mandatory: true,
        reason: `Role is ${jobWorkMode}, but candidate preferences strictly require remote work.`,
      });
    } else {
      // Check location overlap or willingness to relocate
      const preferredLocs = (candidatePreferences?.preferredLocations || []).map((l) =>
        l.toLowerCase()
      );
      const jobLoc = (job.location || '').toLowerCase();
      const matchesLocation = preferredLocs.some((p) => jobLoc.includes(p) || p.includes(jobLoc));

      if (matchesLocation || candidatePreferences?.willingToRelocate) {
        rules.push({
          rule: 'location_and_work_mode',
          result: 'pass',
          mandatory: true,
          reason: matchesLocation
            ? `Role location (${job.location}) matches preferred location.`
            : 'Candidate is open to relocation for onsite/hybrid roles.',
        });
      } else if (preferredLocs.length > 0) {
        rules.push({
          rule: 'location_and_work_mode',
          result: 'fail',
          mandatory: true,
          reason: `Role location (${job.location}) does not match candidate preferred locations and candidate is not open to relocation.`,
        });
      } else {
        rules.push({
          rule: 'location_and_work_mode',
          result: 'pass',
          mandatory: false,
          reason: 'No specific location preferences configured.',
        });
      }
    }
  } else {
    rules.push({
      rule: 'location_and_work_mode',
      result: 'pass',
      mandatory: false,
      reason: 'Work mode and location preferences not strictly specified.',
    });
  }

  // 3. Minimum Experience Requirement
  if (typeof job.experienceMinYears === 'number' && job.experienceMinYears > 0) {
    const candidateYears = candidateProfile?.experienceYears;

    if (typeof candidateYears === 'number') {
      if (candidateYears >= job.experienceMinYears) {
        rules.push({
          rule: 'minimum_experience',
          result: 'pass',
          mandatory: true,
          reason: `Candidate experience (${candidateYears} yrs) meets or exceeds requirement (${job.experienceMinYears}+ yrs).`,
        });
      } else {
        rules.push({
          rule: 'minimum_experience',
          result: 'fail',
          mandatory: true,
          reason: `Candidate experience (${candidateYears} yrs) is below mandatory requirement of ${job.experienceMinYears}+ yrs.`,
        });
      }
    } else {
      rules.push({
        rule: 'minimum_experience',
        result: 'unknown',
        mandatory: true,
        reason: `Role requires ${job.experienceMinYears}+ years of experience, but candidate profile experience is not recorded.`,
      });
    }
  }

  // 4. Education Requirements
  if (job.educationRequirements && job.educationRequirements.length > 0) {
    const candidateDegrees = (candidateProfile?.education || []).map((e) =>
      e.degree.toLowerCase()
    );

    for (const eduReq of job.educationRequirements) {
      if (!eduReq.mandatory) continue;
      const targetDegree = eduReq.degree.toLowerCase();

      if (candidateDegrees.length === 0) {
        rules.push({
          rule: `education_${eduReq.degree}`,
          result: 'unknown',
          mandatory: true,
          reason: `Mandatory education requirement (${eduReq.degree}) cannot be verified; candidate education is empty.`,
        });
      } else {
        const matchesDegree = candidateDegrees.some(
          (d) => d.includes(targetDegree) || targetDegree.includes(d)
        );
        if (matchesDegree) {
          rules.push({
            rule: `education_${eduReq.degree}`,
            result: 'pass',
            mandatory: true,
            reason: `Candidate holds qualifying degree matching ${eduReq.degree}.`,
          });
        } else {
          rules.push({
            rule: `education_${eduReq.degree}`,
            result: 'fail',
            mandatory: true,
            reason: `Candidate does not hold required degree (${eduReq.degree}).`,
          });
        }
      }
    }
  }

  // 5. Mandatory Skill Requirements (with JD Quote Verification Guard)
  const candidateSkills = new Set(
    (candidateProfile?.skills || []).map((s) => s.normalizedName || normalizeSkillName(s.name))
  );

  for (const skill of job.skills) {
    // Invariant (Doc 07 §82): Uncited mandatory skill is treated as non-mandatory
    const isGenuinelyMandatory = Boolean(skill.mandatory && skill.quote && skill.quote.trim().length > 0);

    if (isGenuinelyMandatory) {
      const hasSkill = candidateSkills.has(skill.normalizedName);

      if (hasSkill) {
        rules.push({
          rule: `mandatory_skill_${skill.normalizedName}`,
          result: 'pass',
          mandatory: true,
          quote: skill.quote || undefined,
          reason: `Candidate possesses verified mandatory skill: ${skill.name}.`,
        });
      } else {
        rules.push({
          rule: `mandatory_skill_${skill.normalizedName}`,
          result: 'fail',
          mandatory: true,
          quote: skill.quote || undefined,
          reason: `Candidate lacks verified mandatory skill: ${skill.name}. Grounding quote: "${skill.quote}".`,
        });
      }
    } else if (skill.mandatory) {
      // Grounding guard: AI claimed skill was mandatory but provided no verbatim quote
      rules.push({
        rule: `mandatory_skill_${skill.normalizedName}`,
        result: 'pass',
        mandatory: false,
        reason: `Uncited mandatory skill requirement downgraded to non-mandatory for ${skill.name} (no verbatim quote provided in job analysis).`,
      });
    }
  }

  // Determine Overall Eligibility:
  // - Any mandatory condition fail -> 'ineligible'
  // - No mandatory fails, but any mandatory condition unknown -> 'unknown'
  // - Otherwise -> 'eligible'
  const hasMandatoryFail = rules.some((r) => r.mandatory && r.result === 'fail');
  const hasMandatoryUnknown = rules.some((r) => r.mandatory && r.result === 'unknown');

  let eligibility: OverallEligibility = 'eligible';
  if (hasMandatoryFail) {
    eligibility = 'ineligible';
  } else if (hasMandatoryUnknown) {
    eligibility = 'unknown';
  }

  return {
    eligibility,
    rules,
  };
}
