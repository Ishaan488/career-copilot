import { z } from 'zod';
import * as cheerio from 'cheerio';
import { safeFetch } from '@/shared/http';
import {
  SourceAdapter,
  RawListing,
  RawListingPage,
  ExtractedJob,
  SnapshotMeta,
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

export const urlImportConfigSchema = z.object({
  url: z.string().url(),
});

export type UrlImportConfig = z.infer<typeof urlImportConfigSchema>;

export class UrlImportAdapter implements SourceAdapter<UrlImportConfig> {
  readonly type = 'url_import' as const;
  readonly configSchema = urlImportConfigSchema;
  readonly access = 'public_page' as const;

  async *fetchListings(ctx: {
    config: UrlImportConfig;
    cursor?: string;
    signal?: AbortSignal;
  }): AsyncIterable<RawListingPage> {
    const { url } = this.configSchema.parse(ctx.config);

    const res = await safeFetch(url, {
      signal: ctx.signal,
      timeoutMs: 20000,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to import job from URL: ${res.status} ${res.statusText}`);
    }

    const html = await res.text();
    const parsed = this.parsePageContent(url, html);
    const contentHash = hashJobDescription(parsed.descriptionText || parsed.title);

    yield {
      items: [
        {
          externalId: url,
          url,
          title: parsed.title,
          rawPayload: {
            url,
            ...parsed,
            rawHtml: html.slice(0, 50000), // Cap raw HTML at 50KB in payload
          },
          contentHash,
        },
      ],
      hasMore: false,
    };
  }

  parsePageContent(url: string, html: string): {
    title: string;
    descriptionText: string;
    descriptionHtml?: string;
    companyName?: string;
    locationRaw?: string;
    workMode?: string;
    employmentType?: string;
    postedAt?: string;
    salary?: string;
  } {
    const $ = cheerio.load(html);

    // 1. Try JSON-LD JobPosting first
    let jsonLdJob: Record<string, unknown> | null = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const text = $(el).text().trim();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          const found = parsed.find((p) => p && (p['@type'] === 'JobPosting' || p['@type']?.includes('JobPosting')));
          if (found) jsonLdJob = found;
        } else if (parsed && (parsed['@type'] === 'JobPosting' || parsed['@type']?.includes('JobPosting'))) {
          jsonLdJob = parsed;
        }
      } catch {
        // Ignore JSON parse errors in script tags
      }
    });

    if (jsonLdJob) {
      const ld = jsonLdJob as {
        title?: string;
        description?: string;
        datePosted?: string;
        employmentType?: string;
        hiringOrganization?: { name?: string };
        jobLocation?: {
          address?: {
            addressLocality?: string;
            addressRegion?: string;
            addressCountry?: string;
          } | string;
        };
        baseSalary?: {
          value?: {
            minValue?: number;
            maxValue?: number;
            unitText?: string;
          };
          currency?: string;
        };
      };

      const title = ld.title || $('title').text() || 'Job Opportunity';
      const descHtml = ld.description || '';
      const descText = htmlToText(descHtml) || title;

      let locationStr = '';
      if (typeof ld.jobLocation?.address === 'string') {
        locationStr = ld.jobLocation.address;
      } else if (ld.jobLocation?.address) {
        const addr = ld.jobLocation.address;
        locationStr = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
          .filter(Boolean)
          .join(', ');
      }

      return {
        title,
        descriptionText: descText,
        descriptionHtml: descHtml,
        companyName: ld.hiringOrganization?.name,
        locationRaw: locationStr || undefined,
        employmentType: ld.employmentType,
        postedAt: ld.datePosted,
      };
    }

    // 2. Fallback to OpenGraph and DOM heuristics
    const ogTitle = $('meta[property="og:title"]').attr('content');
    const pageTitle = $('title').text().trim();
    const title = ogTitle || pageTitle || 'Job Opportunity';

    const ogDesc = $('meta[property="og:description"]').attr('content');
    const metaDesc = $('meta[name="description"]').attr('content');

    // Look for article, main, or job-description container
    const mainContent =
      $('main').html() ||
      $('article').html() ||
      $('.job-description, #job-description, .posting-description').html() ||
      $('body').html() ||
      '';

    const descriptionText =
      htmlToText(mainContent) ||
      ogDesc ||
      metaDesc ||
      title;

    return {
      title,
      descriptionText,
      descriptionHtml: mainContent,
    };
  }

  extract(raw: RawListing): ExtractedJob {
    const payload = raw.rawPayload as {
      url: string;
      title: string;
      descriptionText: string;
      descriptionHtml?: string;
      companyName?: string;
      locationRaw?: string;
      workMode?: string;
      employmentType?: string;
      postedAt?: string;
    };

    const title = cleanJobTitle(payload.title || raw.title);
    const normalizedTitle = normalizeJobTitle(title);
    const seniority = extractSeniority(title, payload.descriptionText);
    const locationParsed = parseLocationAndWorkMode(
      payload.locationRaw,
      payload.workMode,
      title,
      payload.descriptionText
    );
    const comp = parseCompensation(null, payload.descriptionText);
    const employmentType = parseEmploymentType(payload.employmentType);

    return {
      externalId: raw.externalId,
      title,
      normalizedTitle,
      seniority,
      descriptionText: payload.descriptionText,
      descriptionHtml: payload.descriptionHtml || null,
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
      postedAt: payload.postedAt ? new Date(payload.postedAt) : null,
      applicationUrl: payload.url,
      canonicalUrl: normalizeCanonicalUrl(payload.url),
      raw: raw.rawPayload,
      contentHash: raw.contentHash,
    };
  }

  detectChange(prev: SnapshotMeta | undefined, raw: RawListing): 'new' | 'changed' | 'unchanged' {
    if (!prev) return 'new';
    return prev.contentHash === raw.contentHash ? 'unchanged' : 'changed';
  }
}
