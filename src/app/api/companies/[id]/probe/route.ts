import { NextRequest, NextResponse } from 'next/server';
import { probeAtsSlugs } from '@/modules/company-discovery';
import { AppError } from '@/shared/errors';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const candidates = await probeAtsSlugs(id, 'user');
    return NextResponse.json(candidates);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to probe ATS' } }, { status: 500 });
  }
}
