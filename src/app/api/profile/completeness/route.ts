import { NextResponse } from 'next/server';
import { getOrCreateProfile, calculateCompleteness } from '@/modules/profile';
import { AppError } from '@/shared/errors';

export async function GET() {
  try {
    const profile = await getOrCreateProfile();
    const completeness = calculateCompleteness(profile);
    return NextResponse.json(completeness);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Failed to calculate profile completeness' } },
      { status: 500 }
    );
  }
}
