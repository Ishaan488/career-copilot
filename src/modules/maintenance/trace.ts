import { getDb } from '@/shared/db';
import { AppError } from '@/shared/errors';
import {
  jobs,
  jobSourceListings,
  jobSnapshots,
  jobEvaluations,
  companyResearch,
  companyResearchEvidence,
  companies,
  jobSources,
  applications,
  applicationEvents,
  applicationTasks,
  applicationFormFields,
  applicationFieldAnswers,
  applicationAuthorizations,
  applicationSubmissions,
  applicationContacts,
  applicationInterviews,
  applicationNotes,
  humanReviewRequests,
  agentExecutionLogs,
  aiRequests,
} from '@/db/schema';
import { eq, desc, inArray } from 'drizzle-orm';

export type TraceEntityType = 'job' | 'application' | 'company';

export interface TraceGraph {
  type: TraceEntityType;
  id: string;
  generatedAt: string;
  root: Record<string, unknown>;
  provenance: {
    sources?: Record<string, unknown>[];
    snapshots?: Record<string, unknown>[];
    evaluations?: Record<string, unknown>[];
    research?: Record<string, unknown>[];
    evidence?: Record<string, unknown>[];
    applications?: Record<string, unknown>[];
    events?: Record<string, unknown>[];
    formFields?: Record<string, unknown>[];
    submissions?: Record<string, unknown>[];
    contacts?: Record<string, unknown>[];
    interviews?: Record<string, unknown>[];
    reviews?: Record<string, unknown>[];
    aiRequests?: Record<string, unknown>[];
    executionLogs?: Record<string, unknown>[];
  };
}

/**
 * Builds a complete traceability provenance graph for a job, application, or company (Doc 15 T-TRC).
 */
export async function getTraceGraph(type: TraceEntityType, id: string): Promise<TraceGraph> {
  const db = getDb();
  const generatedAt = new Date().toISOString();

  if (type === 'job') {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    if (!job) {
      throw new AppError('NOT_FOUND', `Job listing not found with id: ${id}`);
    }

    const listings = await db
      .select()
      .from(jobSourceListings)
      .where(eq(jobSourceListings.jobId, id));

    const listingIds = listings.map((l) => l.id);
    let snapshots: Record<string, unknown>[] = [];
    if (listingIds.length > 0) {
      snapshots = (await db
        .select()
        .from(jobSnapshots)
        .where(inArray(jobSnapshots.listingId, listingIds))
        .orderBy(desc(jobSnapshots.fetchedAt))) as unknown as Record<string, unknown>[];
    }

    const evals = await db
      .select()
      .from(jobEvaluations)
      .where(eq(jobEvaluations.jobId, id));

    let research: Record<string, unknown>[] = [];
    let evidence: Record<string, unknown>[] = [];
    if (job.companyId) {
      research = (await db
        .select()
        .from(companyResearch)
        .where(eq(companyResearch.companyId, job.companyId))) as unknown as Record<string, unknown>[];

      const researchIds = research.map((r) => r.id as string).filter(Boolean);
      if (researchIds.length > 0) {
        evidence = (await db
          .select()
          .from(companyResearchEvidence)
          .where(inArray(companyResearchEvidence.researchId, researchIds))) as unknown as Record<string, unknown>[];
      }
    }

    const appRows = await db
      .select()
      .from(applications)
      .where(eq(applications.jobId, id));

    const aiRows = await db
      .select({
        id: aiRequests.id,
        task: aiRequests.task,
        model: aiRequests.model,
        tokensIn: aiRequests.tokensIn,
        tokensOut: aiRequests.tokensOut,
        costEstimate: aiRequests.costEstimate,
        status: aiRequests.status,
        at: aiRequests.at,
      })
      .from(aiRequests)
      .where(eq(aiRequests.entityId, id))
      .orderBy(desc(aiRequests.at))
      .limit(50);

    const execLogs = await db
      .select()
      .from(agentExecutionLogs)
      .where(eq(agentExecutionLogs.jobId, id))
      .orderBy(desc(agentExecutionLogs.at));

    return {
      type: 'job',
      id,
      generatedAt,
      root: job as unknown as Record<string, unknown>,
      provenance: {
        sources: listings as unknown as Record<string, unknown>[],
        snapshots,
        evaluations: evals as unknown as Record<string, unknown>[],
        research,
        evidence,
        applications: appRows as unknown as Record<string, unknown>[],
        aiRequests: aiRows as unknown as Record<string, unknown>[],
        executionLogs: execLogs as unknown as Record<string, unknown>[],
      },
    };
  }

  if (type === 'application') {
    const [app] = await db.select().from(applications).where(eq(applications.id, id));
    if (!app) {
      throw new AppError('NOT_FOUND', `Application not found with id: ${id}`);
    }

    let job: Record<string, unknown> | null = null;
    let evals: Record<string, unknown>[] = [];
    if (app.jobId) {
      const [j] = await db.select().from(jobs).where(eq(jobs.id, app.jobId));
      if (j) job = j as unknown as Record<string, unknown>;

      evals = (await db
        .select()
        .from(jobEvaluations)
        .where(eq(jobEvaluations.jobId, app.jobId))) as unknown as Record<string, unknown>[];
    }

    const events = await db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, id))
      .orderBy(desc(applicationEvents.at));

    const tasks = await db
      .select()
      .from(applicationTasks)
      .where(eq(applicationTasks.applicationId, id));

    const formFields = await db
      .select()
      .from(applicationFormFields)
      .where(eq(applicationFormFields.applicationId, id));

    const fieldIds = formFields.map((f) => f.id);
    let answers: Record<string, unknown>[] = [];
    if (fieldIds.length > 0) {
      answers = (await db
        .select()
        .from(applicationFieldAnswers)
        .where(inArray(applicationFieldAnswers.fieldId, fieldIds))) as unknown as Record<string, unknown>[];
    }

    const authorizations = await db
      .select()
      .from(applicationAuthorizations)
      .where(eq(applicationAuthorizations.applicationId, id));

    const submissions = await db
      .select()
      .from(applicationSubmissions)
      .where(eq(applicationSubmissions.applicationId, id));

    const contacts = await db
      .select()
      .from(applicationContacts)
      .where(eq(applicationContacts.applicationId, id));

    const interviews = await db
      .select()
      .from(applicationInterviews)
      .where(eq(applicationInterviews.applicationId, id));

    const notes = await db
      .select()
      .from(applicationNotes)
      .where(eq(applicationNotes.applicationId, id));

    let reviews: Record<string, unknown>[] = [];
    if (app.workflowId) {
      reviews = (await db
        .select()
        .from(humanReviewRequests)
        .where(eq(humanReviewRequests.workflowId, app.workflowId))) as unknown as Record<string, unknown>[];
    }

    const execLogs = await db
      .select()
      .from(agentExecutionLogs)
      .where(eq(agentExecutionLogs.applicationId, id))
      .orderBy(desc(agentExecutionLogs.at));

    return {
      type: 'application',
      id,
      generatedAt,
      root: {
        ...(app as unknown as Record<string, unknown>),
        job,
        notes,
        tasks,
        authorizations,
      },
      provenance: {
        evaluations: evals,
        events: events as unknown as Record<string, unknown>[],
        formFields: formFields.map((f) => ({
          ...f,
          answer: answers.find((a) => (a as { fieldId?: string }).fieldId === f.id) || null,
        })) as unknown as Record<string, unknown>[],
        submissions: submissions as unknown as Record<string, unknown>[],
        contacts: contacts as unknown as Record<string, unknown>[],
        interviews: interviews as unknown as Record<string, unknown>[],
        reviews,
        executionLogs: execLogs as unknown as Record<string, unknown>[],
      },
    };
  }

  if (type === 'company') {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    if (!company) {
      throw new AppError('NOT_FOUND', `Company not found with id: ${id}`);
    }

    const sources = await db
      .select()
      .from(jobSources)
      .where(eq(jobSources.companyId, id));

    const research = await db
      .select()
      .from(companyResearch)
      .where(eq(companyResearch.companyId, id));

    const researchIds = research.map((r) => r.id).filter(Boolean);
    let evidence: Record<string, unknown>[] = [];
    if (researchIds.length > 0) {
      evidence = (await db
        .select()
        .from(companyResearchEvidence)
        .where(inArray(companyResearchEvidence.researchId, researchIds))) as unknown as Record<string, unknown>[];
    }

    const companyJobs = await db
      .select()
      .from(jobs)
      .where(eq(jobs.companyId, id))
      .orderBy(desc(jobs.firstDiscoveredAt));

    const jobIds = companyJobs.map((j) => j.id).filter(Boolean);
    let companyApps: Record<string, unknown>[] = [];
    if (jobIds.length > 0) {
      companyApps = (await db
        .select()
        .from(applications)
        .where(inArray(applications.jobId, jobIds))) as unknown as Record<string, unknown>[];
    }

    return {
      type: 'company',
      id,
      generatedAt,
      root: company as unknown as Record<string, unknown>,
      provenance: {
        sources: sources as unknown as Record<string, unknown>[],
        research: research as unknown as Record<string, unknown>[],
        evidence,
        snapshots: [],
        evaluations: [],
        applications: companyApps,
      },
    };
  }

  throw new AppError('VALIDATION', `Unsupported trace entity type: ${String(type)}`);
}
