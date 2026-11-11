import { NextResponse } from 'next/server';
import {
  getDashboardStats,
  getNeedsAttentionItems,
  getUpcomingDeadlines,
  getRecentActivity,
} from '@/modules/tracking';
import { AppError } from '@/shared/errors';

export async function GET() {
  try {
    const [stats, attention, deadlines, recentActivity] = await Promise.all([
      getDashboardStats(),
      getNeedsAttentionItems(),
      getUpcomingDeadlines(),
      getRecentActivity(10),
    ]);

    return NextResponse.json({
      stats,
      attention,
      deadlines,
      recentActivity,
    });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      const statusCode = err.code === 'NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403 : 400;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: statusCode });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: (err as Error).message } }, { status: 500 });
  }
}
