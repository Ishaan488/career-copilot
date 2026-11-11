import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '@/shared/db';
import { applications } from '@/db/schema/applications';
import { jobs } from '@/db/schema/jobs';
import { companies } from '@/db/schema/companies';
import { systemSettings } from '@/db/schema/infra';
import {
  transitionApplication,
  addContact,
  updateContact,
  deleteContact,
  listContacts,
  scheduleInterview,
  updateInterview,
  deleteInterview,
  listInterviews,
  addNote,
  deleteNote,
  listNotes,
  listEvents,
  getDashboardStats,
  getUpcomingDeadlines,
  getRecentActivity,
  getTrackedApplications,
  processInboundEmailSuggestion,
} from '@/modules/tracking/service';
import { eq } from 'drizzle-orm';

describe('Application Tracking Service & Dashboard (Doc 07 §tracking, Doc 08 §72, Doc 10 §3)', () => {
  const db = getDb();
  let testAppId: string;
  let testDomain: string;

  beforeEach(async () => {
    const timestamp = Date.now();
    testDomain = `acme-${timestamp}.com`;
    // Set up test company, job, and application
    const [comp] = await db
      .insert(companies)
      .values({
        name: `Acme Corp ${timestamp}`,
        normalizedName: `acme corp ${timestamp}`,
        primaryDomain: testDomain,
      })
      .returning();

    const [jb] = await db
      .insert(jobs)
      .values({
        companyId: comp!.id,
        title: 'Senior Distributed Systems Engineer',
        normalizedTitle: 'senior distributed systems engineer',
        descriptionText: 'Design and build distributed consensus and fault-tolerant storage engines.',
        descriptionHash: `hash-${timestamp}`,
        applicationUrl: `https://boards.greenhouse.io/acme/jobs/${timestamp}`,
        canonicalUrl: `https://boards.greenhouse.io/acme/jobs/${timestamp}`,
        status: 'shortlisted',
        recommendation: 'strong_match',
      })
      .returning();

    const [app] = await db
      .insert(applications)
      .values({
        jobId: jb!.id,
        dedupeKey: `acme:${Date.now()}`,
        status: 'submitted',
        platform: 'greenhouse',
        applicationUrl: jb!.applicationUrl!,
      })
      .returning();
    testAppId = app!.id;
  });

  describe('Application Lifecycle Transitions', () => {
    it('transitions application status and records an immutable audit event', async () => {
      const updated = await transitionApplication({
        applicationId: testAppId,
        toStatus: 'under_review',
        actor: 'user',
        details: { note: 'Confirmed receipt via email' },
      });

      expect(updated!.status).toBe('under_review');

      const events = await listEvents(testAppId);
      expect(events.length).toBeGreaterThanOrEqual(1);

      const transitionEvent = events.find((e) => e.type === 'status_transition');
      expect(transitionEvent).toBeDefined();
      expect(transitionEvent?.fromStatus).toBe('submitted');
      expect(transitionEvent?.toStatus).toBe('under_review');
      expect(transitionEvent?.actor).toBe('user');
    });

    it('rejects forbidden transitions with a validation error', async () => {
      await expect(
        transitionApplication({
          applicationId: testAppId,
          toStatus: 'ready_to_submit', // cannot jump from submitted back to ready_to_submit
          actor: 'user',
        })
      ).rejects.toThrow(/Cannot transition/);
    });
  });

  describe('Contacts Management', () => {
    it('manages recruiter contacts with full CRUD', async () => {
      const contact = await addContact(testAppId, {
        name: 'Jane Recruiter',
        email: 'jane@acme.com',
        role: 'Lead Tech Recruiter',
        phone: '+1 555 0199',
        linkedinUrl: 'https://linkedin.com/in/janerecruiter',
        notes: 'Initial recruiter point of contact',
      });

      expect(contact!.id).toBeTruthy();
      expect(contact!.name).toBe('Jane Recruiter');

      const contactsList = await listContacts(testAppId);
      expect(contactsList.some((c) => c.id === contact!.id)).toBe(true);

      const updated = await updateContact(contact!.id, {
        role: 'Principal Recruiter',
      });
      expect(updated!.role).toBe('Principal Recruiter');

      await deleteContact(contact!.id);
      const afterDelete = await listContacts(testAppId);
      expect(afterDelete.some((c) => c.id === contact!.id)).toBe(false);
    });
  });

  describe('Interviews Management', () => {
    it('schedules an interview and transitions submitted application to interview_scheduled', async () => {
      const interviewDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days in future

      const interview = await scheduleInterview(testAppId, {
        stage: 'technical',
        title: 'Technical Deep Dive & Architecture',
        scheduledAt: interviewDate,
        durationMinutes: 60,
        interviewerNames: 'Alice (Staff Eng), Bob (Tech Lead)',
        meetingUrl: 'https://meet.google.com/xyz-abc',
        notes: 'Focus on distributed consensus and database sharding',
      });

      expect(interview.id).toBeTruthy();
      expect(interview.stage).toBe('technical');

      // Verify application status transitioned
      const [app] = await db
        .select({ status: applications.status })
        .from(applications)
        .where(eq(applications.id, testAppId));
      expect(app!.status).toBe('interview_scheduled');

      // Verify interview listing
      const interviews = await listInterviews(testAppId);
      expect(interviews.some((i) => i.id === interview.id)).toBe(true);

      // Verify update
      const updated = await updateInterview(interview.id, {
        status: 'completed',
        feedback: 'Strong performance on consensus and fault tolerance',
      });
      expect(updated!.status).toBe('completed');
      expect(updated!.feedback).toContain('Strong performance');

      await deleteInterview(interview.id);
      const afterDelete = await listInterviews(testAppId);
      expect(afterDelete.some((i) => i.id === interview.id)).toBe(false);
    });
  });

  describe('Notes Management', () => {
    it('adds and lists user application notes', async () => {
      const note = await addNote(testAppId, 'Team is migrating from DynamoDB to ScyllaDB');
      expect(note!.id).toBeTruthy();
      expect(note!.content).toContain('DynamoDB');

      const notes = await listNotes(testAppId);
      expect(notes.some((n) => n.id === note!.id)).toBe(true);

      await deleteNote(note!.id);
      const afterDelete = await listNotes(testAppId);
      expect(afterDelete.some((n) => n.id === note!.id)).toBe(false);
    });
  });

  describe('Real DB Dashboard & Kanban Queries', () => {
    it('calculates dashboard metrics from actual database rows without mock data', async () => {
      const stats = await getDashboardStats();

      expect(typeof stats.newToday).toBe('number');
      expect(stats.newToday).toBeGreaterThanOrEqual(1);

      expect(typeof stats.worthConsidering).toBe('number');
      expect(stats.worthConsidering).toBeGreaterThanOrEqual(1);

      expect(typeof stats.inProgress).toBe('number');
      expect(stats.inProgress).toBeGreaterThanOrEqual(1);

      expect(stats.worker).toBeDefined();
    });

    it('queries upcoming deadlines and tracked applications with pipeline stages', async () => {
      // Schedule an interview
      await scheduleInterview(testAppId, {
        stage: 'recruiter_screen',
        title: 'Recruiter Chat',
        scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      });

      const deadlines = await getUpcomingDeadlines();
      expect(deadlines.interviews.length).toBeGreaterThanOrEqual(1);

      const tracked = await getTrackedApplications();
      expect(tracked.length).toBeGreaterThanOrEqual(1);

      const ourApp = tracked.find((a) => a.id === testAppId);
      expect(ourApp).toBeDefined();
      expect(ourApp?.pipelineStage).toBe('interviewing');
    });

    it('retrieves recent chronological activity', async () => {
      await transitionApplication({
        applicationId: testAppId,
        toStatus: 'under_review',
        actor: 'user',
      });

      const activity = await getRecentActivity(5);
      expect(activity.length).toBeGreaterThanOrEqual(1);
      expect(activity[0]!.type).toBe('status_transition');
    });
  });

  describe('Opt-In Inbound Email Monitoring (User Q15, Doc 03 FR-TRK-2)', () => {
    it('throws FORBIDDEN when email monitoring is disabled', async () => {
      delete process.env.EMAIL_MONITORING_ENABLED;

      await expect(
        processInboundEmailSuggestion({
          subject: 'Interview with Acme',
          bodySnippet: 'Invitation to interview on Calendly',
        })
      ).rejects.toThrow(/opt-in and currently disabled/);
    });

    it('processes inbound email when opted in and yields suggestions without mutating DB', async () => {
      process.env.EMAIL_MONITORING_ENABLED = 'true';
      await db
        .insert(systemSettings)
        .values({
          key: 'email_monitoring.enabled',
          value: true,
        })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: true },
        });

      const result = await processInboundEmailSuggestion({
        subject: 'Invitation to interview for Senior Distributed Systems Engineer',
        bodySnippet: 'We would like to interview you for the role. Please schedule a slot.',
        fromAddress: `recruiting@${testDomain}`,
      });

      expect(result.suggestion.isMatch).toBe(true);
      expect(result.suggestion.suggestedStatus).toBe('interview_scheduled');
      expect(result.requiresUserConfirmation).toBe(true);
      expect(result.matchedApplication?.id).toBe(testAppId);

      // Verify DB was NOT modified automatically (FR-TRK-2 Invariant)
      const [app] = await db
        .select({ status: applications.status })
        .from(applications)
        .where(eq(applications.id, testAppId));
      expect(app!.status).toBe('submitted'); // Still 'submitted', never auto-mutated
    });
  });
});
