import { getDb } from '@/shared/db';
import {
  companies,
  companyDomains,
  companyCareerPages,
  companyMonitors,
  companyCheckRuns,
  companyProbeCandidates,
  companyImportBatches,
} from '@/db/schema/companies';
import { eq, and, or, ilike, sql, desc, inArray } from 'drizzle-orm';
import { parse } from 'tldts';
import { AppError } from '@/shared/errors';
import { recordAudit } from '@/modules/audit';
import { createNotification } from '@/modules/notification';
import {
  CreateCompanyInput,
  UpdateCompanyInput,
  ListCompaniesQuery,
  ImportCompaniesInput,
  UpdateMonitorInput,
} from './schemas';
import { generateSlugs } from './domain/slug';
import {
  detectAtsFromUrl,
  SupportedAtsType,
} from './domain/ats-detect';
import { probeAtsEndpoint, computeNameMatchScore } from './infra/probe';
import { detectCareerPagesForDomain, DiscoveredCareerPage } from './infra/career-page';
import { parseCompanyImport } from './domain/import';
import { safeFetch } from '@/shared/http';

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
    .replace(/\b(inc|incorporated|corp|corporation|ltd|limited|pvt|private|llc|llp|technologies|solutions|software|services|group|labs)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanDomain(domainOrUrl?: string | null): string | null {
  if (!domainOrUrl) return null;
  const domainPart = domainOrUrl.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0] || '';
  const parsed = parse(domainPart);
  return parsed.domain || null;
}

export interface CompanyWithMonitor {
  id: string;
  name: string;
  normalizedName: string;
  primaryDomain: string | null;
  industry: string | null;
  sizeRange: string | null;
  hqCountry: string | null;
  websiteUrl: string | null;
  notes: string | null;
  discoveryStatus: string;
  origin: string;
  originRef: string | null;
  registeredAt: Date;
  excludedAt: Date | null;
  excludeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  monitor?: {
    id: string;
    enabled: boolean;
    checkIntervalHours: number;
    status: string;
    lastCheckedAt: Date | null;
    nextCheckAt: Date | null;
    openingsCount: number | null;
    consecutiveFailures: number;
  } | null;
  careerPagesCount?: number;
}

export async function createCompany(
  input: CreateCompanyInput,
  actor = 'user'
): Promise<CompanyWithMonitor> {
  const db = getDb();
  const rawName = input.name.trim();
  const normalizedName = normalizeCompanyName(rawName);
  const primaryDomain = cleanDomain(input.primaryDomain || input.websiteUrl);

  // 1. Deduplication check by primary domain or existing companyDomain
  if (primaryDomain) {
    const [existingByDomain] = await db
      .select()
      .from(companies)
      .where(eq(companies.primaryDomain, primaryDomain))
      .limit(1);

    if (existingByDomain) {
      return getCompanyById(existingByDomain.id);
    }

    const [domainMatch] = await db
      .select({ companyId: companyDomains.companyId })
      .from(companyDomains)
      .where(eq(companyDomains.domain, primaryDomain))
      .limit(1);

    if (domainMatch) {
      return getCompanyById(domainMatch.companyId);
    }
  }

  // 2. Check by exact normalized name
  const [existingByName] = await db
    .select()
    .from(companies)
    .where(eq(companies.normalizedName, normalizedName))
    .limit(1);

  if (existingByName && !primaryDomain) {
    return getCompanyById(existingByName.id);
  }

  // 3. Determine initial discovery status: 'registered' if user-added, 'discovered' if external/job_url
  const origin = input.origin || 'manual';
  const initialStatus = origin === 'manual' ? 'registered' : 'discovered';

  const [company] = await db
    .insert(companies)
    .values({
      name: rawName,
      normalizedName,
      primaryDomain,
      industry: input.industry,
      sizeRange: input.sizeRange,
      hqCountry: input.hqCountry || 'India',
      websiteUrl: input.websiteUrl || (primaryDomain ? `https://${primaryDomain}` : null),
      notes: input.notes,
      discoveryStatus: initialStatus,
      origin,
      originRef: input.originRef,
    })
    .returning();

  if (!company) {
    throw new AppError('INTERNAL', 'Failed to insert company record');
  }

  // 4. Record domain if present
  if (primaryDomain) {
    await db.insert(companyDomains).values({
      companyId: company.id,
      domain: primaryDomain,
      kind: 'official',
      verification: 'unverified',
    });
  }

  // 5. If careerUrl provided, detect ATS and record career page
  if (input.careerUrl) {
    const detected = detectAtsFromUrl(input.careerUrl);
    await db.insert(companyCareerPages).values({
      companyId: company.id,
      url: input.careerUrl,
      atsType: detected ? detected.atsType : 'unknown',
      boardId: detected ? detected.boardId : null,
      status: 'candidate',
      verification: detected?.confidence === 'high' ? 'partially_verified' : 'unverified',
      detectedVia: 'manual',
    });
  }

  // 6. Create default monitor record
  const [monitor] = await db
    .insert(companyMonitors)
    .values({
      companyId: company.id,
      enabled: true,
      checkIntervalHours: 24,
      status: 'ok',
      openingsCount: null,
    })
    .returning();

  await recordAudit({
    actor,
    action: 'company.create',
    entityType: 'company',
    entityId: company.id,
    details: {
      name: company.name,
      primaryDomain: company.primaryDomain,
      origin: company.origin,
    },
  });

  return {
    ...company,
    monitor: monitor
      ? {
          id: monitor.id,
          enabled: monitor.enabled,
          checkIntervalHours: monitor.checkIntervalHours,
          status: monitor.status,
          lastCheckedAt: monitor.lastCheckedAt,
          nextCheckAt: monitor.nextCheckAt,
          openingsCount: monitor.openingsCount,
          consecutiveFailures: monitor.consecutiveFailures,
        }
      : null,
    careerPagesCount: input.careerUrl ? 1 : 0,
  };
}

export async function listCompanies(params: ListCompaniesQuery = {}): Promise<{
  items: CompanyWithMonitor[];
  total: number;
}> {
  const db = getDb();
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  const conditions = [];

  if (params.status) {
    conditions.push(eq(companies.discoveryStatus, params.status));
  }

  if (params.q && params.q.trim()) {
    const searchPattern = `%${params.q.trim()}%`;
    conditions.push(
      or(
        ilike(companies.name, searchPattern),
        ilike(companies.normalizedName, searchPattern),
        ilike(companies.primaryDomain, searchPattern)
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(companies)
    .where(whereClause);

  const total = countResult?.count ?? 0;

  const rows = await db
    .select({
      company: companies,
      monitor: companyMonitors,
      careerPagesCount: sql<number>`(
        SELECT count(*)::int FROM ${companyCareerPages}
        WHERE ${companyCareerPages.companyId} = ${companies.id}
      )`,
    })
    .from(companies)
    .leftJoin(companyMonitors, eq(companies.id, companyMonitors.companyId))
    .where(whereClause)
    .orderBy(desc(companies.createdAt))
    .limit(limit)
    .offset(offset);

  const items = rows.map((r) => ({
    ...r.company,
    monitor: r.monitor
      ? {
          id: r.monitor.id,
          enabled: r.monitor.enabled,
          checkIntervalHours: r.monitor.checkIntervalHours,
          status: r.monitor.status,
          lastCheckedAt: r.monitor.lastCheckedAt,
          nextCheckAt: r.monitor.nextCheckAt,
          openingsCount: r.monitor.openingsCount,
          consecutiveFailures: r.monitor.consecutiveFailures,
        }
      : null,
    careerPagesCount: r.careerPagesCount ?? 0,
  }));

  return { items, total };
}

export async function getCompanyById(id: string): Promise<CompanyWithMonitor & {
  domains: typeof companyDomains.$inferSelect[];
  careerPages: typeof companyCareerPages.$inferSelect[];
  recentCheckRuns: typeof companyCheckRuns.$inferSelect[];
  probeCandidates: typeof companyProbeCandidates.$inferSelect[];
}> {
  const db = getDb();

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);

  if (!company) {
    throw new AppError('NOT_FOUND', `Company with id ${id} not found`);
  }

  const [monitor] = await db
    .select()
    .from(companyMonitors)
    .where(eq(companyMonitors.companyId, id))
    .limit(1);

  const domains = await db
    .select()
    .from(companyDomains)
    .where(eq(companyDomains.companyId, id));

  const careerPages = await db
    .select()
    .from(companyCareerPages)
    .where(eq(companyCareerPages.companyId, id))
    .orderBy(desc(companyCareerPages.createdAt));

  const recentCheckRuns = await db
    .select()
    .from(companyCheckRuns)
    .where(eq(companyCheckRuns.companyId, id))
    .orderBy(desc(companyCheckRuns.startedAt))
    .limit(10);

  const probeCandidates = await db
    .select()
    .from(companyProbeCandidates)
    .where(eq(companyProbeCandidates.companyId, id))
    .orderBy(desc(companyProbeCandidates.probedAt));

  return {
    ...company,
    monitor: monitor
      ? {
          id: monitor.id,
          enabled: monitor.enabled,
          checkIntervalHours: monitor.checkIntervalHours,
          status: monitor.status,
          lastCheckedAt: monitor.lastCheckedAt,
          nextCheckAt: monitor.nextCheckAt,
          openingsCount: monitor.openingsCount,
          consecutiveFailures: monitor.consecutiveFailures,
        }
      : null,
    careerPagesCount: careerPages.length,
    domains,
    careerPages,
    recentCheckRuns,
    probeCandidates,
  };
}

export async function updateCompany(
  id: string,
  input: UpdateCompanyInput,
  actor = 'user'
): Promise<CompanyWithMonitor> {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);

  if (!existing) {
    throw new AppError('NOT_FOUND', `Company with id ${id} not found`);
  }

  const updateValues: Partial<typeof companies.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name) {
    updateValues.name = input.name.trim();
    updateValues.normalizedName = normalizeCompanyName(input.name);
  }
  if (input.primaryDomain !== undefined) {
    updateValues.primaryDomain = cleanDomain(input.primaryDomain);
  }
  if (input.websiteUrl !== undefined) updateValues.websiteUrl = input.websiteUrl;
  if (input.industry !== undefined) updateValues.industry = input.industry;
  if (input.sizeRange !== undefined) updateValues.sizeRange = input.sizeRange;
  if (input.hqCountry !== undefined) updateValues.hqCountry = input.hqCountry;
  if (input.notes !== undefined) updateValues.notes = input.notes;
  if (input.discoveryStatus !== undefined) updateValues.discoveryStatus = input.discoveryStatus;
  if (input.excludeReason !== undefined) updateValues.excludeReason = input.excludeReason;

  const [updated] = await db
    .update(companies)
    .set(updateValues)
    .where(eq(companies.id, id))
    .returning();

  if (!updated) {
    throw new AppError('INTERNAL', 'Failed to update company');
  }

  await recordAudit({
    actor,
    action: 'company.update',
    entityType: 'company',
    entityId: id,
    details: { changes: Object.keys(updateValues) },
  });

  return getCompanyById(updated.id);
}

export async function excludeCompany(
  id: string,
  reason = 'User excluded',
  actor = 'user'
): Promise<CompanyWithMonitor> {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);

  if (!existing) {
    throw new AppError('NOT_FOUND', `Company with id ${id} not found`);
  }

  // Update status to excluded and record exclude timestamp
  await db
    .update(companies)
    .set({
      discoveryStatus: 'excluded',
      excludedAt: new Date(),
      excludeReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, id));

  // Disable monitor
  await db
    .update(companyMonitors)
    .set({
      enabled: false,
      status: 'paused',
      updatedAt: new Date(),
    })
    .where(eq(companyMonitors.companyId, id));

  await recordAudit({
    actor,
    action: 'company.exclude',
    entityType: 'company',
    entityId: id,
    details: { reason },
  });

  return getCompanyById(id);
}

export async function pauseMonitoring(id: string, actor = 'user'): Promise<CompanyWithMonitor> {
  const db = getDb();

  await db
    .update(companyMonitors)
    .set({
      enabled: false,
      status: 'paused',
      updatedAt: new Date(),
    })
    .where(eq(companyMonitors.companyId, id));

  await db
    .update(companies)
    .set({
      discoveryStatus: 'paused',
      updatedAt: new Date(),
    })
    .where(eq(companies.id, id));

  await recordAudit({
    actor,
    action: 'company.pause_monitoring',
    entityType: 'company',
    entityId: id,
  });

  return getCompanyById(id);
}

export async function resumeMonitoring(id: string, actor = 'user'): Promise<CompanyWithMonitor> {
  const db = getDb();

  await db
    .update(companyMonitors)
    .set({
      enabled: true,
      status: 'ok',
      updatedAt: new Date(),
    })
    .where(eq(companyMonitors.companyId, id));

  await db
    .update(companies)
    .set({
      discoveryStatus: 'monitoring',
      updatedAt: new Date(),
    })
    .where(eq(companies.id, id));

  await recordAudit({
    actor,
    action: 'company.resume_monitoring',
    entityType: 'company',
    entityId: id,
  });

  return getCompanyById(id);
}

export async function updateMonitorSettings(
  companyId: string,
  input: UpdateMonitorInput,
  actor = 'user'
): Promise<CompanyWithMonitor> {
  const db = getDb();

  const updateValues: Partial<typeof companyMonitors.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.enabled !== undefined) updateValues.enabled = input.enabled;
  if (input.checkIntervalHours !== undefined) updateValues.checkIntervalHours = input.checkIntervalHours;

  await db
    .update(companyMonitors)
    .set(updateValues)
    .where(eq(companyMonitors.companyId, companyId));

  await recordAudit({
    actor,
    action: 'company.update_monitor',
    entityType: 'company',
    entityId: companyId,
    details: input,
  });

  return getCompanyById(companyId);
}

/**
 * Probe ATS slug variations for a company across Greenhouse, Lever, Ashby, and SmartRecruiters.
 * Limits to 12 probes max per run to adhere to rate limits and anti-abuse policies.
 */
export async function probeAtsSlugs(companyId: string, actor = 'user'): Promise<typeof companyProbeCandidates.$inferSelect[]> {
  const db = getDb();

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) {
    throw new AppError('NOT_FOUND', `Company with id ${companyId} not found`);
  }

  if (company.discoveryStatus === 'excluded') {
    throw new AppError('FORBIDDEN', 'Cannot probe ATS for excluded company');
  }

  const slugs = generateSlugs(company.name, company.primaryDomain);
  const supportedAts: SupportedAtsType[] = ['greenhouse', 'lever', 'ashby', 'smartrecruiters'];

  const results: (typeof companyProbeCandidates.$inferSelect)[] = [];
  let probeCount = 0;
  const MAX_PROBES = 12;

  for (const slug of slugs) {
    for (const ats of supportedAts) {
      if (probeCount >= MAX_PROBES) break;

      // Check if already probed for this company + ats + slug
      const [existing] = await db
        .select()
        .from(companyProbeCandidates)
        .where(
          and(
            eq(companyProbeCandidates.companyId, companyId),
            eq(companyProbeCandidates.atsType, ats),
            eq(companyProbeCandidates.slug, slug)
          )
        )
        .limit(1);

      if (existing) {
        results.push(existing);
        continue;
      }

      probeCount++;
      const probeRes = await probeAtsEndpoint(ats, slug);
      const matchScore = computeNameMatchScore(company.name, probeRes.displayedName);
      const domainMatch = company.primaryDomain
        ? slug.includes(company.primaryDomain.split('.')[0] || '')
        : false;

      const [candidate] = await db
        .insert(companyProbeCandidates)
        .values({
          companyId,
          atsType: ats,
          slug,
          outcome: probeRes.outcome,
          displayedName: probeRes.displayedName,
          nameMatchScore: matchScore.toString(),
          domainMatch,
          status: 'pending_confirmation',
        })
        .returning();

      if (candidate) {
        results.push(candidate);

        // If probe found a valid board, emit an in-app notification so user can confirm
        if (probeRes.outcome === 'exists') {
          await createNotification({
            type: 'company_ats_candidate',
            severity: 'info',
            title: `ATS board candidate detected for ${company.name}`,
            body: `Detected potential ${ats} board "${slug}" (name match: ${Math.round(matchScore * 100)}%). Please confirm to start monitoring.`,
            link: `/companies/${company.id}`,
            entityType: 'company',
            entityId: company.id,
            dedupeKey: `candidate:${company.id}:${ats}:${slug}`,
            channels: ['in_app'],
          });
        }
      }
    }
  }

  await recordAudit({
    actor,
    action: 'company.probe_ats',
    entityType: 'company',
    entityId: companyId,
    details: { probedCount: probeCount, resultsFound: results.filter((r) => r.outcome === 'exists').length },
  });

  return results;
}

/**
 * Confirm a probe candidate. Promotes it to an active, monitored companyCareerPages record.
 */
export async function confirmProbeCandidate(
  candidateId: string,
  actor = 'user'
): Promise<typeof companyCareerPages.$inferSelect> {
  const db = getDb();

  const [candidate] = await db
    .select()
    .from(companyProbeCandidates)
    .where(eq(companyProbeCandidates.id, candidateId))
    .limit(1);

  if (!candidate) {
    throw new AppError('NOT_FOUND', `Probe candidate with id ${candidateId} not found`);
  }

  if (candidate.outcome !== 'exists') {
    throw new AppError('VALIDATION', `Cannot confirm candidate with outcome "${candidate.outcome}"`);
  }

  // Construct official career board URL
  let boardUrl = '';
  switch (candidate.atsType) {
    case 'greenhouse':
      boardUrl = `https://boards.greenhouse.io/${candidate.slug}`;
      break;
    case 'lever':
      boardUrl = `https://jobs.lever.co/${candidate.slug}`;
      break;
    case 'ashby':
      boardUrl = `https://jobs.ashbyhq.com/${candidate.slug}`;
      break;
    case 'smartrecruiters':
      boardUrl = `https://jobs.smartrecruiters.com/${candidate.slug}`;
      break;
    default:
      boardUrl = `https://${candidate.slug}`;
  }

  // Update candidate status
  await db
    .update(companyProbeCandidates)
    .set({ status: 'confirmed' })
    .where(eq(companyProbeCandidates.id, candidateId));

  // Upsert career page
  const [careerPage] = await db
    .insert(companyCareerPages)
    .values({
      companyId: candidate.companyId,
      url: boardUrl,
      atsType: candidate.atsType,
      boardId: candidate.slug,
      status: 'confirmed',
      verification: 'verified',
      detectedVia: 'probe',
      confirmedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [companyCareerPages.companyId, companyCareerPages.atsType, companyCareerPages.boardId],
      set: {
        status: 'confirmed',
        verification: 'verified',
        confirmedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!careerPage) {
    throw new AppError('INTERNAL', 'Failed to confirm career page');
  }

  // Elevate company discovery status to 'monitoring'
  await db
    .update(companies)
    .set({
      discoveryStatus: 'monitoring',
      updatedAt: new Date(),
    })
    .where(eq(companies.id, candidate.companyId));

  // Enable monitor
  await db
    .update(companyMonitors)
    .set({
      enabled: true,
      status: 'ok',
      updatedAt: new Date(),
    })
    .where(eq(companyMonitors.companyId, candidate.companyId));

  await recordAudit({
    actor,
    action: 'company.confirm_candidate',
    entityType: 'company_career_pages',
    entityId: careerPage.id,
    details: { atsType: candidate.atsType, slug: candidate.slug },
  });

  return careerPage;
}

/**
 * Reject a probe candidate.
 */
export async function rejectProbeCandidate(candidateId: string, actor = 'user'): Promise<void> {
  const db = getDb();

  const [candidate] = await db
    .select()
    .from(companyProbeCandidates)
    .where(eq(companyProbeCandidates.id, candidateId))
    .limit(1);

  if (!candidate) {
    throw new AppError('NOT_FOUND', `Probe candidate with id ${candidateId} not found`);
  }

  await db
    .update(companyProbeCandidates)
    .set({ status: 'rejected' })
    .where(eq(companyProbeCandidates.id, candidateId));

  await recordAudit({
    actor,
    action: 'company.reject_candidate',
    entityType: 'company_probe_candidates',
    entityId: candidateId,
  });
}

/**
 * Automatic career page and ATS detection on company domain.
 */
export async function detectCareerPages(
  companyId: string,
  actor = 'user'
): Promise<DiscoveredCareerPage[]> {
  const db = getDb();

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) {
    throw new AppError('NOT_FOUND', `Company with id ${companyId} not found`);
  }

  if (company.discoveryStatus === 'excluded') {
    throw new AppError('FORBIDDEN', 'Cannot detect career pages for excluded company');
  }

  if (!company.primaryDomain) {
    throw new AppError('VALIDATION', 'Company has no primary domain configured');
  }

  const detectedPages = await detectCareerPagesForDomain(company.primaryDomain);

  for (const page of detectedPages) {
    await db
      .insert(companyCareerPages)
      .values({
        companyId,
        url: page.url,
        atsType: page.atsType,
        boardId: page.boardId,
        status: page.confidence === 'high' ? 'confirmed' : 'candidate',
        verification: page.verification,
        detectedVia: page.detectedVia,
      })
      .onConflictDoNothing();
  }

  await recordAudit({
    actor,
    action: 'company.detect_career_pages',
    entityType: 'company',
    entityId: companyId,
    details: { foundCount: detectedPages.length },
  });

  return detectedPages;
}

/**
 * Scheduled or manual monitor check run.
 * Crucial invariant: 0 openings is a REAL value (not null/unknown).
 * Excluded companies are NEVER checked.
 */
export async function runCompanyCheck(
  companyId: string,
  _actor = 'system'
): Promise<typeof companyCheckRuns.$inferSelect> {
  const db = getDb();

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) {
    throw new AppError('NOT_FOUND', `Company with id ${companyId} not found`);
  }

  // FR-CDS-7: Excluded companies are never fetched or monitored
  if (company.discoveryStatus === 'excluded') {
    throw new AppError('FORBIDDEN', `Cannot run check on excluded company "${company.name}"`);
  }

  const [careerPage] = await db
    .select()
    .from(companyCareerPages)
    .where(
      and(
        eq(companyCareerPages.companyId, companyId),
        inArray(companyCareerPages.status, ['confirmed', 'candidate'])
      )
    )
    .orderBy(desc(companyCareerPages.status))
    .limit(1);

  const [monitor] = await db
    .select()
    .from(companyMonitors)
    .where(eq(companyMonitors.companyId, companyId))
    .limit(1);

  if (!careerPage) {
    // Record failure run
    const [failedRun] = await db
      .insert(companyCheckRuns)
      .values({
        companyId,
        status: 'unreachable',
        error: 'No candidate or confirmed career page registered for company',
        finishedAt: new Date(),
        details: {},
      })
      .returning();

    if (monitor) {
      const nextFailures = monitor.consecutiveFailures + 1;
      await db
        .update(companyMonitors)
        .set({
          consecutiveFailures: nextFailures,
          status: nextFailures >= 3 ? 'failing' : monitor.status,
          lastCheckedAt: new Date(),
          lastError: 'No career page registered',
          updatedAt: new Date(),
        })
        .where(eq(companyMonitors.companyId, companyId));
    }

    if (!failedRun) {
      throw new AppError('INTERNAL', 'Failed to record check run');
    }

    return failedRun;
  }

  let openingsCount: number | null = null;
  let boardAlive = false;
  let checkStatus: 'succeeded' | 'failed' | 'blocked_by_robots' | 'unreachable' = 'succeeded';
  let checkError: string | null = null;

  try {
    const ats = careerPage.atsType;
    const boardId = careerPage.boardId;

    if (ats === 'greenhouse' && boardId) {
      const res = await safeFetch(`https://boards-api.greenhouse.io/v1/boards/${boardId}/jobs`, {
        timeoutMs: 8000,
      });
      if (res.ok) {
        boardAlive = true;
        const json = await res.json();
        openingsCount = Array.isArray(json.jobs) ? json.jobs.length : 0;
      } else if (res.status === 404) {
        checkStatus = 'unreachable';
        checkError = 'Greenhouse board returned 404 Not Found';
      } else {
        checkStatus = 'failed';
        checkError = `HTTP ${res.status}`;
      }
    } else if (ats === 'lever' && boardId) {
      const res = await safeFetch(`https://api.lever.co/v0/postings/${boardId}?mode=json`, {
        timeoutMs: 8000,
      });
      if (res.ok) {
        boardAlive = true;
        const json = await res.json();
        openingsCount = Array.isArray(json) ? json.length : 0;
      } else if (res.status === 404) {
        checkStatus = 'unreachable';
        checkError = 'Lever board returned 404 Not Found';
      } else {
        checkStatus = 'failed';
        checkError = `HTTP ${res.status}`;
      }
    } else if (ats === 'ashby' && boardId) {
      const res = await safeFetch(`https://api.ashbyhq.com/posting-api/job-board/${boardId}`, {
        timeoutMs: 8000,
      });
      if (res.ok) {
        boardAlive = true;
        const json = await res.json();
        openingsCount = Array.isArray(json.jobs) ? json.jobs.length : 0;
      } else if (res.status === 404) {
        checkStatus = 'unreachable';
        checkError = 'Ashby board returned 404 Not Found';
      } else {
        checkStatus = 'failed';
        checkError = `HTTP ${res.status}`;
      }
    } else if (ats === 'smartrecruiters' && boardId) {
      const res = await safeFetch(`https://api.smartrecruiters.com/v1/companies/${boardId}/postings?limit=1`, {
        timeoutMs: 8000,
      });
      if (res.ok) {
        boardAlive = true;
        const json = await res.json();
        openingsCount = typeof json.totalFound === 'number' ? json.totalFound : 0;
      } else if (res.status === 404) {
        checkStatus = 'unreachable';
        checkError = 'SmartRecruiters company returned 404 Not Found';
      } else {
        checkStatus = 'failed';
        checkError = `HTTP ${res.status}`;
      }
    } else {
      // General webpage fallback
      const res = await safeFetch(careerPage.url, { timeoutMs: 10000 });
      boardAlive = res.ok;
      if (!res.ok) {
        checkStatus = 'unreachable';
        checkError = `Career page responded with HTTP ${res.status}`;
      }
    }
  } catch (err: unknown) {
    checkStatus = 'failed';
    checkError = err instanceof Error ? err.message : String(err);
  }

  // Insert check run record
  const [run] = await db
    .insert(companyCheckRuns)
    .values({
      companyId,
      careerPageId: careerPage.id,
      status: checkStatus,
      openingsCount,
      boardAlive,
      atsChanged: false,
      finishedAt: new Date(),
      error: checkError,
      details: { url: careerPage.url, atsType: careerPage.atsType },
    })
    .returning();

  // Update monitor record
  if (monitor) {
    const isSuccess = checkStatus === 'succeeded';
    const nextFailures = isSuccess ? 0 : monitor.consecutiveFailures + 1;
    const nextStatus = nextFailures >= 3 ? 'failing' : 'ok';

    await db
      .update(companyMonitors)
      .set({
        lastCheckedAt: new Date(),
        openingsCount: isSuccess ? openingsCount : monitor.openingsCount,
        consecutiveFailures: nextFailures,
        status: nextStatus,
        lastError: checkError,
        updatedAt: new Date(),
      })
      .where(eq(companyMonitors.companyId, companyId));

    // If consecutive failures threshold reached, send alert notification
    if (nextFailures === 3) {
      await createNotification({
        type: 'company_monitor_failing',
        severity: 'warn',
        title: `Career page check failing for ${company.name}`,
        body: `Career page monitor failed 3 consecutive times: ${checkError || 'unknown error'}`,
        link: `/companies/${company.id}`,
        entityType: 'company',
        entityId: company.id,
        dedupeKey: `monitor_failing:${company.id}`,
        channels: ['in_app'],
      });
    }
  }

  // Update career page lastCheckedAt
  await db
    .update(companyCareerPages)
    .set({
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(companyCareerPages.id, careerPage.id));

  if (!run) {
    throw new AppError('INTERNAL', 'Failed to record check run');
  }

  return run;
}

/**
 * Bulk import companies via CSV or raw text list.
 */
export async function importCompaniesBulk(
  input: ImportCompaniesInput,
  actor = 'user'
): Promise<{
  batchId: string;
  total: number;
  acceptedCount: number;
  rejectedCount: number;
  rejected: { row: number; raw: string; reason: string }[];
}> {
  const db = getDb();
  const parsed = parseCompanyImport(input.content, input.source);

  let acceptedCount = 0;
  for (const item of parsed.accepted) {
    try {
      await createCompany(
        {
          name: item.name,
          primaryDomain: item.domain,
          careerUrl: item.careerUrl,
          industry: item.industry,
          notes: item.notes,
          origin: 'csv',
        },
        actor
      );
      acceptedCount++;
    } catch {
      parsed.rejected.push({
        row: acceptedCount + parsed.rejected.length + 1,
        raw: item.name,
        reason: 'Database insertion error or duplicate',
      });
    }
  }

  const [batch] = await db
    .insert(companyImportBatches)
    .values({
      source: input.source,
      total: parsed.accepted.length + parsed.rejected.length,
      accepted: acceptedCount,
      rejected: parsed.rejected.length,
    })
    .returning();

  if (!batch) {
    throw new AppError('INTERNAL', 'Failed to create import batch record');
  }

  await recordAudit({
    actor,
    action: 'company.bulk_import',
    entityType: 'company_import_batches',
    entityId: batch.id,
    details: { total: batch.total, accepted: acceptedCount, rejected: batch.rejected },
  });

  return {
    batchId: batch.id,
    total: batch.total,
    acceptedCount,
    rejectedCount: parsed.rejected.length,
    rejected: parsed.rejected,
  };
}

/**
 * Propose company registration when a job URL is imported.
 */
export async function proposeFromJobUrl(
  jobUrl: string,
  actor = 'system'
): Promise<{
  company: CompanyWithMonitor;
  careerPage?: typeof companyCareerPages.$inferSelect;
}> {
  const detected = detectAtsFromUrl(jobUrl);
  let companyName = '';
  let domain = '';

  if (detected && detected.boardId) {
    // Generate human-friendly company name from boardId
    companyName = detected.boardId
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    domain = `${detected.boardId}.com`;
  } else {
    const parsed = new URL(jobUrl);
    domain = parsed.hostname;
    companyName = (domain.split('.')[0] || 'COMPANY').toUpperCase();
  }

  const company = await createCompany(
    {
      name: companyName,
      primaryDomain: domain,
      careerUrl: jobUrl,
      origin: 'job_url',
      originRef: jobUrl,
    },
    actor
  );

  return { company };
}

/**
 * Read-only interface for Job Discovery module:
 * Returns all active, monitored, confirmed ATS boards for sync.
 */
export async function getBoardsForDiscovery(): Promise<{
  careerPageId: string;
  companyId: string;
  companyName: string;
  atsType: string;
  boardId: string;
  url: string;
}[]> {
  const db = getDb();

  const rows = await db
    .select({
      careerPageId: companyCareerPages.id,
      companyId: companies.id,
      companyName: companies.name,
      atsType: companyCareerPages.atsType,
      boardId: companyCareerPages.boardId,
      url: companyCareerPages.url,
    })
    .from(companyCareerPages)
    .innerJoin(companies, eq(companyCareerPages.companyId, companies.id))
    .innerJoin(companyMonitors, eq(companies.id, companyMonitors.companyId))
    .where(
      and(
        eq(companyCareerPages.status, 'confirmed'),
        eq(companyMonitors.enabled, true),
        inArray(companies.discoveryStatus, ['monitoring', 'registered']),
        inArray(companyCareerPages.atsType, ['greenhouse', 'lever', 'ashby', 'smartrecruiters'])
      )
    );

  return rows.filter((r): r is typeof r & { boardId: string } => Boolean(r.boardId));
}
