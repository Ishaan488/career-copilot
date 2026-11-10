import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateProfile, updateProfile } from '@/modules/profile';
import { AppError } from '@/shared/errors';
import { z } from 'zod';

export async function GET() {
  try {
    const profile = await getOrCreateProfile();
    return NextResponse.json(profile);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to fetch profile' } }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const reason = typeof body.reason === 'string' ? body.reason : 'User updated profile';
    const updated = await updateProfile(body, reason);
    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        { status: err.code === 'FORBIDDEN' ? 403 : 400 }
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Validation failed', details: err.format() } },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to update profile' } }, { status: 500 });
  }
}
