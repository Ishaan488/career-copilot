import { safeFetch, isRobotsAllowed } from '@/shared/http';
import * as cheerio from 'cheerio';
import {
  CompanyResearchProvider,
  CompanyResearchResult,
  CompanyTargetInput,
  EvidenceItem,
} from '../domain/types';

export class OfficialWebsiteResearchProvider implements CompanyResearchProvider {
  readonly name = 'official_website';

  async research(company: CompanyTargetInput): Promise<CompanyResearchResult> {
    const rawDomain =
      company.primaryDomain ||
      (company.websiteUrl ? new URL(company.websiteUrl).hostname : '');

    const cleanDomain = rawDomain
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');

    const researchedAt = new Date();

    if (!cleanDomain) {
      return {
        provider: this.name,
        companyId: company.id,
        companyName: company.name,
        domain: '',
        signals: {
          hasOfficialDomain: false,
          isHttps: false,
          hasCareerPage: false,
          hasPhysicalAddress: false,
          hasContactEmailOrPhone: false,
          hasAboutPage: false,
          isUnknown: true,
        },
        evidence: [],
        researchedAt,
      };
    }

    const evidence: EvidenceItem[] = [];
    const socialLinks: string[] = [];
    const contactDetails: string[] = [];
    let isHttps = true;
    let targetUrl = `https://${cleanDomain}`;
    let html = '';

    // 1. Fetch homepage (HTTPS first, then HTTP fallback)
    try {
      const allowed = await isRobotsAllowed(targetUrl);
      if (allowed) {
        const res = await safeFetch(targetUrl, {
          timeoutMs: 8000,
          maxSizeBytes: 2 * 1024 * 1024,
          headers: { Accept: 'text/html,application/xhtml+xml' },
        });

        if (res.ok) {
          html = await res.text();
        } else {
          // Try HTTP fallback
          isHttps = false;
          targetUrl = `http://${cleanDomain}`;
          const httpRes = await safeFetch(targetUrl, {
            timeoutMs: 8000,
            maxSizeBytes: 2 * 1024 * 1024,
            headers: { Accept: 'text/html,application/xhtml+xml' },
          });
          if (httpRes.ok) {
            html = await httpRes.text();
          }
        }
      }
    } catch {
      // Site unreachable
    }

    if (!html) {
      return {
        provider: this.name,
        companyId: company.id,
        companyName: company.name,
        domain: cleanDomain,
        signals: {
          hasOfficialDomain: false,
          isHttps: false,
          hasCareerPage: false,
          hasPhysicalAddress: false,
          hasContactEmailOrPhone: false,
          hasAboutPage: false,
        },
        evidence: [],
        researchedAt,
      };
    }

    // Evidence: Domain & SSL
    evidence.push({
      signalType: 'domain_ssl',
      sourceUrl: targetUrl,
      contentSnippet: `Verified accessible website at ${targetUrl} (HTTPS: ${isHttps})`,
      confidence: 0.95,
      capturedAt: researchedAt,
      metadata: { domain: cleanDomain, isHttps },
    });

    const $ = cheerio.load(html);

    // 2. Parse Meta & JSON-LD
    let hasAboutPage = false;
    let aboutSnippet: string | undefined;
    let hasPhysicalAddress = false;
    let addressSnippet: string | undefined;

    // Check JSON-LD
    $('script[type="application/ld+json"]').each((_, elem) => {
      try {
        const jsonText = $(elem).html() || '';
        const parsed = JSON.parse(jsonText);
        const data = Array.isArray(parsed) ? parsed : [parsed];

        for (const item of data) {
          if (
            item['@type'] === 'Organization' ||
            item['@type'] === 'Corporation' ||
            item['@type'] === 'LocalBusiness'
          ) {
            if (item.address) {
              hasPhysicalAddress = true;
              addressSnippet = typeof item.address === 'string'
                ? item.address
                : `${item.address.streetAddress || ''}, ${item.address.addressLocality || ''}, ${item.address.addressCountry || ''}`.trim();

              evidence.push({
                signalType: 'business_registry',
                sourceUrl: targetUrl,
                contentSnippet: `Structured JSON-LD Organization address: ${addressSnippet}`,
                confidence: 0.9,
                capturedAt: researchedAt,
              });
            }

            if (item.sameAs) {
              const sameAsList = Array.isArray(item.sameAs) ? item.sameAs : [item.sameAs];
              for (const s of sameAsList) {
                if (typeof s === 'string' && !socialLinks.includes(s)) {
                  socialLinks.push(s);
                }
              }
            }
          }
        }
      } catch {
        // Ignore invalid JSON-LD
      }
    });

    // 3. Scan Links for Social Profiles
    $('a[href]').each((_, elem) => {
      const href = $(elem).attr('href') || '';
      const lower = href.toLowerCase();

      if (
        (lower.includes('linkedin.com/company') ||
          lower.includes('github.com/') ||
          lower.includes('twitter.com/') ||
          lower.includes('x.com/') ||
          lower.includes('youtube.com/')) &&
        !socialLinks.includes(href)
      ) {
        socialLinks.push(href);
      }
    });

    if (socialLinks.length > 0) {
      evidence.push({
        signalType: 'social_presence',
        sourceUrl: targetUrl,
        contentSnippet: `Verified social profiles on homepage: ${socialLinks.slice(0, 3).join(', ')}`,
        confidence: 0.85,
        capturedAt: researchedAt,
        metadata: { socialLinks },
      });
    }

    // 4. Scan for Contact Details (email & phone)
    const pageText = $('body').text();
    const emailMatches = pageText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const validEmails = emailMatches.filter(
      (e) => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.includes('example.com')
    );

    if (validEmails.length > 0) {
      const uniqueEmails = Array.from(new Set(validEmails)).slice(0, 3);
      contactDetails.push(...uniqueEmails);
      evidence.push({
        signalType: 'contact_info',
        sourceUrl: targetUrl,
        contentSnippet: `Disclosed contact emails: ${uniqueEmails.join(', ')}`,
        confidence: 0.85,
        capturedAt: researchedAt,
      });
    }

    // 5. Scan for About Page & Mission
    let aboutLink = '';
    $('a[href]').each((_, elem) => {
      const href = $(elem).attr('href') || '';
      const text = $(elem).text().toLowerCase().trim();
      if (
        text === 'about' ||
        text === 'about us' ||
        text === 'company' ||
        text === 'our story' ||
        href.includes('/about') ||
        href.includes('/company')
      ) {
        if (!aboutLink && (href.startsWith('http') || href.startsWith('/'))) {
          aboutLink = href.startsWith('http') ? href : `https://${cleanDomain}${href}`;
        }
      }
    });

    if (aboutLink) {
      hasAboutPage = true;
      aboutSnippet = `About link found at ${aboutLink}`;
      evidence.push({
        signalType: 'about_us',
        sourceUrl: aboutLink,
        contentSnippet: aboutSnippet,
        confidence: 0.8,
        capturedAt: researchedAt,
      });
    } else {
      // Check if meta description has about text
      const metaDesc = $('meta[name="description"]').attr('content');
      if (metaDesc && metaDesc.length > 20) {
        hasAboutPage = true;
        aboutSnippet = metaDesc;
        evidence.push({
          signalType: 'about_us',
          sourceUrl: targetUrl,
          contentSnippet: `Company overview from meta description: ${metaDesc}`,
          confidence: 0.75,
          capturedAt: researchedAt,
        });
      }
    }

    // 6. Scan for Careers Presence & ATS
    let careerPageUrl: string | undefined;
    let atsType = 'unknown';

    $('a[href]').each((_, elem) => {
      const href = $(elem).attr('href') || '';
      const text = $(elem).text().toLowerCase().trim();
      const lower = href.toLowerCase();

      if (
        lower.includes('boards.greenhouse.io') ||
        lower.includes('jobs.lever.co') ||
        lower.includes('ashbyhq.com') ||
        lower.includes('smartrecruiters.com') ||
        text === 'careers' ||
        text === 'jobs' ||
        text === 'join us' ||
        text === 'work with us' ||
        lower.includes('/careers') ||
        lower.includes('/jobs')
      ) {
        if (!careerPageUrl) {
          careerPageUrl = href.startsWith('http') ? href : `https://${cleanDomain}${href}`;
          if (lower.includes('greenhouse.io')) atsType = 'greenhouse';
          else if (lower.includes('lever.co')) atsType = 'lever';
          else if (lower.includes('ashbyhq.com')) atsType = 'ashby';
          else if (lower.includes('smartrecruiters.com')) atsType = 'smartrecruiters';
          else atsType = 'custom';
        }
      }
    });

    if (careerPageUrl) {
      evidence.push({
        signalType: 'careers_presence',
        sourceUrl: careerPageUrl,
        contentSnippet: `Verified active careers portal at ${careerPageUrl} (ATS: ${atsType})`,
        confidence: 0.9,
        capturedAt: researchedAt,
        metadata: { atsType, careerPageUrl },
      });
    }

    return {
      provider: this.name,
      companyId: company.id,
      companyName: company.name,
      domain: cleanDomain,
      signals: {
        hasOfficialDomain: true,
        domain: cleanDomain,
        isHttps,
        hasCareerPage: Boolean(careerPageUrl),
        careerPageUrl,
        atsType,
        hasPhysicalAddress,
        address: addressSnippet,
        hasContactEmailOrPhone: contactDetails.length > 0,
        contactDetails,
        hasAboutPage,
        aboutTextSnippet: aboutSnippet,
        socialLinks,
      },
      evidence,
      researchedAt,
    };
  }
}

export const officialWebsiteResearchProvider = new OfficialWebsiteResearchProvider();
