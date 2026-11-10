import { NextRequest, NextResponse } from 'next/server';
import { policyService } from '@/modules/policy';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = policyService.simulatePolicy(body.rules || [], body.context);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
