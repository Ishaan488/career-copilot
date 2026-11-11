import { NextRequest, NextResponse } from 'next/server';
import { scheduleInterview, listInterviews } from '@/modules/tracking';
import { AppError } from '@/shared/errors';
import { z } from 'zod';

const interviewCreateSchema = z.object({
  stage: z.string().min(1),
  title: z.string().min(1),
  scheduledAt: z.string().datetime().or(z.string().min(1)),
  durationMinutes: z.number().int().positive().optional().default(45),
  interviewerNames: z.string().optional().nullable(),
  meetingUrl: z.string().url().optional().nullable().or(z.literal('')),
  notes: z.string().optional().nullable(),
  feedback: z.string().optional().nullable(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const interviews = await listInterviews(id);
    return NextResponse.json({ interviews });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      const statusCode = err.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: statusCode });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: (err as Error).message } }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = interviewCreateSchema.parse(body);

    const interview = await scheduleInterview(id, {
      ...parsed,
      scheduledAt: new Date(parsed.scheduledAt),
      meetingUrl: parsed.meetingUrl || null,
    });

    return NextResponse.json(interview, { status: 201 });
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
