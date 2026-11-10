import { NextRequest, NextResponse } from 'next/server';
import { getAutonomyPolicy, updateAutonomyPolicy } from '@/modules/profile';
import { AppError } from '@/shared/errors';
import { z } from 'zod';

export async function GET() {
  try {
    const policy = await getAutonomyPolicy();
    return NextResponse.json(policy);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Failed to fetch autonomy policy' } },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const confirm = Boolean(body.confirm);
    const reason = typeof body.reason === 'string' ? body.reason : 'User updated autonomy policy';
    const updated = await updateAutonomyPolicy(body, { confirm, reason });
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
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Failed to update autonomy policy' } },
      { status: 500 }
    );
  }
}
