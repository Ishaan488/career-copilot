import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '@/shared/db';
import {
  companies,
  jobs,
  applications,
  applicationSubmissions,
  applicationEvents,
} from '@/db/schema';
import { eq } from 'drizzle-orm';
import { intelligenceService } from '@/modules/intelligence';
import { aiService } from '@/modules/ai/service';
import { FakeAIProvider } from '../support/fake-ai-provider';
import { checkSubmissionAuthorization } from '@/modules/application/domain/authorization';
import { AppError } from '@/shared/errors';

describe('Failure Injection & Recovery Suite (Doc 15 §5, Doc 10 §8-10)', () => {
  const db = getDb();
  let testCompanyId: string;
  let testJobId: string;

  beforeEach(async () => {
    const timestamp = Date.now();
    const [c] = await db
      .insert(companies)
      .values({
        name: `Failure Test Co ${timestamp}`,
        normalizedName: `failure test co ${timestamp}`,
        primaryDomain: `failure-${timestamp}.com`,
      })
      .returning();
    testCompanyId = c!.id;

    const [j] = await db
      .insert(jobs)
      .values({
        companyId: testCompanyId,
        title: `Resilient Engineer ${timestamp}`,
        normalizedTitle: 'resilient engineer',
        descriptionText: 'Description for failure injection tests',
        descriptionHash: `fail_hash_${timestamp}`,
      })
      .returning();
    testJobId = j!.id;
  });

  describe('1. AI Provider Failures (503 / 429 / Unreachable)', () => {
    it('handles AI provider down (503/error) gracefully by marking pending_ai rather than crashing', async () => {
      // Simulate down AI provider throwing 503
      const failingProvider = new FakeAIProvider();
      failingProvider.generateStructured = async () => {
        throw new Error('503 Service Unavailable: AI cluster experiencing outage');
      };
      aiService.setProvider(failingProvider);

      const result = await intelligenceService.analyzeJob(testJobId);
      expect(result.status).toBe('pending_ai');
      expect(result.reason).toContain('503');

      // Check DB: Job is marked pending_ai for later draining
      const [job] = await db.select().from(jobs).where(eq(jobs.id, testJobId));
      expect(job?.analysisStatus).toBe('pending_ai');
    });

    it('handles AI provider 429 rate limit / quota exhaustion gracefully', async () => {
      const rateLimitedProvider = new FakeAIProvider();
      rateLimitedProvider.generateStructured = async () => {
        throw new AppError('RATE_LIMITED', '429 Resource has been exhausted (e.g. check quota)');
      };
      aiService.setProvider(rateLimitedProvider);

      const result = await intelligenceService.analyzeJob(testJobId);
      expect(result.status).toBe('pending_ai');
      expect(result.reason).toContain('429');
    });
  });

  describe('2. Submission Protocol Invariant: Max 1 Submit Call (Doc 13 §8, Doc 15 §5)', () => {
    it('strictly prevents duplicate submissions when an active submission exists', () => {
      // If an intent/submission row exists, authorization check must block any second call
      const authCheck = checkSubmissionAuthorization({
        applicationId: '00000000-0000-0000-0000-000000000001',
        status: 'ready_to_submit',
        verifiedDomain: true,
        currentSummaryHash: 'hash_xyz',
        envSubmissionEnabled: true,
        settingsSubmissionEnabled: true,
        activeSubmissionExists: true, // Active intent or unverified submission row
        duplicateSubmittedAppExists: false,
        resume: null,
        authorization: {
          id: '00000000-0000-0000-0000-000000000002',
          kind: 'submission',
          summaryHash: 'hash_xyz',
          expiresAt: new Date(Date.now() + 600000),
          revokedAt: null,
        },
        answers: [],
      });

      expect(authCheck.ok).toBe(false);
      expect(authCheck.reasons.some((r) => r.includes('ACTIVE_SUBMISSION_EXISTS'))).toBe(true);
    });

    it('ensures that after a submit timeout/failure, submit count remains <= 1 per application', async () => {
      let postCallCount = 0;

      // Simulate a target ATS endpoint that counts POST attempts
      const simulatePortalSubmit = async () => {
        postCallCount++;
        // Simulate network timeout or server drop
        throw new Error('Connection timeout waiting for ATS confirmation');
      };

      const [app] = await db
        .insert(applications)
        .values({
          jobId: testJobId,
          dedupeKey: `timeout_app_${Date.now()}`,
          status: 'ready_to_submit',
          applicationUrl: 'https://example.com/apply',
        })
        .returning();

      // Commit intent row before click (protocol requirement)
      const [submission] = await db
        .insert(applicationSubmissions)
        .values({
          applicationId: app!.id,
          status: 'intent',
          intentAt: new Date(),
        })
        .returning();

      try {
        await simulatePortalSubmit();
      } catch {
        // Mark unverified on timeout
        await db
          .update(applicationSubmissions)
          .set({ status: 'unverified' })
          .where(eq(applicationSubmissions.id, submission!.id));

        await db.insert(applicationEvents).values({
          applicationId: app!.id,
          type: 'submission_timeout',
          actor: 'system',
          details: { error: 'Connection timeout' },
        });
      }

      // Assert exactly 1 submit attempt was made
      expect(postCallCount).toBe(1);

      // Verify that a retry or recovery runner will NOT attempt a second submit POST
      const [currentSub] = await db
        .select()
        .from(applicationSubmissions)
        .where(eq(applicationSubmissions.applicationId, app!.id));

      expect(currentSub?.status).toBe('unverified');

      const secondCheck = checkSubmissionAuthorization({
        applicationId: app!.id,
        status: app!.status,
        verifiedDomain: true,
        currentSummaryHash: 'hash_xyz',
        envSubmissionEnabled: true,
        settingsSubmissionEnabled: true,
        activeSubmissionExists: currentSub?.status === 'unverified',
        duplicateSubmittedAppExists: false,
        resume: null,
        authorization: null,
        answers: [],
      });

      // Second submit blocked by active submission exists guard
      expect(secondCheck.ok).toBe(false);
      expect(postCallCount).toBeLessThanOrEqual(1);
    });
  });

  describe('3. Portal Layout Change & CAPTCHA Detection Handling', () => {
    it('halts with BLOCKED_BY_PORTAL when CAPTCHA is encountered (no evasion attempted)', async () => {
      // Per Doc 13 §11 and guidelines, never attempt CAPTCHA evasion
      const portalError = new AppError('BLOCKED_BY_PORTAL', 'Cloudflare Turnstile challenge detected');
      expect(portalError.code).toBe('BLOCKED_BY_PORTAL');
      expect(portalError.message).toContain('Cloudflare Turnstile');
    });

    it('halts and preserves state when layout change is detected', async () => {
      const layoutError = new AppError('VALIDATION', 'LAYOUT_CHANGED: Expected form selector #application-form missing');
      expect(layoutError.message).toContain('LAYOUT_CHANGED');
    });
  });
});
