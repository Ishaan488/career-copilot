import { safeFetch, isRobotsAllowed } from '@/shared/http';
import { detectAtsFromHtml, detectAtsFromUrl } from '../domain/ats-detect';
import * as cheerio from 'cheerio';

export interface DiscoveredCareerPage {
  url: string;
  atsType: string;
  boardId?: string;
  confidence: 'high' | 'medium' | 'low';
  verification: 'verified' | 'partially_verified' | 'unverified';
  detectedVia: 'direct_url' | 'link_detect' | 'embed_detect' | 'probe';
  notes?: string;
}

/**
 * Probes well-known career paths on a domain and inspects HTML for ATS embeds/links.
 */
export async function detectCareerPagesForDomain(domain: string): Promise<DiscoveredCareerPage[]> {
  const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0] || '';
  const candidates: DiscoveredCareerPage[] = [];
  const checkedUrls = new Set<string>();

  const pathsToTry = [
    `https://${cleanDomain}/careers`,
    `https://${cleanDomain}/jobs`,
    `https://careers.${cleanDomain}`,
    `https://${cleanDomain}`,
  ];

  for (const url of pathsToTry) {
    if (checkedUrls.has(url)) continue;
    checkedUrls.add(url);

    try {
      const allowed = await isRobotsAllowed(url);
      if (!allowed) {
        continue;
      }

      const res = await safeFetch(url, {
        timeoutMs: 8000,
        maxSizeBytes: 2 * 1024 * 1024,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
        },
      });

      if (!res.ok) {
        continue;
      }

      const html = await res.text();
      const detected = detectAtsFromHtml(html, url);

      if (detected) {
        candidates.push({
          url: detected.url || url,
          atsType: detected.atsType,
          boardId: detected.boardId,
          confidence: detected.confidence,
          verification: detected.confidence === 'high' ? 'partially_verified' : 'unverified',
          detectedVia: 'embed_detect',
          notes: detected.details ? JSON.stringify(detected.details) : undefined,
        });
        // Found high-confidence ATS, stop searching further paths
        if (detected.confidence === 'high' && detected.isSupported) {
          break;
        }
      }

      // If on homepage and didn't find direct embed, look for links containing "career" or "job"
      if (url === `https://${cleanDomain}`) {
        const $ = cheerio.load(html);
        const careerLinks = $('a[href]');
        for (let i = 0; i < careerLinks.length; i++) {
          const el = $(careerLinks[i]);
          const href = el.attr('href');
          const text = el.text().trim().toLowerCase();

          if (href && (text === 'careers' || text === 'jobs' || text.includes('join our team') || text.includes('work with us'))) {
            try {
              const resolvedUrl = new URL(href, url).toString();
              const atsFromHref = detectAtsFromUrl(resolvedUrl);
              if (atsFromHref) {
                candidates.push({
                  url: atsFromHref.url,
                  atsType: atsFromHref.atsType,
                  boardId: atsFromHref.boardId,
                  confidence: atsFromHref.confidence,
                  verification: 'partially_verified',
                  detectedVia: 'link_detect',
                });
                break;
              } else if (!checkedUrls.has(resolvedUrl) && resolvedUrl.includes(cleanDomain)) {
                // Potential internal career link
                candidates.push({
                  url: resolvedUrl,
                  atsType: 'unknown',
                  confidence: 'low',
                  verification: 'unverified',
                  detectedVia: 'link_detect',
                });
              }
            } catch {
              // Ignore invalid link URLs
            }
          }
        }
      }
    } catch {
      // Fetch or network failure on this path, continue to next path
      continue;
    }
  }

  return candidates;
}
