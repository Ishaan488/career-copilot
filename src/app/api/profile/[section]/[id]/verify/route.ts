import { NextRequest, NextResponse } from 'next/server';
import { verifySectionItem, VerificationStatus } from '@/modules/profile';
import { AppError } from '@/shared/errors';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ section: string; id: string }> }
) {
  try {
    const { section, id } = await params;
    const body = await req.json();
    const verification = body.verification as VerificationStatus;

    if (!verification) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Verification status is required' } }, { status: 400 });
    }

    const updated = await verifySectionItem(
      section as 'education' | 'experience' | 'skills' | 'projects' | 'work_authorizations',
      id,
      verification
    );

    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to verify section item' } }, { status: 500 });
  }
}
