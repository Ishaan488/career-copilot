import { NextRequest, NextResponse } from 'next/server';
import { runCompanyCheck } from '@/modules/company-discovery';
import { AppError } from '@/shared/errors';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const run = await runCompanyCheck(id, 'user');
    return NextResponse.json(run);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to run company check' } }, { status: 500 });
  }
}
