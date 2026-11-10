import { NextRequest, NextResponse } from 'next/server';
import { importJobUrl } from '@/modules/discovery';
import { AppError } from '@/shared/errors';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, companyId } = body as { url: string; companyId?: string };

    if (!url) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    const result = await importJobUrl(url, companyId);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
