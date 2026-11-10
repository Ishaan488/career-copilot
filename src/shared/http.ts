import dns from 'node:dns/promises';
import { AppError } from './errors';

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
  maxSizeBytes?: number;
  maxRedirects?: number;
  allowLocalhost?: boolean;
}

export function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip === 'localhost') return true;

  // IPv4 checks
  const ipv4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const b0 = Number(ipv4Match[1]);
    const b1 = Number(ipv4Match[2]);

    if (b0 === 0) return true; // 0.0.0.0/8
    if (b0 === 127) return true; // 127.0.0.0/8
    if (b0 === 10) return true; // 10.0.0.0/8
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true; // 172.16.0.0/12
    if (b0 === 192 && b1 === 168) return true; // 192.168.0.0/16
    if (b0 === 169 && b1 === 254) return true; // 169.254.0.0/16 (link local, metadata)
    return false;
  }

  // IPv6 checks
  const lower = ip.toLowerCase();
  if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
    return true;
  }

  return false;
}

export async function safeFetch(urlStr: string, options: SafeFetchOptions = {}): Promise<Response> {
  const {
    timeoutMs = 15000,
    maxSizeBytes = 5 * 1024 * 1024,
    maxRedirects = 5,
    allowLocalhost = false,
    headers,
    ...restInit
  } = options;

  let currentUrl = new URL(urlStr);

  if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
    throw new AppError('VALIDATION', `Disallowed URL protocol: ${currentUrl.protocol}`, { details: { url: urlStr } });
  }

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const hostname = currentUrl.hostname;

    if (!allowLocalhost || hostname !== '127.0.0.1' && hostname !== 'localhost') {
      try {
        const addresses = await dns.lookup(hostname, { all: true });
        for (const addr of addresses) {
          if (isPrivateIp(addr.address)) {
            if (allowLocalhost && (addr.address === '127.0.0.1' || addr.address === '::1')) {
              continue;
            }
            throw new AppError('FORBIDDEN', `Access to private IP address blocked by SSRF guard: ${addr.address}`, {
              details: { hostname, ip: addr.address },
            });
          }
        }
      } catch (err: unknown) {
        if (err instanceof AppError) throw err;
        throw new AppError('EXTERNAL_UNAVAILABLE', `DNS resolution failed for ${hostname}`, { cause: err });
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const mergedHeaders = new Headers(headers);
    if (!mergedHeaders.has('User-Agent')) {
      mergedHeaders.set('User-Agent', 'CareerCopilot/0.1.0 (personal use)');
    }

    try {
      const response = await fetch(currentUrl.toString(), {
        ...restInit,
        headers: mergedHeaders,
        redirect: 'manual',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Handle redirects manually to validate destination IPs on each hop
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          return response;
        }
        currentUrl = new URL(location, currentUrl);
        continue;
      }

      // Check size limit from content-length if present
      const contentLength = response.headers.get('content-length');
      if (contentLength && Number(contentLength) > maxSizeBytes) {
        throw new AppError('VALIDATION', `Response body size exceeds maximum limit of ${maxSizeBytes} bytes`, {
          details: { contentLength },
        });
      }

      return response;
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof AppError) throw err;
      if ((err as Error).name === 'AbortError') {
        throw new AppError('EXTERNAL_UNAVAILABLE', `HTTP request timed out after ${timeoutMs}ms`, {
          details: { url: currentUrl.toString() },
        });
      }
      throw new AppError('EXTERNAL_UNAVAILABLE', `Failed to fetch ${currentUrl.toString()}`, { cause: err });
    }
  }

  throw new AppError('EXTERNAL_UNAVAILABLE', `Maximum redirect limit of ${maxRedirects} exceeded`, {
    details: { url: urlStr },
  });
}

interface RobotsCacheEntry {
  disallows: string[];
  expiresAt: number;
}
const robotsCache = new Map<string, RobotsCacheEntry>();

export function clearRobotsCache(): void {
  robotsCache.clear();
}

export function parseRobotsTxt(robotsText: string, targetUserAgent = '*'): string[] {
  const lines = robotsText.split(/\r?\n/);
  let currentUserAgentApplies = false;
  const disallows: string[] = [];

  for (const rawLine of lines) {
    const line = (rawLine.split('#')[0] || '').trim();
    if (!line) continue;
    const [directive, ...rest] = line.split(':');
    const key = directive?.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      const ua = value.toLowerCase();
      if (ua === '*' || ua.includes('careercopilot') || (targetUserAgent !== '*' && ua.includes(targetUserAgent.toLowerCase()))) {
        currentUserAgentApplies = true;
      } else {
        currentUserAgentApplies = false;
      }
    } else if (currentUserAgentApplies && key === 'disallow') {
      if (value) {
        disallows.push(value);
      }
    }
  }

  return disallows;
}

export async function isRobotsAllowed(urlStr: string, userAgent = 'CareerCopilot'): Promise<boolean> {
  try {
    const url = new URL(urlStr);
    const origin = url.origin;
    const now = Date.now();

    let cached = robotsCache.get(origin);
    if (!cached || cached.expiresAt < now) {
      const robotsUrl = `${origin}/robots.txt`;
      try {
        const res = await safeFetch(robotsUrl, { timeoutMs: 5000, maxSizeBytes: 500 * 1024 });
        if (res.ok) {
          const text = await res.text();
          const disallows = parseRobotsTxt(text, userAgent);
          cached = { disallows, expiresAt: now + 3600 * 1000 };
          robotsCache.set(origin, cached);
        } else {
          cached = { disallows: [], expiresAt: now + 3600 * 1000 };
          robotsCache.set(origin, cached);
        }
      } catch {
        // If robots.txt cannot be fetched or network error, default to allowed
        cached = { disallows: [], expiresAt: now + 600 * 1000 };
        robotsCache.set(origin, cached);
      }
    }

    const pathname = url.pathname || '/';
    for (const rule of cached.disallows) {
      if (rule === '/' || pathname.startsWith(rule)) {
        return false;
      }
    }

    return true;
  } catch {
    return true;
  }
}

