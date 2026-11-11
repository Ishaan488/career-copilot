export type LegitimacyStatus =
  | 'verified'
  | 'some_concerns'
  | 'high_concern'
  | 'insufficient_evidence';

export interface EvidenceItem {
  id?: string;
  signalType: string;
  sourceUrl: string;
  contentSnippet: string;
  confidence: number; // 0.00 to 1.00
  metadata?: Record<string, unknown>;
  capturedAt?: Date;
}

export interface LegitimacyRiskFactor {
  code: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  evidenceUrl?: string;
}

export interface ResearchSignals {
  hasOfficialDomain: boolean;
  domain?: string;
  isHttps: boolean;
  domainAgeDays?: number;
  hasCareerPage: boolean;
  careerPageUrl?: string;
  atsType?: string;
  hasPhysicalAddress: boolean;
  address?: string;
  hasContactEmailOrPhone: boolean;
  contactDetails?: string[];
  hasAboutPage: boolean;
  aboutTextSnippet?: string;
  socialLinks?: string[];
  headcountRange?: string;
  industry?: string;
  isUnknown?: boolean;
}

export interface CompanyResearchResult {
  provider: string;
  companyId: string;
  companyName: string;
  domain: string;
  signals: ResearchSignals;
  evidence: EvidenceItem[];
  researchedAt: Date;
}

export interface LegitimacyAssessmentResult {
  status: LegitimacyStatus;
  score: number;
  riskFactors: LegitimacyRiskFactor[];
  summary: string;
  verifiedSignals: string[];
}

export interface CompanyTargetInput {
  id: string;
  name: string;
  primaryDomain?: string | null;
  websiteUrl?: string | null;
}

export interface CompanyResearchProvider {
  readonly name: string;
  research(company: CompanyTargetInput): Promise<CompanyResearchResult>;
}
