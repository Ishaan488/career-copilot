import { parse } from 'tldts';

const CORPORATE_SUFFIXES = [
  'incorporated',
  'corporation',
  'private limited',
  'pvt ltd',
  'pvt limited',
  'technologies',
  'technology',
  'solutions',
  'software',
  'services',
  'holdings',
  'company',
  'group',
  'labs',
  'tech',
  'corp',
  'inc',
  'ltd',
  'pvt',
  'llc',
  'llp',
  'plc',
  'gmbh',
  'co',
];

/**
 * Generate sensible ATS slug variations for a company name and optional domain.
 * Example: "Postman, Inc." -> ["postman", "postmaninc"]
 * Example: "Razorpay Software Private Limited" -> ["razorpay", "razorpaysoftware"]
 */
export function generateSlugs(companyName: string, domain?: string | null): string[] {
  const slugs = new Set<string>();

  if (!companyName && !domain) {
    return [];
  }

  // 1. If domain is provided, extract its main domain name without TLD
  if (domain) {
    const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0] || '';
    if (cleanDomain) {
      const parsed = parse(cleanDomain);
      if (parsed.domainWithoutSuffix && parsed.domainWithoutSuffix.length >= 2) {
        slugs.add(parsed.domainWithoutSuffix.toLowerCase());
      }
    }
  }

  if (companyName) {
    let base = companyName.toLowerCase().trim();

    // Remove punctuation except hyphens/spaces
    base = base.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ');

    // Remove corporate suffixes
    for (const suffix of CORPORATE_SUFFIXES) {
      const regex = new RegExp(`\\b${suffix}\\b`, 'gi');
      base = base.replace(regex, ' ');
    }

    base = base.replace(/\s+/g, ' ').trim();

    if (base.length >= 2) {
      // Slug with hyphens
      const hyphenated = base.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      if (hyphenated.length >= 2) {
        slugs.add(hyphenated);
      }

      // Slug without hyphens (concatenated)
      const concatenated = base.replace(/[^a-z0-9]/g, '');
      if (concatenated.length >= 2) {
        slugs.add(concatenated);
      }

      // First word alone if multi-word (e.g. "Freshworks Technologies" -> "freshworks")
      const words = base.split(' ').filter((w) => w.length >= 2);
      if (words.length > 1 && words[0]) {
        slugs.add(words[0].replace(/[^a-z0-9]/g, ''));
      }
    }

    // Also include a clean version of raw company name without suffix removal
    const rawClean = companyName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '');
    if (rawClean.length >= 2 && rawClean.length <= 40) {
      slugs.add(rawClean);
    }
  }

  return Array.from(slugs)
    .filter((s) => s.length >= 2 && s.length <= 50)
    .slice(0, 8);
}
