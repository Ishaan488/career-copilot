import { getDb } from '../../shared/db';
import {
  jobs,
  jobAnalyses,
  jobSkillRequirements,
  jobStatusHistory,
  companies,
  jobEvaluations,
  recommendationHistory,
} from '../../db/schema';
import { eq, and, desc, isNotNull, ne } from 'drizzle-orm';
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
  normalizeSkillName,
} from '../ai';
import { getOrCreateProfile, getPreferences, getAutonomyPolicy } from '../profile';
import { policyService } from '../policy';
import { getSetting, setSetting } from '../settings';
import {
  evaluateEligibility,
  OverallEligibility,
  CandidateProfileSnapshot,
  CandidatePreferencesSnapshot,
  JobEvaluationContext,
} from './domain/eligibility';
import {
  calculateSuitability,
  DEFAULT_SCORING_WEIGHTS,
  validateScoringWeights,
  ScoringWeights,
  JobScoringContext,
} from './domain/scoring';
import {
  assessRisk,
  JobRiskContext,
} from './domain/risk';
import {
  deriveRecommendation,
  JobRecommendation,
} from './domain/recommendation';
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

  /**
   * Evaluates a job against the candidate profile and preferences (Milestone 7).
   * Runs eligibility, suitability scoring, risk assessment, policy evaluation, and recommendation derivation.
   */
  async evaluateJob(
    jobId: string,
    _options?: { force?: boolean }
  ): Promise<{
    evaluationId: string;
    jobId: string;
    eligibility: OverallEligibility;
    suitabilityTotal: number;
    recommendation: JobRecommendation;
    policyDecision: string;
    explanation: string;
    status: string;
  }> {
    const db = getDb();

    // 1. Fetch canonical job
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (!job) {
      throw new AppError('NOT_FOUND', `Job with id '${jobId}' not found.`);
    }

    // 2. Fetch company if present
    let company: typeof companies.$inferSelect | null = null;
    if (job.companyId) {
      const [c] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, job.companyId))
        .limit(1);
      company = c ?? null;
    }

    // 3. Ensure analysis exists (chain analysis if missing)
    let analysis = await this.getJobAnalysis(jobId);
    if (!analysis) {
      await this.analyzeJob(jobId);
      analysis = await this.getJobAnalysis(jobId);
    }

    if (!analysis) {
      throw new AppError(
        'VALIDATION',
        `Job '${jobId}' must be analyzed before evaluation can run.`
      );
    }

    // 4. Load candidate profile, preferences, and autonomy policy
    const profile = await getOrCreateProfile();
    const preferences = await getPreferences();
    const autonomy = await getAutonomyPolicy();

    // 5. Load scoring weights from settings
    const storedWeights = await getSetting<Record<string, number>>('scoring.weights');
    const scoringWeights = toScoringWeights(storedWeights);

    // 6. Map to domain snapshots
    const profileSnapshot: CandidateProfileSnapshot = {
      workAuthorizations: profile.workAuthorizations.map((w) => ({
        country: w.country,
        status: w.status,
      })),
      experienceYears: profile.experience.reduce((acc, exp) => {
        const start = new Date(exp.startDate);
        const end = exp.endDate ? new Date(exp.endDate) : new Date();
        const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        return acc + (years > 0 ? years : 0);
      }, 0),
      education: profile.education.map((e) => ({
        degree: e.degree || '',
        field: e.department || undefined,
      })),
      skills: profile.skills.map((s) => ({
        name: s.name,
        normalizedName: s.normalizedName || normalizeSkillName(s.name),
        level: s.proficiency >= 4 ? 'advanced' : s.proficiency >= 3 ? 'intermediate' : 'beginner',
      })),
    };

    const parsedLocations = Array.isArray(preferences.locations)
      ? (preferences.locations as Array<{ city?: string; country?: string }>).map((l) => l.city || l.country || '')
      : [];

    const preferencesSnapshot: CandidatePreferencesSnapshot = {
      preferredRoles: (preferences.preferredRoles as string[]) || [],
      workModes: (preferences.workModes as string[]) || [],
      preferredLocations: parsedLocations.filter(Boolean),
      willingToRelocate: true,
      minSalary: preferences.minComp ? Number(preferences.minComp) : undefined,
      preferredSalary: preferences.preferredComp ? Number(preferences.preferredComp) : undefined,
      currency: preferences.compCurrency || 'INR',
    };

    const skillsForEvaluation = (analysis.skills || []).map((s) => ({
      name: s.name,
      normalizedName: s.normalizedName || normalizeSkillName(s.name),
      mandatory: s.mandatory,
      level: s.level || (s.mandatory ? 'required' : 'preferred'),
      quote: s.quote ?? null,
    }));

    const jobEvalContext: JobEvaluationContext = {
      title: job.title,
      location: job.locationRaw || job.city || null,
      workMode: job.workMode,
      experienceMinYears: analysis.experienceMinYears,
      skills: skillsForEvaluation,
      locationConstraints: (analysis.locationConstraints as string[]) || [],
    };

    const jobScoringContext: JobScoringContext = {
      title: job.title,
      descriptionText: job.descriptionText || '',
      responsibilities: (analysis.responsibilities as string[]) || [],
      seniority: job.seniority || analysis.seniority || null,
      experienceMinYears: analysis.experienceMinYears,
      experienceMaxYears: analysis.experienceMaxYears,
      workMode: job.workMode,
      location: job.locationRaw || job.city || null,
      compMin: job.compMin ? Number(job.compMin) : null,
      compMax: job.compMax ? Number(job.compMax) : null,
      compCurrency: job.compCurrency,
      skills: skillsForEvaluation.map((s) => ({
        name: s.name,
        normalizedName: s.normalizedName,
        level: s.level,
      })),
      companyName: company?.name || undefined,
      isPreferredCompany: company?.discoveryStatus === 'monitoring',
    };

    const jobRiskContext: JobRiskContext = {
      title: job.title,
      descriptionText: job.descriptionText || '',
      ambiguities: (analysis.ambiguities as string[]) || [],
      injectionSuspected: analysis.injectionSuspected,
      workMode: job.workMode,
      locationConstraints: (analysis.locationConstraints as string[]) || [],
    };

    // 7. Pure Domain Evaluations
    const eligibility = evaluateEligibility(
      jobEvalContext,
      profileSnapshot,
      preferencesSnapshot
    );

    const suitability = calculateSuitability(
      jobScoringContext,
      profileSnapshot,
      preferencesSnapshot,
      scoringWeights
    );

    const risk = assessRisk(jobRiskContext);

    const recommendationResult = deriveRecommendation({
      hasDescriptionText: Boolean(job.descriptionText && job.descriptionText.trim().length > 0),
      eligibility: eligibility.eligibility,
      suitabilityTotal: suitability.suitabilityTotal,
      breakdown: suitability.breakdown,
      riskLevel: risk.level,
      riskFactors: risk.factors,
    });

    // 8. Policy Evaluation
    const policyResult = await policyService.evaluatePolicy(
      'job',
      job.id,
      {
        companyName: company?.name || undefined,
        title: job.title,
        workMode: job.workMode,
        suitabilityScore: suitability.suitabilityTotal,
        recommendation: recommendationResult.recommendation,
        riskLevel: risk.level,
        disclosedSalary: job.compMin ? Number(job.compMin) : null,
      },
      { persist: true }
    );

    // 9. Status Transition Logic
    let nextStatus = job.status;
    let statusReason = job.statusReason;

    if (recommendationResult.recommendation === 'not_eligible') {
      nextStatus = 'rejected';
      statusReason = 'Ineligible: failed mandatory requirements';
    } else if (
      autonomy.autoShortlist &&
      suitability.suitabilityTotal >= (autonomy.shortlistThreshold ?? 70) &&
      policyResult.decision === 'allow'
    ) {
      nextStatus = 'shortlisted';
      statusReason = `Auto-shortlisted (Score ${suitability.suitabilityTotal.toFixed(1)} >= ${autonomy.shortlistThreshold})`;
    } else if (['strongly_recommended', 'recommended', 'consider'].includes(recommendationResult.recommendation)) {
      if (job.status === 'under_analysis' || job.status === 'new') {
        nextStatus = 'recommended';
        statusReason = `Evaluation score ${suitability.suitabilityTotal.toFixed(1)}`;
      }
    }

    // 10. Persist Evaluation Record in DB
    const [insertedEval] = await db
      .insert(jobEvaluations)
      .values({
        jobId: job.id,
        analysisId: analysis.id,
        profileRevisionId: null,
        weights: scoringWeights as unknown as Record<string, unknown>,
        eligibility: eligibility.eligibility,
        eligibilityRules: eligibility.rules as unknown as Record<string, unknown>[],
        suitabilityTotal: suitability.suitabilityTotal.toFixed(2),
        breakdown: suitability.breakdown as unknown as Record<string, unknown>,
        riskLevel: risk.level,
        riskFactors: risk.factors as unknown as Record<string, unknown>[],
        compAssessment: suitability.breakdown.compensation as unknown as Record<string, unknown>,
        companyAssessment: suitability.breakdown.company as unknown as Record<string, unknown>,
        recommendation: recommendationResult.recommendation,
        explanation: recommendationResult.explanation,
        evidenceIds: [],
      })
      .returning();

    if (!insertedEval) {
      throw new AppError('INTERNAL', 'Failed to insert job evaluation record');
    }

    // 11. Record Recommendation History
    await db.insert(recommendationHistory).values({
      jobId: job.id,
      evaluationId: insertedEval.id,
      recommendation: recommendationResult.recommendation,
      changedFrom: job.recommendation ?? null,
    });

    // 12. Update Job
    await db
      .update(jobs)
      .set({
        score: suitability.suitabilityTotal.toFixed(2),
        recommendation: recommendationResult.recommendation,
        status: nextStatus,
        statusReason,
        lastCheckedAt: new Date(),
      })
      .where(eq(jobs.id, job.id));

    // 13. Audit Status Change if changed
    if (nextStatus !== job.status) {
      await db.insert(jobStatusHistory).values({
        jobId: job.id,
        fromStatus: job.status,
        toStatus: nextStatus,
        actor: 'system',
        reason: statusReason,
      });
    }

    logger.info(
      {
        jobId: job.id,
        recommendation: recommendationResult.recommendation,
        score: suitability.suitabilityTotal,
        policyDecision: policyResult.decision,
      },
      '[IntelligenceService] Job evaluated successfully'
    );

    return {
      evaluationId: insertedEval.id,
      jobId: job.id,
      eligibility: eligibility.eligibility,
      suitabilityTotal: suitability.suitabilityTotal,
      recommendation: recommendationResult.recommendation,
      policyDecision: policyResult.decision,
      explanation: recommendationResult.explanation,
      status: nextStatus,
    };
  }

  /**
   * Retrieves the latest evaluation and breakdown for a job.
   */
  async getJobEvaluation(jobId: string) {
    const db = getDb();
    const [evaluation] = await db
      .select()
      .from(jobEvaluations)
      .where(eq(jobEvaluations.jobId, jobId))
      .orderBy(desc(jobEvaluations.createdAt))
      .limit(1);

    return evaluation ?? null;
  }

  /**
   * Retrieves current scoring weights from system settings.
   */
  async getScoringWeights(): Promise<ScoringWeights> {
    const stored = await getSetting<Record<string, number>>('scoring.weights');
    return toScoringWeights(stored);
  }

  /**
   * Updates scoring weights in system settings after validating that they sum to 100%.
   */
  async updateScoringWeights(weights: Partial<ScoringWeights>): Promise<ScoringWeights> {
    const current = await this.getScoringWeights();
    const updated: ScoringWeights = {
      technical: weights.technical ?? current.technical,
      role: weights.role ?? current.role,
      experience: weights.experience ?? current.experience,
      compensation: weights.compensation ?? current.compensation,
      location: weights.location ?? current.location,
      company: weights.company ?? current.company,
    };
    validateScoringWeights(updated);
    await setSetting('scoring.weights', updated);
    return updated;
  }

  /**
   * Lists recommended jobs sorted by suitability score descending.
   */
  async listRecommendedJobs(filter?: {
    limit?: number;
    offset?: number;
    minScore?: number;
    recommendation?: JobRecommendation;
  }) {
    const db = getDb();
    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    const conditions = [
      isNotNull(jobs.recommendation),
      ne(jobs.recommendation, 'not_eligible'),
    ];

    if (filter?.recommendation) {
      conditions.push(eq(jobs.recommendation, filter.recommendation));
    }

    const rows = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        companyId: jobs.companyId,
        companyName: companies.name,
        location: jobs.locationRaw,
        workMode: jobs.workMode,
        seniority: jobs.seniority,
        score: jobs.score,
        recommendation: jobs.recommendation,
        status: jobs.status,
        statusReason: jobs.statusReason,
        postedAt: jobs.postedAt,
        firstDiscoveredAt: jobs.firstDiscoveredAt,
      })
      .from(jobs)
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .where(and(...conditions))
      .orderBy(desc(jobs.score))
      .limit(limit)
      .offset(offset);

    return rows;
  }
}

function toScoringWeights(weights?: Record<string, number> | null): ScoringWeights {
  if (!weights) return DEFAULT_SCORING_WEIGHTS;
  return {
    technical: weights.technical ?? weights.technicalSkillMatch ?? DEFAULT_SCORING_WEIGHTS.technical,
    role: weights.role ?? weights.roleMatch ?? DEFAULT_SCORING_WEIGHTS.role,
    experience: weights.experience ?? weights.experienceMatch ?? DEFAULT_SCORING_WEIGHTS.experience,
    compensation: weights.compensation ?? weights.compensationMatch ?? DEFAULT_SCORING_WEIGHTS.compensation,
    location: weights.location ?? weights.locationMatch ?? DEFAULT_SCORING_WEIGHTS.location,
    company: weights.company ?? weights.companyAttractiveness ?? DEFAULT_SCORING_WEIGHTS.company,
  };
}

export const intelligenceService = new IntelligenceService();
