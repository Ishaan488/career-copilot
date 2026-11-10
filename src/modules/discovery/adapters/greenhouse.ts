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
  decodeHtmlEntities,
} from '../domain/normalize';
import { normalizeCanonicalUrl } from '../domain/dedupe';

export const greenhouseConfigSchema = z.object({
  boardToken: z.string().min(1),
});

export type GreenhouseConfig = z.infer<typeof greenhouseConfigSchema>;

export class GreenhouseAdapter implements SourceAdapter<GreenhouseConfig> {
  readonly type = 'greenhouse' as const;
  readonly configSchema = greenhouseConfigSchema;
  readonly access = 'public_api' as const;

  async *fetchListings(ctx: {
    config: GreenhouseConfig;
    cursor?: string;
    signal?: AbortSignal;
  }): AsyncIterable<RawListingPage> {
    const { boardToken } = this.configSchema.parse(ctx.config);
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`;

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
      throw new Error(`Greenhouse API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { jobs?: unknown[] };
    const rawJobs = Array.isArray(data.jobs) ? data.jobs : [];

    const items: RawListing[] = rawJobs.map((item) => {
      const job = item as {
        id: number | string;
        title: string;
        absolute_url?: string;
        content?: string;
      };
      const externalId = String(job.id);
      const decodedHtml = decodeHtmlEntities(job.content || '');
      const plainText = htmlToText(decodedHtml);
      const contentHash = hashJobDescription(plainText || job.title);

      return {
        externalId,
        url: job.absolute_url || '',
        title: job.title || '',
        rawPayload: item,
        contentHash,
      };
    });

    yield { items, hasMore: false };
  }

  extract(raw: RawListing): ExtractedJob {
    const job = raw.rawPayload as {
      id: number | string;
      title: string;
      absolute_url?: string;
      content?: string;
      location?: { name?: string };
      updated_at?: string;
      first_published?: string;
    };

    const decodedHtml = decodeHtmlEntities(job.content || '');
    const descriptionText = htmlToText(decodedHtml);
    const title = cleanJobTitle(job.title || raw.title);
    const normalizedTitle = normalizeJobTitle(title);
    const seniority = extractSeniority(title, descriptionText);
    const locationParsed = parseLocationAndWorkMode(
      job.location?.name,
      undefined,
      title,
      descriptionText
    );
    const comp = parseCompensation(null, descriptionText);
    const employmentType = parseEmploymentType(descriptionText);
    const postedDate = job.updated_at || job.first_published;

    return {
      externalId: raw.externalId,
      title,
      normalizedTitle,
      seniority,
      descriptionText,
      descriptionHtml: decodedHtml || null,
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
      postedAt: postedDate ? new Date(postedDate) : null,
      applicationUrl: job.absolute_url || null,
      canonicalUrl: normalizeCanonicalUrl(job.absolute_url),
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
      const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs`;
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
