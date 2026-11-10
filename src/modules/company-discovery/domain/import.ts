import { parse } from 'tldts';

export interface CompanyImportItem {
  name: string;
  domain?: string;
  careerUrl?: string;
  industry?: string;
  notes?: string;
}

export interface CompanyImportResult {
  accepted: CompanyImportItem[];
  rejected: { row: number; raw: string; reason: string }[];
}

/**
 * Pure parser for bulk company import via CSV or plaintext paste.
 */
export function parseCompanyImport(content: string, format: 'csv' | 'paste' = 'paste'): CompanyImportResult {
  const accepted: CompanyImportItem[] = [];
  const rejected: { row: number; raw: string; reason: string }[] = [];

  if (!content || !content.trim()) {
    return { accepted, rejected };
  }

  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { accepted, rejected };
  }

  // Detect header if CSV
  let startIndex = 0;
  let headerMap: { name?: number; domain?: number; careerUrl?: number; industry?: number; notes?: number } = {};

  const firstLine = lines[0];
  if (firstLine && (format === 'csv' || firstLine.toLowerCase().includes('name') || firstLine.toLowerCase().includes('domain'))) {
    const firstLineCols = firstLine.split(',').map((c) => c.trim().toLowerCase().replace(/^["']|["']$/g, ''));
    if (firstLineCols.some((col) => ['name', 'company', 'domain', 'website', 'url', 'career', 'careers'].includes(col))) {
      startIndex = 1;
      headerMap = {
        name: firstLineCols.findIndex((c) => c === 'name' || c === 'company' || c === 'company_name'),
        domain: firstLineCols.findIndex((c) => c === 'domain' || c === 'website' || c === 'primary_domain'),
        careerUrl: firstLineCols.findIndex((c) => c === 'career_url' || c === 'careers' || c === 'careers_url' || c === 'url'),
        industry: firstLineCols.findIndex((c) => c === 'industry' || c === 'sector'),
        notes: firstLineCols.findIndex((c) => c === 'notes' || c === 'note'),
      };
    }
  }

  const seenNames = new Set<string>();
  const seenDomains = new Set<string>();

  for (let i = startIndex; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine) continue;
    const rowNum = i + 1;

    let name = '';
    let domain: string | undefined;
    let careerUrl: string | undefined;
    let industry: string | undefined;
    let notes: string | undefined;

    if (startIndex === 1) {
      // Header-driven CSV
      const cols = rawLine.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
      if (headerMap.name !== undefined && headerMap.name >= 0) name = cols[headerMap.name] || '';
      if (headerMap.domain !== undefined && headerMap.domain >= 0) domain = cols[headerMap.domain];
      if (headerMap.careerUrl !== undefined && headerMap.careerUrl >= 0) careerUrl = cols[headerMap.careerUrl];
      if (headerMap.industry !== undefined && headerMap.industry >= 0) industry = cols[headerMap.industry];
      if (headerMap.notes !== undefined && headerMap.notes >= 0) notes = cols[headerMap.notes];
    } else {
      // Comma-separated or single-value paste
      if (rawLine.includes(',')) {
        const parts = rawLine.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
        name = parts[0] || '';
        domain = parts[1];
        careerUrl = parts[2];
      } else {
        // Single value per line: Could be a domain or a company name
        const parsedTld = parse(rawLine);
        if (parsedTld.isIcann && parsedTld.domain) {
          domain = parsedTld.domain;
          // derive name from domain
          const derived = parsedTld.domainWithoutSuffix || rawLine;
          name = derived.charAt(0).toUpperCase() + derived.slice(1);
        } else {
          name = rawLine;
        }
      }
    }

    name = name.trim();
    if (domain) {
      domain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0];
    }

    if (!name && !domain) {
      rejected.push({ row: rowNum, raw: rawLine, reason: 'Empty company name and domain' });
      continue;
    }

    // If name is missing but domain exists, infer name
    if (!name && domain) {
      const parsed = parse(domain);
      const root = parsed.domainWithoutSuffix || domain;
      name = root.charAt(0).toUpperCase() + root.slice(1);
    }

    if (name.length < 2) {
      rejected.push({ row: rowNum, raw: rawLine, reason: `Company name too short: "${name}"` });
      continue;
    }

    // Deduplication within import batch
    const normName = name.toLowerCase();
    if (seenNames.has(normName) || (domain && seenDomains.has(domain))) {
      rejected.push({ row: rowNum, raw: rawLine, reason: `Duplicate entry within batch: "${name}"` });
      continue;
    }

    seenNames.add(normName);
    if (domain) seenDomains.add(domain);

    accepted.push({
      name,
      domain: domain || undefined,
      careerUrl: careerUrl?.trim() || undefined,
      industry: industry?.trim() || undefined,
      notes: notes?.trim() || undefined,
    });
  }

  return { accepted, rejected };
}
