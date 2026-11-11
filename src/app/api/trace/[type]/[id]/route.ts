import { NextRequest, NextResponse } from 'next/server';
import { getTraceGraph, TraceEntityType } from '@/modules/maintenance';
import { AppError } from '@/shared/errors';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    const { type, id } = await params;
    if (type !== 'job' && type !== 'application' && type !== 'company') {
      return NextResponse.json(
        { error: `Invalid trace entity type '${type}'. Must be job, application, or company.`, code: 'VALIDATION' },
        { status: 400 }
      );
    }

    const graph = await getTraceGraph(type as TraceEntityType, id);
    return NextResponse.json(graph);
  } catch (err) {
    if (err instanceof AppError) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
