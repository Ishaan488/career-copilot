import { NextRequest, NextResponse } from 'next/server';
import { humanReviewService } from '@/modules/human-review';
import { AppError } from '@/shared/errors';
import { z } from 'zod';

const deferSchema = z.object({
  snoozeUntil: z.string().datetime(),
  reason: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = deferSchema.parse(body);

    const updated = await humanReviewService.defer(id, {
      snoozeUntil: new Date(parsed.snoozeUntil),
      reason: parsed.reason,
    });

    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: err.errors[0]?.message || 'Invalid input' } },
        { status: 400 }
      );
    }
    if (err instanceof AppError) {
      const statusCode = err.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: statusCode });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: (err as Error).message } }, { status: 500 });
  }
}
