export interface DuplicateEvaluationInput {
  incoming: {
    externalId?: string;
    sourceId?: string;
    url?: string | null;
    companyId?: string | null;
    normalizedTitle: string;
    locationRaw?: string | null;
    descriptionText: string;
  };
  existing: {
    id: string;
    canonicalUrl?: string | null;
    companyId?: string | null;
    normalizedTitle: string;
    locationRaw?: string | null;
    descriptionText: string;
  };
}

export type DedupeDecision =
  | { type: 'exact_url'; jobId: string; reason: string }
  | { type: 'merge_match'; jobId: string; similarity: number; reason: string }
  | { type: 'possible_duplicate'; jobId: string; similarity: number; reason: string }
  | { type: 'distinct' };

/**
 * Normalizes URL by removing tracking query parameters, fragments, and standardizing host/path.
 */
export function normalizeCanonicalUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl.trim());

    // Lowercase scheme, host, and path
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.pathname = parsed.pathname.toLowerCase();

    // Remove fragment
    parsed.hash = '';

    // Remove standard tracking parameters
    const trackingParams = new Set([
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'ref',
      'ref_id',
      'source',
      'gh_jid',
      'lever-origin',
      'lever-source',
      'ashby_jid',
      'fbclid',
      'gclid',
      'mc_eid',
      's_cid',
      'trid',
    ]);

    const paramsToRemove: string[] = [];
    parsed.searchParams.forEach((_, key) => {
      const lower = key.toLowerCase();
      if (trackingParams.has(lower) || lower.startsWith('utm_')) {
        paramsToRemove.push(key);
      }
    });

    for (const key of paramsToRemove) {
      parsed.searchParams.delete(key);
    }

    // Normalize trailing slash if path is more than just '/'
    let normalized = parsed.toString();
    if (parsed.pathname.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch {
    // If not a valid standard URL, return trimmed lowercase representation
    return rawUrl.trim().toLowerCase();
  }
}

/**
 * Creates overlapping k-word shingles from text for robust similarity estimation.
 */
export function getWordShingles(text: string, k = 5): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);

  const shingles = new Set<string>();

  if (words.length < k) {
    if (words.length > 0) {
      shingles.add(words.join(' '));
    }
    return shingles;
  }

  for (let i = 0; i <= words.length - k; i++) {
    const shingle = words.slice(i, i + k).join(' ');
    shingles.add(shingle);
  }

  return shingles;
}

/**
 * Calculates Jaccard similarity coefficient between two sets of shingles.
 * Range: [0.0, 1.0].
 */
export function calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersectionSize = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionSize++;
    }
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

/**
 * Compares an incoming job candidate against an existing job record.
 * Order per doc 07 §B.3:
 * 1. Canonical application URL equal -> exact job match.
 * 2. Same company + same normalized title + same location + description similarity >= 0.92 -> merge.
 * 3. Similarity in [0.80, 0.92) OR (same company + same title with different location) -> possible_duplicate.
 * 4. Otherwise -> distinct.
 */
export function evaluateDeduplication(input: DuplicateEvaluationInput): DedupeDecision {
  const { incoming, existing } = input;

  // 1. Canonical URL match
  const incomingCanonical = normalizeCanonicalUrl(incoming.url);
  const existingCanonical = normalizeCanonicalUrl(existing.canonicalUrl);

  if (incomingCanonical && existingCanonical && incomingCanonical === existingCanonical) {
    return {
      type: 'exact_url',
      jobId: existing.id,
      reason: 'Canonical application URL matches existing job',
    };
  }

  // Check company match
  const sameCompany =
    Boolean(incoming.companyId) &&
    Boolean(existing.companyId) &&
    incoming.companyId === existing.companyId;

  // Title match
  const sameTitle =
    incoming.normalizedTitle.length > 0 &&
    incoming.normalizedTitle === existing.normalizedTitle;

  // Location match
  const incomingLoc = (incoming.locationRaw || '').trim().toLowerCase();
  const existingLoc = (existing.locationRaw || '').trim().toLowerCase();
  const sameLocation = incomingLoc === existingLoc;

  // Compute text similarity
  const shinglesIncoming = getWordShingles(incoming.descriptionText, 5);
  const shinglesExisting = getWordShingles(existing.descriptionText, 5);
  const similarity = calculateJaccardSimilarity(shinglesIncoming, shinglesExisting);

  // 2. High confidence merge: same company, same title, same location, and description similarity >= 0.92
  if (sameCompany && sameTitle && sameLocation && similarity >= 0.92) {
    return {
      type: 'merge_match',
      jobId: existing.id,
      similarity,
      reason: `Same company, title, location and ${(similarity * 100).toFixed(1)}% description similarity`,
    };
  }

  // 3. Flag possible duplicate (0.75 <= similarity < 0.92 OR same company + title with different location)
  if (
    (sameCompany && sameTitle) ||
    (sameCompany && similarity >= 0.7) ||
    similarity >= 0.75
  ) {
    return {
      type: 'possible_duplicate',
      jobId: existing.id,
      similarity,
      reason: sameTitle && !sameLocation
        ? `Same company and title but different location ('${incomingLoc}' vs '${existingLoc}')`
        : `High description similarity (${(similarity * 100).toFixed(1)}%)`,
    };
  }

  return { type: 'distinct' };
}
