import { NextRequest, NextResponse } from 'next/server';
import { getReusableAnswers, createReusableAnswer } from '@/modules/profile';
import { AppError } from '@/shared/errors';
import { z } from 'zod';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const category = searchParams.get('category') || undefined;
    const includeDisabled = searchParams.get('includeDisabled') === 'true';

    const answers = await getReusableAnswers({ category, includeDisabled });
    return NextResponse.json(answers);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Failed to fetch reusable answers' } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const created = await createReusableAnswer(body);
    return NextResponse.json(created, { status: 201 });
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
      { error: { code: 'INTERNAL', message: 'Failed to create reusable answer' } },
      { status: 500 }
    );
  }
}
