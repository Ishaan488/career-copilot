import { describe, it, expect } from 'vitest';
import { middleware } from '@/middleware';
import { NextRequest } from 'next/server';

describe('CSRF and Security Headers Middleware', () => {
  it('blocks cross-origin mutating POST requests to /api/*', async () => {
    const req = new NextRequest('http://127.0.0.1:3000/api/settings', {
      method: 'POST',
      headers: {
        origin: 'http://malicious-website.com',
        host: '127.0.0.1:3000',
        'content-type': 'application/json',
      },
    });

    const res = middleware(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('allows same-origin mutating POST requests to /api/*', () => {
    const req = new NextRequest('http://127.0.0.1:3000/api/auth/setup', {
      method: 'POST',
      headers: {
        origin: 'http://127.0.0.1:3000',
        host: '127.0.0.1:3000',
        'content-type': 'application/json',
      },
    });

    const res = middleware(req);
    expect(res.status).not.toBe(403);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
