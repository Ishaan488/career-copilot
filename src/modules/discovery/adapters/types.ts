import { z } from 'zod';
import {
  SeniorityLevel,
  WorkMode,
  EmploymentType,
} from '../domain/normalize';

export type SourceType =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'smartrecruiters'
  | 'rss_feed'
  | 'url_import'
  | 'manual_paste';

export interface RawListing {
  externalId: string;
  url: string;
  title: string;
  rawPayload: unknown;
  contentHash: string;
}

export interface RawListingPage {
  items: RawListing[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface ExtractedJob {
  externalId: string;
  title: string;
  normalizedTitle: string;
  seniority: SeniorityLevel | null;
  descriptionText: string;
  descriptionHtml?: string | null;
  locationRaw?: string | null;
  city?: string | null;
  country?: string | null;
  workMode: WorkMode;
  employmentType?: EmploymentType | null;
  compMin: string | null;
  compMax: string | null;
  compCurrency: string | null;
  compPeriod: 'yearly' | 'monthly' | 'hourly' | null;
  compDisclosed: boolean;
  postedAt?: Date | null;
  deadlineAt?: Date | null;
  applicationUrl?: string | null;
  canonicalUrl?: string | null;
  raw: unknown;
  contentHash: string;
}

export interface SnapshotMeta {
  contentHash: string;
  fetchedAt?: Date;
}

export interface ProbeBoardResult {
  exists: boolean;
  displayedName?: string;
  count?: number;
  error?: string;
}

export interface SourceAdapter<C = unknown> {
  readonly type: SourceType;
  readonly configSchema: z.ZodType<C>;
  readonly access: 'public_api' | 'public_feed' | 'public_page' | 'email' | 'manual';

  fetchListings(ctx: {
    config: C;
    cursor?: string;
    signal?: AbortSignal;
  }): AsyncIterable<RawListingPage>;

  extract(raw: RawListing): ExtractedJob;

  detectChange(prev: SnapshotMeta | undefined, raw: RawListing): 'new' | 'changed' | 'unchanged';

  probeBoard?(slug: string): Promise<ProbeBoardResult>;
}
