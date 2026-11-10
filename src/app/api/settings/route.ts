import { NextRequest, NextResponse } from 'next/server';
import { getAllSettings, setSetting } from '@/modules/settings';

export async function GET() {
  const settings = await getAllSettings();
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Payload must be a key-value object.' } },
        { status: 400 }
      );
    }

    for (const [key, value] of Object.entries(body)) {
      await setSetting(key, value);
    }

    const updated = await getAllSettings();
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to update settings.' } }, { status: 500 });
  }
}
