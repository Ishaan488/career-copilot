import { describe, it, expect } from 'vitest';
import { evaluatePrefilter } from '@/modules/discovery';

describe('Discovery Prefilter (Deterministic Evaluation)', () => {
  it('passes when no exclusions are violated', () => {
    const res = evaluatePrefilter(
      {
        companyName: 'Acme Corp',
        normalizedTitle: 'senior software engineer',
        workMode: 'remote',
        compDisclosed: true,
        compMin: '2000000',
        compMax: '3000000',
        compCurrency: 'INR',
        compPeriod: 'yearly',
      },
      {
        excludedCompanies: ['EvilCorp'],
        excludedTitles: ['sales', 'marketing'],
        requiredWorkModes: ['remote', 'hybrid'],
        minimumComp: {
          amount: 1500000,
          currency: 'INR',
          period: 'yearly',
        },
      }
    );

    expect(res.passed).toBe(true);
    expect(res.reasons).toHaveLength(0);
  });

  it('fails when company matches excluded company pattern', () => {
    const res = evaluatePrefilter(
      {
        companyName: 'EvilCorp Technologies',
        normalizedTitle: 'senior engineer',
        workMode: 'remote',
        compDisclosed: false,
      },
      {
        excludedCompanies: ['EvilCorp'],
      }
    );

    expect(res.passed).toBe(false);
    expect(res.reasons[0]).toContain("matches excluded company pattern 'EvilCorp'");
  });

  it('fails when title contains excluded keyword', () => {
    const res = evaluatePrefilter(
      {
        companyName: 'Fintech Co',
        normalizedTitle: 'crypto blockchain developer',
        workMode: 'remote',
        compDisclosed: false,
      },
      {
        excludedTitles: ['crypto', 'blockchain'],
      }
    );

    expect(res.passed).toBe(false);
    expect(res.reasons[0]).toContain("Job title matches excluded keyword 'crypto'");
  });

  it('fails when work mode violates required work modes', () => {
    const res = evaluatePrefilter(
      {
        companyName: 'Bank Corp',
        normalizedTitle: 'lead engineer',
        workMode: 'onsite',
        compDisclosed: false,
      },
      {
        requiredWorkModes: ['remote'],
      }
    );

    expect(res.passed).toBe(false);
    expect(res.reasons[0]).toContain("Job work mode 'onsite' is not among required work modes: [remote]");
  });

  it('fails when disclosed compensation maximum is below minimum floor', () => {
    const res = evaluatePrefilter(
      {
        companyName: 'Startup Inc',
        normalizedTitle: 'backend engineer',
        workMode: 'remote',
        compDisclosed: true,
        compMin: '800000',
        compMax: '1000000',
        compCurrency: 'INR',
        compPeriod: 'yearly',
      },
      {
        minimumComp: {
          amount: 1500000,
          currency: 'INR',
          period: 'yearly',
        },
      }
    );

    expect(res.passed).toBe(false);
    expect(res.reasons[0]).toContain('below configured minimum');
  });
});
