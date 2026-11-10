import { NextResponse } from 'next/server';
import { aiService } from '@/modules/ai';
import { AppError } from '@/shared/errors';

export async function GET() {
  try {
    const status = await aiService.status();
    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
