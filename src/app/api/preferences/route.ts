import { NextRequest, NextResponse } from 'next/server';
import { getPreferences, updatePreferences } from '@/modules/profile';
import { AppError } from '@/shared/errors';
import { z } from 'zod';

export async function GET() {
  try {
    const preferences = await getPreferences();
    return NextResponse.json(preferences);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Failed to fetch preferences' } },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const updated = await updatePreferences(body);
    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        { status: 400 }
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Validation failed', details: err.format() } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Failed to update preferences' } },
      { status: 500 }
    );
  }
}
