// Application Tracking & Lifecycle Service (Doc 07 §tracking, Doc 08 §72, Doc 10 §3, Doc 14 §3)
import { getDb } from '@/shared/db';
import {
  applications,
  applicationEvents,
  applicationContacts,
  applicationInterviews,
  applicationNotes,
  applicationSubmissions,
} from '@/db/schema/applications';
import { jobs } from '@/db/schema/jobs';
import { companies } from '@/db/schema/companies';
import { humanReviewRequests } from '@/db/schema/workflows';
import { workerHeartbeats, systemSettings } from '@/db/schema/infra';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { AppError } from '@/shared/errors';
import {
  canTransitionLifecycle,
  getPipelineStage,
  ApplicationStatus,
  PipelineStage,
} from './domain/lifecycle';
import { classifyEmailContent } from './domain/email-classifier';
import { notify } from '@/modules/notification';

// ---------------------------------------------------------------------------
// 1. Lifecycle Transitions (Doc 10 §3, Doc 03 FR-TRK-1, FR-TRK-3)
// ---------------------------------------------------------------------------

export interface TransitionParams {
  applicationId: string;
  toStatus: ApplicationStatus;
  actor: 'user' | 'system' | 'email_suggestion' | 'policy';
  evidence?: Record<string, unknown>;
  details?: Record<string, unknown>;
}

export async function transitionApplication(params: TransitionParams) {
  const db = getDb();

  const [app] = await db
    .select({
      id: applications.id,
      status: applications.status,
      jobId: applications.jobId,
    })
    .from(applications)
    .where(eq(applications.id, params.applicationId))
    .limit(1);

  if (!app) {
    throw new AppError('NOT_FOUND', `Application not found: ${params.applicationId}`);
  }

  const check = canTransitionLifecycle(app.status, params.toStatus, params.actor);
  if (!check.allowed) {
    throw new AppError('VALIDATION', check.reason || 'Invalid lifecycle transition');
  }

  const now = new Date();

  return await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(applications)
      .set({
        status: params.toStatus,
        lastActivityAt: now,
        updatedAt: now,
      })
      .where(eq(applications.id, params.applicationId))
      .returning();

    await tx.insert(applicationEvents).values({
      applicationId: params.applicationId,
      type: 'status_transition',
      fromStatus: app.status,
      toStatus: params.toStatus,
      actor: params.actor,
      details: {
        ...(params.details || {}),
        evidence: params.evidence || null,
      },
      at: now,
    });

    // Notify user of high-value status changes
    if (['interview_scheduled', 'offer_received', 'rejected'].includes(params.toStatus)) {
      await notify({
        type: 'application_update',
        severity: params.toStatus === 'offer_received' ? 'success' : params.toStatus === 'rejected' ? 'info' : 'warn',
        title: `Application Status: ${params.toStatus.replace('_', ' ').toUpperCase()}`,
        body: `Application status transitioned to ${params.toStatus}.`,
        link: `/applications/${params.applicationId}`,
        dedupeKey: `app_status:${params.applicationId}:${params.toStatus}`,
        entityType: 'application',
        entityId: params.applicationId,
      });
    }

    return updated;
  });
}

// ---------------------------------------------------------------------------
// 2. Contacts Management (Doc 08 §72, Doc 03 FR-TRK-4)
// ---------------------------------------------------------------------------

export interface ContactInput {
  name: string;
  email?: string | null;
  role?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  notes?: string | null;
}

export async function addContact(applicationId: string, data: ContactInput) {
  const db = getDb();
  const [contact] = await db
    .insert(applicationContacts)
    .values({
      applicationId,
      name: data.name,
      email: data.email || null,
      role: data.role || null,
      phone: data.phone || null,
      linkedinUrl: data.linkedinUrl || null,
      notes: data.notes || null,
    })
    .returning();
  return contact;
}

export async function updateContact(contactId: string, data: Partial<ContactInput>) {
  const db = getDb();
  const [updated] = await db
    .update(applicationContacts)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(applicationContacts.id, contactId))
    .returning();
  return updated;
}

export async function deleteContact(contactId: string) {
  const db = getDb();
  await db.delete(applicationContacts).where(eq(applicationContacts.id, contactId));
}

export async function listContacts(applicationId: string) {
  const db = getDb();
  return db
    .select()
    .from(applicationContacts)
    .where(eq(applicationContacts.applicationId, applicationId))
    .orderBy(desc(applicationContacts.createdAt));
}

// ---------------------------------------------------------------------------
// 3. Interviews Management (Doc 08 §72, Doc 03 FR-TRK-4)
// ---------------------------------------------------------------------------

export interface InterviewInput {
  stage: string;
  title: string;
  scheduledAt: Date;
  durationMinutes?: number;
  interviewerNames?: string | null;
  meetingUrl?: string | null;
  notes?: string | null;
  feedback?: string | null;
}

export async function scheduleInterview(applicationId: string, data: InterviewInput) {
  const db = getDb();

  const [interview] = await db
    .insert(applicationInterviews)
    .values({
      applicationId,
      stage: data.stage,
      title: data.title,
      scheduledAt: data.scheduledAt,
      durationMinutes: data.durationMinutes || 45,
      interviewerNames: data.interviewerNames || null,
      meetingUrl: data.meetingUrl || null,
      notes: data.notes || null,
      feedback: data.feedback || null,
    })
    .returning();

  if (!interview) {
    throw new AppError('INTERNAL', 'Failed to create interview record');
  }

  // If application is in submitted or under_review, update to interview_scheduled
  const [app] = await db
    .select({ status: applications.status })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (app && ['submitted', 'under_review', 'assessment_received'].includes(app.status)) {
    await transitionApplication({
      applicationId,
      toStatus: 'interview_scheduled',
      actor: 'user',
      details: { interviewId: interview.id, stage: data.stage },
    });
  }

  // Notify user of upcoming interview
  await notify({
    type: 'interview_upcoming',
    severity: 'info',
    title: `Interview Scheduled: ${data.title}`,
    body: `Interview stage "${data.stage}" scheduled for ${data.scheduledAt.toISOString()}`,
    link: `/applications/${applicationId}`,
    dedupeKey: `interview:${interview.id}`,
    entityType: 'application',
    entityId: applicationId,
  });

  return interview;
}

export async function updateInterview(
  interviewId: string,
  data: Partial<InterviewInput & { status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled' }>
) {
  const db = getDb();
  const [updated] = await db
    .update(applicationInterviews)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(applicationInterviews.id, interviewId))
    .returning();
  return updated;
}

export async function deleteInterview(interviewId: string) {
  const db = getDb();
  await db.delete(applicationInterviews).where(eq(applicationInterviews.id, interviewId));
}

export async function listInterviews(applicationId: string) {
  const db = getDb();
  return db
    .select()
    .from(applicationInterviews)
    .where(eq(applicationInterviews.applicationId, applicationId))
    .orderBy(desc(applicationInterviews.scheduledAt));
}

// ---------------------------------------------------------------------------
// 4. Notes & Events Management (Doc 08 §69, §72)
// ---------------------------------------------------------------------------

export async function addNote(applicationId: string, content: string) {
  const db = getDb();
  const [note] = await db
    .insert(applicationNotes)
    .values({ applicationId, content })
    .returning();
  return note;
}

export async function deleteNote(noteId: string) {
  const db = getDb();
  await db.delete(applicationNotes).where(eq(applicationNotes.id, noteId));
}

export async function listNotes(applicationId: string) {
  const db = getDb();
  return db
    .select()
    .from(applicationNotes)
    .where(eq(applicationNotes.applicationId, applicationId))
    .orderBy(desc(applicationNotes.createdAt));
}

export async function listEvents(applicationId: string) {
  const db = getDb();
  return db
    .select()
    .from(applicationEvents)
    .where(eq(applicationEvents.applicationId, applicationId))
    .orderBy(desc(applicationEvents.at));
}

// ---------------------------------------------------------------------------
// 5. Inbound Email Processing (Opt-In Only, User Q15, Doc 03 FR-TRK-2)
// ---------------------------------------------------------------------------

export async function isEmailMonitoringOptedIn(): Promise<boolean> {
  if (process.env.EMAIL_MONITORING_ENABLED !== 'true') {
    return false;
  }
  const db = getDb();
  const [setting] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, 'email_monitoring.enabled'))
    .limit(1);

  return setting?.value === true;
}

export interface InboundEmailPayload {
  subject: string;
  bodySnippet: string;
  fromAddress?: string;
}

export async function processInboundEmailSuggestion(payload: InboundEmailPayload) {
  const isOptedIn = await isEmailMonitoringOptedIn();
  if (!isOptedIn) {
    throw new AppError(
      'FORBIDDEN',
      'Email monitoring is strictly opt-in and currently disabled. Enable EMAIL_MONITORING_ENABLED=true and settings toggle.'
    );
  }

  const suggestion = classifyEmailContent(payload.subject, payload.bodySnippet);

  // If a potential match is found, identify the matching application
  const db = getDb();
  let matchedApp: { id: string; jobTitle: string; companyName: string; currentStatus: string } | null = null;

  if (suggestion.isMatch && payload.fromAddress) {
    const fromDomain = payload.fromAddress.split('@')[1]?.toLowerCase();
    if (fromDomain) {
      const [candidate] = await db
        .select({
          id: applications.id,
          jobTitle: jobs.title,
          companyName: companies.name,
          currentStatus: applications.status,
        })
        .from(applications)
        .innerJoin(jobs, eq(applications.jobId, jobs.id))
        .innerJoin(companies, eq(jobs.companyId, companies.id))
        .where(
          and(
            sql`LOWER(${companies.primaryDomain}) = ${fromDomain}`,
            sql`${applications.status} NOT IN ('rejected', 'withdrawn', 'closed')`
          )
        )
        .limit(1);

      if (candidate) {
        matchedApp = candidate;
      }
    }
  }

  return {
    suggestion,
    matchedApplication: matchedApp,
    requiresUserConfirmation: true, // FR-TRK-2 Invariant: Always requires user confirmation
  };
}

// ---------------------------------------------------------------------------
// 6. Dashboard & Kanban Real DB Queries (Doc 14 §3, Doc 07 §tracking)
// ---------------------------------------------------------------------------

export async function getDashboardStats() {
  const db = getDb();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Real DB count: new today (jobs created in last 24h)
  const [newJobsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(gte(jobs.createdAt, oneDayAgo));

  // Real DB count: worth considering (active recommendations >= consider)
  const [worthConsideringRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(
      and(
        sql`status NOT IN ('rejected', 'archived')`,
        sql`recommendation IN ('strong_match', 'match', 'consider')`
      )
    );

  // Real DB count: needs review (pending human review requests)
  const [needsReviewRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(humanReviewRequests)
    .where(eq(humanReviewRequests.status, 'pending'));

  // Real DB count: in progress (active applications not closed)
  const [inProgressRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(
      sql`status NOT IN ('rejected', 'withdrawn', 'closed')`
    );

  // Worker status: offline banner if last_seen_at > 60s
  const [latestHeartbeat] = await db
    .select()
    .from(workerHeartbeats)
    .orderBy(desc(workerHeartbeats.lastSeenAt))
    .limit(1);

  const isWorkerOnline = latestHeartbeat
    ? Date.now() - new Date(latestHeartbeat.lastSeenAt).getTime() <= 60000
    : false;

  return {
    newToday: newJobsRow?.count ?? 0,
    worthConsidering: worthConsideringRow?.count ?? 0,
    needsReview: needsReviewRow?.count ?? 0,
    inProgress: inProgressRow?.count ?? 0,
    worker: {
      online: isWorkerOnline,
      lastSeenAt: latestHeartbeat?.lastSeenAt ?? null,
      workerId: latestHeartbeat?.workerId ?? null,
    },
  };
}

export async function getNeedsAttentionItems() {
  const db = getDb();

  // Pending review requests
  const reviews = await db
    .select({
      id: humanReviewRequests.id,
      category: humanReviewRequests.category,
      question: humanReviewRequests.question,
      createdAt: humanReviewRequests.createdAt,
      jobId: humanReviewRequests.jobId,
      applicationId: humanReviewRequests.applicationId,
    })
    .from(humanReviewRequests)
    .where(eq(humanReviewRequests.status, 'pending'))
    .orderBy(humanReviewRequests.createdAt)
    .limit(10);

  // Unverified submissions
  const unverified = await db
    .select({
      submissionId: applicationSubmissions.id,
      applicationId: applicationSubmissions.applicationId,
      jobTitle: jobs.title,
      companyName: companies.name,
      clickedAt: applicationSubmissions.clickedAt,
    })
    .from(applicationSubmissions)
    .innerJoin(applications, eq(applicationSubmissions.applicationId, applications.id))
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(applicationSubmissions.status, 'unverified'))
    .limit(5);

  return {
    reviews,
    unverifiedSubmissions: unverified,
  };
}

export async function getUpcomingDeadlines() {
  const db = getDb();
  const now = new Date();

  // Upcoming interviews
  const upcomingInterviews = await db
    .select({
      id: applicationInterviews.id,
      applicationId: applicationInterviews.applicationId,
      stage: applicationInterviews.stage,
      title: applicationInterviews.title,
      scheduledAt: applicationInterviews.scheduledAt,
      durationMinutes: applicationInterviews.durationMinutes,
      meetingUrl: applicationInterviews.meetingUrl,
      companyName: companies.name,
      jobTitle: jobs.title,
    })
    .from(applicationInterviews)
    .innerJoin(applications, eq(applicationInterviews.applicationId, applications.id))
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(
      and(
        eq(applicationInterviews.status, 'scheduled'),
        gte(applicationInterviews.scheduledAt, now)
      )
    )
    .orderBy(applicationInterviews.scheduledAt)
    .limit(10);

  return {
    interviews: upcomingInterviews,
  };
}

export async function getRecentActivity(limit = 10) {
  const db = getDb();

  return db
    .select({
      id: applicationEvents.id,
      applicationId: applicationEvents.applicationId,
      type: applicationEvents.type,
      fromStatus: applicationEvents.fromStatus,
      toStatus: applicationEvents.toStatus,
      actor: applicationEvents.actor,
      details: applicationEvents.details,
      at: applicationEvents.at,
      jobTitle: jobs.title,
      companyName: companies.name,
    })
    .from(applicationEvents)
    .innerJoin(applications, eq(applicationEvents.applicationId, applications.id))
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .orderBy(desc(applicationEvents.at))
    .limit(limit);
}

export async function getTrackedApplications(filters?: { stage?: PipelineStage; status?: string }) {
  const db = getDb();

  const query = db
    .select({
      id: applications.id,
      status: applications.status,
      jobId: applications.jobId,
      platform: applications.platform,
      applicationUrl: applications.applicationUrl,
      appliedAt: applications.appliedAt,
      lastActivityAt: applications.lastActivityAt,
      notes: applications.notes,
      jobTitle: jobs.title,
      companyId: companies.id,
      companyName: companies.name,
      companyDomain: companies.primaryDomain,
    })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .orderBy(desc(applications.lastActivityAt));

  const rows = await query;

  return rows
    .map((r) => ({
      ...r,
      pipelineStage: getPipelineStage(r.status),
    }))
    .filter((r) => {
      if (filters?.stage && r.pipelineStage !== filters.stage) return false;
      if (filters?.status && r.status !== filters.status) return false;
      return true;
    });
}
