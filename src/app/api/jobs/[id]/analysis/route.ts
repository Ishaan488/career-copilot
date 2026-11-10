import { NextRequest, NextResponse } from 'next/server';
import { intelligenceService } from '@/modules/intelligence';
import { AppError } from '@/shared/errors';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const analysis = await intelligenceService.getJobAnalysis(id);
    if (!analysis) {
      return NextResponse.json({ error: 'No analysis found for this job', code: 'NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json(analysis);
  } catch (err) {
    if (err instanceof AppError) {
      const httpStatus = err.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status: httpStatus });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
