import { NextRequest, NextResponse } from 'next/server';
import { applicationService } from '@/modules/application';
import { AppError } from '@/shared/errors';
import { z } from 'zod';

const createFromJobSchema = z.object({
  jobId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createFromJobSchema.parse(body);

    const result = await applicationService.createFromJob(parsed.jobId);
    return NextResponse.json(result, { status: 201 });
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
