import { getDb } from '@/shared/db';
import {
  humanReviewRequests,
  workflowCheckpoints,
  applications,
  applicationFieldAnswers,
  jobs,
  companies,
  reusableApplicationAnswers,
  notifications,
} from '@/db/schema';
import { eq, and, desc, or, lte } from 'drizzle-orm';
import { AppError } from '@/shared/errors';
import { logger } from '@/shared/logger';
import { enqueue } from '@/modules/queue';
import {
  CreateReviewRequestInput,
  DeferReviewRequestInput,
  RequiredAction,
  RespondReviewRequestInput,
  ResponseSchema,
  ReviewCategory,
  ReviewItem,
  ReviewStatus,
} from './domain/types';
import {
  isCoreCategory,
  sanitizeReviewSuggestion,
  validateReviewResponse,
} from './domain/core-categories';

export class HumanReviewService {
  /**
   * Creates a human review request.
   * If workflowId or applicationId are provided, updates their statuses to awaiting review.
   */
  async createRequest(input: CreateReviewRequestInput): Promise<ReviewItem> {
    const db = getDb();

    // 1. Invariant enforcement: Zero AI suggestions on core categories
    const sanitizedSuggestion = sanitizeReviewSuggestion(
      input.category,
      input.suggestedAnswer
    );

    // 2. Insert review request
    const [inserted] = await db
      .insert(humanReviewRequests)
      .values({
        workflowId: input.workflowId,
        jobId: input.jobId,
        applicationId: input.applicationId,
        fieldId: input.fieldId,
        category: input.category,
        question: input.question,
        context: input.context || {},
        uncertaintyReason: input.uncertaintyReason,
        evidence: input.evidence || [],
        suggestedAnswer: sanitizedSuggestion,
        suggestionConfidence: sanitizedSuggestion
          ? input.suggestionConfidence?.toFixed(2)
          : null,
        suggestionRationale: sanitizedSuggestion
          ? input.suggestionRationale
          : null,
        requiredAction: input.requiredAction,
        responseSchema: input.responseSchema || { type: 'text' },
        status: 'pending',
        checkpointStep: input.checkpointStep,
        expiresAt: input.expiresAt,
      })
      .returning();

    if (!inserted) {
      throw new AppError('INTERNAL', 'Failed to create human review request.');
    }

    // 3. Update associated workflow checkpoint if active
    if (input.workflowId) {
      await db
        .update(workflowCheckpoints)
        .set({
          status: 'waiting_review',
          updatedAt: new Date(),
        })
        .where(eq(workflowCheckpoints.workflowId, input.workflowId));
    }

    // 4. Update associated application if active
    if (input.applicationId) {
      await db
        .update(applications)
        .set({
          status: 'awaiting_review',
          updatedAt: new Date(),
        })
        .where(eq(applications.id, input.applicationId));
    }

    // 5. Emit in-app notification
    try {
      await db.insert(notifications).values({
        type: 'review_request',
        title: `Action Required: ${input.category.toUpperCase()}`,
        body: input.question,
        link: '/review',
        entityType: 'review_request',
        entityId: inserted.id,
      });
    } catch (notifErr) {
      logger.warn({ notifErr }, '[HumanReviewService] Could not insert notification');
    }

    logger.info(
      {
        requestId: inserted.id,
        category: input.category,
        jobId: input.jobId,
        isCore: isCoreCategory(input.category),
      },
      '[HumanReviewService] Review request created'
    );

    return this.get(inserted.id);
  }

  /**
   * Submits a user response to an active review request.
   */
  async respond(
    id: string,
    action: RequiredAction,
    payload: RespondReviewRequestInput
  ): Promise<ReviewItem> {
    const db = getDb();

    // 1. Fetch review request
    const [request] = await db
      .select()
      .from(humanReviewRequests)
      .where(eq(humanReviewRequests.id, id))
      .limit(1);

    if (!request) {
      throw new AppError('NOT_FOUND', `Review request '${id}' not found.`);
    }

    if (request.status !== 'pending' && request.status !== 'deferred') {
      throw new AppError(
        'CONFLICT',
        `Review request '${id}' is already in status '${request.status}'.`
      );
    }

    // 2. Validate response against schema
    const validation = validateReviewResponse(
      request.responseSchema as ResponseSchema,
      payload.answer
    );
    if (!validation.valid) {
      throw new AppError('VALIDATION', validation.error || 'Invalid response');
    }

    // 3. Handle optional reusable answer save (with explicit user authorization)
    if (payload.saveReusable && payload.reusableKey) {
      const isCore = isCoreCategory(request.category);
      await db
        .insert(reusableApplicationAnswers)
        .values({
          questionKey: payload.reusableKey.trim().toLowerCase(),
          questionPatterns: [request.question],
          answer: payload.answer,
          scope: payload.reusableScope || {},
          category: request.category,
          coreCategoryConfirmed: isCore,
          authorizedAt: new Date(),
          authorizedNote: payload.notes || 'Saved explicitly from review request',
        })
        .onConflictDoUpdate({
          target: reusableApplicationAnswers.questionKey,
          set: {
            answer: payload.answer,
            coreCategoryConfirmed: isCore,
            authorizedAt: new Date(),
            updatedAt: new Date(),
          },
        });
    }

    // 4. If linked to an application form field, update field answer
    if (request.fieldId) {
      await db
        .update(applicationFieldAnswers)
        .set({
          answer: payload.answer,
          decision: payload.answer === null ? 'left_blank' : 'answered',
          source: 'human',
          status: 'approved',
          approvedAt: new Date(),
          reviewedByRequestId: request.id,
          updatedAt: new Date(),
        })
        .where(eq(applicationFieldAnswers.fieldId, request.fieldId));
    }

    // 5. Update review request status to answered or approved
    const finalStatus = action === 'approve' ? 'approved' : 'answered';
    await db
      .update(humanReviewRequests)
      .set({
        status: finalStatus,
        userAnswer: payload.answer,
        resolvedAt: new Date(),
      })
      .where(eq(humanReviewRequests.id, id));

    // 6. Check if workflow can resume
    if (request.workflowId) {
      // Check if any other requests remain pending for this workflow
      const remainingPending = await db
        .select({ id: humanReviewRequests.id })
        .from(humanReviewRequests)
        .where(
          and(
            eq(humanReviewRequests.workflowId, request.workflowId),
            or(
              eq(humanReviewRequests.status, 'pending'),
              eq(humanReviewRequests.status, 'deferred')
            )
          )
        );

      if (remainingPending.length === 0) {
        // Enqueue workflow.resume job
        await enqueue(
          'workflow.resume',
          {
            workflowId: request.workflowId,
            requestId: request.id,
          },
          { singletonKey: `resume:${request.workflowId}` }
        );
        logger.info(
          { workflowId: request.workflowId, requestId: request.id },
          '[HumanReviewService] All review requests resolved; enqueued workflow.resume'
        );
      }
    }

    logger.info(
      { requestId: id, action, finalStatus },
      '[HumanReviewService] Review request resolved'
    );

    return this.get(id);
  }

  /**
   * Snoozes / defers a review request until a future timestamp.
   */
  async defer(id: string, input: DeferReviewRequestInput): Promise<ReviewItem> {
    const db = getDb();
    const [request] = await db
      .select({ id: humanReviewRequests.id, status: humanReviewRequests.status })
      .from(humanReviewRequests)
      .where(eq(humanReviewRequests.id, id))
      .limit(1);

    if (!request) {
      throw new AppError('NOT_FOUND', `Review request '${id}' not found.`);
    }

    if (request.status !== 'pending' && request.status !== 'deferred') {
      throw new AppError(
        'CONFLICT',
        `Cannot defer review request in status '${request.status}'.`
      );
    }

    await db
      .update(humanReviewRequests)
      .set({
        status: 'deferred',
        snoozedUntil: input.snoozeUntil,
      })
      .where(eq(humanReviewRequests.id, id));

    return this.get(id);
  }

  /**
   * Cancels a review request.
   */
  async cancel(id: string): Promise<ReviewItem> {
    const db = getDb();
    const [request] = await db
      .select({ id: humanReviewRequests.id })
      .from(humanReviewRequests)
      .where(eq(humanReviewRequests.id, id))
      .limit(1);

    if (!request) {
      throw new AppError('NOT_FOUND', `Review request '${id}' not found.`);
    }

    await db
      .update(humanReviewRequests)
      .set({
        status: 'cancelled',
        resolvedAt: new Date(),
      })
      .where(eq(humanReviewRequests.id, id));

    return this.get(id);
  }

  /**
   * Retrieves a single review item with rich joined job and company information.
   */
  async get(id: string): Promise<ReviewItem> {
    const db = getDb();

    const [row] = await db
      .select({
        req: humanReviewRequests,
        jobTitle: jobs.title,
        companyName: companies.name,
      })
      .from(humanReviewRequests)
      .innerJoin(jobs, eq(humanReviewRequests.jobId, jobs.id))
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .where(eq(humanReviewRequests.id, id))
      .limit(1);

    if (!row) {
      throw new AppError('NOT_FOUND', `Review request '${id}' not found.`);
    }

    return this.mapToItem(row.req, row.jobTitle, row.companyName ?? undefined);
  }

  /**
   * Lists review requests with optional status and category filters.
   */
  async list(options?: {
    status?: ReviewStatus | 'active' | 'all';
    category?: string;
    jobId?: string;
    limit?: number;
  }): Promise<ReviewItem[]> {
    const db = getDb();
    const limit = options?.limit || 50;

    const conditions = [];

    if (options?.category) {
      conditions.push(eq(humanReviewRequests.category, options.category));
    }
    if (options?.jobId) {
      conditions.push(eq(humanReviewRequests.jobId, options.jobId));
    }

    if (options?.status === 'all') {
      // no status condition
    } else if (options?.status === 'active' || !options?.status) {
      const now = new Date();
      conditions.push(
        or(
          eq(humanReviewRequests.status, 'pending'),
          and(
            eq(humanReviewRequests.status, 'deferred'),
            lte(humanReviewRequests.snoozedUntil, now)
          )
        )
      );
    } else {
      conditions.push(eq(humanReviewRequests.status, options.status));
    }

    const rows = await db
      .select({
        req: humanReviewRequests,
        jobTitle: jobs.title,
        companyName: companies.name,
      })
      .from(humanReviewRequests)
      .innerJoin(jobs, eq(humanReviewRequests.jobId, jobs.id))
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(humanReviewRequests.createdAt))
      .limit(limit);

    return rows.map((r) =>
      this.mapToItem(r.req, r.jobTitle, r.companyName ?? undefined)
    );
  }

  private mapToItem(
    raw: typeof humanReviewRequests.$inferSelect,
    jobTitle?: string,
    companyName?: string
  ): ReviewItem {
    return {
      id: raw.id,
      workflowId: raw.workflowId,
      jobId: raw.jobId,
      jobTitle,
      companyName,
      applicationId: raw.applicationId,
      fieldId: raw.fieldId,
      category: raw.category as ReviewCategory,
      isCoreCategory: isCoreCategory(raw.category),
      question: raw.question,
      context: raw.context as Record<string, unknown>,
      uncertaintyReason: raw.uncertaintyReason,
      evidence: (raw.evidence as Array<Record<string, unknown>>) || [],
      suggestedAnswer: raw.suggestedAnswer,
      suggestionConfidence: raw.suggestionConfidence
        ? Number(raw.suggestionConfidence)
        : null,
      suggestionRationale: raw.suggestionRationale,
      requiredAction: raw.requiredAction as RequiredAction,
      responseSchema: raw.responseSchema as ResponseSchema,
      status: raw.status as ReviewStatus,
      userAnswer: raw.userAnswer,
      snoozedUntil: raw.snoozedUntil,
      expiresAt: raw.expiresAt,
      checkpointStep: raw.checkpointStep,
      createdAt: raw.createdAt,
      resolvedAt: raw.resolvedAt,
    };
  }
}

export const humanReviewService = new HumanReviewService();
