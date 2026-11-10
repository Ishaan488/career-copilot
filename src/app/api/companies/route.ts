import { NextRequest, NextResponse } from 'next/server';
import {
  listCompanies,
  createCompany,
  createCompanySchema,
  companyDiscoveryStatusEnum,
} from '@/modules/company-discovery';
import { AppError } from '@/shared/errors';
import { z } from 'zod';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || undefined;
    const statusParam = searchParams.get('status') || undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 50;
    const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : 0;

    const statusParsed = statusParam ? companyDiscoveryStatusEnum.safeParse(statusParam) : null;
    const status = statusParsed?.success ? statusParsed.data : undefined;

    const result = await listCompanies({
      q,
      status,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to list companies' } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createCompanySchema.parse(body);
    const company = await createCompany(parsed, 'user');
    return NextResponse.json(company, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: err.errors[0]?.message || 'Invalid input' } }, { status: 400 });
    }
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to create company' } }, { status: 500 });
  }
}
