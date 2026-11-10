import { NextResponse } from 'next/server';
import { reconcileSources } from '@/modules/discovery';
import { AppError } from '@/shared/errors';

export async function POST() {
  try {
    const result = await reconcileSources();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
