import { describe, it, expect } from 'vitest';
import {
  calculateSuitability,
  validateScoringWeights,
  DEFAULT_SCORING_WEIGHTS,
  ScoringWeights,
  JobScoringContext,
} from '@/modules/intelligence/domain/scoring';
import { AppError } from '@/shared/errors';

describe('Suitability Scoring Engine (T-SCORE)', () => {
  const profile = {
    experienceYears: 6,
    skills: [
      { name: 'TypeScript', normalizedName: 'typescript', level: 'advanced' },
      { name: 'Node.js', normalizedName: 'nodejs', level: 'advanced' },
      { name: 'React', normalizedName: 'react', level: 'intermediate' },
    ],
  };

  const preferences = {
    workModes: ['remote', 'hybrid'],
    preferredLocations: ['Bangalore'],
    minSalary: 2000000,
    preferredSalary: 3000000,
    currency: 'INR',
  };

  it('validates that weights must sum to 100%', () => {
    const invalidWeights: ScoringWeights = {
      technical: 40,
      role: 30,
      experience: 20,
      compensation: 15,
      location: 10,
      company: 10, // Sum = 125
    };

    expect(() => validateScoringWeights(invalidWeights)).toThrow(AppError);
  });

  it('rejects negative weights', () => {
    const invalidWeights: ScoringWeights = {
      technical: 50,
      role: 30,
      experience: 20,
      compensation: 10,
      location: -10,
      company: 0,
    };

    expect(() => validateScoringWeights(invalidWeights)).toThrow(AppError);
  });

  it('computes 6-component weighted score correctly', () => {
    const job: JobScoringContext = {
      title: 'Senior TypeScript Developer',
      descriptionText: 'Looking for a Senior TypeScript and Node.js developer.',
      responsibilities: ['Build APIs in Node.js', 'Write robust TypeScript'],
      seniority: 'senior',
      experienceMinYears: 4,
      experienceMaxYears: 7,
      workMode: 'remote',
      location: 'Bangalore',
      compMin: 2500000,
      compMax: 3200000,
      compCurrency: 'INR',
      compDisclosed: true,
      aiRoleSemanticScore: 90,
      skills: [
        { name: 'TypeScript', normalizedName: 'typescript', level: 'required' },
        { name: 'Node.js', normalizedName: 'nodejs', level: 'required' },
      ],
      companyName: 'Acme Corp',
      isPreferredCompany: true,
    };

    const res = calculateSuitability(job, profile, preferences, DEFAULT_SCORING_WEIGHTS);
    expect(res.suitabilityTotal).toBeGreaterThanOrEqual(85);
    expect(res.breakdown.technical.score).toBeGreaterThanOrEqual(90);
    expect(res.breakdown.company.score).toBe(100);
    expect(res.breakdown.compensation.score).toBe(100);
  });

  it('scores undisclosed compensation as neutral 50 with isUnknownNeutral flag', () => {
    const job: JobScoringContext = {
      title: 'Backend Engineer',
      workMode: 'remote',
      compMin: null,
      compMax: null,
      skills: [],
    };

    const res = calculateSuitability(job, profile, preferences);
    expect(res.breakdown.compensation.score).toBe(50);
    expect(res.breakdown.compensation.isUnknownNeutral).toBe(true);
    expect(res.breakdown.compensation.notes).toContain('Compensation not disclosed');
  });

  it('scores standard company as neutral 50 with isUnknownNeutral flag', () => {
    const job: JobScoringContext = {
      title: 'Backend Engineer',
      workMode: 'remote',
      skills: [],
      isPreferredCompany: false,
    };

    const res = calculateSuitability(job, profile, preferences);
    expect(res.breakdown.company.score).toBe(50);
    expect(res.breakdown.company.isUnknownNeutral).toBe(true);
  });

  it('applies mild decay for significantly overqualified candidates', () => {
    const seniorProfile = {
      experienceYears: 15,
      skills: [],
    };

    const juniorJob: JobScoringContext = {
      title: 'Junior Developer',
      experienceMinYears: 1,
      experienceMaxYears: 2,
      skills: [],
    };

    const res = calculateSuitability(juniorJob, seniorProfile, preferences);
    // Overqualified experience score should be capped between 70 and 90
    expect(res.breakdown.experience.score).toBeLessThan(100);
    expect(res.breakdown.experience.score).toBeGreaterThanOrEqual(70);
  });
});
