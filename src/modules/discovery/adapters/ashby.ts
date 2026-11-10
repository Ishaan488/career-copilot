import { z } from 'zod';
import { safeFetch } from '@/shared/http';
import {
  SourceAdapter,
  RawListing,
  RawListingPage,
  ExtractedJob,
  SnapshotMeta,
  ProbeBoardResult,
} from './types';
import {
  cleanJobTitle,
  normalizeJobTitle,
  extractSeniority,
  htmlToText,
  parseLocationAndWorkMode,
  parseEmploymentType,
  parseCompensation,
  hashJobDescription,
} from '../domain/normalize';
import { normalizeCanonicalUrl } from '../domain/dedupe';

export const ashbyConfigSchema = z.object({
  jobBoardName: z.string().min(1),
});

export type AshbyConfig = z.infer<typeof ashbyConfigSchema>;

export class AshbyAdapter implements SourceAdapter<AshbyConfig> {
  readonly type = 'ashby' as const;
  readonly configSchema = ashbyConfigSchema;
  readonly access = 'public_api' as const;

  async *fetchListings(ctx: {
    config: AshbyConfig;
    cursor?: string;
    signal?: AbortSignal;
  }): AsyncIterable<RawListingPage> {
    const { jobBoardName } = this.configSchema.parse(ctx.config);
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(jobBoardName)}?includeCompensation=true`;

    const res = await safeFetch(url, {
      signal: ctx.signal,
      timeoutMs: 20000,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CareerCopilot/1.0 (+https://github.com/Ishaan488/career-copilot)',
      },
    });

    if (!res.ok) {
      if (res.status === 404) {
        yield { items: [], hasMore: false };
        return;
      }
      throw new Error(`Ashby API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { jobs?: unknown[] };
    const rawJobs = Array.isArray(data.jobs) ? data.jobs : [];

    const items: RawListing[] = rawJobs.map((item) => {
      const job = item as {
        id: string;
        title: string;
        jobUrl?: string;
        applyUrl?: string;
        descriptionPlain?: string;
        descriptionHtml?: string;
      };
      const externalId = job.id;
      const plainText = job.descriptionPlain || htmlToText(job.descriptionHtml || '');
      const contentHash = hashJobDescription(plainText || job.title);

      return {
        externalId,
        url: job.jobUrl || job.applyUrl || '',
        title: job.title || '',
        rawPayload: item,
        contentHash,
      };
    });

    yield { items, hasMore: false };
  }

  extract(raw: RawListing): ExtractedJob {
    const job = raw.rawPayload as {
      id: string;
      title: string;
      jobUrl?: string;
      applyUrl?: string;
      descriptionHtml?: string;
      descriptionPlain?: string;
      location?: string;
      employmentType?: string;
      publishedAt?: string;
      compensation?: {
        minAnnualSalary?: number;
        maxAnnualSalary?: number;
        currency?: string;
        compensationTierSummary?: string;
        scrapeableCompensationSalarySummary?: string;
      };
      workplaceType?: string;
    };

    const descriptionText =
      job.descriptionPlain ||
      htmlToText(job.descriptionHtml || '') ||
      job.title;

    const title = cleanJobTitle(job.title || raw.title);
    const normalizedTitle = normalizeJobTitle(title);
    const seniority = extractSeniority(title, descriptionText);

    const locationParsed = parseLocationAndWorkMode(
      job.location,
      job.workplaceType,
      title,
      descriptionText
    );

    const employmentType = parseEmploymentType(job.employmentType);

    // Parse structured compensation or fall back to description parsing
    let comp = parseCompensation(
      job.compensation
        ? {
            min: job.compensation.minAnnualSalary,
            max: job.compensation.maxAnnualSalary,
            currency: job.compensation.currency,
            interval: 'year',
          }
        : null,
      descriptionText
    );

    if (!comp.compDisclosed && job.compensation?.scrapeableCompensationSalarySummary) {
      comp = parseCompensation(null, job.compensation.scrapeableCompensationSalarySummary);
    }

    return {
      externalId: raw.externalId,
      title,
      normalizedTitle,
      seniority,
      descriptionText,
      descriptionHtml: job.descriptionHtml || null,
      locationRaw: locationParsed.locationRaw,
      city: locationParsed.city,
      country: locationParsed.country,
      workMode: locationParsed.workMode,
      employmentType,
      compMin: comp.compMin,
      compMax: comp.compMax,
      compCurrency: comp.compCurrency,
      compPeriod: comp.compPeriod,
      compDisclosed: comp.compDisclosed,
      postedAt: job.publishedAt ? new Date(job.publishedAt) : null,
      applicationUrl: job.applyUrl || job.jobUrl || null,
      canonicalUrl: normalizeCanonicalUrl(job.jobUrl),
      raw: raw.rawPayload,
      contentHash: raw.contentHash,
    };
  }

  detectChange(prev: SnapshotMeta | undefined, raw: RawListing): 'new' | 'changed' | 'unchanged' {
    if (!prev) return 'new';
    return prev.contentHash === raw.contentHash ? 'unchanged' : 'changed';
  }

  async probeBoard(slug: string): Promise<ProbeBoardResult> {
    try {
      const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=false`;
      const res = await safeFetch(url, {
        method: 'GET',
        timeoutMs: 10000,
        headers: { Accept: 'application/json' },
      });

      if (res.status === 404) {
        return { exists: false };
      }
      if (!res.ok) {
        return { exists: false, error: `HTTP ${res.status}` };
      }

      const data = (await res.json()) as { jobs?: unknown[] };
      const jobsList = Array.isArray(data.jobs) ? data.jobs : [];
      return {
        exists: true,
        count: jobsList.length,
      };
    } catch (err) {
      return { exists: false, error: (err as Error).message };
    }
  }
}
