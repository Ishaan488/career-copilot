import { NextRequest, NextResponse } from 'next/server';
import { intelligenceService } from '@/modules/intelligence';
import { AppError } from '@/shared/errors';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let force = false;
    try {
      const body = await req.json();
      force = Boolean(body?.force);
    } catch {
      // Body is optional
    }

    const result = await intelligenceService.analyzeJob(id, { force });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AppError) {
      const httpStatus = err.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status: httpStatus });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
