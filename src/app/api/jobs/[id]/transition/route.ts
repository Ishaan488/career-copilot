import { NextRequest, NextResponse } from 'next/server';
import { transitionJobStatus, JobStatus } from '@/modules/discovery';
import { AppError } from '@/shared/errors';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { toStatus, reason } = body as { toStatus: JobStatus; reason?: string };

    if (!toStatus) {
      return NextResponse.json({ error: 'toStatus is required' }, { status: 400 });
    }

    const updated = await transitionJobStatus(id, toStatus, 'user', reason);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof AppError) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
