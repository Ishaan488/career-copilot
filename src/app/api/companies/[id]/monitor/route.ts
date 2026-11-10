import { NextRequest, NextResponse } from 'next/server';
import { updateMonitorSettings, updateMonitorSchema, pauseMonitoring, resumeMonitoring } from '@/modules/company-discovery';
import { AppError } from '@/shared/errors';
import { z } from 'zod';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateMonitorSchema.parse(body);

    if (parsed.enabled === false) {
      const result = await pauseMonitoring(id, 'user');
      return NextResponse.json(result);
    } else if (parsed.enabled === true) {
      const result = await resumeMonitoring(id, 'user');
      return NextResponse.json(result);
    }

    const updated = await updateMonitorSettings(id, parsed, 'user');
    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: err.errors[0]?.message || 'Invalid input' } }, { status: 400 });
    }
    if (err instanceof AppError) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to update monitor settings' } }, { status: 500 });
  }
}
