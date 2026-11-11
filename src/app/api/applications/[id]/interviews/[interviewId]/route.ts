import { NextRequest, NextResponse } from 'next/server';
import { updateInterview, deleteInterview } from '@/modules/tracking';
import { AppError } from '@/shared/errors';
import { z } from 'zod';

const interviewUpdateSchema = z.object({
  stage: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().positive().optional(),
  interviewerNames: z.string().optional().nullable(),
  meetingUrl: z.string().url().optional().nullable().or(z.literal('')),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'rescheduled']).optional(),
  notes: z.string().optional().nullable(),
  feedback: z.string().optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; interviewId: string }> }
) {
  try {
    const { interviewId } = await params;
    const body = await req.json();
    const parsed = interviewUpdateSchema.parse(body);

    const updated = await updateInterview(interviewId, {
      ...parsed,
      scheduledAt: parsed.scheduledAt ? new Date(parsed.scheduledAt) : undefined,
      meetingUrl: parsed.meetingUrl || null,
    });

    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: err.errors[0]?.message } }, { status: 400 });
    }
    if (err instanceof AppError) {
      const statusCode = err.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: statusCode });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: (err as Error).message } }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; interviewId: string }> }
) {
  try {
    const { interviewId } = await params;
    await deleteInterview(interviewId);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      const statusCode = err.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: statusCode });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: (err as Error).message } }, { status: 500 });
  }
}
