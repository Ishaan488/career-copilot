import { NextRequest, NextResponse } from 'next/server';
import { intelligenceService, JobRecommendation } from '@/modules/intelligence';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;
    const recommendation = searchParams.get('recommendation') as JobRecommendation | null;

    const jobs = await intelligenceService.listRecommendedJobs({
      limit,
      offset,
      recommendation: recommendation || undefined,
    });

    return NextResponse.json(jobs);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
