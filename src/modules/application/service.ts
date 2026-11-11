import crypto from 'node:crypto';
import { getDb } from '@/shared/db';
import {
  applications,
  applicationTasks,
  workflowCheckpoints,
  jobs,
  companies,
  resumes,
  resumeVersions,
  humanReviewRequests,
} from '@/db/schema';
import { eq, and, desc, lte } from 'drizzle-orm';
import { AppError } from '@/shared/errors';
import { logger } from '@/shared/logger';
import { enqueue } from '@/modules/queue';
import { humanReviewService, ReviewCategory, ResponseSchema } from '@/modules/human-review';
import {
  StepContext,
  StepResult,
  WorkflowStep,
} from './domain/types';
import {
  detectAtsPlatform,
  executeResolveUrlStep,
  executeSelectResumeStep,
  executeVerifyDomainStep,
} from './domain/workflow-steps';

export class ApplicationService {
  /**
   * Initializes an application and workflow checkpoint for a given job.
   * Enforces deduplication: only one application per job.
   */
  async createFromJob(jobId: string): Promise<{
    applicationId: string;
    workflowId: string;
    status: string;
  }> {
    const db = getDb();

    // 1. Fetch job
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (!job) {
      throw new AppError('NOT_FOUND', `Job with id '${jobId}' not found.`);
    }

    // 2. Check for existing application
    const [existing] = await db
      .select()
      .from(applications)
      .where(eq(applications.jobId, jobId))
      .limit(1);

    if (existing) {
      logger.info({ jobId, applicationId: existing.id }, '[ApplicationService] Application already exists');
      return {
        applicationId: existing.id,
        workflowId: existing.workflowId || existing.id,
        status: existing.status,
      };
    }

    // 3. Compute dedupe key
    const rawTarget = `${job.companyId || 'nocompany'}:${job.applicationUrl || job.canonicalUrl || job.id}`;
    const dedupeKey = crypto.createHash('sha256').update(rawTarget).digest('hex');

    // 4. Create workflow ID
    const workflowId = crypto.randomUUID();

    // 5. Insert application record
    const [insertedApp] = await db
      .insert(applications)
      .values({
        jobId: job.id,
        dedupeKey,
        status: 'preparing',
        applicationUrl: job.applicationUrl || job.canonicalUrl || '',
        workflowId,
        platform: detectAtsPlatform(job.applicationUrl || job.canonicalUrl || ''),
      })
      .returning();

    if (!insertedApp) {
      throw new AppError('INTERNAL', 'Failed to insert application record.');
    }

    // 6. Insert initial workflow checkpoint
    await db.insert(workflowCheckpoints).values({
      workflowId,
      type: 'application',
      subjectId: insertedApp.id,
      step: 'resolve_url',
      status: 'running',
      version: 1,
      state: {
        jobId: job.id,
        companyId: job.companyId,
        applicationId: insertedApp.id,
      },
    });

    // 7. Enqueue initial step execution
    await enqueue(
      'application.run_step',
      { workflowId, step: 'resolve_url' },
      { singletonKey: `wf:${workflowId}:resolve_url:1` }
    );

    logger.info(
      { jobId, applicationId: insertedApp.id, workflowId },
      '[ApplicationService] Application workflow created and enqueued'
    );

    return {
      applicationId: insertedApp.id,
      workflowId,
      status: insertedApp.status,
    };
  }

  /**
   * Executes a single checkpointed workflow step.
   * Runs under an optimistic concurrency lock on checkpoint.version.
   */
  async executeStep(workflowId: string): Promise<void> {
    const db = getDb();

    // 1. Fetch checkpoint
    const [checkpoint] = await db
      .select()
      .from(workflowCheckpoints)
      .where(eq(workflowCheckpoints.workflowId, workflowId))
      .limit(1);

    if (!checkpoint) {
      logger.warn({ workflowId }, '[ApplicationService] Checkpoint not found');
      return;
    }

    // Idempotency check: only execute if running
    if (checkpoint.status !== 'running') {
      logger.info(
        { workflowId, status: checkpoint.status, step: checkpoint.step },
        '[ApplicationService] Checkpoint is not running; skipping step execution'
      );
      return;
    }

    const state = checkpoint.state as Record<string, unknown>;
    const applicationId = (state.applicationId as string) || checkpoint.subjectId;
    const currentStep = checkpoint.step as WorkflowStep;

    // Fetch application details
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    if (!app) {
      logger.error({ applicationId, workflowId }, '[ApplicationService] Application record missing');
      return;
    }

    // Fetch job details
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, app.jobId))
      .limit(1);

    // Fetch company details if present
    let companyDomain: string | null = null;
    if (job?.companyId) {
      const [comp] = await db
        .select({ primaryDomain: companies.primaryDomain })
        .from(companies)
        .where(eq(companies.id, job.companyId))
        .limit(1);
      companyDomain = comp?.primaryDomain || null;
    }

    // Check for user default resume version if needed
    let defaultResumeId: string | null = null;
    const [defaultResume] = await db
      .select({ id: resumeVersions.id })
      .from(resumeVersions)
      .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id))
      .where(and(eq(resumes.isDefault, true), eq(resumeVersions.status, 'active')))
      .limit(1);
    if (defaultResume) {
      defaultResumeId = defaultResume.id;
    } else {
      const [anyResume] = await db
        .select({ id: resumeVersions.id })
        .from(resumeVersions)
        .where(eq(resumeVersions.status, 'active'))
        .orderBy(desc(resumeVersions.uploadedAt))
        .limit(1);
      if (anyResume) {
        defaultResumeId = anyResume.id;
      }
    }

    const ctx: StepContext = {
      workflowId,
      applicationId: app.id,
      jobId: app.jobId,
      companyId: job?.companyId,
      step: currentStep,
      state,
      version: checkpoint.version,
    };

    // 2. Execute pure step logic
    let result: StepResult;
    const taskStart = new Date();

    try {
      switch (currentStep) {
        case 'resolve_url': {
          result = executeResolveUrlStep(app.applicationUrl || job?.applicationUrl || job?.canonicalUrl, ctx);
          break;
        }

        case 'verify_domain': {
          const appUrl = (state.applicationUrl as string) || app.applicationUrl;
          result = executeVerifyDomainStep(appUrl, companyDomain, ctx);
          break;
        }

        case 'select_resume': {
          result = executeSelectResumeStep(app.resumeVersionId, defaultResumeId, ctx);
          break;
        }

        case 'detect_platform': {
          const appUrl = (state.applicationUrl as string) || app.applicationUrl;
          const platform = detectAtsPlatform(appUrl);
          result = {
            type: 'next',
            nextStep: 'final_summary',
            stateUpdates: { platform },
          };
          break;
        }

        case 'final_summary': {
          result = {
            type: 'done',
            stateUpdates: { readyAt: new Date().toISOString() },
          };
          break;
        }

        default: {
          result = {
            type: 'done',
          };
          break;
        }
      }
    } catch (err: unknown) {
      logger.error({ err, workflowId, currentStep }, '[ApplicationService] Step execution threw exception');
      result = {
        type: 'failed',
        errorClass: 'UNHANDLED_EXCEPTION',
        error: (err as Error).message || 'Unknown error during step execution',
      };
    }

    // 3. Persist step outcome in database
    const newVersion = checkpoint.version + 1;
    const updatedState = {
      ...state,
      ...(result.type === 'next' || result.type === 'pause' || result.type === 'done' ? result.stateUpdates : {}),
    };

    if (result.type === 'next') {
      await db
        .update(workflowCheckpoints)
        .set({
          step: result.nextStep,
          state: updatedState,
          version: newVersion,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflowCheckpoints.workflowId, workflowId),
            eq(workflowCheckpoints.version, checkpoint.version)
          )
        );

      // Record task audit
      await db.insert(applicationTasks).values({
        applicationId: app.id,
        step: currentStep,
        status: 'done',
        startedAt: taskStart,
        finishedAt: new Date(),
      });

      // Update application state if platform or url changed
      if (updatedState.platform || updatedState.resumeVersionId) {
        await db
          .update(applications)
          .set({
            platform: (updatedState.platform as string) || app.platform,
            resumeVersionId: (updatedState.resumeVersionId as string) || app.resumeVersionId,
            verifiedDomain: (updatedState.verifiedDomain as boolean) ?? app.verifiedDomain,
            updatedAt: new Date(),
          })
          .where(eq(applications.id, app.id));
      }

      // Enqueue next step
      await enqueue(
        'application.run_step',
        { workflowId, step: result.nextStep },
        { singletonKey: `wf:${workflowId}:${result.nextStep}:${newVersion}` }
      );
    } else if (result.type === 'pause') {
      await db
        .update(workflowCheckpoints)
        .set({
          status: 'waiting_review',
          state: updatedState,
          version: newVersion,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflowCheckpoints.workflowId, workflowId),
            eq(workflowCheckpoints.version, checkpoint.version)
          )
        );

      await db
        .update(applications)
        .set({
          status: 'awaiting_review',
          updatedAt: new Date(),
        })
        .where(eq(applications.id, app.id));

      // Create human review requests
      if (result.reviewRequests && result.reviewRequests.length > 0) {
        for (const req of result.reviewRequests) {
          await humanReviewService.createRequest({
            workflowId,
            jobId: app.jobId,
            applicationId: app.id,
            category: req.category as ReviewCategory,
            question: req.question,
            requiredAction: req.requiredAction,
            responseSchema: req.responseSchema as ResponseSchema | undefined,
            context: req.context,
            checkpointStep: currentStep,
          });
        }
      }

      await db.insert(applicationTasks).values({
        applicationId: app.id,
        step: currentStep,
        status: 'pending',
        startedAt: taskStart,
        finishedAt: new Date(),
        error: result.message || 'Paused waiting for human review',
      });
    } else if (result.type === 'done') {
      await db
        .update(workflowCheckpoints)
        .set({
          status: 'completed',
          state: updatedState,
          version: newVersion,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflowCheckpoints.workflowId, workflowId),
            eq(workflowCheckpoints.version, checkpoint.version)
          )
        );

      await db
        .update(applications)
        .set({
          status: 'ready_to_submit',
          updatedAt: new Date(),
        })
        .where(eq(applications.id, app.id));

      await db.insert(applicationTasks).values({
        applicationId: app.id,
        step: currentStep,
        status: 'done',
        startedAt: taskStart,
        finishedAt: new Date(),
      });
    } else if (result.type === 'failed') {
      await db
        .update(workflowCheckpoints)
        .set({
          status: 'failed',
          lastError: result.error,
          version: newVersion,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflowCheckpoints.workflowId, workflowId),
            eq(workflowCheckpoints.version, checkpoint.version)
          )
        );

      await db.insert(applicationTasks).values({
        applicationId: app.id,
        step: currentStep,
        status: 'failed',
        errorClass: result.errorClass,
        error: result.error,
        startedAt: taskStart,
        finishedAt: new Date(),
      });
    }
  }

  /**
   * Resumes a paused workflow checkpoint once all pending review requests are answered.
   */
  async resumeWorkflow(workflowId: string, requestId?: string): Promise<boolean> {
    const db = getDb();

    const [checkpoint] = await db
      .select()
      .from(workflowCheckpoints)
      .where(eq(workflowCheckpoints.workflowId, workflowId))
      .limit(1);

    if (!checkpoint) return false;

    // Check if any other review requests are still pending
    const pendingReviews = await db
      .select({ id: humanReviewRequests.id })
      .from(humanReviewRequests)
      .where(
        and(
          eq(humanReviewRequests.workflowId, workflowId),
          eq(humanReviewRequests.status, 'pending')
        )
      );

    if (pendingReviews.length > 0) {
      logger.info(
        { workflowId, pendingCount: pendingReviews.length },
        '[ApplicationService] Workflow still has pending review requests'
      );
      return false;
    }

    // Set checkpoint status back to running
    const newVersion = checkpoint.version + 1;
    await db
      .update(workflowCheckpoints)
      .set({
        status: 'running',
        version: newVersion,
        updatedAt: new Date(),
      })
      .where(eq(workflowCheckpoints.workflowId, workflowId));

    // Update application status to preparing
    await db
      .update(applications)
      .set({
        status: 'preparing',
        updatedAt: new Date(),
      })
      .where(eq(applications.id, checkpoint.subjectId));

    // Enqueue step execution from current step
    await enqueue(
      'application.run_step',
      { workflowId, step: checkpoint.step, resumedFromRequest: requestId },
      { singletonKey: `wf:${workflowId}:${checkpoint.step}:${newVersion}` }
    );

    logger.info(
      { workflowId, step: checkpoint.step, newVersion },
      '[ApplicationService] Workflow resumed successfully'
    );

    return true;
  }

  /**
   * Scans and recovers stale workflows that stalled mid-step due to crash or worker restart.
   */
  async recoverStaleWorkflows(): Promise<number> {
    const db = getDb();
    const staleThreshold = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago

    const staleList = await db
      .select()
      .from(workflowCheckpoints)
      .where(
        and(
          eq(workflowCheckpoints.status, 'running'),
          lte(workflowCheckpoints.updatedAt, staleThreshold)
        )
      )
      .limit(50);

    let recovered = 0;
    for (const cp of staleList) {
      const newVersion = cp.version + 1;
      await db
        .update(workflowCheckpoints)
        .set({
          version: newVersion,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflowCheckpoints.workflowId, cp.workflowId),
            eq(workflowCheckpoints.version, cp.version)
          )
        );

      await enqueue(
        'application.run_step',
        { workflowId: cp.workflowId, step: cp.step, recovered: true },
        { singletonKey: `wf:${cp.workflowId}:${cp.step}:${newVersion}` }
      );
      recovered += 1;
    }

    if (recovered > 0) {
      logger.info({ recovered }, '[ApplicationService] Recovered stale workflow checkpoints');
    }

    return recovered;
  }

  /**
   * Retrieves an application by ID.
   */
  async getApplication(id: string) {
    const db = getDb();

    const [row] = await db
      .select({
        app: applications,
        jobTitle: jobs.title,
        companyName: companies.name,
      })
      .from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .where(eq(applications.id, id))
      .limit(1);

    if (!row) return null;

    const tasks = await db
      .select()
      .from(applicationTasks)
      .where(eq(applicationTasks.applicationId, id))
      .orderBy(desc(applicationTasks.createdAt));

    return {
      ...row.app,
      jobTitle: row.jobTitle,
      companyName: row.companyName,
      tasks,
    };
  }

  /**
   * Selects an immutable resume version for an application.
   */
  async selectResume(applicationId: string, resumeVersionId: string): Promise<void> {
    const db = getDb();

    const [app] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    if (!app) {
      throw new AppError('NOT_FOUND', `Application '${applicationId}' not found.`);
    }

    const [ver] = await db
      .select({ id: resumeVersions.id })
      .from(resumeVersions)
      .where(eq(resumeVersions.id, resumeVersionId))
      .limit(1);

    if (!ver) {
      throw new AppError('NOT_FOUND', `Resume version '${resumeVersionId}' not found.`);
    }

    await db
      .update(applications)
      .set({
        resumeVersionId,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId));
  }
}

export const applicationService = new ApplicationService();
