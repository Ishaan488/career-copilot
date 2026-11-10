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

export const rssConfigSchema = z.object({
  feedUrl: z.string().url(),
});

export type RssConfig = z.infer<typeof rssConfigSchema>;

export class RssFeedAdapter implements SourceAdapter<RssConfig> {
  readonly type = 'rss_feed' as const;
  readonly configSchema = rssConfigSchema;
  readonly access = 'public_feed' as const;

  async *fetchListings(ctx: {
    config: RssConfig;
    cursor?: string;
    signal?: AbortSignal;
  }): AsyncIterable<RawListingPage> {
    const { feedUrl } = this.configSchema.parse(ctx.config);

    const res = await safeFetch(feedUrl, {
      signal: ctx.signal,
      timeoutMs: 20000,
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml',
        'User-Agent': 'CareerCopilot/1.0 (+https://github.com/Ishaan488/career-copilot)',
      },
    });

    if (!res.ok) {
      throw new Error(`RSS feed fetch error: ${res.status} ${res.statusText}`);
    }

    const xmlText = await res.text();
    const $ = cheerio.load(xmlText, { xmlMode: true });

    const items: RawListing[] = [];

    // RSS 2.0 <item> elements
    $('item').each((_, el) => {
      const itemEl = $(el);
      const title = itemEl.find('title').text().trim();
      const link = itemEl.find('link').text().trim();
      const guid = itemEl.find('guid').text().trim() || link;
      const description =
        itemEl.find('content\\:encoded').text().trim() ||
        itemEl.find('description').text().trim();
      const pubDate = itemEl.find('pubDate').text().trim();

      const plainText = htmlToText(description || title);
      const contentHash = hashJobDescription(plainText || title);

      items.push({
        externalId: guid || link,
        url: link,
        title,
        rawPayload: {
          title,
          link,
          guid,
          description,
          pubDate,
        },
        contentHash,
      });
    });

    // Atom <entry> elements if no RSS items found
    if (items.length === 0) {
      $('entry').each((_, el) => {
        const entryEl = $(el);
        const title = entryEl.find('title').text().trim();
        const link = entryEl.find('link').attr('href') || entryEl.find('link').text().trim();
        const id = entryEl.find('id').text().trim() || link;
        const content =
          entryEl.find('content').text().trim() ||
          entryEl.find('summary').text().trim();
        const updated = entryEl.find('updated').text().trim() || entryEl.find('published').text().trim();

        const plainText = htmlToText(content || title);
        const contentHash = hashJobDescription(plainText || title);

        items.push({
          externalId: id || link,
          url: link,
          title,
          rawPayload: {
            title,
            link,
            guid: id,
            description: content,
            pubDate: updated,
          },
          contentHash,
        });
      });
    }

    yield { items, hasMore: false };
  }

  extract(raw: RawListing): ExtractedJob {
    const payload = raw.rawPayload as {
      title?: string;
      link?: string;
      guid?: string;
      description?: string;
      pubDate?: string;
    };

    const title = cleanJobTitle(payload.title || raw.title);
    const normalizedTitle = normalizeJobTitle(title);
    const descriptionText = htmlToText(payload.description || '') || title;
    const seniority = extractSeniority(title, descriptionText);
    const locationParsed = parseLocationAndWorkMode(undefined, undefined, title, descriptionText);
    const comp = parseCompensation(null, descriptionText);
    const employmentType = parseEmploymentType(descriptionText);

    return {
      externalId: raw.externalId,
      title,
      normalizedTitle,
      seniority,
      descriptionText,
      descriptionHtml: payload.description || null,
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
      postedAt: payload.pubDate ? new Date(payload.pubDate) : null,
      applicationUrl: payload.link || null,
      canonicalUrl: normalizeCanonicalUrl(payload.link),
      raw: raw.rawPayload,
      contentHash: raw.contentHash,
    };
  }

  detectChange(prev: SnapshotMeta | undefined, raw: RawListing): 'new' | 'changed' | 'unchanged' {
    if (!prev) return 'new';
    return prev.contentHash === raw.contentHash ? 'unchanged' : 'changed';
  }
}
