import { NextRequest, NextResponse } from 'next/server';
import { setupPasscode, AppError } from '@/shared/index';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.passcode || typeof body.passcode !== 'string') {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Passcode is required.' } },
        { status: 400 }
      );
    }

    await setupPasscode(body.passcode);
    return NextResponse.json({ success: true, message: 'Passcode successfully configured.' });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      const status = err.code === 'CONFLICT' ? 409 : err.code === 'VALIDATION' ? 400 : 500;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Internal server error.' } }, { status: 500 });
  }
}
