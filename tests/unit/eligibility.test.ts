import { describe, it, expect } from 'vitest';
import {
  evaluateEligibility,
  CandidateProfileSnapshot,
  CandidatePreferencesSnapshot,
  JobEvaluationContext,
} from '@/modules/intelligence/domain/eligibility';

describe('Eligibility Engine (T-ELIG)', () => {
  const baseProfile: CandidateProfileSnapshot = {
    workAuthorizations: [{ country: 'India', status: 'citizen' }],
    experienceYears: 5,
    education: [{ degree: 'B.Tech', field: 'Computer Science' }],
    skills: [
      { name: 'TypeScript', normalizedName: 'typescript', level: 'advanced' },
      { name: 'Node.js', normalizedName: 'nodejs', level: 'advanced' },
      { name: 'PostgreSQL', normalizedName: 'postgresql', level: 'intermediate' },
    ],
  };

  const basePreferences: CandidatePreferencesSnapshot = {
    workModes: ['remote', 'hybrid'],
    preferredLocations: ['Bangalore', 'Remote'],
    willingToRelocate: false,
    minSalary: 1500000,
    preferredSalary: 2500000,
    currency: 'INR',
  };

  it('passes when candidate meets experience, skills, and work mode', () => {
    const job: JobEvaluationContext = {
      title: 'Senior Backend Engineer',
      workMode: 'remote',
      location: 'Bangalore',
      experienceMinYears: 3,
      skills: [
        {
          name: 'TypeScript',
          normalizedName: 'typescript',
          mandatory: true,
          level: 'required',
          quote: 'At least 3 years of TypeScript experience required',
        },
      ],
    };

    const res = evaluateEligibility(job, baseProfile, basePreferences);
    expect(res.eligibility).toBe('eligible');
    expect(res.rules.every((r) => r.result === 'pass')).toBe(true);
  });

  it('fails overall when mandatory skill with verbatim quote is missing', () => {
    const job: JobEvaluationContext = {
      title: 'Rust Backend Engineer',
      workMode: 'remote',
      experienceMinYears: 3,
      skills: [
        {
          name: 'Rust',
          normalizedName: 'rust',
          mandatory: true,
          level: 'required',
          quote: 'Must have extensive production experience with Rust',
        },
      ],
    };

    const res = evaluateEligibility(job, baseProfile, basePreferences);
    expect(res.eligibility).toBe('ineligible');
    const skillRule = res.rules.find((r) => r.rule === 'mandatory_skill_rust');
    expect(skillRule?.result).toBe('fail');
    expect(skillRule?.mandatory).toBe(true);
  });

  it('downgrades uncited mandatory skill to non-mandatory (grounding guard against AI fabrication)', () => {
    const job: JobEvaluationContext = {
      title: 'Go Engineer',
      workMode: 'remote',
      experienceMinYears: 3,
      skills: [
        {
          name: 'Go',
          normalizedName: 'golang',
          mandatory: true,
          level: 'required',
          quote: null, // AI marked mandatory but provided NO verbatim quote!
        },
      ],
    };

    const res = evaluateEligibility(job, baseProfile, basePreferences);
    // Uncited skill should NOT disqualify candidate
    expect(res.eligibility).toBe('eligible');
    const skillRule = res.rules.find((r) => r.rule === 'mandatory_skill_golang');
    expect(skillRule?.mandatory).toBe(false);
    expect(skillRule?.reason).toContain('Uncited mandatory skill requirement downgraded');
  });

  it('fails when candidate has strict remote preference but role is onsite', () => {
    const strictRemotePrefs: CandidatePreferencesSnapshot = {
      ...basePreferences,
      workModes: ['remote'], // strictly remote
    };

    const job: JobEvaluationContext = {
      title: 'Backend Engineer',
      workMode: 'onsite',
      location: 'Hyderabad',
      experienceMinYears: 2,
      skills: [],
    };

    const res = evaluateEligibility(job, baseProfile, strictRemotePrefs);
    expect(res.eligibility).toBe('ineligible');
    const locRule = res.rules.find((r) => r.rule === 'location_and_work_mode');
    expect(locRule?.result).toBe('fail');
  });

  it('fails when candidate experience is below mandatory minimum', () => {
    const juniorProfile: CandidateProfileSnapshot = {
      ...baseProfile,
      experienceYears: 2,
    };

    const job: JobEvaluationContext = {
      title: 'Principal Architect',
      workMode: 'remote',
      experienceMinYears: 8,
      skills: [],
    };

    const res = evaluateEligibility(job, juniorProfile, basePreferences);
    expect(res.eligibility).toBe('ineligible');
    const expRule = res.rules.find((r) => r.rule === 'minimum_experience');
    expect(expRule?.result).toBe('fail');
  });

  it('fails when work authorization conflict exists', () => {
    const job: JobEvaluationContext = {
      title: 'Defense Systems Software Engineer',
      workMode: 'onsite',
      locationConstraints: ['US Citizenship required', 'Secret clearance'],
      skills: [],
    };

    const res = evaluateEligibility(job, baseProfile, basePreferences);
    expect(res.eligibility).toBe('ineligible');
    const authRule = res.rules.find((r) => r.rule === 'work_authorization');
    expect(authRule?.result).toBe('fail');
  });
});
