import { safeFetch } from '@/shared/http';
import { SupportedAtsType } from '../domain/ats-detect';

export interface AtsProbeResult {
  atsType: SupportedAtsType;
  slug: string;
  outcome: 'exists' | 'not_found' | 'rate_limited' | 'error';
  displayedName?: string;
  openingsCount?: number;
  statusCode?: number;
  errorMessage?: string;
  url: string;
}

/**
 * Probe a specific ATS endpoint for a slug.
 * Uses safeFetch with strict timeout and error classification.
 */
export async function probeAtsEndpoint(atsType: SupportedAtsType, slug: string): Promise<AtsProbeResult> {
  const cleanSlug = encodeURIComponent(slug.trim().toLowerCase());
  let targetUrl = '';

  switch (atsType) {
    case 'greenhouse':
      targetUrl = `https://boards-api.greenhouse.io/v1/boards/${cleanSlug}`;
      break;
    case 'lever':
      targetUrl = `https://api.lever.co/v0/postings/${cleanSlug}?mode=json`;
      break;
    case 'ashby':
      targetUrl = `https://api.ashbyhq.com/posting-api/job-board/${cleanSlug}`;
      break;
    case 'smartrecruiters':
      targetUrl = `https://api.smartrecruiters.com/v1/companies/${cleanSlug}/postings?limit=1`;
      break;
  }

  try {
    const res = await safeFetch(targetUrl, {
      timeoutMs: 6000,
      maxSizeBytes: 1024 * 1024,
      headers: {
        Accept: 'application/json',
      },
    });

    if (res.status === 200) {
      let displayedName: string | undefined;
      let openingsCount: number | undefined;

      try {
        const json = await res.json();
        if (atsType === 'greenhouse' && json) {
          displayedName = json.name;
        } else if (atsType === 'lever' && Array.isArray(json)) {
          openingsCount = json.length;
          // Lever jobs usually have company text or categories
          if (json.length > 0 && json[0]?.text) {
            // First job text
          }
        } else if (atsType === 'ashby' && json) {
          displayedName = json.jobBoard?.name || json.name;
          if (Array.isArray(json.jobs)) {
            openingsCount = json.jobs.length;
          }
        } else if (atsType === 'smartrecruiters' && json) {
          openingsCount = json.totalFound;
        }
      } catch {
        // Response parsing failed but 200 received
      }

      return {
        atsType,
        slug,
        outcome: 'exists',
        displayedName,
        openingsCount,
        statusCode: 200,
        url: targetUrl,
      };
    }

    if (res.status === 404) {
      return {
        atsType,
        slug,
        outcome: 'not_found',
        statusCode: 404,
        url: targetUrl,
      };
    }

    if (res.status === 429) {
      return {
        atsType,
        slug,
        outcome: 'rate_limited',
        statusCode: 429,
        url: targetUrl,
      };
    }

    return {
      atsType,
      slug,
      outcome: 'error',
      statusCode: res.status,
      errorMessage: `HTTP ${res.status}`,
      url: targetUrl,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      atsType,
      slug,
      outcome: 'error',
      errorMessage: message,
      url: targetUrl,
    };
  }
}

/**
 * Compare target company name with displayed ATS board name to compute match score (0.0 to 1.0).
 */
export function computeNameMatchScore(targetName: string, displayedName?: string): number {
  if (!displayedName || !targetName) return 0.5;

  const a = targetName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const b = displayedName.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (a === b) return 1.0;
  if (a.includes(b) || b.includes(a)) return 0.85;

  // Simple token overlap
  const tokensA = new Set(targetName.toLowerCase().split(/\s+/).filter(Boolean));
  const tokensB = new Set(displayedName.toLowerCase().split(/\s+/).filter(Boolean));
  let matched = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) matched++;
  }

  const score = matched / Math.max(tokensA.size, tokensB.size, 1);
  return Number(score.toFixed(2));
}
