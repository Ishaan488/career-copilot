import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { humanReviewService } from '@/modules/human-review/service';
import { isCoreCategory, sanitizeReviewSuggestion, validateReviewResponse } from '@/modules/human-review/domain/core-categories';
import { jobs } from '@/db/schema/jobs';
import { companies } from '@/db/schema/companies';
import { humanReviewRequests } from '@/db/schema/workflows';
import { reusableApplicationAnswers } from '@/db/schema/profile';
import { getDb, closeDbPool } from '@/shared/db';
import { eq } from 'drizzle-orm';

describe('Human-in-the-Loop Review Subsystem (Milestone 9)', () => {
  let testJobId: string;
  let testCompanyId: string;

  beforeAll(async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    const db = getDb();

    // Clean up review and reusable tables
    await db.delete(humanReviewRequests);
    await db.delete(reusableApplicationAnswers);
    await db.delete(companies).where(eq(companies.normalizedName, 'hitl-review-corp'));

    // Create a dummy company and job for foreign keys
    const [c] = await db
      .insert(companies)
      .values({
        name: 'HITL Review Corp',
        normalizedName: 'hitl-review-corp',
        primaryDomain: 'hitl-review.org',
        origin: 'manual',
      })
      .returning({ id: companies.id });
    testCompanyId = c!.id;

    const [j] = await db
      .insert(jobs)
      .values({
        companyId: testCompanyId,
        title: 'Senior Compliance Engineer',
        normalizedTitle: 'senior compliance engineer',
        descriptionText: 'Handle core compliance, legal declarations, and automated workflows.',
        descriptionHash: 'hash_hitl_test_999',
      })
      .returning({ id: jobs.id });
    testJobId = j!.id;
  });

  afterAll(async () => {
    await closeDbPool();
  });

  describe('Core Categories & Invariant Engine', () => {
    it('accurately identifies core categories that require strict human confirmation', () => {
      expect(isCoreCategory('legal')).toBe(true);
      expect(isCoreCategory('consent')).toBe(true);
      expect(isCoreCategory('bond')).toBe(true);
      expect(isCoreCategory('work_auth')).toBe(true);
      expect(isCoreCategory('salary')).toBe(true);
      expect(isCoreCategory('eeo')).toBe(true);
      expect(isCoreCategory('sensitive')).toBe(true);

      // Non-core categories
      expect(isCoreCategory('company_legitimacy')).toBe(false);
      expect(isCoreCategory('missing_profile')).toBe(false);
      expect(isCoreCategory('custom_question')).toBe(false);
      expect(isCoreCategory('other')).toBe(false);
    });

    it('sanitizes AI suggestions to null for all core categories (Zero-Fabrication Contract)', () => {
      const sanitizedCore = sanitizeReviewSuggestion('work_auth', 'US Citizen');
      expect(sanitizedCore).toBeNull();

      const sanitizedNonCore = sanitizeReviewSuggestion('custom_question', 'React and TypeScript');
      expect(sanitizedNonCore).toBe('React and TypeScript');
    });

    it('validates response values against declared response schema', () => {
      // Required boolean schema
      const booleanSchema = { type: 'boolean' as const, required: true };
      expect(validateReviewResponse(booleanSchema, true).valid).toBe(true);
      expect(validateReviewResponse(booleanSchema, 'invalid-bool').valid).toBe(false);

      // Select / Radio with enumerated options
      const selectSchema = {
        type: 'select' as const,
        required: true,
        options: [
          { label: 'Yes, authorized', value: 'authorized' },
          { label: 'Requires sponsorship', value: 'sponsorship_required' },
        ],
      };
      expect(validateReviewResponse(selectSchema, 'authorized').valid).toBe(true);
      expect(validateReviewResponse(selectSchema, 'alien_status').valid).toBe(false);

      // Numeric with min / max constraints
      const numberSchema = { type: 'number' as const, required: true, min: 50000, max: 200000 };
      expect(validateReviewResponse(numberSchema, 120000).valid).toBe(true);
      expect(validateReviewResponse(numberSchema, 30000).valid).toBe(false);
    });
  });

  describe('HumanReviewService Operations', () => {
    it('creates a review request for a core category and forces suggestions to null', async () => {
      const created = await humanReviewService.createRequest({
        jobId: testJobId,
        category: 'work_auth',
        question: 'Are you legally authorized to work in the United States?',
        suggestedAnswer: 'Yes',
        suggestionConfidence: 0.98,
        suggestionRationale: 'Profile has US phone number',
        requiredAction: 'answer',
        responseSchema: {
          type: 'select',
          required: true,
          options: [
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ],
        },
      });

      expect(created.id).toBeDefined();
      expect(created.category).toBe('work_auth');
      expect(created.isCoreCategory).toBe(true);
      // Verify AI suggestions were stripped
      expect(created.suggestedAnswer).toBeNull();
      expect(created.suggestionConfidence).toBeNull();
      expect(created.suggestionRationale).toBeNull();
      expect(created.status).toBe('pending');
    });

    it('creates a review request for a non-core category and preserves suggestions', async () => {
      const created = await humanReviewService.createRequest({
        jobId: testJobId,
        category: 'custom_question',
        question: 'How many years of experience do you have with PostgreSQL?',
        suggestedAnswer: 5,
        suggestionConfidence: 0.9,
        suggestionRationale: 'Calculated from experience items',
        requiredAction: 'answer',
        responseSchema: {
          type: 'text',
          required: true,
        },
      });

      expect(created.category).toBe('custom_question');
      expect(created.isCoreCategory).toBe(false);
      expect(created.suggestedAnswer).toBe(5);
      expect(created.suggestionConfidence).toBe(0.9);
      expect(created.status).toBe('pending');
    });

    it('submits a response to a review request and records the answer', async () => {
      const created = await humanReviewService.createRequest({
        jobId: testJobId,
        category: 'salary',
        question: 'What is your minimum acceptable annual base salary?',
        requiredAction: 'answer',
        responseSchema: {
          type: 'number',
          min: 100000,
          required: true,
        },
      });

      const updated = await humanReviewService.respond(created.id, 'answer', {
        answer: 150000,
        notes: 'Aligned with industry benchmark',
      });

      expect(updated.status).toBe('answered');
      expect(updated.userAnswer).toBe(150000);
      expect(updated.resolvedAt).toBeInstanceOf(Date);
    });

    it('saves a reusable answer with coreCategoryConfirmed=true when user selects saveReusable on core category', async () => {
      const created = await humanReviewService.createRequest({
        jobId: testJobId,
        category: 'bond',
        question: 'Do you currently have an active employment bond or non-compete with your prior employer?',
        requiredAction: 'answer',
        responseSchema: {
          type: 'boolean',
          required: true,
        },
      });

      const updated = await humanReviewService.respond(created.id, 'answer', {
        answer: false,
        saveReusable: true,
        reusableKey: 'bond_active_non_compete',
      });

      expect(updated.status).toBe('answered');

      // Verify the entry was stored in reusableApplicationAnswers with coreCategoryConfirmed
      const db = getDb();
      const saved = await db
        .select()
        .from(reusableApplicationAnswers)
        .where(eq(reusableApplicationAnswers.questionKey, 'bond_active_non_compete'));

      expect(saved.length).toBe(1);
      expect(saved[0]!.category).toBe('bond');
      expect(saved[0]!.answer).toBe(false);
      expect(saved[0]!.coreCategoryConfirmed).toBe(true);
    });

    it('snoozes a review request using defer and restores status', async () => {
      const created = await humanReviewService.createRequest({
        jobId: testJobId,
        category: 'company_legitimacy',
        question: 'Please confirm whether you wish to proceed with this unverified domain.',
        requiredAction: 'decide',
      });

      const snoozeDate = new Date(Date.now() + 2 * 3600 * 1000);
      const deferred = await humanReviewService.defer(created.id, {
        snoozeUntil: snoozeDate,
        reason: 'Investigating company background manually',
      });

      expect(deferred.status).toBe('deferred');
      expect(deferred.snoozedUntil).toBeInstanceOf(Date);
    });

    it('cancels an unwanted review request', async () => {
      const created = await humanReviewService.createRequest({
        jobId: testJobId,
        category: 'other',
        question: 'Optional portfolio link check',
        requiredAction: 'answer',
      });

      const cancelled = await humanReviewService.cancel(created.id);
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.resolvedAt).toBeInstanceOf(Date);
    });

    it('lists reviews with status filters', async () => {
      const allItems = await humanReviewService.list({ status: 'all', jobId: testJobId });
      expect(allItems.length).toBeGreaterThanOrEqual(4);

      const activeItems = await humanReviewService.list({ status: 'active', jobId: testJobId });
      expect(activeItems.every((i) => i.status === 'pending')).toBe(true);
    });
  });
});
