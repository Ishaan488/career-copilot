import { NextRequest, NextResponse } from 'next/server';
import { listSources, createManualSource } from '@/modules/discovery';
import { AppError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || undefined;
    const origin = searchParams.get('origin') || undefined;

    const sources = await listSources({ type, origin });
    return NextResponse.json({ sources });
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
    const source = await createManualSource(body);
    return NextResponse.json(source, { status: 201 });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
