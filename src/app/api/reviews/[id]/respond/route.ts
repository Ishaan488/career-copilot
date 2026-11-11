import { NextRequest, NextResponse } from 'next/server';
import { humanReviewService } from '@/modules/human-review';
import { AppError } from '@/shared/errors';
import { z } from 'zod';

const respondSchema = z.object({
  action: z.enum(['answer', 'approve', 'authorize', 'decide']).default('answer'),
  answer: z.unknown(),
  saveReusable: z.boolean().optional(),
  reusableKey: z.string().optional(),
  reusableScope: z.object({
    atsTypes: z.array(z.string()).optional(),
    companyIds: z.array(z.string()).optional(),
  }).optional(),
  notes: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = respondSchema.parse(body);

    const updated = await humanReviewService.respond(id, parsed.action, {
      answer: parsed.answer,
      saveReusable: parsed.saveReusable,
      reusableKey: parsed.reusableKey,
      reusableScope: parsed.reusableScope,
      notes: parsed.notes,
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
