import { NextRequest, NextResponse } from 'next/server';
import { setDefaultResume } from '@/modules/resume';
import { AppError } from '@/shared/errors';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updated = await setDefaultResume(id);
    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to set default resume' } }, { status: 500 });
  }
}
