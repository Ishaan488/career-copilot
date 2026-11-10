import * as cheerio from 'cheerio';

export type SupportedAtsType = 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters';
export type UnsupportedAtsType = 'workday' | 'darwinbox' | 'oracle' | 'successfactors' | 'custom' | 'unknown';
export type AtsType = SupportedAtsType | UnsupportedAtsType;

export interface AtsDetectionResult {
  atsType: AtsType;
  boardId?: string;
  url: string;
  isSupported: boolean;
  confidence: 'high' | 'medium' | 'low';
  details?: Record<string, unknown>;
}

export const SUPPORTED_ATS_TYPES: ReadonlySet<string> = new Set([
  'greenhouse',
  'lever',
  'ashby',
  'smartrecruiters',
]);

/**
 * Detect ATS provider and board/slug from a direct URL.
 */
export function detectAtsFromUrl(rawUrl: string): AtsDetectionResult | null {
  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    // Greenhouse
    // boards.greenhouse.io/<token>
    // job-boards.greenhouse.io/<token>
    // boards-api.greenhouse.io/v1/boards/<token>
    if (host.includes('greenhouse.io')) {
      const match = pathname.match(/\/(?:v1\/boards\/)?([^/?#]+)/i);
      const token = match && match[1] && match[1] !== 'embed' && match[1] !== 'v1' ? match[1] : undefined;
      // also check ?for=<token> query param if embed
      const forParam = parsed.searchParams.get('for');
      const boardId = forParam || token;
      return {
        atsType: 'greenhouse',
        boardId: boardId ? decodeURIComponent(boardId) : undefined,
        url: parsed.toString(),
        isSupported: true,
        confidence: boardId ? 'high' : 'medium',
      };
    }

    // Lever
    // jobs.lever.co/<slug>
    if (host.includes('lever.co')) {
      const parts = pathname.split('/').filter(Boolean);
      const slug = parts[0];
      return {
        atsType: 'lever',
        boardId: slug ? decodeURIComponent(slug) : undefined,
        url: parsed.toString(),
        isSupported: true,
        confidence: slug ? 'high' : 'medium',
      };
    }

    // Ashby
    // jobs.ashbyhq.com/<name>
    if (host.includes('ashbyhq.com')) {
      const parts = pathname.split('/').filter(Boolean);
      // If path is /job-board/<name> or /<name>
      const name = parts[parts.length - 1];
      return {
        atsType: 'ashby',
        boardId: name ? decodeURIComponent(name) : undefined,
        url: parsed.toString(),
        isSupported: true,
        confidence: name ? 'high' : 'medium',
      };
    }

    // SmartRecruiters
    // jobs.smartrecruiters.com/<id>
    // careers.smartrecruiters.com/<id>
    if (host.includes('smartrecruiters.com')) {
      const parts = pathname.split('/').filter(Boolean);
      const id = parts[parts.length - 1];
      return {
        atsType: 'smartrecruiters',
        boardId: id ? decodeURIComponent(id) : undefined,
        url: parsed.toString(),
        isSupported: true,
        confidence: id ? 'high' : 'medium',
      };
    }

    // Workday (Unsupported)
    // *.myworkdayjobs.com
    if (host.includes('myworkdayjobs.com')) {
      const boardId = host.split('.')[0];
      return {
        atsType: 'workday',
        boardId,
        url: parsed.toString(),
        isSupported: false,
        confidence: 'high',
        details: { message: 'Workday is unsupported in v1; URL import and manual paste remain supported.' },
      };
    }

    // Darwinbox (Unsupported)
    // *.darwinbox.in
    if (host.includes('darwinbox.in') || host.includes('darwinbox.com')) {
      const boardId = host.split('.')[0];
      return {
        atsType: 'darwinbox',
        boardId,
        url: parsed.toString(),
        isSupported: false,
        confidence: 'high',
        details: { message: 'Darwinbox is unsupported in v1; URL import and manual paste remain supported.' },
      };
    }

    // Oracle / Taleo (Unsupported)
    if (host.includes('taleo.net') || host.includes('oraclecloud.com')) {
      return {
        atsType: 'oracle',
        url: parsed.toString(),
        isSupported: false,
        confidence: 'high',
        details: { message: 'Oracle / Taleo is unsupported in v1; URL import and manual paste remain supported.' },
      };
    }

    // SuccessFactors (Unsupported)
    if (host.includes('successfactors.com')) {
      return {
        atsType: 'successfactors',
        url: parsed.toString(),
        isSupported: false,
        confidence: 'high',
        details: { message: 'SAP SuccessFactors is unsupported in v1; URL import and manual paste remain supported.' },
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Scan an HTML document for embedded ATS links, iframes, and scripts.
 */
export function detectAtsFromHtml(html: string, pageUrl?: string): AtsDetectionResult | null {
  if (!html) return null;

  const $ = cheerio.load(html);

  // 1. Check iframes
  const iframes = $('iframe');
  for (let i = 0; i < iframes.length; i++) {
    const src = $(iframes[i]).attr('src') || $(iframes[i]).attr('data-src');
    if (src) {
      const detected = detectAtsFromUrl(src);
      if (detected) {
        return {
          ...detected,
          confidence: 'high',
          details: { detectedIn: 'iframe', src },
        };
      }
    }
  }

  // 2. Check script tags
  const scripts = $('script');
  for (let i = 0; i < scripts.length; i++) {
    const src = $(scripts[i]).attr('src');
    if (src) {
      const detected = detectAtsFromUrl(src);
      if (detected) {
        return {
          ...detected,
          confidence: 'high',
          details: { detectedIn: 'script_src', src },
        };
      }
    }

    const scriptText = $(scripts[i]).html() || '';
    // Greenhouse script embed: grnh.se or boards.greenhouse.io/embed/job_board.js?for=stripe
    const ghMatch = scriptText.match(/boards\.greenhouse\.io\/embed\/job_board\.js\?for=([a-zA-Z0-9_-]+)/i);
    if (ghMatch && ghMatch[1]) {
      return {
        atsType: 'greenhouse',
        boardId: ghMatch[1],
        url: `https://boards.greenhouse.io/${ghMatch[1]}`,
        isSupported: true,
        confidence: 'high',
        details: { detectedIn: 'inline_script' },
      };
    }

    // Lever embed
    const leverMatch = scriptText.match(/api\.lever\.co\/v0\/postings\/([a-zA-Z0-9_-]+)/i);
    if (leverMatch && leverMatch[1]) {
      return {
        atsType: 'lever',
        boardId: leverMatch[1],
        url: `https://jobs.lever.co/${leverMatch[1]}`,
        isSupported: true,
        confidence: 'high',
        details: { detectedIn: 'inline_script' },
      };
    }
  }

  // 3. Check anchor tags linking out to ATS job boards
  const links = $('a[href]');
  for (let i = 0; i < links.length; i++) {
    const href = $(links[i]).attr('href');
    if (href) {
      const detected = detectAtsFromUrl(href);
      if (detected && detected.isSupported && detected.boardId) {
        return {
          ...detected,
          confidence: 'high',
          details: { detectedIn: 'link', linkText: $(links[i]).text().trim() },
        };
      }
    }
  }

  // 4. Check for known container ids or classes
  if ($('#grnh_app').length > 0) {
    return {
      atsType: 'greenhouse',
      url: pageUrl || '',
      isSupported: true,
      confidence: 'medium',
      details: { detectedIn: 'dom_element_#grnh_app' },
    };
  }

  return null;
}
