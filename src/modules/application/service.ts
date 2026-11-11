import crypto from 'node:crypto';
import { getDb } from '@/shared/db';
import {
  applications,
  applicationTasks,
  applicationFormFields,
  applicationFieldAnswers,
  applicationEvents,
  applicationAuthorizations,
  applicationSubmissions,
  workflowCheckpoints,
  jobs,
  companies,
  resumes,
  resumeVersions,
  humanReviewRequests,
  reusableApplicationAnswers,
} from '@/db/schema';
import { eq, and, desc, lte, sql } from 'drizzle-orm';
import { AppError } from '@/shared/errors';
import { logger } from '@/shared/logger';
import { storage } from '@/shared/storage';
import { enqueue } from '@/modules/queue';
import { recordAudit } from '@/modules/audit';
import { getSetting } from '@/modules/settings';
import {
  humanReviewService,
  ReviewCategory,
  ResponseSchema,
  isCoreCategory,
} from '@/modules/human-review';
import {
  browserService,
  createSubmitToken,
  BrowserError,
  FieldType,
  ExtractedFieldOption,
  SelectorStrategy,
} from '@/modules/browser';
import {
  getVerifiedSnapshot,
} from '@/modules/profile';
import {
  getResumeVersion,
  getResumeFileBuffer,
  recordResumeAttachment,
} from '@/modules/resume';
import { checkSubmissionAuthorization } from './domain/authorization';
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
  executeDetectPlatformStep,
  executeAwaitSubmissionDecisionStep,
} from './domain/workflow-steps';
import {
  mapFieldsToAnswers,
  computeSummaryHash,
} from './domain/field-mapping';

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

    // 2. Execute step logic
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
          result = executeDetectPlatformStep(appUrl);
          break;
        }

        case 'open_portal': {
          const appUrl = (state.applicationUrl as string) || app.applicationUrl;
          result = await browserService.withPage(
            appUrl,
            { workflowId, applicationId: app.id },
            async (page, driver) => {
              const block = await driver.detectBlock(page);
              if (block) {
                return {
                  type: 'pause' as const,
                  reason: 'blocked' as const,
                  message: `Application portal access blocked (${block}). Manual handover required.`,
                  stateUpdates: { blockType: block },
                };
              }
              return {
                type: 'next' as const,
                nextStep: 'extract_form' as const,
                stateUpdates: { portalOpened: true },
              };
            }
          );
          break;
        }

        case 'extract_form': {
          const appUrl = (state.applicationUrl as string) || app.applicationUrl;
          result = await browserService.withPage(
            appUrl,
            { workflowId, applicationId: app.id },
            async (page, driver) => {
              const extracted = await driver.extractForm(page);

              // Persist extracted fields
              for (const f of extracted.fields) {
                await db
                  .insert(applicationFormFields)
                  .values({
                    applicationId: app.id,
                    fieldKey: f.fieldKey,
                    label: f.label,
                    type: f.type,
                    required: f.required,
                    options: f.options,
                    selectorStrategy: f.selectorStrategy,
                    category: f.category,
                    pageIndex: f.pageIndex,
                  })
                  .onConflictDoUpdate({
                    target: [applicationFormFields.applicationId, applicationFormFields.fieldKey],
                    set: {
                      label: f.label,
                      type: f.type,
                      required: f.required,
                      options: f.options,
                      selectorStrategy: f.selectorStrategy,
                      category: f.category,
                    },
                  });
              }

              return {
                type: 'next' as const,
                nextStep: 'map_fields' as const,
                stateUpdates: { extractedFieldsCount: extracted.fields.length },
              };
            }
          );
          break;
        }

        case 'map_fields': {
          const formFields = await db
            .select()
            .from(applicationFormFields)
            .where(eq(applicationFormFields.applicationId, app.id));

          const profile = await getVerifiedSnapshot();
          const reusable = await db.select().from(reusableApplicationAnswers);
          const reusableList = reusable.map((r) => ({
            questionHash: r.questionKey,
            normalizedQuestion: r.questionKey,
            answer: r.answer,
            category: r.category,
          }));

          const mappedAnswers = mapFieldsToAnswers(formFields, profile, reusableList);

          for (const ma of mappedAnswers) {
            await db
              .insert(applicationFieldAnswers)
              .values({
                fieldId: ma.fieldId,
                answer: ma.answer,
                decision: ma.decision,
                source: ma.source,
                sourceRef: ma.sourceRef,
                confidence: String(ma.confidence || 1.0),
                status: ma.status,
              })
              .onConflictDoUpdate({
                target: applicationFieldAnswers.fieldId,
                set: {
                  answer: ma.answer,
                  decision: ma.decision,
                  source: ma.source,
                  sourceRef: ma.sourceRef,
                  status: ma.status,
                  updatedAt: new Date(),
                },
              });
          }

          result = {
            type: 'next',
            nextStep: 'validate_answers',
            stateUpdates: { mappedCount: mappedAnswers.length },
          };
          break;
        }

        case 'validate_answers': {
          const answersWithFields = await db
            .select({
              answer: applicationFieldAnswers,
              field: applicationFormFields,
            })
            .from(applicationFieldAnswers)
            .innerJoin(applicationFormFields, eq(applicationFieldAnswers.fieldId, applicationFormFields.id))
            .where(eq(applicationFormFields.applicationId, app.id));

          const needsReview = answersWithFields.filter(
            (item) => item.answer.status === 'needs_review'
          );

          if (needsReview.length > 0) {
            const reviewRequests = needsReview.map((item) => {
              const isCore = isCoreCategory(item.field.category);
              const isActionAuth =
                item.field.category === 'legal' ||
                item.field.category === 'consent' ||
                item.field.category === 'bond';

              let schemaType: 'boolean' | 'radio' | 'select' | 'number' | 'text' = 'text';
              if (item.field.type === 'checkbox') schemaType = 'boolean';
              else if (item.field.type === 'select') schemaType = 'select';
              else if (item.field.type === 'radio') schemaType = 'radio';
              else if (item.field.type === 'number') schemaType = 'number';

              return {
                category: item.field.category,
                question: item.field.label,
                fieldId: item.field.id,
                requiredAction: isActionAuth ? ('authorize' as const) : ('answer' as const),
                responseSchema: {
                  type: schemaType,
                  required: item.field.required,
                  options: item.field.options as Array<{ label: string; value: string }>,
                },
                context: {
                  fieldId: item.field.id,
                  fieldKey: item.field.fieldKey,
                  label: item.field.label,
                  category: item.field.category,
                  isCore,
                  suggestedAnswer: isCore ? null : item.answer.answer,
                },
              };
            });

            result = {
              type: 'pause',
              reason: 'review',
              message: `Application requires human review for ${needsReview.length} form field(s).`,
              reviewRequests,
            };
          } else {
            result = {
              type: 'next',
              nextStep: 'fill_form',
            };
          }
          break;
        }

        case 'fill_form': {
          const answersWithFields = await db
            .select({
              answer: applicationFieldAnswers,
              field: applicationFormFields,
            })
            .from(applicationFieldAnswers)
            .innerJoin(applicationFormFields, eq(applicationFieldAnswers.fieldId, applicationFormFields.id))
            .where(eq(applicationFormFields.applicationId, app.id));

          // Resolve resume version file path
          let resumeFilePath: string | undefined;
          let resumeFileName: string | undefined;
          if (app.resumeVersionId) {
            const version = await getResumeVersion(app.resumeVersionId);
            resumeFilePath = storage.getAbsolutePath(version.storedPath);
            resumeFileName = version.originalFilename || 'resume.pdf';
            await recordResumeAttachment(app.id, app.resumeVersionId);
          }

          const appUrl = (state.applicationUrl as string) || app.applicationUrl;
          const fillPlan = {
            fields: answersWithFields.map((af) => ({
              fieldKey: af.field.fieldKey,
              value: af.answer.answer,
              decision: af.answer.decision as 'answered' | 'declined' | 'left_blank',
              type: af.field.type,
            })),
            resumeFilePath,
            resumeFileName,
          };

          result = await browserService.withPage(
            appUrl,
            { workflowId, applicationId: app.id },
            async (page, driver) => {
              const fillReport = await driver.fill(page, fillPlan);

              // Update filled answers status
              for (const item of fillReport.filled) {
                if (item.success) {
                  const matched = answersWithFields.find((af) => af.field.fieldKey === item.fieldKey);
                  if (matched) {
                    await db
                      .update(applicationFieldAnswers)
                      .set({ status: 'filled', updatedAt: new Date() })
                      .where(eq(applicationFieldAnswers.id, matched.answer.id));
                  }
                }
              }

              return {
                type: 'next' as const,
                nextStep: 'validate_form' as const,
                stateUpdates: {
                  filledCount: fillReport.filled.filter((f) => f.success).length,
                  fillErrorsCount: fillReport.errors.length,
                },
              };
            }
          );
          break;
        }

        case 'validate_form': {
          const answersWithFields = await db
            .select({
              answer: applicationFieldAnswers,
              field: applicationFormFields,
            })
            .from(applicationFieldAnswers)
            .innerJoin(applicationFormFields, eq(applicationFieldAnswers.fieldId, applicationFormFields.id))
            .where(eq(applicationFormFields.applicationId, app.id));

          const appUrl = (state.applicationUrl as string) || app.applicationUrl;

          result = await browserService.withPage(
            appUrl,
            { workflowId, applicationId: app.id },
            async (page, driver) => {
              const extractedFields = answersWithFields.map((af) => ({
                fieldKey: af.field.fieldKey,
                label: af.field.label,
                type: af.field.type as FieldType,
                required: af.field.required,
                options: af.field.options as ExtractedFieldOption[],
                selectorStrategy: af.field.selectorStrategy as SelectorStrategy[],
                category: af.field.category,
                pageIndex: af.field.pageIndex,
                isHoneypot: false,
              }));

              await driver.readBack(page, extractedFields);

              // Mark verified filled
              for (const af of answersWithFields) {
                await db
                  .update(applicationFieldAnswers)
                  .set({ status: 'verified_filled', updatedAt: new Date() })
                  .where(eq(applicationFieldAnswers.id, af.answer.id));
              }

              return {
                type: 'next' as const,
                nextStep: 'final_summary' as const,
                stateUpdates: { verifiedFilled: true },
              };
            }
          );
          break;
        }

        case 'final_summary': {
          const answersWithFields = await db
            .select({
              answer: applicationFieldAnswers,
              field: applicationFormFields,
            })
            .from(applicationFieldAnswers)
            .innerJoin(applicationFormFields, eq(applicationFieldAnswers.fieldId, applicationFormFields.id))
            .where(eq(applicationFormFields.applicationId, app.id));

          let resumeSha256 = 'no_resume';
          if (app.resumeVersionId) {
            const version = await getResumeVersion(app.resumeVersionId);
            resumeSha256 = version.sha256;
          }

          const appUrl = (state.applicationUrl as string) || app.applicationUrl;
          const summaryHash = computeSummaryHash(
            appUrl,
            resumeSha256,
            answersWithFields.map((af) => ({
              fieldKey: af.field.fieldKey,
              answer: af.answer.answer,
              decision: af.answer.decision,
            }))
          );

          await db
            .update(applications)
            .set({
              status: 'ready_to_submit',
              updatedAt: new Date(),
            })
            .where(eq(applications.id, app.id));

          result = {
            type: 'next',
            nextStep: 'await_submission_decision',
            stateUpdates: {
              summaryHash,
              readyAt: new Date().toISOString(),
            },
          };
          break;
        }

        case 'await_submission_decision': {
          const appUrl = (state.applicationUrl as string) || app.applicationUrl;
          const sHash = (state.summaryHash as string) || '';
          result = executeAwaitSubmissionDecisionStep(appUrl, sHash, ctx);
          break;
        }

        case 'manual_handover': {
          result = {
            type: 'pause',
            reason: 'manual_handover',
            message: 'Awaiting manual submission confirmation from user.',
          };
          break;
        }

        case 'submit': {
          const subResult = await this.submitApprovedApplication(app.id);
          if (subResult.verification.status === 'confirmed' || subResult.verification.status === 'already_applied') {
            result = {
              type: 'next',
              nextStep: 'finalize',
              stateUpdates: { submissionSource: 'automated_verified' },
            };
          } else {
            result = {
              type: 'pause',
              reason: 'review',
              message: 'Automated submission completed but confirmation could not be verified in portal.',
              stateUpdates: {
                submissionStatus: 'unverified',
                submissionId: subResult.submissionId,
              },
            };
          }
          break;
        }

        case 'verify_submission': {
          const [sub] = await db
            .select()
            .from(applicationSubmissions)
            .where(eq(applicationSubmissions.applicationId, app.id))
            .orderBy(desc(applicationSubmissions.createdAt))
            .limit(1);

          if (sub && sub.status === 'verified') {
            result = {
              type: 'next',
              nextStep: 'finalize',
              stateUpdates: { submissionSource: 'automated_verified' },
            };
          } else {
            result = {
              type: 'pause',
              reason: 'review',
              message: 'Submission verification pending or uncertain.',
            };
          }
          break;
        }

        case 'finalize': {
          await db
            .update(applications)
            .set({
              status: 'submitted',
              submissionSource: (state.submissionSource as string) || 'manual_confirmed',
              appliedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(applications.id, app.id));

          if (job) {
            await db
              .update(jobs)
              .set({ status: 'applied', updatedAt: new Date() })
              .where(eq(jobs.id, job.id));
          }

          await db.insert(applicationEvents).values({
            applicationId: app.id,
            type: 'submitted',
            fromStatus: 'ready_to_submit',
            toStatus: 'submitted',
            actor: 'user',
            details: {
              submissionSource: (state.submissionSource as string) || 'manual_confirmed',
              appliedAt: new Date().toISOString(),
            },
          });

          result = {
            type: 'done',
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
      const cpStatus =
        result.reason === 'review'
          ? 'waiting_review'
          : result.reason === 'authorization'
            ? 'waiting_authorization'
            : 'paused';

      const appStatus =
        result.reason === 'review'
          ? 'awaiting_review'
          : result.reason === 'manual_handover'
            ? 'ready_to_submit'
            : app.status;

      await db
        .update(workflowCheckpoints)
        .set({
          status: cpStatus,
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
          status: appStatus,
          updatedAt: new Date(),
        })
        .where(eq(applications.id, app.id));

      // Create human review requests if any
      if (result.reviewRequests && result.reviewRequests.length > 0) {
        for (const req of result.reviewRequests) {
          await humanReviewService.createRequest({
            workflowId,
            jobId: app.jobId,
            applicationId: app.id,
            fieldId: req.fieldId,
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
        error: result.message || 'Workflow paused',
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

      const nextStep = cp.step === 'submit' ? 'verify_submission' : cp.step;
      await enqueue(
        'application.run_step',
        { workflowId: cp.workflowId, step: nextStep, recovered: true },
        { singletonKey: `wf:${cp.workflowId}:${nextStep}:${newVersion}` }
      );
      recovered += 1;
    }

    // Also recover any stale clicked submissions (verify-only, never click twice) (Doc 10 §5, §9)
    try {
      const staleSubmissions = await db
        .select()
        .from(applicationSubmissions)
        .where(
          and(
            eq(applicationSubmissions.status, 'clicked'),
            lte(applicationSubmissions.clickedAt, staleThreshold)
          )
        )
        .limit(10);

      for (const sub of staleSubmissions) {
        const [app] = await db
          .select()
          .from(applications)
          .where(eq(applications.id, sub.applicationId))
          .limit(1);

        if (app && app.applicationUrl) {
          try {
            await browserService.withPage(
              app.applicationUrl,
              { workflowId: app.workflowId || crypto.randomUUID(), applicationId: app.id },
              async (page, driver) => {
                const verification = await driver.verifySubmission(page);
                if (verification.status === 'confirmed' || verification.status === 'already_applied') {
                  await db
                    .update(applicationSubmissions)
                    .set({
                      status: 'verified',
                      verifiedAt: new Date(),
                      verificationEvidence: verification.evidence || {},
                      updatedAt: new Date(),
                    })
                    .where(eq(applicationSubmissions.id, sub.id));

                  await db
                    .update(applications)
                    .set({
                      status: 'submitted',
                      submissionSource: 'automated_verified',
                      appliedAt: new Date(),
                      updatedAt: new Date(),
                    })
                    .where(eq(applications.id, app.id));
                } else {
                  await db
                    .update(applicationSubmissions)
                    .set({
                      status: 'unverified',
                      error: 'Stale clicked submission verification uncertain',
                      updatedAt: new Date(),
                    })
                    .where(eq(applicationSubmissions.id, sub.id));

                  await db
                    .update(applications)
                    .set({
                      status: 'submission_unverified',
                      updatedAt: new Date(),
                    })
                    .where(eq(applications.id, app.id));
                }
              }
            );
          } catch {
            // Keep going on recovery error
          }
        }
        recovered += 1;
      }
    } catch {
      // Table may not have rows or check failed
    }

    if (recovered > 0) {
      logger.info({ recovered }, '[ApplicationService] Recovered stale workflow checkpoints');
    }

    return recovered;
  }

  /**
   * Retrieves an application by ID with form fields, answers, and audit history.
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

    const fieldsWithAnswers = await db
      .select({
        field: applicationFormFields,
        answer: applicationFieldAnswers,
      })
      .from(applicationFormFields)
      .leftJoin(applicationFieldAnswers, eq(applicationFormFields.id, applicationFieldAnswers.fieldId))
      .where(eq(applicationFormFields.applicationId, id));

    const [latestAuth] = await db
      .select()
      .from(applicationAuthorizations)
      .where(eq(applicationAuthorizations.applicationId, id))
      .orderBy(desc(applicationAuthorizations.createdAt))
      .limit(1);

    const [latestSub] = await db
      .select()
      .from(applicationSubmissions)
      .where(eq(applicationSubmissions.applicationId, id))
      .orderBy(desc(applicationSubmissions.createdAt))
      .limit(1);

    let resumeSha256 = 'no_resume';
    if (row.app.resumeVersionId) {
      try {
        const version = await getResumeVersion(row.app.resumeVersionId);
        resumeSha256 = version.sha256;
      } catch {
        // ignore
      }
    }

    const validAnswers = fieldsWithAnswers
      .filter((fa) => fa.answer !== null)
      .map((fa) => ({
        fieldKey: fa.field.fieldKey,
        answer: fa.answer!.answer,
        decision: fa.answer!.decision,
      }));

    const summaryHash = computeSummaryHash(row.app.applicationUrl, resumeSha256, validAnswers);
    const submissionSetting = await getSetting<boolean>('submission.enabled');
    const submissionEnv = process.env.SUBMISSION_ENABLED === 'true';
    const canAutomate = submissionEnv && !!submissionSetting && row.app.platform !== 'generic';

    return {
      ...row.app,
      jobTitle: row.jobTitle,
      companyName: row.companyName,
      tasks,
      fields: fieldsWithAnswers,
      authorization: latestAuth || null,
      latestSubmission: latestSub || null,
      summaryHash,
      canAutomate,
    };
  }

  /**
   * Starts manual browser handover for user inspection and manual submission.
   */
  async startManualHandover(applicationId: string) {
    const app = await this.getApplication(applicationId);
    if (!app) {
      throw new AppError('NOT_FOUND', `Application '${applicationId}' not found.`);
    }

    return {
      applicationId: app.id,
      applicationUrl: app.applicationUrl,
      platform: app.platform,
      status: app.status,
      fieldsCount: app.fields.length,
      instructions:
        'Please open the application URL in your browser. Verify all prefilled answers and click Submit on the portal. Once submitted, return here and confirm.',
    };
  }

  /**
   * Confirms that the candidate has completed manual submission on the portal.
   */
  async confirmManualSubmission(applicationId: string, notes?: string) {
    const db = getDb();

    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    if (!app) {
      throw new AppError('NOT_FOUND', `Application '${applicationId}' not found.`);
    }

    // Update application
    await db
      .update(applications)
      .set({
        status: 'submitted',
        submissionSource: 'manual_confirmed',
        appliedAt: new Date(),
        notes: notes || app.notes,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId));

    // Update job status
    await db
      .update(jobs)
      .set({ status: 'applied', updatedAt: new Date() })
      .where(eq(jobs.id, app.jobId));

    // Record application event
    await db.insert(applicationEvents).values({
      applicationId: app.id,
      type: 'submitted',
      fromStatus: app.status,
      toStatus: 'submitted',
      actor: 'user',
      details: {
        submissionSource: 'manual_confirmed',
        notes: notes || null,
        confirmedAt: new Date().toISOString(),
      },
    });

    // Complete checkpoint if exists
    if (app.workflowId) {
      await db
        .update(workflowCheckpoints)
        .set({
          status: 'completed',
          step: 'finalize',
          updatedAt: new Date(),
        })
        .where(eq(workflowCheckpoints.workflowId, app.workflowId));
    }

    logger.info({ applicationId }, '[ApplicationService] Application confirmed manually submitted by user');

    return {
      applicationId: app.id,
      status: 'submitted',
      submissionSource: 'manual_confirmed',
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

  /**
   * Explicitly authorizes automated submission for an application bound to a deterministic summary hash.
   * Enforces 24-hour expiration window and invalidation upon any change (Doc 08 §71, Doc 10 §6, Doc 13 §8).
   */
  async authorizeSubmission(
    applicationId: string,
    params: { summaryHash: string; expiresHours?: number; notes?: string }
  ) {
    const db = getDb();

    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    if (!app) {
      throw new AppError('NOT_FOUND', `Application '${applicationId}' not found.`);
    }

    if (app.status !== 'ready_to_submit') {
      throw new AppError(
        'VALIDATION',
        `Application status must be 'ready_to_submit' to authorize submission (current: '${app.status}').`
      );
    }

    // Verify summary hash
    const answersWithFields = await db
      .select({
        answer: applicationFieldAnswers,
        field: applicationFormFields,
      })
      .from(applicationFieldAnswers)
      .innerJoin(applicationFormFields, eq(applicationFieldAnswers.fieldId, applicationFormFields.id))
      .where(eq(applicationFormFields.applicationId, app.id));

    let resumeSha256 = 'no_resume';
    if (app.resumeVersionId) {
      const version = await getResumeVersion(app.resumeVersionId);
      resumeSha256 = version.sha256;
    }

    const currentHash = computeSummaryHash(
      app.applicationUrl,
      resumeSha256,
      answersWithFields.map((af) => ({
        fieldKey: af.field.fieldKey,
        answer: af.answer.answer,
        decision: af.answer.decision,
      }))
    );

    if (currentHash !== params.summaryHash) {
      throw new AppError(
        'VALIDATION',
        'Summary hash mismatch. Application content or answers have changed since summary was generated.'
      );
    }

    // Revoke any existing active authorizations for this application
    await db
      .update(applicationAuthorizations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(applicationAuthorizations.applicationId, app.id),
          eq(applicationAuthorizations.kind, 'submission')
        )
      );

    const expiresAt = new Date(Date.now() + (params.expiresHours || 24) * 3600 * 1000);

    const [auth] = await db
      .insert(applicationAuthorizations)
      .values({
        applicationId: app.id,
        kind: 'submission',
        scope: {
          applicationId: app.id,
          platform: app.platform,
          applicationUrl: app.applicationUrl,
        },
        summaryHash: params.summaryHash,
        summarySnapshot: {
          answersCount: answersWithFields.length,
          applicationUrl: app.applicationUrl,
          resumeVersionId: app.resumeVersionId,
          notes: params.notes || null,
        },
        grantedBy: 'user',
        expiresAt,
      })
      .returning();

    await recordAudit({
      actor: 'user',
      action: 'authorization.granted',
      entityType: 'applications',
      entityId: app.id,
      details: {
        authorizationId: auth?.id,
        summaryHash: params.summaryHash,
        expiresAt: expiresAt.toISOString(),
      },
    });

    await db.insert(applicationEvents).values({
      applicationId: app.id,
      type: 'submission_authorized',
      fromStatus: app.status,
      toStatus: app.status,
      actor: 'user',
      details: {
        authorizationId: auth?.id,
        summaryHash: params.summaryHash,
        expiresAt: expiresAt.toISOString(),
      },
    });

    logger.info({ applicationId: app.id, authorizationId: auth?.id }, '[ApplicationService] Submission authorized by user');
    return auth!;
  }

  /**
   * Revokes an active submission authorization for an application.
   */
  async revokeSubmissionAuthorization(applicationId: string, reason?: string) {
    const db = getDb();

    const [app] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    if (!app) {
      throw new AppError('NOT_FOUND', `Application '${applicationId}' not found.`);
    }

    await db
      .update(applicationAuthorizations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(applicationAuthorizations.applicationId, app.id),
          eq(applicationAuthorizations.kind, 'submission')
        )
      );

    await recordAudit({
      actor: 'user',
      action: 'authorization.revoked',
      entityType: 'applications',
      entityId: app.id,
      details: { reason: reason || 'User revoked submission authorization' },
    });

    await db.insert(applicationEvents).values({
      applicationId: app.id,
      type: 'authorization_revoked',
      actor: 'user',
      details: { reason },
    });

    return { revoked: true };
  }

  /**
   * Retrieves the current active submission authorization for an application.
   */
  async getSubmissionAuthorization(applicationId: string) {
    const db = getDb();
    const [auth] = await db
      .select()
      .from(applicationAuthorizations)
      .where(
        and(
          eq(applicationAuthorizations.applicationId, applicationId),
          eq(applicationAuthorizations.kind, 'submission')
        )
      )
      .orderBy(desc(applicationAuthorizations.grantedAt))
      .limit(1);

    return auth || null;
  }

  /**
   * Submits an approved application using the strict two-phase idempotency protocol (Doc 10 §5, Doc 13 §8).
   * Commits intent row first, updates clicked before submission, and validates evidence.
   */
  async submitApprovedApplication(applicationId: string) {
    const db = getDb();

    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    if (!app) {
      throw new AppError('NOT_FOUND', `Application '${applicationId}' not found.`);
    }

    // 1. Check duplicate active submitted application
    const duplicateApp = await db
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.dedupeKey, app.dedupeKey),
          eq(applications.status, 'submitted')
        )
      )
      .limit(1);

    // 2. Load fields & answers
    const answersWithFields = await db
      .select({
        answer: applicationFieldAnswers,
        field: applicationFormFields,
      })
      .from(applicationFieldAnswers)
      .innerJoin(applicationFormFields, eq(applicationFieldAnswers.fieldId, applicationFormFields.id))
      .where(eq(applicationFormFields.applicationId, app.id));

    // 3. Load resume version info
    let storedSha256: string | null = null;
    let expectedSha256: string | null = null;
    let resumePath: string | undefined;
    let resumeFileName: string | undefined;

    if (app.resumeVersionId) {
      const version = await getResumeVersion(app.resumeVersionId);
      expectedSha256 = version.sha256;
      const { version: verOnDisk } = await getResumeFileBuffer(app.resumeVersionId);
      storedSha256 = verOnDisk.sha256;
      resumePath = storage.getAbsolutePath(version.storedPath);
      resumeFileName = version.originalFilename || 'resume.pdf';
    }

    // 4. Compute current summary hash
    const currentSummaryHash = computeSummaryHash(
      app.applicationUrl,
      expectedSha256 || 'no_resume',
      answersWithFields.map((af) => ({
        fieldKey: af.field.fieldKey,
        answer: af.answer.answer,
        decision: af.answer.decision,
      }))
    );

    // 5. Load active authorization
    const [auth] = await db
      .select()
      .from(applicationAuthorizations)
      .where(
        and(
          eq(applicationAuthorizations.applicationId, app.id),
          eq(applicationAuthorizations.kind, 'submission')
        )
      )
      .orderBy(desc(applicationAuthorizations.grantedAt))
      .limit(1);

    // 6. Check gates
    const envSubmissionEnabled = process.env.SUBMISSION_ENABLED === 'true';
    const settingsSubmissionEnabled = await getSetting<boolean>('submission.enabled');

    // Check active submission
    const [existingActiveSubmission] = await db
      .select({ id: applicationSubmissions.id, status: applicationSubmissions.status })
      .from(applicationSubmissions)
      .where(
        and(
          eq(applicationSubmissions.applicationId, app.id),
          sql`${applicationSubmissions.status} IN ('intent', 'clicked', 'verified', 'unverified')`
        )
      )
      .limit(1);

    const authCheck = checkSubmissionAuthorization({
      applicationId: app.id,
      status: app.status,
      verifiedDomain: app.verifiedDomain,
      currentSummaryHash,
      envSubmissionEnabled,
      settingsSubmissionEnabled,
      activeSubmissionExists: !!existingActiveSubmission,
      duplicateSubmittedAppExists: duplicateApp.length > 0 && duplicateApp[0]?.id !== app.id,
      resume: app.resumeVersionId
        ? { storedSha256, expectedSha256 }
        : null,
      authorization: auth
        ? {
            id: auth.id,
            kind: auth.kind,
            summaryHash: auth.summaryHash,
            expiresAt: auth.expiresAt,
            revokedAt: auth.revokedAt,
          }
        : null,
      answers: answersWithFields.map((af) => ({
        fieldKey: af.field.fieldKey,
        category: af.field.category,
        status: af.answer.status,
        source: af.answer.source,
        decision: af.answer.decision,
      })),
    });

    if (!authCheck.ok) {
      throw new AppError(
        'FORBIDDEN',
        `Automated submission rejected by security policy: ${authCheck.reasons.join('; ')}`,
        { details: { reasons: authCheck.reasons } }
      );
    }

    // 7. Phase 1: COMMIT INTENT ROW (Doc 10 §5, Doc 13 §8)
    const [submission] = await db
      .insert(applicationSubmissions)
      .values({
        applicationId: app.id,
        status: 'intent',
        authorizationId: auth!.id,
        intentAt: new Date(),
      })
      .returning();

    const token = createSubmitToken({
      applicationId: app.id,
      submissionId: submission!.id,
      summaryHash: currentSummaryHash,
    });

    await db.insert(applicationEvents).values({
      applicationId: app.id,
      type: 'submission_intent',
      actor: 'system',
      details: {
        submissionId: submission!.id,
        authorizationId: auth!.id,
        summaryHash: currentSummaryHash,
      },
    });

    // 8. Phase 2: BROWSER EXECUTION WITH PRE-CLICK COMMIT
    try {
      const result = await browserService.withPage(
        app.applicationUrl,
        { workflowId: app.workflowId || crypto.randomUUID(), applicationId: app.id },
        async (page, driver) => {
          // Verify driver capabilities
          if (!driver.capabilities.submit) {
            throw new BrowserError(
              'BLOCKED_BY_PORTAL',
              `Driver '${driver.id}' does not support automated submission. Manual handover required.`,
              { retryable: false }
            );
          }

          // Refill form with approved answers and verified resume
          const fillPlan = {
            fields: answersWithFields.map((af) => ({
              fieldKey: af.field.fieldKey,
              value: af.answer.answer,
              decision: af.answer.decision as 'answered' | 'declined' | 'left_blank',
              type: af.field.type,
            })),
            resumeFilePath: resumePath,
            resumeFileName: resumeFileName,
          };

          await driver.fill(page, fillPlan);

          // COMMIT CLICKED STATUS BEFORE CLICKING SUBMIT (Doc 10 §5)
          await db
            .update(applicationSubmissions)
            .set({
              status: 'clicked',
              clickedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(applicationSubmissions.id, submission!.id));

          await db.insert(applicationEvents).values({
            applicationId: app.id,
            type: 'submission_clicked',
            actor: 'system',
            details: { submissionId: submission!.id },
          });

          // DISPATCH SUBMIT
          await driver.submit(page, token);

          // VERIFY SUBMISSION EVIDENCE
          const verification = await driver.verifySubmission(page);
          return { verification, pageUrl: page.url() };
        }
      );

      const verification = result.verification;

      if (verification.status === 'confirmed' || verification.status === 'already_applied') {
        // SUCCESS
        await db
          .update(applicationSubmissions)
          .set({
            status: 'verified',
            verifiedAt: new Date(),
            verificationEvidence: verification.evidence || {},
            updatedAt: new Date(),
          })
          .where(eq(applicationSubmissions.id, submission!.id));

        await db
          .update(applications)
          .set({
            status: 'submitted',
            submissionSource: 'automated_verified',
            appliedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(applications.id, app.id));

        const [job] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, app.jobId)).limit(1);
        if (job) {
          await db.update(jobs).set({ status: 'applied', updatedAt: new Date() }).where(eq(jobs.id, job.id));
        }

        if (app.workflowId) {
          await db
            .update(workflowCheckpoints)
            .set({ status: 'completed', updatedAt: new Date() })
            .where(eq(workflowCheckpoints.workflowId, app.workflowId));
        }

        await recordAudit({
          actor: 'system',
          action: 'application.submitted_automated',
          entityType: 'applications',
          entityId: app.id,
          details: {
            submissionId: submission!.id,
            verification,
          },
        });

        await db.insert(applicationEvents).values({
          applicationId: app.id,
          type: 'submitted',
          fromStatus: 'ready_to_submit',
          toStatus: 'submitted',
          actor: 'system',
          details: {
            submissionSource: 'automated_verified',
            submissionId: submission!.id,
            verification,
          },
        });

        logger.info({ applicationId: app.id, submissionId: submission!.id }, '[ApplicationService] Application submitted and verified successfully');
        return {
          applicationId: app.id,
          status: 'submitted',
          submissionId: submission!.id,
          verification,
        };
      } else {
        // UNCERTAIN / NOT CONFIRMED
        await db
          .update(applicationSubmissions)
          .set({
            status: 'unverified',
            error: 'Submission confirmation could not be verified in portal.',
            verificationEvidence: verification.evidence || {},
            updatedAt: new Date(),
          })
          .where(eq(applicationSubmissions.id, submission!.id));

        await db
          .update(applications)
          .set({
            status: 'submission_unverified',
            updatedAt: new Date(),
          })
          .where(eq(applications.id, app.id));

        if (app.workflowId) {
          await db
            .update(workflowCheckpoints)
            .set({
              status: 'paused',
              step: 'verify_submission',
              updatedAt: new Date(),
            })
            .where(eq(workflowCheckpoints.workflowId, app.workflowId));
        }

        await db.insert(applicationEvents).values({
          applicationId: app.id,
          type: 'submission_unverified',
          fromStatus: 'ready_to_submit',
          toStatus: 'submission_unverified',
          actor: 'system',
          details: {
            submissionId: submission!.id,
            verification,
          },
        });

        logger.warn({ applicationId: app.id, submissionId: submission!.id }, '[ApplicationService] Submission unverified; manual resolution required');
        return {
          applicationId: app.id,
          status: 'submission_unverified',
          submissionId: submission!.id,
          verification,
        };
      }
    } catch (err: unknown) {
      // Check if failure occurred before click
      const [currentSub] = await db
        .select({ status: applicationSubmissions.status })
        .from(applicationSubmissions)
        .where(eq(applicationSubmissions.id, submission!.id))
        .limit(1);

      if (currentSub?.status === 'intent') {
        await db
          .update(applicationSubmissions)
          .set({
            status: 'failed_before_click',
            error: err instanceof Error ? err.message : String(err),
            updatedAt: new Date(),
          })
          .where(eq(applicationSubmissions.id, submission!.id));
      }

      throw err;
    }
  }

  /**
   * Resolves an unverified automated submission (Doc 10 §5).
   */
  async resolveUnverifiedSubmission(
    applicationId: string,
    resolution: 'confirm_submitted' | 'retry_confirmed' | 'abandon',
    notes?: string
  ) {
    const db = getDb();

    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    if (!app) {
      throw new AppError('NOT_FOUND', `Application '${applicationId}' not found.`);
    }

    const [sub] = await db
      .select()
      .from(applicationSubmissions)
      .where(
        and(
          eq(applicationSubmissions.applicationId, app.id),
          eq(applicationSubmissions.status, 'unverified')
        )
      )
      .orderBy(desc(applicationSubmissions.createdAt))
      .limit(1);

    if (!sub) {
      throw new AppError('NOT_FOUND', `No unverified submission found for application '${applicationId}'.`);
    }

    if (resolution === 'confirm_submitted') {
      await db
        .update(applicationSubmissions)
        .set({
          status: 'verified',
          verifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(applicationSubmissions.id, sub.id));

      await db
        .update(applications)
        .set({
          status: 'submitted',
          submissionSource: 'automated_unverified_resolved',
          appliedAt: new Date(),
          notes: notes || app.notes,
          updatedAt: new Date(),
        })
        .where(eq(applications.id, app.id));

      const [job] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, app.jobId)).limit(1);
      if (job) {
        await db.update(jobs).set({ status: 'applied', updatedAt: new Date() }).where(eq(jobs.id, job.id));
      }

      if (app.workflowId) {
        await db
          .update(workflowCheckpoints)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(eq(workflowCheckpoints.workflowId, app.workflowId));
      }

      await recordAudit({
        actor: 'user',
        action: 'application.unverified_resolved_confirmed',
        entityType: 'applications',
        entityId: app.id,
        details: { submissionId: sub.id, notes },
      });

      return { applicationId: app.id, status: 'submitted', submissionSource: 'automated_unverified_resolved' };
    } else if (resolution === 'retry_confirmed') {
      await db
        .update(applicationSubmissions)
        .set({
          status: 'abandoned',
          error: notes || 'User chose to retry submission',
          updatedAt: new Date(),
        })
        .where(eq(applicationSubmissions.id, sub.id));

      await db
        .update(applications)
        .set({
          status: 'ready_to_submit',
          updatedAt: new Date(),
        })
        .where(eq(applications.id, app.id));

      if (app.workflowId) {
        await db
          .update(workflowCheckpoints)
          .set({
            status: 'running',
            step: 'await_submission_decision',
            updatedAt: new Date(),
          })
          .where(eq(workflowCheckpoints.workflowId, app.workflowId));
      }

      return { applicationId: app.id, status: 'ready_to_submit' };
    } else {
      // abandon
      await db
        .update(applicationSubmissions)
        .set({
          status: 'abandoned',
          error: notes || 'User abandoned unverified submission',
          updatedAt: new Date(),
        })
        .where(eq(applicationSubmissions.id, sub.id));

      await db
        .update(applications)
        .set({
          status: 'withdrawn',
          updatedAt: new Date(),
        })
        .where(eq(applications.id, app.id));

      if (app.workflowId) {
        await db
          .update(workflowCheckpoints)
          .set({
            status: 'cancelled',
            updatedAt: new Date(),
          })
          .where(eq(workflowCheckpoints.workflowId, app.workflowId));
      }

      return { applicationId: app.id, status: 'withdrawn' };
    }
  }
}

export const applicationService = new ApplicationService();
