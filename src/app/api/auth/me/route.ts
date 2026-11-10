import { NextRequest, NextResponse } from 'next/server';
import { validateSessionToken, isSetupRequired } from '@/shared/index';

export async function GET(req: NextRequest) {
  const setupNeeded = await isSetupRequired();
  if (setupNeeded) {
    return NextResponse.json({ authenticated: false, setupRequired: true });
  }

  const token = req.cookies.get('session_token')?.value;
  const valid = token ? await validateSessionToken(token) : false;

  return NextResponse.json({ authenticated: valid, setupRequired: false });
}
