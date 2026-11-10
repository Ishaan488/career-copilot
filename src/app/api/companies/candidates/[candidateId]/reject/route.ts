import { NextRequest, NextResponse } from 'next/server';
import { rejectProbeCandidate } from '@/modules/company-discovery';
import { AppError } from '@/shared/errors';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params;
    await rejectProbeCandidate(candidateId, 'user');
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to reject candidate' } }, { status: 500 });
  }
}
