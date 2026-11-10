import { getDb } from '../../shared/db';
import {
  jobs,
  jobAnalyses,
  jobSkillRequirements,
  jobStatusHistory,
  companies,
} from '../../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import {
  aiService,
  buildJdAnalysisPrompt,
  validateJdAnalysis,
  JdAnalysisOutputSchema,
  JdAnalysisOutput,
  JD_ANALYSIS_JSON_SCHEMA,
  JD_ANALYSIS_SYSTEM_PROMPT,
  JD_ANALYSIS_PROMPT_VERSION,
  JD_ANALYSIS_SCHEMA_VERSION,
} from '../ai';
import { AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';

export interface AnalyzeJobResult {
  status: 'completed' | 'unchanged' | 'pending_ai' | 'skipped' | 'failed';
  analysisId?: string;
  skipped?: boolean;
  reason?: string;
  injectionSuspected?: boolean;
}

export class IntelligenceService {
  /**
   * Analyzes a canonical job description using the AI layer with degraded mode fallback (Doc 11 §1, §10, Doc 03 INT-1).
   */
  async analyzeJob(
    jobId: string,
    options?: { force?: boolean }
  ): Promise<AnalyzeJobResult> {
    const db = getDb();
    // 1. Fetch canonical job and linked company
    const [job] = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        seniority: jobs.seniority,
        employmentType: jobs.employmentType,
        descriptionText: jobs.descriptionText,
        descriptionHash: jobs.descriptionHash,
        status: jobs.status,
        analysisStatus: jobs.analysisStatus,
        companyId: jobs.companyId,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (!job) {
      throw new AppError('NOT_FOUND', `Job ${jobId} not found`);
    }

    // Closed or archived jobs are skipped
    if (job.status === 'closed' || job.status === 'archived') {
      return {
        status: 'skipped',
        reason: `Job is currently ${job.status}`,
        skipped: true,
      };
    }

    // 2. Unchanged JD Check (T-AI-4)
    if (!options?.force) {
      const [existingAnalysis] = await db
        .select({ id: jobAnalyses.id })
        .from(jobAnalyses)
        .where(
          and(
            eq(jobAnalyses.jobId, jobId),
            eq(jobAnalyses.descriptionHash, job.descriptionHash),
            eq(jobAnalyses.schemaVersion, JD_ANALYSIS_SCHEMA_VERSION),
            eq(jobAnalyses.taskVersion, JD_ANALYSIS_PROMPT_VERSION)
          )
        )
        .limit(1);

      if (existingAnalysis) {
        return {
          status: 'unchanged',
          analysisId: existingAnalysis.id,
          skipped: true,
          reason: 'Job description hash and schema version unchanged',
        };
      }
    }

    // 3. Degraded Mode Check (Doc 11 §10)
    const aiStatus = await aiService.status();
    if (aiStatus.status !== 'available') {
      logger.info(
        { jobId, aiStatus: aiStatus.status },
        'AI layer is unavailable or degraded; setting job analysisStatus to pending_ai'
      );

      await db
        .update(jobs)
        .set({
          analysisStatus: 'pending_ai',
          statusReason: `Analysis pending AI availability (${aiStatus.status}: ${aiStatus.reason || 'provider unavailable'})`,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      return {
        status: 'pending_ai',
        reason: aiStatus.reason || `AI status is ${aiStatus.status}`,
      };
    }

    // 4. Mark job as analyzing
    await db
      .update(jobs)
      .set({
        analysisStatus: 'analyzing',
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    // Get company name if available
    let companyName: string | null = null;
    if (job.companyId) {
      const [comp] = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, job.companyId))
        .limit(1);
      if (comp) companyName = comp.name;
    }

    // 5. Build prompt & execute AI pipeline
    const promptParts = buildJdAnalysisPrompt({
      title: job.title,
      companyName,
      descriptionText: job.descriptionText,
    });

    try {
      const pipelineResult = await aiService.run<JdAnalysisOutput>(
        {
          task: 'jd_analysis',
          model: aiStatus.defaultModel,
          system: JD_ANALYSIS_SYSTEM_PROMPT,
          userContent: promptParts,
          schema: JdAnalysisOutputSchema,
          jsonSchema: JD_ANALYSIS_JSON_SCHEMA,
          temperature: 0.1,
        },
        {
          entityType: 'job',
          entityId: jobId,
        },
        {
          bypassCache: Boolean(options?.force),
        }
      );

      // 6. Semantic Validation (quote verification, skills normalization, year bounds)
      const validated = validateJdAnalysis(pipelineResult.data, job.descriptionText);

      // 7. Persist Analysis and Skills in DB Transaction
      let createdAnalysisId = '';

      await db.transaction(async (tx) => {
        // Upsert job_analyses row
        const [analysis] = await tx
          .insert(jobAnalyses)
          .values({
            jobId: job.id,
            descriptionHash: job.descriptionHash,
            schemaVersion: JD_ANALYSIS_SCHEMA_VERSION,
            taskVersion: JD_ANALYSIS_PROMPT_VERSION,
            model: pipelineResult.model,
            responsibilities: validated.output.responsibilities,
            seniority: validated.output.seniority || job.seniority,
            domain: validated.output.domain,
            techStack: validated.output.techStack,
            experienceMinYears: validated.output.experienceMinYears,
            experienceMaxYears: validated.output.experienceMaxYears,
            educationRequirements: validated.output.educationRequirements,
            employmentType: validated.output.employmentType || job.employmentType,
            locationConstraints: validated.output.locationConstraints,
            compMentions: validated.output.compMentions,
            applicationConditions: validated.output.applicationConditions,
            ambiguities: validated.output.ambiguities,
            injectionSuspected: validated.injectionSuspected,
            rawOutput: validated.output,
            tokensIn: pipelineResult.tokens?.inTokens ?? 0,
            tokensOut: pipelineResult.tokens?.outTokens ?? 0,
            createdAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              jobAnalyses.jobId,
              jobAnalyses.descriptionHash,
              jobAnalyses.schemaVersion,
              jobAnalyses.taskVersion,
            ],
            set: {
              model: pipelineResult.model,
              responsibilities: validated.output.responsibilities,
              seniority: validated.output.seniority || job.seniority,
              domain: validated.output.domain,
              techStack: validated.output.techStack,
              experienceMinYears: validated.output.experienceMinYears,
              experienceMaxYears: validated.output.experienceMaxYears,
              educationRequirements: validated.output.educationRequirements,
              employmentType: validated.output.employmentType || job.employmentType,
              locationConstraints: validated.output.locationConstraints,
              compMentions: validated.output.compMentions,
              applicationConditions: validated.output.applicationConditions,
              ambiguities: validated.output.ambiguities,
              injectionSuspected: validated.injectionSuspected,
              rawOutput: validated.output,
              tokensIn: pipelineResult.tokens?.inTokens ?? 0,
              tokensOut: pipelineResult.tokens?.outTokens ?? 0,
              createdAt: new Date(),
            },
          })
          .returning();

        if (!analysis) {
          throw new AppError('INTERNAL', 'Failed to insert job_analyses record');
        }
        createdAnalysisId = analysis.id;

        // Clear existing skills if re-analyzing
        await tx
          .delete(jobSkillRequirements)
          .where(eq(jobSkillRequirements.analysisId, analysis.id));

        // Insert job_skill_requirements
        if (validated.normalizedSkills.length > 0) {
          await tx.insert(jobSkillRequirements).values(
            validated.normalizedSkills.map((s) => ({
              analysisId: analysis.id,
              name: s.name,
              normalizedName: s.normalizedName,
              level: s.level,
              mandatory: s.mandatory,
              quote: s.quote,
              minYears: s.minYears,
              createdAt: new Date(),
            }))
          );
        }

        // Transition job status from 'new' to 'under_analysis' per Doc 10 §1
        let newStatus = job.status;
        if (job.status === 'new') {
          newStatus = 'under_analysis';

          await tx.insert(jobStatusHistory).values({
            jobId: job.id,
            fromStatus: 'new',
            toStatus: 'under_analysis',
            actor: 'system',
            reason: 'JD analysis completed',
            at: new Date(),
          });
        }

        // Update canonical job record
        await tx
          .update(jobs)
          .set({
            status: newStatus,
            analysisStatus: 'completed',
            seniority: job.seniority || validated.output.seniority || null,
            employmentType: job.employmentType || validated.output.employmentType || null,
            updatedAt: new Date(),
          })
          .where(eq(jobs.id, jobId));
      });

      return {
        status: 'completed',
        analysisId: createdAnalysisId,
        injectionSuspected: validated.injectionSuspected,
      };
    } catch (err: unknown) {
      logger.error({ err, jobId }, 'JD analysis failed');

      await db
        .update(jobs)
        .set({
          analysisStatus: 'failed',
          statusReason: `Analysis failed: ${(err as Error).message}`,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      return {
        status: 'failed',
        reason: (err as Error).message,
      };
    }
  }

  /**
   * Retrieves full analysis and extracted skills for a job.
   */
  async getJobAnalysis(jobId: string) {
    const db = getDb();
    const [analysis] = await db
      .select()
      .from(jobAnalyses)
      .where(eq(jobAnalyses.jobId, jobId))
      .orderBy(desc(jobAnalyses.createdAt))
      .limit(1);

    if (!analysis) return null;

    const skills = await db
      .select()
      .from(jobSkillRequirements)
      .where(eq(jobSkillRequirements.analysisId, analysis.id));

    return {
      ...analysis,
      skills,
    };
  }

  /**
   * Lists jobs whose analysis was deferred due to AI unavailability.
   */
  async listPendingAIJobs(limit = 50) {
    const db = getDb();
    return db
      .select({
        id: jobs.id,
        title: jobs.title,
        status: jobs.status,
        analysisStatus: jobs.analysisStatus,
        lastCheckedAt: jobs.lastCheckedAt,
      })
      .from(jobs)
      .where(eq(jobs.analysisStatus, 'pending_ai'))
      .limit(limit);
  }

  /**
   * Drains pending_ai jobs when AI availability is restored (Doc 11 §10).
   */
  async drainPendingAIJobs(limit = 20): Promise<{ processed: number; succeeded: number; failed: number }> {
    const pending = await this.listPendingAIJobs(limit);
    let succeeded = 0;
    let failed = 0;

    for (const job of pending) {
      try {
        const res = await this.analyzeJob(job.id);
        if (res.status === 'completed') succeeded += 1;
        else if (res.status === 'failed') failed += 1;
      } catch {
        failed += 1;
      }
    }

    return {
      processed: pending.length,
      succeeded,
      failed,
    };
  }
}

export const intelligenceService = new IntelligenceService();
