import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  candidateProfiles,
  jobPreferences,
  autonomyPolicies,
  reusableApplicationAnswers,
} from '@/db/schema/profile';
import {
  getOrCreateProfile,
  updateProfile,
  getProfileRevisions,
  addEmail,
  deleteEmail,
  addPhone,
  deletePhone,
  addWorkAuth,
  addEducation,
  addExperience,
  addSkill,
  calculateCompleteness,
  getVerifiedSnapshot,
  getPreferences,
  updatePreferences,
  getAutonomyPolicy,
  updateAutonomyPolicy,
  getAutonomyPolicyHistory,
  createReusableAnswer,
  getReusableAnswers,
  matchReusableAnswer,
  deleteReusableAnswer,
} from '@/modules/profile';
import { getDb, closeDbPool } from '@/shared/db';
import { AppError } from '@/shared/errors';

describe('Profile, Preferences & Autonomy Module', () => {
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

  describe('Candidate Profile & Revisions', () => {
    it('creates and updates profile with automatic revision snapshots', async () => {
      const initial = await getOrCreateProfile();
      expect(initial.isSingleton).toBe(true);

      const updated = await updateProfile(
        {
          fullName: 'Ada Lovelace',
          headline: 'Pioneer Computer Scientist',
          summary: 'First programmer in history.',
          timezone: 'Europe/London',
          currentCity: 'London',
          currentCountry: 'United Kingdom',
          address: 'St. James Square',
          preferredContact: 'email',
          noticePeriodDays: 30,
          currentEmploymentStatus: 'employed',
        },
        'Profile initial setup'
      );

      expect(updated.fullName).toBe('Ada Lovelace');
      expect(updated.headline).toBe('Pioneer Computer Scientist');
      expect(updated.currentCity).toBe('London');

      const revisions = await getProfileRevisions();
      expect(revisions.length).toBeGreaterThanOrEqual(1);
      expect(revisions[0]!.reason).toBe('Profile initial setup');
      expect((revisions[0]!.snapshot as Record<string, unknown>).fullName).toBe('Ada Lovelace');
    });

    it('calculates profile completeness percentage accurately', async () => {
      const profile = await getOrCreateProfile();
      const completeness = calculateCompleteness(profile);

      expect(completeness.score).toBeGreaterThanOrEqual(20);
      expect(completeness.breakdown).toHaveProperty('personal');
      expect(completeness.breakdown).toHaveProperty('contact');
      expect(completeness.breakdown).toHaveProperty('experience');
      expect(completeness.breakdown).toHaveProperty('skills');
      expect(Array.isArray(completeness.missingFields)).toBe(true);
    });
  });

  describe('Section Items & Verified Snapshot Isolation', () => {
    let emailId: string;
    let phoneId: string;

    it('adds email, phone, work authorization, education, experience, and skills', async () => {
      const email = await addEmail('ada.lovelace@example.com', true);
      emailId = email!.id;
      expect(email!.isPrimary).toBe(true);
      expect(email!.verified).toBe(true);

      const phone = await addPhone('+441234567890', true);
      phoneId = phone!.id;
      expect(phone!.isPrimary).toBe(true);
      expect(phone!.verified).toBe(true);

      const workAuth = await addWorkAuth('United Kingdom', 'citizen');
      expect(workAuth!.country).toBe('United Kingdom');
      expect(workAuth!.verification).toBe('verified');

      const edu = await addEducation({
        institution: 'University of London',
        degree: 'Bachelor of Mathematics',
        department: 'Mathematics',
        startYear: 1832,
        graduationYear: 1836,
      });
      expect(edu!.degree).toBe('Bachelor of Mathematics');

      const exp = await addExperience({
        org: 'Analytical Engine Labs',
        title: 'Lead Algorithm Designer',
        kind: 'job',
        startDate: '1842-01',
        responsibilities: ['Authored first computer program for Bernoulli numbers'],
      });
      expect(exp!.org).toBe('Analytical Engine Labs');

      const skill1 = await addSkill({ name: 'Algorithms', category: 'other', proficiency: 5 });
      const skill2 = await addSkill({ name: 'Mathematics', category: 'other', proficiency: 5 });
      const skill3 = await addSkill({ name: 'Logic', category: 'other', proficiency: 5 });
      expect(skill1!.name).toBe('Algorithms');
      expect(skill2!.name).toBe('Mathematics');
      expect(skill3!.name).toBe('Logic');
    });

    it('produces a verified snapshot containing strictly verified information', async () => {
      const snapshot = await getVerifiedSnapshot();
      expect(snapshot.fullName).toBe('Ada Lovelace');
      expect(snapshot.primaryEmail).toBe('ada.lovelace@example.com');
      expect(snapshot.primaryPhone).toBe('+441234567890');
      expect(snapshot.workAuthorizations.length).toBeGreaterThanOrEqual(1);
      expect(snapshot.experience.length).toBeGreaterThanOrEqual(1);
      expect(snapshot.skills.length).toBeGreaterThanOrEqual(3);
    });

    it('cleans up test email and phone', async () => {
      if (emailId) await deleteEmail(emailId);
      if (phoneId) await deletePhone(phoneId);
    });
  });

  describe('Job Preferences & Scoring Weights', () => {
    it('updates preferences when scoring weights sum to 100', async () => {
      const current = await getPreferences();
      expect(current.isSingleton).toBe(true);

      const updated = await updatePreferences({
        preferredRoles: ['Software Engineer', 'AI Research Engineer'],
        excludedRoles: ['Sales Manager'],
        industries: ['Technology', 'AI'],
        excludedIndustries: ['Gambling'],
        locations: [{ city: 'London', country: 'United Kingdom', remoteOk: true }],
        workModes: ['remote', 'hybrid'],
        minComp: 100000,
        preferredComp: 150000,
        compCurrency: 'GBP',
        compPeriod: 'annual',
        experienceLevels: ['senior'],
        employmentTypes: ['full_time'],
        prioritizedCompanies: ['DeepMind'],
        excludedCompanies: [],
        maxNoticePeriodDays: 30,
        relocation: 'within_country',
        scoringWeights: {
          roleFit: 35,
          skillMatch: 25,
          comp: 20,
          location: 10,
          companyReputation: 10,
        },
      });

      expect(updated!.preferredRoles).toContain('AI Research Engineer');
      expect(updated!.compCurrency).toBe('GBP');
      expect((updated!.scoringWeights as Record<string, number>).roleFit).toBe(35);
    });

    it('rejects preferences update when scoring weights do not sum to 100', async () => {
      await expect(
        updatePreferences({
          preferredRoles: [],
          excludedRoles: [],
          industries: [],
          excludedIndustries: [],
          locations: [],
          workModes: [],
          minComp: null,
          preferredComp: null,
          compCurrency: 'INR',
          compPeriod: 'annual',
          experienceLevels: [],
          employmentTypes: [],
          prioritizedCompanies: [],
          excludedCompanies: [],
          maxNoticePeriodDays: null,
          relocation: null,
          scoringWeights: {
            roleFit: 50,
            skillMatch: 20,
            comp: 10,
            location: 10,
            companyReputation: 5, // sum = 95 != 100
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Autonomy Policies & Safety Boundaries', () => {
    it('retrieves default Level 1 autonomy policy with core review categories', async () => {
      const policy = await getAutonomyPolicy();
      expect(policy.level).toBe(1);
      expect(policy.submissionMode).toBe('manual_handover');
      expect(policy.alwaysReviewCategories).toContain('legal');
      expect(policy.alwaysReviewCategories).toContain('consent');
      expect(policy.alwaysReviewCategories).toContain('bond');
      expect(policy.alwaysReviewCategories).toContain('salary');
      expect(policy.alwaysReviewCategories).toContain('eeo');
    });

    it('requires explicit confirmation (confirm: true) to elevate autonomy permissions', async () => {
      await expect(
        updateAutonomyPolicy({
          level: 2,
          autoShortlist: false,
          shortlistThreshold: 70,
          mayPrepareApplications: true, // Elevating!
          mayFillForms: true, // Elevating!
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
        })
      ).rejects.toThrowError(AppError);
    });

    it('successfully elevates to Level 2 with explicit confirm: true and records history', async () => {
      const updated = await updateAutonomyPolicy(
        {
          level: 2,
          autoShortlist: false,
          shortlistThreshold: 75,
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
        },
        { confirm: true, reason: 'User enabled Level 2 application preparation' }
      );

      expect(updated!.level).toBe(2);
      expect(updated!.mayPrepareApplications).toBe(true);

      const history = await getAutonomyPolicyHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0]!.reason).toContain('User enabled Level 2');
    });

    it('rejects autonomy level 3 (strictly Level 1 or Level 2)', async () => {
      await expect(
        updateAutonomyPolicy({
          // @ts-expect-error Level 3 is not permitted
          level: 3,
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
        })
      ).rejects.toThrow();
    });
  });

  describe('Reusable Application Answers & Pattern Matching', () => {
    let testAnswerId: string;

    it('rejects core category answers if coreCategoryConfirmed is false', async () => {
      await expect(
        createReusableAnswer({
          questionKey: 'work_auth_us',
          questionPatterns: ['authorized to work in the United States'],
          answer: { value: 'Yes' },
          category: 'work_auth',
          coreCategoryConfirmed: false, // Must be true for core categories!
        })
      ).rejects.toThrow();
    });

    it('creates authorized reusable answer with coreCategoryConfirmed', async () => {
      const created = await createReusableAnswer({
        questionKey: 'work_auth_uk_test',
        questionPatterns: ['authorized to work in the UK', 'eligible to work in the United Kingdom'],
        answer: { value: 'Yes', citizen: true },
        category: 'work_auth',
        coreCategoryConfirmed: true,
        authorizedNote: 'UK citizen by birth',
      });

      testAnswerId = created.id;
      expect(created.questionKey).toBe('work_auth_uk_test');
      expect(created.coreCategoryConfirmed).toBe(true);

      const all = await getReusableAnswers();
      expect(all.length).toBeGreaterThanOrEqual(1);
    });

    it('matches question text against patterns and increments use count', async () => {
      const matched = await matchReusableAnswer('Are you legally eligible to work in the United Kingdom?');
      expect(matched).not.toBeNull();
      expect(matched?.questionKey).toBe('work_auth_uk_test');
      expect(matched?.useCount).toBeGreaterThanOrEqual(1);
    });

    it('cleans up reusable answer', async () => {
      if (testAnswerId) {
        await deleteReusableAnswer(testAnswerId);
      }
    });
  });
});
