import { NextRequest, NextResponse } from 'next/server';
import { loginWithPasscode, AppError } from '@/shared/index';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.passcode || typeof body.passcode !== 'string') {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Passcode is required.' } },
        { status: 400 }
      );
    }

    const clientIp = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const token = await loginWithPasscode(body.passcode, clientIp);

    const response = NextResponse.json({ success: true, message: 'Logged in successfully.' });
    response.cookies.set('session_token', token, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (err: unknown) {
    if (err instanceof AppError) {
      const status = err.code === 'RATE_LIMITED' ? 429 : err.code === 'UNAUTHORIZED' ? 401 : 400;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Internal server error.' } }, { status: 500 });
  }
}
