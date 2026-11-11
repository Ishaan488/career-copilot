import { describe, it, expect } from 'vitest';
import { assessCompanyLegitimacy } from '@/modules/companies/domain/legitimacy';
import { ResearchSignals, EvidenceItem } from '@/modules/companies/domain/types';

describe('Company Legitimacy Assessment Engine (T-LEGIT)', () => {
  const dummyEvidence: EvidenceItem[] = [
    {
      signalType: 'official_domain',
      sourceUrl: 'https://acme.org',
      contentSnippet: 'Acme Corporation - Official Portal',
      confidence: 0.95,
      capturedAt: new Date(),
    },
    {
      signalType: 'contact_info',
      sourceUrl: 'https://acme.org/contact',
      contentSnippet: 'Contact: contact@acme.org',
      confidence: 0.9,
      capturedAt: new Date(),
    },
  ];

  it('evaluates fully verified company with official domain, HTTPS, and career portal', () => {
    const signals: ResearchSignals = {
      hasOfficialDomain: true,
      isHttps: true,
      hasCareerPage: true,
      atsType: 'greenhouse',
      hasAboutPage: true,
      hasPhysicalAddress: true,
      hasContactEmailOrPhone: true,
      socialLinks: ['https://linkedin.com/company/acme', 'https://twitter.com/acme'],
      industry: 'Technology',
    };

    const assessment = assessCompanyLegitimacy(signals, dummyEvidence);

    expect(assessment.status).toBe('verified');
    expect(assessment.score).toBeGreaterThanOrEqual(70);
    expect(assessment.riskFactors).toHaveLength(0);
    expect(assessment.verifiedSignals).toEqual(
      expect.arrayContaining([
        'Official Domain Active',
        'HTTPS / TLS Enforced',
        'Career Portal Verified (greenhouse)',
        'About Us / Mission Verified',
        'Physical Location Disclosed',
        'Direct Contact Methods Verified',
        'Social Presence Verified (2 channels)',
      ])
    );
    expect(assessment.summary).toContain('Company verified with legitimacy score');
  });

  it('penalizes empty shell site with high-severity risk factor and score deduction', () => {
    const signals: ResearchSignals = {
      hasOfficialDomain: true,
      isHttps: true,
      hasCareerPage: false,
      hasAboutPage: false,
      hasContactEmailOrPhone: false,
      hasPhysicalAddress: false,
    };

    const assessment = assessCompanyLegitimacy(signals, dummyEvidence);

    expect(assessment.status).toBe('high_concern');
    expect(assessment.riskFactors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'EMPTY_SHELL_SITE',
          severity: 'high',
        }),
      ])
    );
    expect(assessment.summary).toContain('High legitimacy concern');
  });

  it('penalizes insecure HTTP with INSECURE_HTTP risk factor', () => {
    const signals: ResearchSignals = {
      hasOfficialDomain: true,
      isHttps: false,
      hasCareerPage: true,
      hasAboutPage: true,
      hasPhysicalAddress: true,
      hasContactEmailOrPhone: true,
    };

    const assessment = assessCompanyLegitimacy(signals, dummyEvidence);

    expect(assessment.riskFactors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INSECURE_HTTP',
          severity: 'medium',
        }),
      ])
    );
    expect(assessment.verifiedSignals).not.toContain('HTTPS / TLS Enforced');
  });

  it('detects recently registered domain (<30d) and records risk factor', () => {
    const signals: ResearchSignals = {
      hasOfficialDomain: true,
      isHttps: true,
      domainAgeDays: 14,
      hasCareerPage: true,
      hasAboutPage: true,
      hasPhysicalAddress: true,
      hasContactEmailOrPhone: true,
    };

    const assessment = assessCompanyLegitimacy(signals, dummyEvidence);

    expect(assessment.riskFactors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'RECENTLY_REGISTERED_DOMAIN',
          severity: 'medium',
        }),
      ])
    );
  });

  it('flags missing official domain as high risk', () => {
    const signals: ResearchSignals = {
      hasOfficialDomain: false,
      isHttps: false,
      hasCareerPage: false,
      hasAboutPage: false,
      hasPhysicalAddress: false,
      hasContactEmailOrPhone: false,
    };

    const assessment = assessCompanyLegitimacy(signals, dummyEvidence);

    expect(assessment.status).toBe('high_concern');
    expect(assessment.riskFactors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'NO_OFFICIAL_DOMAIN',
          severity: 'high',
        }),
      ])
    );
  });

  it('returns insufficient_evidence when zero evidence or signals are captured', () => {
    const signals: ResearchSignals = {
      hasOfficialDomain: false,
      isHttps: false,
      hasCareerPage: false,
      hasAboutPage: false,
      hasPhysicalAddress: false,
      hasContactEmailOrPhone: false,
      isUnknown: true,
    };
    const assessment = assessCompanyLegitimacy(signals, []);

    expect(assessment.status).toBe('insufficient_evidence');
    expect(assessment.score).toBe(0);
    expect(assessment.riskFactors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INSUFFICIENT_EVIDENCE',
          severity: 'low',
        }),
      ])
    );
    expect(assessment.summary).toContain('Insufficient public evidence');
  });

  it('returns some_concerns for partially verified entity without physical address or career portal', () => {
    const signals: ResearchSignals = {
      hasOfficialDomain: true,
      isHttps: true,
      hasAboutPage: true,
      hasContactEmailOrPhone: true,
      hasCareerPage: false,
      hasPhysicalAddress: false,
      socialLinks: ['https://linkedin.com/company/startup'],
    };

    const assessment = assessCompanyLegitimacy(signals, dummyEvidence);

    expect(assessment.status).toBe('some_concerns');
    expect(assessment.score).toBeGreaterThanOrEqual(40);
    expect(assessment.score).toBeLessThan(70);
  });
});
