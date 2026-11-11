import { NextRequest, NextResponse } from 'next/server';
import { humanReviewService, ReviewCategory, ResponseSchema, ReviewStatus } from '@/modules/human-review';
import { AppError } from '@/shared/errors';
import { z } from 'zod';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get('status');
    const category = searchParams.get('category') || undefined;
    const jobId = searchParams.get('jobId') || undefined;
    const limitParam = searchParams.get('limit');

    const status = (statusParam as ReviewStatus | 'active' | 'all') || 'active';

    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const items = await humanReviewService.list({
      status,
      category,
      jobId,
      limit,
    });

    return NextResponse.json({ items });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      const statusCode = err.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: statusCode });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: (err as Error).message } }, { status: 500 });
  }
}

const createReviewSchema = z.object({
  jobId: z.string().uuid(),
  workflowId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  fieldId: z.string().uuid().optional(),
  category: z.string(),
  question: z.string().min(1),
  context: z.record(z.unknown()).optional(),
  uncertaintyReason: z.string().optional(),
  evidence: z.array(z.record(z.unknown())).optional(),
  suggestedAnswer: z.unknown().optional(),
  suggestionConfidence: z.number().min(0).max(1).optional(),
  suggestionRationale: z.string().optional(),
  requiredAction: z.enum(['answer', 'approve', 'authorize', 'decide']),
  responseSchema: z.record(z.unknown()).optional(),
  checkpointStep: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createReviewSchema.parse(body);

    const created = await humanReviewService.createRequest({
      jobId: parsed.jobId,
      workflowId: parsed.workflowId,
      applicationId: parsed.applicationId,
      fieldId: parsed.fieldId,
      category: parsed.category as ReviewCategory,
      question: parsed.question,
      context: parsed.context,
      uncertaintyReason: parsed.uncertaintyReason,
      evidence: parsed.evidence,
      suggestedAnswer: parsed.suggestedAnswer,
      suggestionConfidence: parsed.suggestionConfidence,
      suggestionRationale: parsed.suggestionRationale,
      requiredAction: parsed.requiredAction,
      responseSchema: parsed.responseSchema as ResponseSchema | undefined,
      checkpointStep: parsed.checkpointStep,
    });

    return NextResponse.json(created, { status: 201 });
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
