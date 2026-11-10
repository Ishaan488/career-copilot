import { NextRequest, NextResponse } from 'next/server';
import { confirmProbeCandidate } from '@/modules/company-discovery';
import { AppError } from '@/shared/errors';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params;
    const confirmed = await confirmProbeCandidate(candidateId, 'user');
    return NextResponse.json(confirmed);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to confirm candidate' } }, { status: 500 });
  }
}
