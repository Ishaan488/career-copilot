import { NextRequest, NextResponse } from 'next/server';
import { listEvents } from '@/modules/tracking';
import { AppError } from '@/shared/errors';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const events = await listEvents(id);
    return NextResponse.json(events);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: (err as Error).message } }, { status: 500 });
  }
}
