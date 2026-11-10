import { describe, it, expect } from 'vitest';
import {
  deriveRecommendation,
  RecommendationInput,
} from '@/modules/intelligence/domain/recommendation';
import { SuitabilityBreakdown } from '@/modules/intelligence/domain/scoring';

describe('Recommendation Precedence Engine (T-REC)', () => {
  const dummyBreakdown: SuitabilityBreakdown = {
    technical: { score: 95, weight: 30, matched: ['TypeScript'], missing: [], notes: 'Good' },
    role: { score: 90, weight: 20, matched: [], missing: [], notes: 'Good' },
    experience: { score: 85, weight: 15, matched: [], missing: [], notes: 'Good' },
    compensation: { score: 80, weight: 15, matched: [], missing: [], notes: 'Good' },
    location: { score: 90, weight: 10, matched: [], missing: [], notes: 'Good' },
    company: { score: 90, weight: 10, matched: [], missing: [], notes: 'Good' },
  };

  it('CRITICAL INVARIANT: Ineligible is NEVER recommended even with 100/100 suitability score', () => {
    const input: RecommendationInput = {
      hasDescriptionText: true,
      eligibility: 'ineligible', // Hard mandatory rule failed
      suitabilityTotal: 100, // Perfect score
      breakdown: dummyBreakdown,
      riskLevel: 'low',
      riskFactors: [],
    };

    const res = deriveRecommendation(input);
    expect(res.recommendation).toBe('not_eligible');
    expect(res.explanation).toContain('Not Eligible');
  });

  it('Precedence 2: High risk overrides high score', () => {
    const input: RecommendationInput = {
      hasDescriptionText: true,
      eligibility: 'eligible',
      suitabilityTotal: 92,
      breakdown: dummyBreakdown,
      riskLevel: 'high',
      riskFactors: [{ code: 'INJECTION', severity: 'high', detail: 'Hostile prompt injection' }],
    };

    const res = deriveRecommendation(input);
    expect(res.recommendation).toBe('high_risk');
  });

  it('Precedence 3: Missing description text maps to insufficient_information', () => {
    const input: RecommendationInput = {
      hasDescriptionText: false, // No JD text
      eligibility: 'eligible',
      suitabilityTotal: 88,
      breakdown: dummyBreakdown,
      riskLevel: 'low',
      riskFactors: [],
    };

    const res = deriveRecommendation(input);
    expect(res.recommendation).toBe('insufficient_information');
  });

  it('Precedence 3b: Unknown eligibility maps to insufficient_information', () => {
    const input: RecommendationInput = {
      hasDescriptionText: true,
      eligibility: 'unknown',
      suitabilityTotal: 88,
      breakdown: dummyBreakdown,
      riskLevel: 'low',
      riskFactors: [],
    };

    const res = deriveRecommendation(input);
    expect(res.recommendation).toBe('insufficient_information');
  });

  it('Score >= 85 maps to strongly_recommended', () => {
    const input: RecommendationInput = {
      hasDescriptionText: true,
      eligibility: 'eligible',
      suitabilityTotal: 87.5,
      breakdown: dummyBreakdown,
      riskLevel: 'low',
      riskFactors: [],
    };

    const res = deriveRecommendation(input);
    expect(res.recommendation).toBe('strongly_recommended');
  });

  it('Score 70..84 maps to recommended', () => {
    const input: RecommendationInput = {
      hasDescriptionText: true,
      eligibility: 'eligible',
      suitabilityTotal: 74.0,
      breakdown: dummyBreakdown,
      riskLevel: 'low',
      riskFactors: [],
    };

    const res = deriveRecommendation(input);
    expect(res.recommendation).toBe('recommended');
  });

  it('Score 55..69 maps to consider', () => {
    const input: RecommendationInput = {
      hasDescriptionText: true,
      eligibility: 'eligible',
      suitabilityTotal: 62.0,
      breakdown: dummyBreakdown,
      riskLevel: 'low',
      riskFactors: [],
    };

    const res = deriveRecommendation(input);
    expect(res.recommendation).toBe('consider');
  });

  it('Score < 55 maps to low_priority', () => {
    const input: RecommendationInput = {
      hasDescriptionText: true,
      eligibility: 'eligible',
      suitabilityTotal: 48.0,
      breakdown: dummyBreakdown,
      riskLevel: 'low',
      riskFactors: [],
    };

    const res = deriveRecommendation(input);
    expect(res.recommendation).toBe('low_priority');
  });

  it('Property test: Random scores with ineligible always yield not_eligible', () => {
    for (let score = 0; score <= 100; score += 5) {
      const input: RecommendationInput = {
        hasDescriptionText: true,
        eligibility: 'ineligible',
        suitabilityTotal: score,
        breakdown: dummyBreakdown,
        riskLevel: 'low',
        riskFactors: [],
      };
      const res = deriveRecommendation(input);
      expect(res.recommendation).toBe('not_eligible');
    }
  });
});
