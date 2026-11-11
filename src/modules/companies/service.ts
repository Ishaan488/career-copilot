import { getDb } from '@/shared/db';
import {
  companies,
  companyResearch,
  companyResearchEvidence,
} from '@/db/schema/companies';
import { eq, desc } from 'drizzle-orm';
import { AppError } from '@/shared/errors';
import { logger } from '@/shared/logger';
import {
  CompanyResearchProvider,
  CompanyResearchResult,
  EvidenceItem,
  LegitimacyAssessmentResult,
  ResearchSignals,
} from './domain/types';
import { assessCompanyLegitimacy } from './domain/legitimacy';
import { officialWebsiteResearchProvider } from './infra/official-website-provider';

export interface FullCompanyResearchReport {
  id: string;
  companyId: string;
  companyName: string;
  provider: string;
  legitimacyStatus: string;
  legitimacyScore: number;
  signals: Record<string, unknown>;
  riskFactors: Array<{ code: string; severity: string; description: string }>;
  summary: string;
  researchedAt: Date;
  expiresAt: Date;
  evidence: EvidenceItem[];
}

export class CompanyResearchService {
  private defaultProvider: CompanyResearchProvider = officialWebsiteResearchProvider;

  /**
   * Set custom or mock provider (useful for testing or switching search providers).
   */
  setProvider(provider: CompanyResearchProvider): void {
    this.defaultProvider = provider;
  }

  /**
   * Conducts verifiable company research and legitimacy assessment (Milestone 8, User Q3, Q9).
   */
  async researchCompany(
    companyId: string,
    options?: { force?: boolean; provider?: CompanyResearchProvider }
  ): Promise<{
    researchId: string;
    companyId: string;
    legitimacyStatus: string;
    legitimacyScore: number;
    assessment: LegitimacyAssessmentResult;
    result: CompanyResearchResult;
  }> {
    const db = getDb();

    // 1. Fetch company
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company) {
      throw new AppError('NOT_FOUND', `Company with id '${companyId}' not found.`);
    }

    // 2. Check for fresh cached research (< 180 days) unless forced
    if (!options?.force) {
      const [existing] = await db
        .select()
        .from(companyResearch)
        .where(eq(companyResearch.companyId, companyId))
        .orderBy(desc(companyResearch.researchedAt))
        .limit(1);

      if (existing && existing.expiresAt > new Date()) {
        const evidenceRows = await db
          .select()
          .from(companyResearchEvidence)
          .where(eq(companyResearchEvidence.researchId, existing.id));

        const evidenceItems: EvidenceItem[] = evidenceRows.map((e) => ({
          id: e.id,
          signalType: e.signalType,
          sourceUrl: e.sourceUrl,
          contentSnippet: e.contentSnippet,
          confidence: Number(e.confidence),
          metadata: e.metadata as Record<string, unknown>,
          capturedAt: e.capturedAt,
        }));

        const parsedSignals = (existing.signals || {}) as unknown as ResearchSignals;
        const assessment = assessCompanyLegitimacy(
          parsedSignals,
          evidenceItems
        );

        return {
          researchId: existing.id,
          companyId,
          legitimacyStatus: existing.legitimacyStatus,
          legitimacyScore: Number(existing.legitimacyScore),
          assessment,
          result: {
            provider: existing.provider,
            companyId,
            companyName: company.name,
            domain: company.primaryDomain || '',
            signals: parsedSignals,
            evidence: evidenceItems,
            researchedAt: existing.researchedAt,
          },
        };
      }
    }

    // 3. Execute research through configured provider
    const provider = options?.provider || this.defaultProvider;
    const researchResult = await provider.research({
      id: company.id,
      name: company.name,
      primaryDomain: company.primaryDomain,
      websiteUrl: company.websiteUrl,
    });

    // 4. Pure Legitimacy Assessment
    const assessment = assessCompanyLegitimacy(
      researchResult.signals,
      researchResult.evidence
    );

    // 5. Expiration date (180 days default per User Decision Q9)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 180);

    // 6. Persist research and evidence in DB transaction
    const [insertedResearch] = await db
      .insert(companyResearch)
      .values({
        companyId: company.id,
        provider: researchResult.provider,
        legitimacyStatus: assessment.status,
        legitimacyScore: assessment.score.toFixed(2),
        signals: researchResult.signals as unknown as Record<string, unknown>,
        riskFactors: assessment.riskFactors as unknown as Record<string, unknown>[],
        summary: assessment.summary,
        researchedAt: researchResult.researchedAt,
        expiresAt,
      })
      .returning();

    if (!insertedResearch) {
      throw new AppError('INTERNAL', 'Failed to persist company research record');
    }

    if (researchResult.evidence.length > 0) {
      await db.insert(companyResearchEvidence).values(
        researchResult.evidence.map((ev) => ({
          researchId: insertedResearch.id,
          companyId: company.id,
          signalType: ev.signalType,
          sourceUrl: ev.sourceUrl,
          contentSnippet: ev.contentSnippet,
          confidence: ev.confidence.toFixed(2),
          metadata: ev.metadata || {},
          capturedAt: ev.capturedAt || new Date(),
        }))
      );
    }

    // 7. Update company record if websiteUrl was discovered and not set
    if (!company.websiteUrl && researchResult.signals.hasOfficialDomain && researchResult.domain) {
      const inferredUrl = `https://${researchResult.domain}`;
      await db
        .update(companies)
        .set({ websiteUrl: inferredUrl, updatedAt: new Date() })
        .where(eq(companies.id, company.id));
    }

    logger.info(
      {
        companyId: company.id,
        status: assessment.status,
        score: assessment.score,
        evidenceCount: researchResult.evidence.length,
      },
      '[CompanyResearchService] Research completed successfully'
    );

    return {
      researchId: insertedResearch.id,
      companyId: company.id,
      legitimacyStatus: assessment.status,
      legitimacyScore: assessment.score,
      assessment,
      result: researchResult,
    };
  }

  /**
   * Retrieves the latest research report and evidence items for a company.
   */
  async getCompanyResearch(companyId: string): Promise<FullCompanyResearchReport | null> {
    const db = getDb();

    const [company] = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company) return null;

    const [research] = await db
      .select()
      .from(companyResearch)
      .where(eq(companyResearch.companyId, companyId))
      .orderBy(desc(companyResearch.researchedAt))
      .limit(1);

    if (!research) return null;

    const evidenceRows = await db
      .select()
      .from(companyResearchEvidence)
      .where(eq(companyResearchEvidence.researchId, research.id));

    const evidence: EvidenceItem[] = evidenceRows.map((e) => ({
      id: e.id,
      signalType: e.signalType,
      sourceUrl: e.sourceUrl,
      contentSnippet: e.contentSnippet,
      confidence: Number(e.confidence),
      metadata: e.metadata as Record<string, unknown>,
      capturedAt: e.capturedAt,
    }));

    return {
      id: research.id,
      companyId: research.companyId,
      companyName: company.name,
      provider: research.provider,
      legitimacyStatus: research.legitimacyStatus,
      legitimacyScore: Number(research.legitimacyScore),
      signals: research.signals as Record<string, unknown>,
      riskFactors: research.riskFactors as Array<{ code: string; severity: string; description: string }>,
      summary: research.summary,
      researchedAt: research.researchedAt,
      expiresAt: research.expiresAt,
      evidence,
    };
  }

  /**
   * Lists recently researched companies.
   */
  async listRecentResearch(limit = 50) {
    const db = getDb();
    return db
      .select({
        id: companyResearch.id,
        companyId: companyResearch.companyId,
        companyName: companies.name,
        legitimacyStatus: companyResearch.legitimacyStatus,
        legitimacyScore: companyResearch.legitimacyScore,
        researchedAt: companyResearch.researchedAt,
        expiresAt: companyResearch.expiresAt,
      })
      .from(companyResearch)
      .innerJoin(companies, eq(companyResearch.companyId, companies.id))
      .orderBy(desc(companyResearch.researchedAt))
      .limit(limit);
  }
}

export const companyResearchService = new CompanyResearchService();
