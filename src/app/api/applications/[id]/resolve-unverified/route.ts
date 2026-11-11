import { NextRequest, NextResponse } from 'next/server';
import { applicationService } from '@/modules/application';
import { AppError } from '@/shared/errors';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    if (!body?.resolution || !['confirm_submitted', 'retry_confirmed', 'abandon'].includes(body.resolution)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Valid resolution (confirm_submitted | retry_confirmed | abandon) is required' } },
        { status: 400 }
      );
    }

    const result = await applicationService.resolveUnverifiedSubmission(id, body.resolution, body.notes);

    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      const statusCode = err.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: statusCode });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: (err as Error).message } }, { status: 500 });
  }
}
