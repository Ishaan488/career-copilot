import { NextRequest, NextResponse } from 'next/server';
import { destroySession } from '@/shared/index';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('session_token')?.value;
  if (token) {
    await destroySession(token);
  }

  const response = NextResponse.json({ success: true, message: 'Logged out.' });
  response.cookies.delete('session_token');
  return response;
}
