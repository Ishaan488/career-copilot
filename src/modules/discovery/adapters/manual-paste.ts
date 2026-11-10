import { z } from 'zod';
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
  parseLocationAndWorkMode,
  parseEmploymentType,
  parseCompensation,
  hashJobDescription,
} from '../domain/normalize';
import { normalizeCanonicalUrl } from '../domain/dedupe';

export const manualPasteConfigSchema = z.object({});

export type ManualPasteConfig = z.infer<typeof manualPasteConfigSchema>;

export class ManualPasteAdapter implements SourceAdapter<ManualPasteConfig> {
  readonly type = 'manual_paste' as const;
  readonly configSchema = manualPasteConfigSchema;
  readonly access = 'manual' as const;

  async *fetchListings(): AsyncIterable<RawListingPage> {
    yield { items: [], hasMore: false };
  }

  extract(raw: RawListing): ExtractedJob {
    const payload = raw.rawPayload as {
      title: string;
      descriptionText: string;
      applicationUrl?: string;
      locationRaw?: string;
      workMode?: string;
      employmentType?: string;
      compMin?: string;
      compMax?: string;
      compCurrency?: string;
      compPeriod?: 'yearly' | 'monthly' | 'hourly';
    };

    const title = cleanJobTitle(payload.title || raw.title);
    const normalizedTitle = normalizeJobTitle(title);
    const descriptionText = payload.descriptionText || title;
    const seniority = extractSeniority(title, descriptionText);

    const locationParsed = parseLocationAndWorkMode(
      payload.locationRaw,
      payload.workMode,
      title,
      descriptionText
    );

    const employmentType = parseEmploymentType(payload.employmentType);

    // Fall back to text compensation parsing if not explicitly provided
    let compMin = payload.compMin || null;
    let compMax = payload.compMax || null;
    let compCurrency = payload.compCurrency || null;
    let compPeriod = payload.compPeriod || null;
    let compDisclosed = Boolean(compMin || compMax);

    if (!compDisclosed) {
      const parsedComp = parseCompensation(null, descriptionText);
      compMin = parsedComp.compMin;
      compMax = parsedComp.compMax;
      compCurrency = parsedComp.compCurrency;
      compPeriod = parsedComp.compPeriod;
      compDisclosed = parsedComp.compDisclosed;
    }

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
      employmentType,
      compMin,
      compMax,
      compCurrency,
      compPeriod,
      compDisclosed,
      postedAt: new Date(),
      applicationUrl: payload.applicationUrl || null,
      canonicalUrl: normalizeCanonicalUrl(payload.applicationUrl),
      raw: raw.rawPayload,
      contentHash: raw.contentHash,
    };
  }

  detectChange(prev: SnapshotMeta | undefined, raw: RawListing): 'new' | 'changed' | 'unchanged' {
    if (!prev) return 'new';
    return prev.contentHash === raw.contentHash ? 'unchanged' : 'changed';
  }
}

export function createManualListing(input: {
  id?: string;
  title: string;
  descriptionText: string;
  applicationUrl?: string;
  locationRaw?: string;
  workMode?: string;
  employmentType?: string;
  compMin?: string;
  compMax?: string;
  compCurrency?: string;
  compPeriod?: 'yearly' | 'monthly' | 'hourly';
}): RawListing {
  const externalId = input.id || `manual-${Date.now()}`;
  const contentHash = hashJobDescription(input.descriptionText || input.title);

  return {
    externalId,
    url: input.applicationUrl || '',
    title: input.title,
    rawPayload: input,
    contentHash,
  };
}
