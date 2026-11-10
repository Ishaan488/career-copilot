import { NextRequest, NextResponse } from 'next/server';
import {
  searchJobs,
  createManualJob,
  JobStatus,
  SeniorityLevel,
  WorkMode,
} from '@/modules/discovery';
import { AppError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') as JobStatus) || undefined;
    const seniority = (searchParams.get('seniority') as SeniorityLevel) || undefined;
    const workMode = (searchParams.get('workMode') as WorkMode) || undefined;
    const companyId = searchParams.get('companyId') || undefined;
    const searchTerm = searchParams.get('search') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;

    const result = await searchJobs({
      status,
      seniority,
      workMode,
      companyId,
      searchTerm,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await createManualJob(body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
