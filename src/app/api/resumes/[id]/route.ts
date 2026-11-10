import { NextRequest, NextResponse } from 'next/server';
import { getResume, updateResume, deleteResume } from '@/modules/resume';
import { AppError } from '@/shared/errors';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const resume = await getResume(id);
    return NextResponse.json(resume);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 404 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to fetch resume' } }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const updated = await updateResume(id, body);
    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to update resume' } }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteResume(id);
    return NextResponse.json({ success: true, message: 'Resume deleted successfully' });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.code === 'CONFLICT' ? 409 : 400 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to delete resume' } }, { status: 500 });
  }
}
