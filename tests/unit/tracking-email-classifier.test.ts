import { describe, it, expect } from 'vitest';
import { classifyEmailContent } from '@/modules/tracking/domain/email-classifier';

describe('Email Classifier Domain Engine (Doc 03 FR-TRK-2, User Q15)', () => {
  it('classifies application receipt confirmation as under_review suggestion', () => {
    const result = classifyEmailContent(
      'Thank you for applying to Stripe - Software Engineer',
      'We have received your application for the Software Engineer position. Our team will review your qualifications and reach out if there is a match.'
    );

    expect(result.isMatch).toBe(true);
    expect(result.category).toBe('confirmation');
    expect(result.suggestedStatus).toBe('under_review');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('classifies technical coding challenge as assessment_received suggestion', () => {
    const result = classifyEmailContent(
      'Next steps: Online Assessment for Figma',
      'Please complete the HackerRank coding assessment within 5 days. Link: https://hackerrank.com/test-123'
    );

    expect(result.isMatch).toBe(true);
    expect(result.category).toBe('assessment');
    expect(result.suggestedStatus).toBe('assessment_received');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('classifies recruiter interview invitation as interview_scheduled suggestion', () => {
    const result = classifyEmailContent(
      'Invitation to Interview with Datadog',
      'We would like to interview you for the Senior Platform Engineer role. Please choose a slot on our Calendly: https://calendly.com/recruiter-slot'
    );

    expect(result.isMatch).toBe(true);
    expect(result.category).toBe('interview');
    expect(result.suggestedStatus).toBe('interview_scheduled');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('classifies formal job offer as offer_received suggestion', () => {
    const result = classifyEmailContent(
      'Job Offer: Senior Software Engineer at Linear',
      'We are pleased to offer you employment as a Senior Software Engineer at Linear. Please find your formal offer letter attached.'
    );

    expect(result.isMatch).toBe(true);
    expect(result.category).toBe('offer');
    expect(result.suggestedStatus).toBe('offer_received');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('classifies rejection notification as rejected suggestion', () => {
    const result = classifyEmailContent(
      'Update regarding your application to Retool',
      'Thank you for your interest in Retool. We have decided to pursue other candidates whose qualifications more closely align with our current needs.'
    );

    expect(result.isMatch).toBe(true);
    expect(result.category).toBe('rejection');
    expect(result.suggestedStatus).toBe('rejected');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('returns inconclusive for marketing or newsletter content', () => {
    const result = classifyEmailContent(
      'Weekly tech trends and engineering digest',
      'Read our latest blog post on database indexing techniques and distributed consensus protocols.'
    );

    expect(result.isMatch).toBe(false);
    expect(result.category).toBe('inconclusive');
    expect(result.suggestedStatus).toBeUndefined();
    expect(result.confidence).toBe(0);
  });

  it('handles empty inputs safely without throwing', () => {
    const result = classifyEmailContent('', '');
    expect(result.isMatch).toBe(false);
    expect(result.category).toBe('inconclusive');
  });
});
