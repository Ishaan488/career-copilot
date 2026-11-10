import { NextRequest, NextResponse } from 'next/server';
import { updateReusableAnswer, deleteReusableAnswer } from '@/modules/profile';
import { AppError } from '@/shared/errors';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const updated = await updateReusableAnswer(id, body);
    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Failed to update reusable answer' } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteReusableAnswer(id);
    return NextResponse.json({ success: true, message: 'Deleted reusable answer' });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Failed to delete reusable answer' } },
      { status: 500 }
    );
  }
}
