import { NextRequest, NextResponse } from 'next/server';
import { getCompanyById, updateCompany, excludeCompany, updateCompanySchema } from '@/modules/company-discovery';
import { AppError } from '@/shared/errors';
import { z } from 'zod';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const company = await getCompanyById(id);
    return NextResponse.json(company);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to fetch company' } }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateCompanySchema.parse(body);
    const updated = await updateCompany(id, parsed, 'user');
    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: err.errors[0]?.message || 'Invalid input' } }, { status: 400 });
    }
    if (err instanceof AppError) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to update company' } }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let reason = 'User excluded';
    try {
      const body = await req.json();
      if (body?.reason) reason = body.reason;
    } catch {
      // Body is optional
    }
    const excluded = await excludeCompany(id, reason, 'user');
    return NextResponse.json(excluded);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to exclude company' } }, { status: 500 });
  }
}
