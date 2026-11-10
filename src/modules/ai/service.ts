import crypto from 'node:crypto';
import { getDb } from '../../shared/db';
import { aiRequests, systemSettings } from '../../db/schema';
import { eq, gte, sql } from 'drizzle-orm';
import { startOfDay } from 'date-fns';
import {
  AIProvider,
  AITask,
  AIStatusInfo,
  AIUsageMetrics,
  AIPipelineResult,
  EntityReference,
  GenerateStructuredRequest,
} from './types';
import { GeminiProvider } from './providers/gemini';
import { computeCacheKey, getCachedOutput, setCachedOutput } from './domain/cache';
import { checkBudget, DEFAULT_BUDGET_LIMITS } from './domain/budget';
import { globalRateLimiter } from './domain/rate-limiter';
import { AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';

export class AIService {
  private provider: AIProvider;
  private defaultModel = 'gemini-2.0-flash';
  private quotaExhaustedUntil: Date | null = null;
  private recentFailureCount = 0;
  private lastFailureAt: Date | null = null;

  constructor(provider?: AIProvider) {
    this.provider = provider || new GeminiProvider();
  }

  setProvider(provider: AIProvider): void {
    this.provider = provider;
  }

  getProvider(): AIProvider {
    return this.provider;
  }

  /**
   * Evaluates the current operational status of the AI layer (Doc 11 §10).
   */
  async status(): Promise<AIStatusInfo> {
    const limits = await this.getBudgetLimits();
    const todayUsage = await this.getTodayUsageCount();

    // 1. Check if provider is configured (API key check)
    if (this.provider.name === 'gemini') {
      const gemini = this.provider as GeminiProvider;
      if (!gemini.isConfigured()) {
        return {
          status: 'no_key',
          reason: 'GEMINI_API_KEY environment variable is not configured',
          provider: this.provider.name,
          defaultModel: this.defaultModel,
          dailyRequestsUsed: todayUsage.requestsUsed,
          dailyRequestsLimit: limits.dailyRequests,
          dailyTokensUsed: todayUsage.totalTokens,
          dailyTokensLimit: limits.dailyTokens,
        };
      }
    }

    // 2. Check quota exhausted flag or window
    const now = new Date();
    if (this.quotaExhaustedUntil && this.quotaExhaustedUntil > now) {
      return {
        status: 'quota_exhausted',
        reason: `Daily quota exhausted. Resets at ${this.quotaExhaustedUntil.toISOString()}`,
        provider: this.provider.name,
        defaultModel: this.defaultModel,
        dailyRequestsUsed: todayUsage.requestsUsed,
        dailyRequestsLimit: limits.dailyRequests,
        dailyTokensUsed: todayUsage.totalTokens,
        dailyTokensLimit: limits.dailyTokens,
      };
    }

    // 3. Check budget limits
    if (todayUsage.requestsUsed >= limits.dailyRequests) {
      return {
        status: 'quota_exhausted',
        reason: `Daily request cap reached (${todayUsage.requestsUsed}/${limits.dailyRequests})`,
        provider: this.provider.name,
        defaultModel: this.defaultModel,
        dailyRequestsUsed: todayUsage.requestsUsed,
        dailyRequestsLimit: limits.dailyRequests,
        dailyTokensUsed: todayUsage.totalTokens,
        dailyTokensLimit: limits.dailyTokens,
      };
    }

    // 4. Outage check: multiple consecutive failures within last 5 minutes
    if (
      this.recentFailureCount >= 5 &&
      this.lastFailureAt &&
      now.getTime() - this.lastFailureAt.getTime() < 300000
    ) {
      return {
        status: 'outage',
        reason: 'Multiple consecutive upstream AI failures detected',
        provider: this.provider.name,
        defaultModel: this.defaultModel,
        dailyRequestsUsed: todayUsage.requestsUsed,
        dailyRequestsLimit: limits.dailyRequests,
        dailyTokensUsed: todayUsage.totalTokens,
        dailyTokensLimit: limits.dailyTokens,
      };
    }

    return {
      status: 'available',
      provider: this.provider.name,
      defaultModel: this.defaultModel,
      dailyRequestsUsed: todayUsage.requestsUsed,
      dailyRequestsLimit: limits.dailyRequests,
      dailyTokensUsed: todayUsage.totalTokens,
      dailyTokensLimit: limits.dailyTokens,
    };
  }

  /**
   * Main pipeline executor (Doc 11 §1).
   */
  async run<T>(
    req: GenerateStructuredRequest<T>,
    entityRef?: EntityReference,
    options?: { isUserTriggered?: boolean; bypassCache?: boolean }
  ): Promise<AIPipelineResult<T>> {
    const startTime = Date.now();
    const task = req.task;
    const model = req.model || this.defaultModel;
    const promptVersion = 1;
    const schemaVersion = 1;

    // 1. Build canonical input representation for hashing & caching
    const canonicalInput = JSON.stringify({
      task,
      parts: req.userContent,
    });
    const inputHash = crypto.createHash('sha256').update(canonicalInput).digest('hex');
    const cacheKey = computeCacheKey(task, schemaVersion, promptVersion, inputHash);

    // 2. Cache Lookup
    if (!options?.bypassCache) {
      const cached = await getCachedOutput<T>(cacheKey);
      if (cached !== null) {
        // Log cached request for audit & metrics
        const db = getDb();
        const [auditLog] = await db
          .insert(aiRequests)
          .values({
            task,
            model,
            provider: this.provider.name,
            promptVersion,
            inputHash,
            entityType: entityRef?.entityType,
            entityId: entityRef?.entityId,
            outputRef: entityRef?.outputRef,
            status: 'cached',
            validationOutcome: 'passed',
            tokensIn: 0,
            tokensOut: 0,
            latencyMs: Date.now() - startTime,
            at: new Date(),
          })
          .returning();

        return {
          data: cached,
          cached: true,
          corrected: false,
          tokens: { inTokens: 0, outTokens: 0 },
          latencyMs: Date.now() - startTime,
          model,
          provider: this.provider.name,
          requestId: auditLog?.id || 'cached',
        };
      }
    }

    // 3. Status & Budget Check
    const currentStatus = await this.status();
    if (currentStatus.status === 'no_key') {
      throw new AppError('EXTERNAL_UNAVAILABLE', currentStatus.reason || 'AI provider not configured');
    }
    if (currentStatus.status === 'quota_exhausted') {
      throw new AppError('RATE_LIMITED', currentStatus.reason || 'AI daily budget exhausted');
    }

    const budgetResult = await checkBudget(
      await this.getBudgetLimits(),
      options?.isUserTriggered
    );
    if (!budgetResult.allowed) {
      await this.recordRequestLog({
        task,
        model,
        promptVersion,
        inputHash,
        entityRef,
        status: 'budget_exceeded',
        validationOutcome: 'failed',
        latencyMs: Date.now() - startTime,
        error: budgetResult.reason,
      });
      throw new AppError('RATE_LIMITED', budgetResult.reason || 'AI daily budget exceeded');
    }

    // 4. Rate Limiting
    await globalRateLimiter.acquire(model);

    // 5. Call Provider with 60s timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    let providerResult;
    try {
      providerResult = await this.provider.generateStructured({
        ...req,
        model,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      this.recentFailureCount = 0;
    } catch (err: unknown) {
      clearTimeout(timeout);
      this.recentFailureCount += 1;
      this.lastFailureAt = new Date();

      const error = err as Error;
      const isRateLimit = error.message.includes('rate limit') || error.message.includes('429');

      await this.recordRequestLog({
        task,
        model,
        promptVersion,
        inputHash,
        entityRef,
        status: isRateLimit ? 'rate_limited' : 'error',
        validationOutcome: 'failed',
        latencyMs: Date.now() - startTime,
        error: error.message,
      });

      throw err;
    }

    // 6. Schema Parsing and Controlled Correction Call (Doc 11 §1 step 5)
    let parsedResult = req.schema.safeParse(providerResult.data);
    let corrected = false;

    if (!parsedResult.success) {
      logger.warn(
        { errors: parsedResult.error.issues, task },
        'AI output failed schema validation. Attempting one controlled correction call...'
      );

      // One controlled correction call
      try {
        const correctionPrompt = [
          {
            type: 'text' as const,
            text: `The previous output contained the following JSON validation errors:\n${JSON.stringify(
              parsedResult.error.issues,
              null,
              2
            )}\n\nPrevious raw output was:\n${providerResult.raw}\n\nPlease fix the errors and produce a valid output conforming strictly to the requested schema.`,
          },
        ];

        const correctionResult = await this.provider.generateStructured({
          ...req,
          model,
          userContent: correctionPrompt,
        });

        const secondParse = req.schema.safeParse(correctionResult.data);
        if (secondParse.success) {
          parsedResult = secondParse;
          corrected = true;
          providerResult = correctionResult;
        }
      } catch (correctionErr) {
        logger.error({ err: correctionErr }, 'Controlled correction call failed');
      }
    }

    // If still failing after one correction attempt
    if (!parsedResult.success) {
      await this.recordRequestLog({
        task,
        model,
        promptVersion,
        inputHash,
        entityRef,
        status: 'invalid_output',
        validationOutcome: 'failed',
        tokensIn: providerResult.usage?.inTokens,
        tokensOut: providerResult.usage?.outTokens,
        latencyMs: Date.now() - startTime,
        error: JSON.stringify(parsedResult.error.issues),
      });

      throw new AppError(
        'VALIDATION',
        `AI generated output failed schema validation after correction attempt: ${parsedResult.error.message}`
      );
    }

    const validatedData = parsedResult.data;

    // 7. Store in Cache
    await setCachedOutput(cacheKey, validatedData);

    // 8. Log successful request
    const requestId = await this.recordRequestLog({
      task,
      model,
      promptVersion,
      inputHash,
      entityRef,
      status: 'ok',
      validationOutcome: corrected ? 'corrected' : 'passed',
      tokensIn: providerResult.usage?.inTokens,
      tokensOut: providerResult.usage?.outTokens,
      latencyMs: Date.now() - startTime,
    });

    return {
      data: validatedData,
      cached: false,
      corrected,
      tokens: providerResult.usage,
      latencyMs: Date.now() - startTime,
      model,
      provider: this.provider.name,
      requestId,
    };
  }

  private async recordRequestLog(params: {
    task: AITask;
    model: string;
    promptVersion: number;
    inputHash: string;
    entityRef?: EntityReference;
    status: string;
    validationOutcome: string;
    tokensIn?: number;
    tokensOut?: number;
    latencyMs?: number;
    error?: string;
  }): Promise<string> {
    try {
      const db = getDb();
      const [row] = await db
        .insert(aiRequests)
        .values({
          task: params.task,
          model: params.model,
          provider: this.provider.name,
          promptVersion: params.promptVersion,
          inputHash: params.inputHash,
          entityType: params.entityRef?.entityType,
          entityId: params.entityRef?.entityId,
          outputRef: params.entityRef?.outputRef,
          status: params.status,
          validationOutcome: params.validationOutcome,
          tokensIn: params.tokensIn ?? 0,
          tokensOut: params.tokensOut ?? 0,
          latencyMs: params.latencyMs ?? 0,
          error: params.error,
          at: new Date(),
        })
        .returning();

      return row?.id || '';
    } catch (logErr) {
      logger.error({ err: logErr }, 'Failed to record AI request log');
      return '';
    }
  }

  private async getBudgetLimits() {
    try {
      const db = getDb();
      const [setting] = await db
        .select({ value: systemSettings.value })
        .from(systemSettings)
        .where(eq(systemSettings.key, 'ai.budget'))
        .limit(1);

      if (setting?.value && typeof setting.value === 'object') {
        const val = setting.value as Record<string, number>;
        return {
          dailyRequests: val.dailyRequests ?? DEFAULT_BUDGET_LIMITS.dailyRequests,
          dailyTokens: val.dailyTokens ?? DEFAULT_BUDGET_LIMITS.dailyTokens,
          userOverrideReserve: val.userOverrideReserve ?? DEFAULT_BUDGET_LIMITS.userOverrideReserve,
        };
      }
    } catch {
      // Fallback to defaults
    }
    return DEFAULT_BUDGET_LIMITS;
  }

  private async getTodayUsageCount() {
    const db = getDb();
    const start = startOfDay(new Date());
    const [res] = await db
      .select({
        requestsUsed: sql<number>`count(*)::int`,
        tokensIn: sql<number>`coalesce(sum(${aiRequests.tokensIn}), 0)::int`,
        tokensOut: sql<number>`coalesce(sum(${aiRequests.tokensOut}), 0)::int`,
      })
      .from(aiRequests)
      .where(gte(aiRequests.at, start));

    const totalTokens = (res?.tokensIn || 0) + (res?.tokensOut || 0);
    return {
      requestsUsed: res?.requestsUsed || 0,
      totalTokens,
    };
  }

  /**
   * Retrieves aggregated usage statistics for dashboard & metrics (Doc 11 §6).
   */
  async getUsageMetrics(date = new Date()): Promise<AIUsageMetrics> {
    const db = getDb();
    const start = startOfDay(date);

    const rows = await db
      .select()
      .from(aiRequests)
      .where(gte(aiRequests.at, start));

    let totalRequests = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let cachedRequests = 0;
    let failedRequests = 0;
    const taskBreakdown: Record<string, { requests: number; tokens: number }> = {};
    const modelBreakdown: Record<string, { requests: number; tokens: number }> = {};

    for (const r of rows) {
      totalRequests += 1;
      const tIn = r.tokensIn ?? 0;
      const tOut = r.tokensOut ?? 0;
      const tTotal = tIn + tOut;
      totalTokensIn += tIn;
      totalTokensOut += tOut;

      if (r.status === 'cached') cachedRequests += 1;
      if (r.status === 'error' || r.status === 'invalid_output') failedRequests += 1;

      // Task breakdown
      if (!taskBreakdown[r.task]) {
        taskBreakdown[r.task] = { requests: 0, tokens: 0 };
      }
      taskBreakdown[r.task]!.requests += 1;
      taskBreakdown[r.task]!.tokens += tTotal;

      // Model breakdown
      if (!modelBreakdown[r.model]) {
        modelBreakdown[r.model] = { requests: 0, tokens: 0 };
      }
      modelBreakdown[r.model]!.requests += 1;
      modelBreakdown[r.model]!.tokens += tTotal;
    }

    // Gemini Free Tier is $0.00. We can estimate standard commercial rate for display.
    const estimatedCostUsd = (totalTokensIn * 0.00000015) + (totalTokensOut * 0.0000006);

    return {
      date: start.toISOString().split('T')[0] ?? start.toISOString(),
      totalRequests,
      totalTokensIn,
      totalTokensOut,
      cachedRequests,
      failedRequests,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(4)),
      taskBreakdown,
      modelBreakdown,
    };
  }
}

export const aiService = new AIService();
