import { NextRequest, NextResponse } from 'next/server';
import { policyService } from '@/modules/policy';
import { AppError } from '@/shared/errors';

export async function GET() {
  try {
    const rules = await policyService.listRules();
    return NextResponse.json(rules);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rule = await policyService.createRule(body);
    return NextResponse.json(rule, { status: 201 });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
