import { getDb } from '../../../shared/db';
import { aiRequests } from '../../../db/schema';
import { gte, sql } from 'drizzle-orm';
import { startOfDay } from 'date-fns';

export interface BudgetLimits {
  dailyRequests: number;
  dailyTokens: number;
  userOverrideReserve: number;
}

export const DEFAULT_BUDGET_LIMITS: BudgetLimits = {
  dailyRequests: 1500, // Gemini Free Tier standard cap
  dailyTokens: 1000000, // 1M tokens/day
  userOverrideReserve: 50,
};

export interface DailyUsage {
  requestsUsed: number;
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  cachedCount: number;
  failedCount: number;
}

/**
 * Calculates total requests and tokens consumed today starting from midnight UTC.
 */
export async function getTodayUsage(targetDate = new Date()): Promise<DailyUsage> {
  const db = getDb();
  const start = startOfDay(targetDate);

  const [res] = await db
    .select({
      requestsUsed: sql<number>`count(*)::int`,
      tokensIn: sql<number>`coalesce(sum(${aiRequests.tokensIn}), 0)::int`,
      tokensOut: sql<number>`coalesce(sum(${aiRequests.tokensOut}), 0)::int`,
      cachedCount: sql<number>`count(*) filter (where ${aiRequests.status} = 'cached')::int`,
      failedCount: sql<number>`count(*) filter (where ${aiRequests.status} in ('error', 'invalid_output'))::int`,
    })
    .from(aiRequests)
    .where(gte(aiRequests.at, start));

  const totalTokens = (res?.tokensIn || 0) + (res?.tokensOut || 0);

  return {
    requestsUsed: res?.requestsUsed || 0,
    tokensIn: res?.tokensIn || 0,
    tokensOut: res?.tokensOut || 0,
    totalTokens,
    cachedCount: res?.cachedCount || 0,
    failedCount: res?.failedCount || 0,
  };
}

/**
 * Checks if a new request is permitted under the daily budget caps.
 */
export async function checkBudget(
  limits = DEFAULT_BUDGET_LIMITS,
  isUserTriggered = false
): Promise<{ allowed: boolean; reason?: string; usage: DailyUsage }> {
  const usage = await getTodayUsage();

  const maxRequests = isUserTriggered
    ? limits.dailyRequests + limits.userOverrideReserve
    : limits.dailyRequests;

  if (usage.requestsUsed >= maxRequests) {
    return {
      allowed: false,
      reason: `Daily AI request budget exceeded (${usage.requestsUsed}/${maxRequests})`,
      usage,
    };
  }

  if (usage.totalTokens >= limits.dailyTokens) {
    return {
      allowed: false,
      reason: `Daily AI token budget exceeded (${usage.totalTokens}/${limits.dailyTokens})`,
      usage,
    };
  }

  return { allowed: true, usage };
}
