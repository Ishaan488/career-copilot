import { NextRequest, NextResponse } from 'next/server';
import { getResumes, uploadResume } from '@/modules/resume';
import { AppError } from '@/shared/errors';

export async function GET() {
  try {
    const list = await getResumes();
    return NextResponse.json(list);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to fetch resumes' } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const label = (formData.get('label') as string) || (file ? file.name.replace(/\.[^/.]+$/, '') : 'Master Resume');
    const notes = (formData.get('notes') as string) || null;
    const resumeId = (formData.get('resumeId') as string) || undefined;
    const isDefault = formData.get('isDefault') === 'true';

    if (!file) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'No PDF file provided' } }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await uploadResume(buffer, file.name, {
      label,
      notes,
      resumeId,
      isDefault,
    });

    return NextResponse.json(result, { status: result.isDuplicate ? 200 : 201 });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to upload resume PDF' } }, { status: 500 });
  }
}
