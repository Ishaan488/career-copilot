import { NextRequest, NextResponse } from 'next/server';
import { listNotifications, notify, deliverPendingNotifications } from '@/modules/notification';
import { AppError } from '@/shared/errors';
import { z } from 'zod';

const createNotificationSchema = z.object({
  type: z.string(),
  title: z.string().min(1),
  body: z.string().min(1),
  link: z.string().optional(),
  severity: z.enum(['info', 'success', 'warn', 'error']).default('info'),
  channels: z.array(z.enum(['in_app', 'telegram', 'email'])).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const notifs = await listNotifications(limit);
    return NextResponse.json({ notifications: notifs });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: (err as Error).message } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get('action') === 'process_outbox') {
      const summary = await deliverPendingNotifications();
      return NextResponse.json({ outbox: summary });
    }

    const body = await req.json();
    const parsed = createNotificationSchema.parse(body);
    const id = await notify(parsed);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: err.errors[0]?.message } }, { status: 400 });
    }
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: (err as Error).message } }, { status: 500 });
  }
}
