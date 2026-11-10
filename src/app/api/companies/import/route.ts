import { NextRequest, NextResponse } from 'next/server';
import { importCompaniesBulk, importCompaniesSchema } from '@/modules/company-discovery';
import { AppError } from '@/shared/errors';
import { z } from 'zod';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = importCompaniesSchema.parse(body);
    const result = await importCompaniesBulk(parsed, 'user');
    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: err.errors[0]?.message || 'Invalid input' } }, { status: 400 });
    }
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to import companies' } }, { status: 500 });
  }
}
