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
  parseLocationAndWorkMode,
  parseCompensation,
  hashJobDescription,
} from '../domain/normalize';
import { normalizeCanonicalUrl } from '../domain/dedupe';

export const smartRecruitersConfigSchema = z.object({
  companyId: z.string().min(1),
});

export type SmartRecruitersConfig = z.infer<typeof smartRecruitersConfigSchema>;

export class SmartRecruitersAdapter implements SourceAdapter<SmartRecruitersConfig> {
  readonly type = 'smartrecruiters' as const;
  readonly configSchema = smartRecruitersConfigSchema;
  readonly access = 'public_api' as const;

  async *fetchListings(ctx: {
    config: SmartRecruitersConfig;
    cursor?: string;
    signal?: AbortSignal;
  }): AsyncIterable<RawListingPage> {
    const { companyId } = this.configSchema.parse(ctx.config);
    const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyId)}/postings`;

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
      throw new Error(`SmartRecruiters API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { content?: unknown[] };
    const rawJobs = Array.isArray(data.content) ? data.content : [];

    const items: RawListing[] = rawJobs.map((item) => {
      const job = item as {
        id: string;
        name: string;
        location?: { city?: string; country?: string };
        company?: { identifier?: string };
      };
      const externalId = job.id;
      const listingUrl = `https://jobs.smartrecruiters.com/${job.company?.identifier || companyId}/${job.id}`;
      const descriptionText = `${job.name}\nLocation: ${job.location?.city || ''}, ${job.location?.country || ''}`;
      const contentHash = hashJobDescription(descriptionText);

      return {
        externalId,
        url: listingUrl,
        title: job.name || '',
        rawPayload: item,
        contentHash,
      };
    });

    yield { items, hasMore: false };
  }

  extract(raw: RawListing): ExtractedJob {
    const job = raw.rawPayload as {
      id: string;
      name: string;
      releasedDate?: string;
      location?: { city?: string; region?: string; country?: string; remote?: boolean };
      department?: { label?: string };
      company?: { identifier?: string };
    };

    const title = cleanJobTitle(job.name || raw.title);
    const normalizedTitle = normalizeJobTitle(title);
    const locationStr = [job.location?.city, job.location?.region, job.location?.country]
      .filter(Boolean)
      .join(', ');

    const descriptionText = `${title}\nDepartment: ${job.department?.label || 'General'}\nLocation: ${locationStr}`;
    const seniority = extractSeniority(title, descriptionText);
    const locationParsed = parseLocationAndWorkMode(
      locationStr,
      job.location?.remote ? 'remote' : undefined,
      title,
      descriptionText
    );
    const comp = parseCompensation(null, descriptionText);

    return {
      externalId: raw.externalId,
      title,
      normalizedTitle,
      seniority,
      descriptionText,
      descriptionHtml: `<p>${descriptionText.replace(/\n/g, '<br/>')}</p>`,
      locationRaw: locationParsed.locationRaw,
      city: locationParsed.city,
      country: locationParsed.country,
      workMode: locationParsed.workMode,
      employmentType: 'full_time',
      compMin: comp.compMin,
      compMax: comp.compMax,
      compCurrency: comp.compCurrency,
      compPeriod: comp.compPeriod,
      compDisclosed: comp.compDisclosed,
      postedAt: job.releasedDate ? new Date(job.releasedDate) : null,
      applicationUrl: raw.url,
      canonicalUrl: normalizeCanonicalUrl(raw.url),
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
      const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings`;
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

      const data = (await res.json()) as { totalFound?: number; content?: unknown[] };
      const count = typeof data.totalFound === 'number' ? data.totalFound : (data.content?.length ?? 0);
      return {
        exists: true,
        count,
      };
    } catch (err) {
      return { exists: false, error: (err as Error).message };
    }
  }
}
