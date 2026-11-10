import { eq, and, or, inArray, desc, asc, sql, ilike } from 'drizzle-orm';
import { getDb } from '@/shared/db';
import { AppError } from '@/shared/errors';
import {
  jobSources,
  sourceSyncRuns,
  jobs,
  jobSourceListings,
  jobSnapshots,
  jobStatusHistory,
  companies,
} from '@/db/schema';
import { getBoardsForDiscovery } from '@/modules/company-discovery';
import { getPreferences } from '@/modules/profile';
import { enqueue } from '@/modules/queue';
import {
  SeniorityLevel,
  WorkMode,
  EmploymentType,
} from './domain/normalize';
import {
  evaluateDeduplication,
} from './domain/dedupe';
import {
  validateJobTransition,
  JobStatus,
  StateActor,
} from './domain/state-machine';
import {
  evaluatePrefilter,
  PrefilterPreferences,
} from './domain/prefilter';
import {
  getSourceAdapter,
  SourceType,
  RawListing,
  createManualListing,
} from './adapters';

export interface SyncRunResult {
  runId: string;
  sourceId: string;
  status: 'succeeded' | 'failed' | 'partial';
  newCount: number;
  changedCount: number;
  unchangedCount: number;
  failedCount: number;
  error?: string;
}

export interface ReconcileResult {
  reconciledCount: number;
  createdCount: number;
  updatedCount: number;
}

export interface ManualJobInput {
  title: string;
  companyId?: string | null;
  companyName?: string | null;
  descriptionText: string;
  applicationUrl?: string | null;
  locationRaw?: string | null;
  workMode?: WorkMode;
  employmentType?: EmploymentType | null;
  compMin?: string | null;
  compMax?: string | null;
  compCurrency?: string | null;
  compPeriod?: 'yearly' | 'monthly' | 'hourly' | null;
}

export interface JobSearchFilters {
  status?: JobStatus;
  seniority?: SeniorityLevel;
  workMode?: WorkMode;
  companyId?: string;
  searchTerm?: string;
  limit?: number;
  offset?: number;
}

/**
 * Reconciles confirmed company career pages with job_sources table.
 * Derived sources are created/updated exclusively by this function.
 */
export async function reconcileSources(): Promise<ReconcileResult> {
  const db = getDb();
  const boards = await getBoardsForDiscovery();

  let createdCount = 0;
  let updatedCount = 0;

  for (const board of boards) {
    // Determine config payload based on ATS type
    let configPayload: Record<string, string> = {};
    if (board.atsType === 'greenhouse') {
      configPayload = { boardToken: board.boardId };
    } else if (board.atsType === 'lever') {
      configPayload = { company: board.boardId };
    } else if (board.atsType === 'ashby') {
      configPayload = { jobBoardName: board.boardId };
    } else if (board.atsType === 'smartrecruiters') {
      configPayload = { companyId: board.boardId };
    }

    const sourceName = `${board.companyName} (${board.atsType})`;

    // Check if source already exists for this careerPageId
    const [existing] = await db
      .select()
      .from(jobSources)
      .where(eq(jobSources.careerPageId, board.careerPageId))
      .limit(1);

    if (existing) {
      await db
        .update(jobSources)
        .set({
          name: sourceName,
          type: board.atsType,
          config: configPayload,
          companyId: board.companyId,
          updatedAt: new Date(),
        })
        .where(eq(jobSources.id, existing.id));
      updatedCount++;
    } else {
      await db.insert(jobSources).values({
        name: sourceName,
        type: board.atsType,
        config: configPayload,
        origin: 'derived_from_company',
        companyId: board.companyId,
        careerPageId: board.careerPageId,
        enabled: true,
        status: 'idle',
      });
      createdCount++;
    }
  }

  return {
    reconciledCount: boards.length,
    createdCount,
    updatedCount,
  };
}

/**
 * Runs synchronization for a single job source.
 * Isolated in try/catch — never throws unhandled errors to caller or queue.
 */
export async function runSourceSync(sourceId: string): Promise<SyncRunResult> {
  const db = getDb();

  // 1. Fetch source
  const [source] = await db
    .select()
    .from(jobSources)
    .where(eq(jobSources.id, sourceId))
    .limit(1);

  if (!source) {
    throw new AppError('NOT_FOUND', `Job source '${sourceId}' not found`);
  }

  if (!source.enabled) {
    return {
      runId: 'none',
      sourceId,
      status: 'succeeded',
      newCount: 0,
      changedCount: 0,
      unchangedCount: 0,
      failedCount: 0,
    };
  }

  // 2. Start sync run record
  const [run] = await db
    .insert(sourceSyncRuns)
    .values({
      sourceId,
      status: 'running',
      newCount: 0,
      changedCount: 0,
      unchangedCount: 0,
      failedCount: 0,
    })
    .returning();

  if (!run) {
    throw new AppError('INTERNAL', 'Failed to create sync run record');
  }

  await db
    .update(jobSources)
    .set({ status: 'running', updatedAt: new Date() })
    .where(eq(jobSources.id, sourceId));

  let newCount = 0;
  let changedCount = 0;
  let unchangedCount = 0;
  let failedCount = 0;
  const seenExternalIds = new Set<string>();

  try {
    const adapter = getSourceAdapter(source.type as SourceType);

    // Fetch user preferences for pre-filtering
    let prefilterPrefs: PrefilterPreferences | undefined;
    try {
      const prefs = await getPreferences();
      if (prefs) {
        const rawExcludedComp = Array.isArray(prefs.excludedCompanies)
          ? (prefs.excludedCompanies as string[])
          : [];
        const rawExcludedTitles = Array.isArray(prefs.excludedRoles)
          ? (prefs.excludedRoles as string[])
          : [];
        const rawWorkModes = Array.isArray(prefs.workModes)
          ? (prefs.workModes as string[])
          : [];

        prefilterPrefs = {
          excludedCompanies: rawExcludedComp,
          excludedTitles: rawExcludedTitles,
          requiredWorkModes: rawWorkModes,
          minimumComp:
            prefs.minComp != null
              ? {
                  amount: Number(prefs.minComp),
                  currency: prefs.compCurrency || 'INR',
                  period: (prefs.compPeriod === 'annual' ? 'yearly' : (prefs.compPeriod as 'yearly' | 'monthly' | 'hourly')) || 'yearly',
                }
              : null,
        };
      }
    } catch {
      // Preferences not found or uninitialized; proceed without prefilter restrictions
    }

    // 3. Iterate through listings
    for await (const page of adapter.fetchListings({ config: source.config })) {
      for (const rawListing of page.items) {
        seenExternalIds.add(rawListing.externalId);

        try {
          // Check if this listing was already discovered for this source
          const [existingListing] = await db
            .select()
            .from(jobSourceListings)
            .where(
              and(
                eq(jobSourceListings.sourceId, sourceId),
                eq(jobSourceListings.externalId, rawListing.externalId)
              )
            )
            .limit(1);

          if (existingListing) {
            if (existingListing.lastHash === rawListing.contentHash) {
              // Unchanged
              unchangedCount++;
              await db
                .update(jobSourceListings)
                .set({
                  lastSeenAt: new Date(),
                  missingCount: 0,
                  status: 'active',
                  updatedAt: new Date(),
                })
                .where(eq(jobSourceListings.id, existingListing.id));
            } else {
              // Changed
              changedCount++;
              const extracted = adapter.extract(rawListing);

              // Update canonical job
              await db
                .update(jobs)
                .set({
                  title: extracted.title,
                  normalizedTitle: extracted.normalizedTitle,
                  seniority: extracted.seniority,
                  descriptionText: extracted.descriptionText,
                  descriptionHtml: extracted.descriptionHtml,
                  locationRaw: extracted.locationRaw,
                  city: extracted.city,
                  country: extracted.country,
                  workMode: extracted.workMode,
                  employmentType: extracted.employmentType,
                  compMin: extracted.compMin,
                  compMax: extracted.compMax,
                  compCurrency: extracted.compCurrency,
                  compPeriod: extracted.compPeriod,
                  compDisclosed: extracted.compDisclosed,
                  descriptionHash: extracted.contentHash,
                  lastCheckedAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(jobs.id, existingListing.jobId));

              // Record new snapshot
              await db.insert(jobSnapshots).values({
                listingId: existingListing.id,
                contentHash: rawListing.contentHash,
                raw: rawListing.rawPayload as Record<string, unknown>,
              });

              // Update listing
              await db
                .update(jobSourceListings)
                .set({
                  lastHash: rawListing.contentHash,
                  lastSeenAt: new Date(),
                  missingCount: 0,
                  status: 'active',
                  updatedAt: new Date(),
                })
                .where(eq(jobSourceListings.id, existingListing.id));
            }
          } else {
            // New listing
            newCount++;
            const extracted = adapter.extract(rawListing);

            // Deduplication against existing jobs
            let targetJobId: string | null = null;
            let possibleDuplicateOf: string | null = null;

            // Search potential matches (by canonical URL or same company)
            const queryConditions = [];
            if (extracted.canonicalUrl) {
              queryConditions.push(eq(jobs.canonicalUrl, extracted.canonicalUrl));
            }
            if (source.companyId) {
              queryConditions.push(eq(jobs.companyId, source.companyId));
            }

            const candidateJobs = queryConditions.length > 0
              ? await db
                  .select()
                  .from(jobs)
                  .where(or(...queryConditions))
                  .limit(20)
              : [];

            for (const cand of candidateJobs) {
              const dedupeResult = evaluateDeduplication({
                incoming: {
                  externalId: rawListing.externalId,
                  sourceId,
                  url: extracted.canonicalUrl || extracted.applicationUrl,
                  companyId: source.companyId,
                  normalizedTitle: extracted.normalizedTitle,
                  locationRaw: extracted.locationRaw,
                  descriptionText: extracted.descriptionText,
                },
                existing: {
                  id: cand.id,
                  canonicalUrl: cand.canonicalUrl,
                  companyId: cand.companyId,
                  normalizedTitle: cand.normalizedTitle,
                  locationRaw: cand.locationRaw,
                  descriptionText: cand.descriptionText,
                },
              });

              if (dedupeResult.type === 'exact_url' || dedupeResult.type === 'merge_match') {
                targetJobId = dedupeResult.jobId;
                break;
              } else if (dedupeResult.type === 'possible_duplicate' && !possibleDuplicateOf) {
                possibleDuplicateOf = dedupeResult.jobId;
              }
            }

            // Run deterministic prefilter
            const prefilter = evaluatePrefilter(
              {
                companyName: source.name,
                normalizedTitle: extracted.normalizedTitle,
                workMode: extracted.workMode,
                compDisclosed: extracted.compDisclosed,
                compMin: extracted.compMin,
                compMax: extracted.compMax,
                compCurrency: extracted.compCurrency,
                compPeriod: extracted.compPeriod,
              },
              prefilterPrefs
            );

            let createdListingId: string;

            if (targetJobId) {
              // Link listing to existing canonical job
              const [newListing] = await db
                .insert(jobSourceListings)
                .values({
                  jobId: targetJobId,
                  sourceId,
                  externalId: rawListing.externalId,
                  listingUrl: rawListing.url,
                  status: 'active',
                  lastHash: rawListing.contentHash,
                })
                .returning();
              if (!newListing) continue;
              createdListingId = newListing.id;
            } else {
              // Create new canonical job
              const [newJob] = await db
                .insert(jobs)
                .values({
                  companyId: source.companyId,
                  title: extracted.title,
                  normalizedTitle: extracted.normalizedTitle,
                  seniority: extracted.seniority,
                  descriptionText: extracted.descriptionText,
                  descriptionHtml: extracted.descriptionHtml,
                  locationRaw: extracted.locationRaw,
                  city: extracted.city,
                  country: extracted.country,
                  workMode: extracted.workMode,
                  employmentType: extracted.employmentType,
                  compMin: extracted.compMin,
                  compMax: extracted.compMax,
                  compCurrency: extracted.compCurrency,
                  compPeriod: extracted.compPeriod,
                  compDisclosed: extracted.compDisclosed,
                  postedAt: extracted.postedAt,
                  applicationUrl: extracted.applicationUrl,
                  canonicalUrl: extracted.canonicalUrl,
                  status: 'new',
                  descriptionHash: extracted.contentHash,
                  possibleDuplicateOf,
                  prefilterResult: prefilter,
                })
                .returning();

              if (!newJob) continue;

              // Insert status history
              await db.insert(jobStatusHistory).values({
                jobId: newJob.id,
                fromStatus: 'none',
                toStatus: 'new',
                actor: 'system',
                reason: `Initial discovery via source '${source.name}'`,
              });

              // Trigger async AI analysis if eligible
              try {
                await enqueue('intel.analyze', { jobId: newJob.id }, { singletonKey: `intel.analyze.${newJob.id}` });
              } catch {
                // Queue may not be running in isolated test mode
              }

              // Create listing
              const [newListing] = await db
                .insert(jobSourceListings)
                .values({
                  jobId: newJob.id,
                  sourceId,
                  externalId: rawListing.externalId,
                  listingUrl: rawListing.url,
                  status: 'active',
                  lastHash: rawListing.contentHash,
                })
                .returning();

              if (!newListing) continue;
              createdListingId = newListing.id;

              // Update primary listing id
              await db
                .update(jobs)
                .set({ primaryListingId: createdListingId })
                .where(eq(jobs.id, newJob.id));
            }

            // Create initial snapshot
            await db.insert(jobSnapshots).values({
              listingId: createdListingId,
              contentHash: rawListing.contentHash,
              raw: rawListing.rawPayload as Record<string, unknown>,
            });
          }
        } catch {
          failedCount++;
        }
      }
    }

    // 4. Missing listings tracking
    const existingActiveListings = await db
      .select()
      .from(jobSourceListings)
      .where(
        and(
          eq(jobSourceListings.sourceId, sourceId),
          eq(jobSourceListings.status, 'active')
        )
      );

    for (const listing of existingActiveListings) {
      if (!seenExternalIds.has(listing.externalId)) {
        const nextMissingCount = listing.missingCount + 1;
        const newStatus = nextMissingCount >= 2 ? 'closed' : 'active';

        await db
          .update(jobSourceListings)
          .set({
            missingCount: nextMissingCount,
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(jobSourceListings.id, listing.id));

        // If listing is now closed, check if ALL listings for this job are closed
        if (newStatus === 'closed') {
          const remainingActive = await db
            .select()
            .from(jobSourceListings)
            .where(
              and(
                eq(jobSourceListings.jobId, listing.jobId),
                eq(jobSourceListings.status, 'active')
              )
            );

          if (remainingActive.length === 0) {
            // Check current job status
            const [job] = await db
              .select()
              .from(jobs)
              .where(eq(jobs.id, listing.jobId))
              .limit(1);

            if (job && !['closed', 'applied', 'archived'].includes(job.status)) {
              await transitionJobStatus(
                job.id,
                'closed',
                'system',
                'Listing no longer present on career portal'
              );
            }
          }
        }
      }
    }

    // 5. Complete sync run
    await db
      .update(sourceSyncRuns)
      .set({
        status: 'succeeded',
        newCount,
        changedCount,
        unchangedCount,
        failedCount,
        finishedAt: new Date(),
      })
      .where(eq(sourceSyncRuns.id, run.id));

    await db
      .update(jobSources)
      .set({
        status: 'idle',
        lastSuccessAt: new Date(),
        consecutiveFailures: 0,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(jobSources.id, sourceId));

    return {
      runId: run.id,
      sourceId,
      status: 'succeeded',
      newCount,
      changedCount,
      unchangedCount,
      failedCount,
    };
  } catch (err) {
    const errorMsg = (err as Error).message || 'Unknown sync error';

    await db
      .update(sourceSyncRuns)
      .set({
        status: 'failed',
        error: errorMsg,
        newCount,
        changedCount,
        unchangedCount,
        failedCount,
        finishedAt: new Date(),
      })
      .where(eq(sourceSyncRuns.id, run.id));

    const nextFailures = source.consecutiveFailures + 1;
    await db
      .update(jobSources)
      .set({
        status: nextFailures >= 3 ? 'failing' : 'idle',
        consecutiveFailures: nextFailures,
        lastError: errorMsg,
        updatedAt: new Date(),
      })
      .where(eq(jobSources.id, sourceId));

    return {
      runId: run.id,
      sourceId,
      status: 'failed',
      newCount,
      changedCount,
      unchangedCount,
      failedCount,
      error: errorMsg,
    };
  }
}

/**
 * Imports a job posting from an arbitrary URL.
 */
export async function importJobUrl(
  url: string,
  companyId?: string
): Promise<{ job: typeof jobs.$inferSelect; listing: typeof jobSourceListings.$inferSelect }> {
  const db = getDb();

  // Find or create a 'url_import' source
  let [importSource] = await db
    .select()
    .from(jobSources)
    .where(eq(jobSources.type, 'url_import'))
    .limit(1);

  if (!importSource) {
    [importSource] = await db
      .insert(jobSources)
      .values({
        name: 'Direct URL Importer',
        type: 'url_import',
        config: {},
        origin: 'manual',
        status: 'idle',
      })
      .returning();
  }

  if (!importSource) {
    throw new AppError('INTERNAL', 'Failed to resolve URL import source');
  }

  const adapter = getSourceAdapter('url_import');
  let rawListing: RawListing | undefined;

  for await (const page of adapter.fetchListings({ config: { url } })) {
    if (page.items.length > 0) {
      rawListing = page.items[0];
      break;
    }
  }

  if (!rawListing) {
    throw new AppError('VALIDATION', `Failed to extract job posting from URL: ${url}`);
  }

  const extracted = adapter.extract(rawListing);

  // Check if job already exists by canonical URL
  const [existing] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.canonicalUrl, extracted.canonicalUrl || url))
    .limit(1);

  if (existing) {
    const [listing] = await db
      .select()
      .from(jobSourceListings)
      .where(eq(jobSourceListings.jobId, existing.id))
      .limit(1);
    if (!listing) {
      throw new AppError('NOT_FOUND', 'Listing record not found for existing job');
    }
    return { job: existing, listing };
  }

  // Create canonical job
  const [newJob] = await db
    .insert(jobs)
    .values({
      companyId: companyId || null,
      title: extracted.title,
      normalizedTitle: extracted.normalizedTitle,
      seniority: extracted.seniority,
      descriptionText: extracted.descriptionText,
      descriptionHtml: extracted.descriptionHtml,
      locationRaw: extracted.locationRaw,
      city: extracted.city,
      country: extracted.country,
      workMode: extracted.workMode,
      employmentType: extracted.employmentType,
      compMin: extracted.compMin,
      compMax: extracted.compMax,
      compCurrency: extracted.compCurrency,
      compPeriod: extracted.compPeriod,
      compDisclosed: extracted.compDisclosed,
      postedAt: extracted.postedAt || new Date(),
      applicationUrl: extracted.applicationUrl || url,
      canonicalUrl: extracted.canonicalUrl || url,
      status: 'new',
      descriptionHash: extracted.contentHash,
    })
    .returning();

  if (!newJob) {
    throw new AppError('INTERNAL', 'Failed to insert canonical job');
  }

  // Create status history
  await db.insert(jobStatusHistory).values({
    jobId: newJob.id,
    fromStatus: 'none',
    toStatus: 'new',
    actor: 'user',
    reason: `Manual URL import from ${url}`,
  });

  try {
    await enqueue('intel.analyze', { jobId: newJob.id }, { singletonKey: `intel.analyze.${newJob.id}` });
  } catch {
    // Queue may not be running in isolated mode
  }

  // Create listing
  const [listing] = await db
    .insert(jobSourceListings)
    .values({
      jobId: newJob.id,
      sourceId: importSource.id,
      externalId: url,
      listingUrl: url,
      status: 'active',
      lastHash: rawListing.contentHash,
    })
    .returning();

  if (!listing) {
    throw new AppError('INTERNAL', 'Failed to insert source listing');
  }

  await db.insert(jobSnapshots).values({
    listingId: listing.id,
    contentHash: rawListing.contentHash,
    raw: rawListing.rawPayload as Record<string, unknown>,
  });

  await db
    .update(jobs)
    .set({ primaryListingId: listing.id })
    .where(eq(jobs.id, newJob.id));

  return { job: newJob, listing };
}

/**
 * Creates a job manually from form input.
 */
export async function createManualJob(
  input: ManualJobInput
): Promise<{ job: typeof jobs.$inferSelect; listing: typeof jobSourceListings.$inferSelect }> {
  const db = getDb();

  // Find or create manual_paste source
  let [manualSource] = await db
    .select()
    .from(jobSources)
    .where(eq(jobSources.type, 'manual_paste'))
    .limit(1);

  if (!manualSource) {
    [manualSource] = await db
      .insert(jobSources)
      .values({
        name: 'Manual Jobs',
        type: 'manual_paste',
        config: {},
        origin: 'manual',
        status: 'idle',
      })
      .returning();
  }

  if (!manualSource) {
    throw new AppError('INTERNAL', 'Failed to initialize manual job source');
  }

  const rawListing = createManualListing({
    title: input.title,
    descriptionText: input.descriptionText,
    applicationUrl: input.applicationUrl || undefined,
    locationRaw: input.locationRaw || undefined,
    workMode: input.workMode,
    employmentType: input.employmentType || undefined,
    compMin: input.compMin || undefined,
    compMax: input.compMax || undefined,
    compCurrency: input.compCurrency || undefined,
    compPeriod: input.compPeriod || undefined,
  });

  const adapter = getSourceAdapter('manual_paste');
  const extracted = adapter.extract(rawListing);

  const [newJob] = await db
    .insert(jobs)
    .values({
      companyId: input.companyId || null,
      title: extracted.title,
      normalizedTitle: extracted.normalizedTitle,
      seniority: extracted.seniority,
      descriptionText: extracted.descriptionText,
      descriptionHtml: extracted.descriptionHtml,
      locationRaw: extracted.locationRaw,
      city: extracted.city,
      country: extracted.country,
      workMode: extracted.workMode,
      employmentType: extracted.employmentType,
      compMin: extracted.compMin,
      compMax: extracted.compMax,
      compCurrency: extracted.compCurrency,
      compPeriod: extracted.compPeriod,
      compDisclosed: extracted.compDisclosed,
      postedAt: extracted.postedAt || new Date(),
      applicationUrl: extracted.applicationUrl,
      canonicalUrl: extracted.canonicalUrl,
      status: 'new',
      descriptionHash: extracted.contentHash,
    })
    .returning();

  if (!newJob) {
    throw new AppError('INTERNAL', 'Failed to insert manual job');
  }

  await db.insert(jobStatusHistory).values({
    jobId: newJob.id,
    fromStatus: 'none',
    toStatus: 'new',
    actor: 'user',
    reason: 'Manual job entry',
  });

  try {
    await enqueue('intel.analyze', { jobId: newJob.id }, { singletonKey: `intel.analyze.${newJob.id}` });
  } catch {
    // Queue may not be running in isolated mode
  }

  const [listing] = await db
    .insert(jobSourceListings)
    .values({
      jobId: newJob.id,
      sourceId: manualSource.id,
      externalId: rawListing.externalId,
      listingUrl: input.applicationUrl || `manual:${newJob.id}`,
      status: 'active',
      lastHash: rawListing.contentHash,
    })
    .returning();

  if (!listing) {
    throw new AppError('INTERNAL', 'Failed to insert manual job listing');
  }

  await db.insert(jobSnapshots).values({
    listingId: listing.id,
    contentHash: rawListing.contentHash,
    raw: rawListing.rawPayload as Record<string, unknown>,
  });

  await db
    .update(jobs)
    .set({ primaryListingId: listing.id })
    .where(eq(jobs.id, newJob.id));

  return { job: newJob, listing };
}

/**
 * Transitions job status with full state-machine validation and audit history.
 */
export async function transitionJobStatus(
  jobId: string,
  toStatus: JobStatus,
  actor: StateActor,
  reason?: string,
  decisionId?: string
): Promise<typeof jobs.$inferSelect> {
  const db = getDb();

  return await db.transaction(async (tx) => {
    const [currentJob] = await tx
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (!currentJob) {
      throw new AppError('NOT_FOUND', `Job '${jobId}' not found`);
    }

    // Validate transition
    validateJobTransition(currentJob.status as JobStatus, toStatus, actor);

    // Update job
    const [updated] = await tx
      .update(jobs)
      .set({
        status: toStatus,
        statusReason: reason || null,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId))
      .returning();

    if (!updated) {
      throw new AppError('NOT_FOUND', `Job '${jobId}' not found`);
    }

    // Insert history
    await tx.insert(jobStatusHistory).values({
      jobId,
      fromStatus: currentJob.status,
      toStatus,
      actor,
      reason: reason || null,
      decisionId: decisionId || null,
    });

    return updated;
  });
}

/**
 * Searches and filters canonical jobs.
 */
export async function searchJobs(filters: JobSearchFilters = {}) {
  const db = getDb();
  const conditions = [];

  if (filters.status) {
    conditions.push(eq(jobs.status, filters.status));
  }
  if (filters.seniority) {
    conditions.push(eq(jobs.seniority, filters.seniority));
  }
  if (filters.workMode) {
    conditions.push(eq(jobs.workMode, filters.workMode));
  }
  if (filters.companyId) {
    conditions.push(eq(jobs.companyId, filters.companyId));
  }
  if (filters.searchTerm) {
    const term = `%${filters.searchTerm.trim()}%`;
    conditions.push(
      or(
        ilike(jobs.title, term),
        ilike(jobs.descriptionText, term),
        ilike(jobs.locationRaw, term)
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  const rows = await db
    .select({
      job: jobs,
      company: {
        id: companies.id,
        name: companies.name,
        primaryDomain: companies.primaryDomain,
      },
    })
    .from(jobs)
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .where(whereClause)
    .orderBy(desc(jobs.postedAt), desc(jobs.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalRes] = await db
    .select({ count: sql<number>`count(*)` })
    .from(jobs)
    .where(whereClause);

  return {
    jobs: rows.map((r) => ({
      ...r.job,
      company: r.company,
    })),
    total: Number(totalRes?.count || 0),
  };
}

/**
 * Gets a canonical job with its source listings, company, and status history.
 */
export async function getJob(jobId: string) {
  const db = getDb();

  const [jobRow] = await db
    .select({
      job: jobs,
      company: {
        id: companies.id,
        name: companies.name,
        primaryDomain: companies.primaryDomain,
        industry: companies.industry,
      },
    })
    .from(jobs)
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.id, jobId))
    .limit(1);

  if (!jobRow) {
    throw new AppError('NOT_FOUND', `Job '${jobId}' not found`);
  }

  const listings = await db
    .select({
      listing: jobSourceListings,
      source: {
        id: jobSources.id,
        name: jobSources.name,
        type: jobSources.type,
      },
    })
    .from(jobSourceListings)
    .leftJoin(jobSources, eq(jobSourceListings.sourceId, jobSources.id))
    .where(eq(jobSourceListings.jobId, jobId));

  const history = await db
    .select()
    .from(jobStatusHistory)
    .where(eq(jobStatusHistory.jobId, jobId))
    .orderBy(desc(jobStatusHistory.at));

  return {
    ...jobRow.job,
    company: jobRow.company,
    listings: listings.map((l) => ({
      ...l.listing,
      source: l.source,
    })),
    history,
  };
}

/**
 * Lists job sources with latest sync run stats.
 */
export async function listSources(filters?: { type?: string; origin?: string }) {
  const db = getDb();
  const conditions = [];

  if (filters?.type) {
    conditions.push(eq(jobSources.type, filters.type));
  }
  if (filters?.origin) {
    conditions.push(eq(jobSources.origin, filters.origin));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sources = await db
    .select({
      source: jobSources,
      companyName: companies.name,
    })
    .from(jobSources)
    .leftJoin(companies, eq(jobSources.companyId, companies.id))
    .where(whereClause)
    .orderBy(asc(jobSources.name));

  // Fetch latest sync run for each source
  const sourceIds = sources.map((s) => s.source.id);
  const syncRuns = sourceIds.length > 0
    ? await db
        .select()
        .from(sourceSyncRuns)
        .where(inArray(sourceSyncRuns.sourceId, sourceIds))
        .orderBy(desc(sourceSyncRuns.startedAt))
    : [];

  const runsBySource = new Map<string, typeof sourceSyncRuns.$inferSelect>();
  for (const r of syncRuns) {
    if (!runsBySource.has(r.sourceId)) {
      runsBySource.set(r.sourceId, r);
    }
  }

  return sources.map((s) => ({
    ...s.source,
    companyName: s.companyName,
    latestSyncRun: runsBySource.get(s.source.id) || null,
  }));
}

/**
 * Creates a manual source (e.g. RSS feed).
 */
export async function createManualSource(input: {
  name: string;
  type: SourceType;
  config: Record<string, unknown>;
  companyId?: string;
  scheduleCron?: string;
}) {
  const db = getDb();

  const [newSource] = await db
    .insert(jobSources)
    .values({
      name: input.name,
      type: input.type,
      config: input.config,
      origin: 'manual',
      companyId: input.companyId || null,
      scheduleCron: input.scheduleCron || '0 */6 * * *',
      status: 'idle',
      enabled: true,
    })
    .returning();

  return newSource;
}
