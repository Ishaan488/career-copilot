import { NextRequest, NextResponse } from 'next/server';
import { transitionApplication, ApplicationStatus } from '@/modules/tracking';
import { AppError } from '@/shared/errors';
import { z } from 'zod';

const statusTransitionSchema = z.object({
  toStatus: z.string(),
  actor: z.enum(['user', 'system', 'email_suggestion', 'policy']).default('user'),
  evidence: z.record(z.unknown()).optional(),
  details: z.record(z.unknown()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = statusTransitionSchema.parse(body);

    const updated = await transitionApplication({
      applicationId: id,
      toStatus: parsed.toStatus as ApplicationStatus,
      actor: parsed.actor,
      evidence: parsed.evidence,
      details: parsed.details,
    });

    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: err.errors[0]?.message } }, { status: 400 });
    }
    if (err instanceof AppError) {
      const statusCode = err.code === 'NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403 : 400;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: statusCode });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: (err as Error).message } }, { status: 500 });
  }
}
