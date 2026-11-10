import { NextRequest, NextResponse } from 'next/server';
import { getResumeFileBuffer } from '@/modules/resume';
import { AppError } from '@/shared/errors';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  try {
    const { versionId } = await params;
    const { buffer, version } = await getResumeFileBuffer(versionId);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${encodeURIComponent(version.originalFilename)}"`,
        'Content-Length': String(buffer.length),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 404 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to retrieve resume PDF' } }, { status: 500 });
  }
}
