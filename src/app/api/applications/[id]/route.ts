import { NextRequest, NextResponse } from 'next/server';
import { applicationService } from '@/modules/application';
import { AppError } from '@/shared/errors';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const app = await applicationService.getApplication(id);

    if (!app) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Application '${id}' not found.` } },
        { status: 404 }
      );
    }

    return NextResponse.json(app);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      const statusCode = err.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: statusCode });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: (err as Error).message } }, { status: 500 });
  }
}
