import crypto from 'node:crypto';
import * as cheerio from 'cheerio';

export type SeniorityLevel =
  | 'intern'
  | 'junior'
  | 'mid'
  | 'senior'
  | 'lead'
  | 'staff'
  | 'principal'
  | 'director'
  | 'executive';

export type WorkMode = 'remote' | 'hybrid' | 'onsite' | 'unknown';

export type EmploymentType =
  | 'full_time'
  | 'part_time'
  | 'contract'
  | 'internship'
  | 'temporary';

export interface ParsedCompensation {
  compMin: string | null;
  compMax: string | null;
  compCurrency: string | null;
  compPeriod: 'yearly' | 'monthly' | 'hourly' | null;
  compDisclosed: boolean;
}

export interface ParsedLocation {
  locationRaw: string | null;
  city: string | null;
  country: string | null;
  workMode: WorkMode;
}

/**
 * Strips bracketed requisition IDs, trailing numbers, and extra whitespace from job titles.
 */
export function cleanJobTitle(title: string): string {
  if (!title) return '';

  let cleaned = title.trim();

  // Remove bracketed requisition IDs, e.g. "[REQ-1234]", "(Req #5678)", "[12345]"
  cleaned = cleaned.replace(/\[\s*(?:req|job|id|requisition)?\s*[:#-]?\s*[\w\d-]+\s*\]/gi, '');
  cleaned = cleaned.replace(/\(\s*(?:req|job|id|requisition)?\s*[:#-]?\s*[\w\d-]+\s*\)/gi, '');

  // Remove trailing requisition numbers like " - 1451" or " #9872"
  cleaned = cleaned.replace(/\s+[-–—#]\s*(?:req|id)?\s*\d{3,}\s*$/gi, '');

  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned || title.trim();
}

/**
 * Extracts seniority level from title and description.
 */
export function extractSeniority(title: string, description?: string): SeniorityLevel | null {
  const t = title.toLowerCase();

  // Executive / Director check first
  if (/\b(cto|ceo|cpo|cio|cmo|chief technology officer|chief architect|vp|vice president)\b/i.test(t)) {
    return 'executive';
  }
  if (/\b(director|head of|head -)\b/i.test(t)) {
    return 'director';
  }

  // Principal
  if (/\b(principal|distinguished|fellow)\b/i.test(t)) {
    return 'principal';
  }

  // Staff
  if (/\b(staff|senior staff)\b/i.test(t)) {
    return 'staff';
  }

  // Lead
  if (/\b(tech(?:nical)?\s+lead|team\s+lead|lead(?:\s+software|\s+engineer|\s+developer|\s+backend|\s+frontend|\s+fullstack)?)\b/i.test(t)) {
    return 'lead';
  }

  // Senior
  if (/\b(senior|sr\.?|sr\b|senior-level)\b/i.test(t)) {
    return 'senior';
  }

  // Junior / Intern
  if (/\b(intern|internship|trainee|co-?op)\b/i.test(t)) {
    return 'intern';
  }
  if (/\b(junior|jr\.?|jr\b|entry\s+level|associate\s+engineer|associate\s+software)\b/i.test(t)) {
    return 'junior';
  }

  // Mid-level explicit mentions
  if (/\b(mid|mid-level|intermediate)\b/i.test(t)) {
    return 'mid';
  }

  // Check description if title is ambiguous and description has explicit years or level
  if (description) {
    const d = description.toLowerCase();
    if (/\b(8\+|10\+|12\+)\s*(?:years|yrs)\b/i.test(d)) {
      return 'senior';
    }
  }

  return null;
}

/**
 * Normalizes title for deduplication and indexing (lowercase, noise removed).
 */
export function normalizeJobTitle(title: string): string {
  const cleaned = cleanJobTitle(title).toLowerCase();

  // Strip punctuation and symbols
  const withoutPunct = cleaned.replace(/[^a-z0-9\s]/g, ' ');

  // Collapse whitespace
  return withoutPunct.replace(/\s+/g, ' ').trim();
}

/**
 * Decodes common HTML entities.
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/**
 * Converts HTML to structured plain text while preserving paragraph breaks and lists.
 */
export function htmlToText(html: string): string {
  if (!html) return '';

  const decoded = decodeHtmlEntities(html);
  const $ = cheerio.load(decoded);

  // Replace br and hr with newlines
  $('br').replaceWith('\n');
  $('hr').replaceWith('\n---\n');

  // Format list items
  $('li').each((_, el) => {
    $(el).prepend('• ');
    $(el).append('\n');
  });

  // Format headers and paragraphs
  $('h1, h2, h3, h4, h5, h6, p').each((_, el) => {
    $(el).prepend('\n');
    $(el).append('\n');
  });

  const text = $.text();

  // Normalize linebreaks and whitespace
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line, i, arr) => line.length > 0 || (i > 0 && (arr[i - 1]?.length ?? 0) > 0))
    .join('\n')
    .trim();
}

/**
 * Parses location string and work mode.
 */
export function parseLocationAndWorkMode(
  locationRaw?: string | null,
  workplaceType?: string | null,
  title?: string,
  description?: string
): ParsedLocation {
  const loc = (locationRaw || '').trim();
  const t = (title || '').toLowerCase();
  const d = (description || '').toLowerCase();
  const combined = `${loc} ${t} ${workplaceType || ''} ${d}`.toLowerCase();

  let workMode: WorkMode = 'unknown';

  if (
    workplaceType?.toLowerCase() === 'remote' ||
    /\b(remote|work from home|wfh|anywhere|telecommute)\b/i.test(combined)
  ) {
    workMode = 'remote';
  } else if (
    workplaceType?.toLowerCase() === 'hybrid' ||
    /\b(hybrid|flexible location)\b/i.test(combined)
  ) {
    workMode = 'hybrid';
  } else if (
    workplaceType?.toLowerCase() === 'onsite' ||
    workplaceType?.toLowerCase() === 'in_office' ||
    /\b(onsite|on-site|in-office|in office)\b/i.test(combined)
  ) {
    workMode = 'onsite';
  }

  // Country and City extraction
  let country: string | null = null;
  let city: string | null = null;
  const searchScope = loc || combined;

  if (/\b(india|bharat)\b/i.test(searchScope) || /\b(remote\s*-\s*india)\b/i.test(searchScope)) {
    country = 'India';
  } else if (/\b(united states|usa|u\.s\.a?|san francisco|new york|seattle|austin|chicago)\b/i.test(searchScope)) {
    country = 'United States';
  } else if (/\b(united kingdom|uk|u\.k\.|london)\b/i.test(searchScope)) {
    country = 'United Kingdom';
  } else if (/\b(germany|berlin|munich)\b/i.test(searchScope)) {
    country = 'Germany';
  } else if (/\b(canada|toronto|vancouver)\b/i.test(searchScope)) {
    country = 'Canada';
  }

  // Common Indian cities
  const indianCities = [
    'Bengaluru',
    'Bangalore',
    'Hyderabad',
    'Pune',
    'Mumbai',
    'Delhi',
    'New Delhi',
    'Noida',
    'Gurgaon',
    'Gurugram',
    'Chennai',
    'Kolkata',
    'Ahmedabad',
    'Kochi',
  ];

  for (const c of indianCities) {
    const reg = new RegExp(`\\b${c}\\b`, 'i');
    if (reg.test(searchScope)) {
      city = c === 'Bangalore' ? 'Bengaluru' : c === 'Gurgaon' ? 'Gurugram' : c;
      if (!country) country = 'India';
      break;
    }
  }

  // Common US cities if city not found
  if (!city) {
    const usCities = [
      'San Francisco',
      'New York',
      'Seattle',
      'Austin',
      'Boston',
      'Los Angeles',
      'Chicago',
      'Atlanta',
    ];
    for (const c of usCities) {
      const reg = new RegExp(`\\b${c}\\b`, 'i');
      if (reg.test(searchScope)) {
        city = c;
        if (!country) country = 'United States';
        break;
      }
    }
  }

  return {
    locationRaw: loc || null,
    city,
    country,
    workMode,
  };
}

/**
 * Parses employment type from text/category.
 */
export function parseEmploymentType(raw?: string | null): EmploymentType | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();

  if (/\b(intern|internship|co-op)\b/i.test(s)) return 'internship';
  if (/\b(full[- ]?time|regular|permanent)\b/i.test(s)) return 'full_time';
  if (/\b(part[- ]?time)\b/i.test(s)) return 'part_time';
  if (/\b(contract|contractor|freelance|consultant)\b/i.test(s)) return 'contract';
  if (/\b(temporary|temp)\b/i.test(s)) return 'temporary';

  return null;
}

/**
 * Parses compensation ranges from structured fields or free text.
 * Supports INR (LPA, absolute), USD (k, absolute), EUR, GBP, hourly, monthly, yearly.
 */
export function parseCompensation(
  rawComp?: {
    min?: number | string | null;
    max?: number | string | null;
    currency?: string | null;
    interval?: string | null;
  } | null,
  description?: string
): ParsedCompensation {
  // 1. Check structured compensation first
  if (rawComp && (rawComp.min != null || rawComp.max != null)) {
    const minVal = rawComp.min != null ? Number(rawComp.min) : null;
    const maxVal = rawComp.max != null ? Number(rawComp.max) : null;
    const currency = (rawComp.currency || 'USD').toUpperCase();
    let period: 'yearly' | 'monthly' | 'hourly' = 'yearly';

    if (rawComp.interval) {
      const inter = rawComp.interval.toLowerCase();
      if (inter.includes('hour')) period = 'hourly';
      else if (inter.includes('month')) period = 'monthly';
      else period = 'yearly';
    }

    return {
      compMin: minVal != null && !isNaN(minVal) ? minVal.toString() : null,
      compMax: maxVal != null && !isNaN(maxVal) ? maxVal.toString() : null,
      compCurrency: currency,
      compPeriod: period,
      compDisclosed: true,
    };
  }

  // 2. Parse from text (description or salary strings)
  if (!description) {
    return {
      compMin: null,
      compMax: null,
      compCurrency: null,
      compPeriod: null,
      compDisclosed: false,
    };
  }

  const text = description;

  // A. Indian LPA: e.g. "₹12–18 LPA", "12-18 LPA", "₹15 LPA", "INR 15 to 25 Lakhs"
  const lpaMatch = text.match(
    /(?:₹|inr|rs\.?)\s*(\d+(?:\.\d+)?)\s*(?:[-–—to]+\s*(\d+(?:\.\d+)?))?\s*(?:lpa|lakhs?|lac|lacs?)\b/i
  ) || text.match(/(\d+(?:\.\d+)?)\s*[-–—to]+\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?)\b/i);

  if (lpaMatch) {
    const minLacs = parseFloat(lpaMatch[1] ?? '0');
    const maxLacs = lpaMatch[2] ? parseFloat(lpaMatch[2]) : minLacs;
    return {
      compMin: (minLacs * 100000).toString(),
      compMax: (maxLacs * 100000).toString(),
      compCurrency: 'INR',
      compPeriod: 'yearly',
      compDisclosed: true,
    };
  }

  // B. USD k format: e.g. "$120k - $150k", "$120k–150k", "$140k"
  const usdKMatch = text.match(
    /\$\s*(\d+(?:\.\d+)?)\s*k\s*(?:[-–—to]+\s*\$?\s*(\d+(?:\.\d+)?)\s*k)?\b/i
  );
  if (usdKMatch) {
    const minK = parseFloat(usdKMatch[1] ?? '0');
    const maxK = usdKMatch[2] ? parseFloat(usdKMatch[2]) : minK;
    return {
      compMin: (minK * 1000).toString(),
      compMax: (maxK * 1000).toString(),
      compCurrency: 'USD',
      compPeriod: 'yearly',
      compDisclosed: true,
    };
  }

  // C. Full USD format: e.g. "$120,000 - $160,000" or "$135,000 / year"
  const usdFullMatch = text.match(
    /\$\s*(\d{2,3}(?:,\d{3})+)(?:\s*(?:[-–—to]+|\/)\s*\$?\s*(\d{2,3}(?:,\d{3})+))?(?:\s*(?:\/|per)\s*(year|yr|annum|hr|hour))?/i
  );
  if (usdFullMatch) {
    const min = parseFloat((usdFullMatch[1] ?? '0').replace(/,/g, ''));
    const max = usdFullMatch[2] ? parseFloat(usdFullMatch[2].replace(/,/g, '')) : min;
    const unit = (usdFullMatch[3] || '').toLowerCase();
    const period = unit.startsWith('h') ? 'hourly' : 'yearly';
    return {
      compMin: min.toString(),
      compMax: max.toString(),
      compCurrency: 'USD',
      compPeriod: period,
      compDisclosed: true,
    };
  }

  // D. Hourly format: e.g. "$50 - $75 / hr"
  const hourlyMatch = text.match(
    /(?:\$|₹|£|€)\s*(\d+(?:\.\d+)?)\s*(?:[-–—to]+\s*(?:\$|₹|£|€)?\s*(\d+(?:\.\d+)?))?\s*(?:\/|per)\s*(?:hr|hour)\b/i
  );
  if (hourlyMatch) {
    const min = parseFloat(hourlyMatch[1] ?? '0');
    const max = hourlyMatch[2] ? parseFloat(hourlyMatch[2]) : min;
    const currency = text.includes('₹') ? 'INR' : text.includes('£') ? 'GBP' : text.includes('€') ? 'EUR' : 'USD';
    return {
      compMin: min.toString(),
      compMax: max.toString(),
      compCurrency: currency,
      compPeriod: 'hourly',
      compDisclosed: true,
    };
  }

  return {
    compMin: null,
    compMax: null,
    compCurrency: null,
    compPeriod: null,
    compDisclosed: false,
  };
}

/**
 * Creates SHA-256 hash of job description text.
 */
export function hashJobDescription(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}
