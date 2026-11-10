import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getProfile, PUT as putProfile } from '@/app/api/profile/route';
import { GET as getCompleteness } from '@/app/api/profile/completeness/route';
import { GET as getRevisions } from '@/app/api/profile/revisions/route';
import { POST as postSection } from '@/app/api/profile/[section]/route';
import { DELETE as deleteSection } from '@/app/api/profile/[section]/[id]/route';
import { GET as getPreferences, PUT as putPreferences } from '@/app/api/preferences/route';
import { GET as getAutonomy, PUT as putAutonomy } from '@/app/api/autonomy/route';
import { GET as getAutonomyHistory } from '@/app/api/autonomy/history/route';
import { GET as getAnswers, POST as postAnswers } from '@/app/api/reusable-answers/route';
import { DELETE as deleteAnswer } from '@/app/api/reusable-answers/[id]/route';
import {
  candidateProfiles,
  jobPreferences,
  autonomyPolicies,
  reusableApplicationAnswers,
} from '@/db/schema/profile';
import { getDb, closeDbPool } from '@/shared/db';

describe('Profile & Autonomy API Endpoints', () => {
  beforeAll(async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    const db = getDb();
    await db.delete(candidateProfiles);
    await db.delete(jobPreferences);
    await db.delete(autonomyPolicies);
    await db.delete(reusableApplicationAnswers);
  });

  afterAll(async () => {
    await closeDbPool();
  });

  describe('Profile API', () => {
    it('handles GET and PUT /api/profile', async () => {
      const getRes = await getProfile();
      expect(getRes.status).toBe(200);

      const putReq = new NextRequest('http://127.0.0.1:3000/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Alan Turing',
          headline: 'Theoretical Computer Scientist',
          summary: 'Cryptanalyst and mathematician.',
          timezone: 'Europe/London',
          currentCity: 'Manchester',
          currentCountry: 'United Kingdom',
          preferredContact: 'email',
          noticePeriodDays: 30,
          currentEmploymentStatus: 'employed',
        }),
      });

      const putRes = await putProfile(putReq);
      expect(putRes.status).toBe(200);
      const putData = await putRes.json();
      expect(putData.fullName).toBe('Alan Turing');
    });

    it('returns completeness report from /api/profile/completeness', async () => {
      const res = await getCompleteness();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('score');
      expect(data).toHaveProperty('breakdown');
      expect(data).toHaveProperty('missingFields');
    });

    it('returns revision list from /api/profile/revisions', async () => {
      const res = await getRevisions();
      expect(res.status).toBe(200);
      const revisions = await res.json();
      expect(Array.isArray(revisions)).toBe(true);
      expect(revisions.length).toBeGreaterThanOrEqual(1);
    });

    it('adds and deletes an email via /api/profile/[section]', async () => {
      const postReq = new NextRequest('http://127.0.0.1:3000/api/profile/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'turing@bletchley.org', isPrimary: true }),
      });

      const postRes = await postSection(postReq, { params: Promise.resolve({ section: 'emails' }) });
      expect(postRes.status).toBe(201);
      const email = await postRes.json();
      expect(email.email).toBe('turing@bletchley.org');

      const delReq = new NextRequest(`http://127.0.0.1:3000/api/profile/emails/${email.id}`, { method: 'DELETE' });
      const delRes = await deleteSection(delReq, { params: Promise.resolve({ section: 'emails', id: email.id }) });
      expect(delRes.status).toBe(200);
    });
  });

  describe('Preferences API', () => {
    it('handles GET and PUT /api/preferences with valid weights', async () => {
      const getRes = await getPreferences();
      expect(getRes.status).toBe(200);

      const putReq = new NextRequest('http://127.0.0.1:3000/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferredRoles: ['Cryptanalyst', 'Mathematician'],
          excludedRoles: [],
          industries: ['Defense', 'Intelligence'],
          excludedIndustries: [],
          locations: [],
          workModes: ['onsite'],
          minComp: 50000,
          preferredComp: 80000,
          compCurrency: 'GBP',
          compPeriod: 'annual',
          experienceLevels: ['lead'],
          employmentTypes: ['full_time'],
          prioritizedCompanies: [],
          excludedCompanies: [],
          maxNoticePeriodDays: 30,
          relocation: 'within_country',
          scoringWeights: {
            roleFit: 40,
            skillMatch: 30,
            comp: 10,
            location: 10,
            companyReputation: 10,
          },
        }),
      });

      const putRes = await putPreferences(putReq);
      expect(putRes.status).toBe(200);
      const putData = await putRes.json();
      expect(putData.compCurrency).toBe('GBP');
    });

    it('returns 400 when scoring weights do not sum to 100', async () => {
      const putReq = new NextRequest('http://127.0.0.1:3000/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferredRoles: [],
          excludedRoles: [],
          industries: [],
          excludedIndustries: [],
          locations: [],
          workModes: [],
          compCurrency: 'INR',
          compPeriod: 'annual',
          experienceLevels: [],
          employmentTypes: [],
          prioritizedCompanies: [],
          excludedCompanies: [],
          scoringWeights: {
            roleFit: 20,
            skillMatch: 20,
            comp: 20,
            location: 20,
            companyReputation: 10, // sum = 90
          },
        }),
      });

      const res = await putPreferences(putReq);
      expect(res.status).toBe(400);
    });
  });

  describe('Autonomy API', () => {
    it('handles GET /api/autonomy and returns default Level 1', async () => {
      const res = await getAutonomy();
      expect(res.status).toBe(200);
      const policy = await res.json();
      expect(policy.level).toBe(1);
      expect(policy.submissionMode).toBe('manual_handover');
    });

    it('returns 403 on elevating autonomy without confirm: true', async () => {
      const putReq = new NextRequest('http://127.0.0.1:3000/api/autonomy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 2,
          autoShortlist: false,
          shortlistThreshold: 70,
          mayPrepareApplications: true,
          mayFillForms: true,
          allowedCompanyIds: [],
          allowedAts: [],
          alwaysReviewCategories: [
            'legal',
            'consent',
            'bond',
            'work_auth',
            'salary',
            'notice',
            'relocation',
            'background',
            'sensitive',
            'eeo',
          ],
          notificationPrefs: {},
          submissionMode: 'manual_handover',
          maxDailyApplications: 5,
          confirm: false, // Not confirmed!
        }),
      });

      const res = await putAutonomy(putReq);
      expect(res.status).toBe(403);
    });

    it('elevates autonomy to Level 2 with confirm: true and records history', async () => {
      const putReq = new NextRequest('http://127.0.0.1:3000/api/autonomy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 2,
          autoShortlist: false,
          shortlistThreshold: 70,
          mayPrepareApplications: true,
          mayFillForms: true,
          allowedCompanyIds: [],
          allowedAts: [],
          alwaysReviewCategories: [
            'legal',
            'consent',
            'bond',
            'work_auth',
            'salary',
            'notice',
            'relocation',
            'background',
            'sensitive',
            'eeo',
          ],
          notificationPrefs: {},
          submissionMode: 'manual_handover',
          maxDailyApplications: 5,
          confirm: true,
          reason: 'User approved Level 2 via API',
        }),
      });

      const res = await putAutonomy(putReq);
      expect(res.status).toBe(200);

      const histRes = await getAutonomyHistory();
      expect(histRes.status).toBe(200);
      const history = await histRes.json();
      expect(history.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Reusable Answers API', () => {
    let answerId: string;

    it('creates reusable answer and fetches list via /api/reusable-answers', async () => {
      const postReq = new NextRequest('http://127.0.0.1:3000/api/reusable-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionKey: 'api_test_auth',
          questionPatterns: ['authorized to work in UK'],
          answer: { value: 'Yes' },
          category: 'work_auth',
          coreCategoryConfirmed: true,
        }),
      });

      const postRes = await postAnswers(postReq);
      expect(postRes.status).toBe(201);
      const created = await postRes.json();
      answerId = created.id;
      expect(created.questionKey).toBe('api_test_auth');

      const getReq = new NextRequest('http://127.0.0.1:3000/api/reusable-answers');
      const getRes = await getAnswers(getReq);
      expect(getRes.status).toBe(200);
      const list = await getRes.json();
      expect(list.some((a: { id: string }) => a.id === answerId)).toBe(true);
    });

    it('cleans up test answer via DELETE /api/reusable-answers/[id]', async () => {
      if (answerId) {
        const delReq = new NextRequest(`http://127.0.0.1:3000/api/reusable-answers/${answerId}`, { method: 'DELETE' });
        const delRes = await deleteAnswer(delReq, { params: Promise.resolve({ id: answerId }) });
        expect(delRes.status).toBe(200);
      }
    });
  });
});
