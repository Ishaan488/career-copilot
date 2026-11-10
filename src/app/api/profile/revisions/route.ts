import { NextResponse } from 'next/server';
import { getProfileRevisions } from '@/modules/profile';
import { AppError } from '@/shared/errors';

export async function GET() {
  try {
    const revisions = await getProfileRevisions();
    return NextResponse.json(revisions);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Failed to fetch profile revisions' } },
      { status: 500 }
    );
  }
}
