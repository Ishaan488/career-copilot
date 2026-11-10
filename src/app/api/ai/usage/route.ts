import { NextRequest, NextResponse } from 'next/server';
import { aiService } from '@/modules/ai';
import { AppError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');
    const targetDate = dateParam ? new Date(dateParam) : new Date();

    const metrics = await aiService.getUsageMetrics(targetDate);
    const status = await aiService.status();

    return NextResponse.json({
      metrics,
      status,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
