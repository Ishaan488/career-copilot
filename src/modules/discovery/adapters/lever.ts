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

export const leverConfigSchema = z.object({
  company: z.string().min(1),
});

export type LeverConfig = z.infer<typeof leverConfigSchema>;

export class LeverAdapter implements SourceAdapter<LeverConfig> {
  readonly type = 'lever' as const;
  readonly configSchema = leverConfigSchema;
  readonly access = 'public_api' as const;

  async *fetchListings(ctx: {
    config: LeverConfig;
    cursor?: string;
    signal?: AbortSignal;
  }): AsyncIterable<RawListingPage> {
    const { company } = this.configSchema.parse(ctx.config);
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`;

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
      throw new Error(`Lever API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const rawJobs = Array.isArray(data) ? data : [];

    const items: RawListing[] = rawJobs.map((item) => {
      const job = item as {
        id: string;
        text: string;
        hostedUrl?: string;
        descriptionPlain?: string;
        description?: string;
      };
      const externalId = job.id;
      const plainText = job.descriptionPlain || htmlToText(job.description || '');
      const contentHash = hashJobDescription(plainText || job.text);

      return {
        externalId,
        url: job.hostedUrl || '',
        title: job.text || '',
        rawPayload: item,
        contentHash,
      };
    });

    yield { items, hasMore: false };
  }

  extract(raw: RawListing): ExtractedJob {
    const job = raw.rawPayload as {
      id: string;
      text: string;
      hostedUrl?: string;
      applyUrl?: string;
      description?: string;
      descriptionPlain?: string;
      additional?: string;
      additionalPlain?: string;
      categories?: {
        commitment?: string;
        location?: string;
        department?: string;
        team?: string;
        allLocations?: string[];
      };
      workplaceType?: string;
      createdAt?: number;
    };

    const combinedHtml = `${job.description || ''}\n${job.additional || ''}`.trim();
    const descriptionText =
      job.descriptionPlain ||
      htmlToText(combinedHtml) ||
      job.text;

    const title = cleanJobTitle(job.text || raw.title);
    const normalizedTitle = normalizeJobTitle(title);
    const seniority = extractSeniority(title, descriptionText);

    const locationParsed = parseLocationAndWorkMode(
      job.categories?.location,
      job.workplaceType,
      title,
      descriptionText
    );

    const employmentType = parseEmploymentType(job.categories?.commitment);
    const comp = parseCompensation(null, descriptionText);

    return {
      externalId: raw.externalId,
      title,
      normalizedTitle,
      seniority,
      descriptionText,
      descriptionHtml: combinedHtml || null,
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
      postedAt: job.createdAt ? new Date(job.createdAt) : null,
      applicationUrl: job.applyUrl || job.hostedUrl || null,
      canonicalUrl: normalizeCanonicalUrl(job.hostedUrl),
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
      const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
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

      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      return {
        exists: true,
        count: list.length,
      };
    } catch (err) {
      return { exists: false, error: (err as Error).message };
    }
  }
}
