import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_API_PATHS = ['/api/auth/setup', '/api/auth/login', '/api/auth/me', '/api/health'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Security headers
  const response = NextResponse.next();
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');

  // Origin check on mutating API requests
  const method = req.method.toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && pathname.startsWith('/api/')) {
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');

    if (origin) {
      try {
        const originUrl = new URL(origin);
        if (originUrl.host !== host) {
          return NextResponse.json(
            { error: { code: 'FORBIDDEN', message: 'Cross-origin request blocked.' } },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Invalid origin header.' } },
          { status: 403 }
        );
      }
    }
  }

  // Allow public API paths and public assets
  if (PUBLIC_API_PATHS.includes(pathname) || pathname.startsWith('/_next/') || pathname.startsWith('/favicon.ico')) {
    return response;
  }

  // Session check for other /api/* routes
  if (pathname.startsWith('/api/')) {
    const sessionToken = req.cookies.get('session_token')?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } },
        { status: 401 }
      );
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
