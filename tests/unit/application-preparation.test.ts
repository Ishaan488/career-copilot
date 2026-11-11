import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from '@/shared/db';
import { storage } from '@/shared/storage';
import {
  jobs,
  companies,
  resumes,
  resumeVersions,
  applications,
  workflowCheckpoints,
  applicationFormFields,
  applicationFieldAnswers,
} from '@/db/schema';
import { eq } from 'drizzle-orm';
import { AtsFixtureServer } from '../../fixtures/ats-site/server';
import {
  applicationService,
  mapFieldsToAnswers,
  computeSummaryHash,
  executeDetectPlatformStep,
  executeAwaitSubmissionDecisionStep,
} from '@/modules/application';
import { humanReviewService } from '@/modules/human-review';

describe('Application Preparation & Form Field Subsystem (M10/M11)', () => {
  let fixtureServer: AtsFixtureServer;
  let baseUrl: string;
  const db = getDb();

  beforeAll(async () => {
    fixtureServer = new AtsFixtureServer();
    baseUrl = await fixtureServer.start();
  });

  afterAll(async () => {
    await fixtureServer.stop().catch(() => {});
  });

  describe('Field Mapping & Answer Hierarchy Domain Logic', () => {
    const mockProfile = {
      fullName: 'John Doe',
      headline: 'Software Engineer',
      summary: 'Experienced developer',
      currentCity: 'Seattle',
      currentCountry: 'United States',
      address: '123 Main St',
      noticePeriodDays: 30,
      currentEmploymentStatus: 'employed',
      primaryEmail: 'john.doe@example.com',
      primaryPhone: '+12065550199',
      workAuthorizations: [{ country: 'US', status: 'authorized', details: 'Citizen' }],
      skills: [{ name: 'TypeScript', normalizedName: 'typescript' }],
    };

    const mockFields = [
      {
        id: 'f-1',
        fieldKey: 'key-first-name',
        label: 'First Name',
        type: 'text',
        required: true,
        category: 'profile',
        options: [],
      },
      {
        id: 'f-2',
        fieldKey: 'key-last-name',
        label: 'Last Name',
        type: 'text',
        required: true,
        category: 'profile',
        options: [],
      },
      {
        id: 'f-3',
        fieldKey: 'key-email',
        label: 'Email',
        type: 'email',
        required: true,
        category: 'profile',
        options: [],
      },
      {
        id: 'f-4',
        fieldKey: 'key-work-auth',
        label: 'Are you authorized to work in the US?',
        type: 'select',
        required: true,
        category: 'work_auth',
        options: [
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'no' },
        ],
      },
      {
        id: 'f-5',
        fieldKey: 'key-legal-terms',
        label: 'I certify that all information submitted is true',
        type: 'checkbox',
        required: true,
        category: 'legal',
        options: [],
      },
      {
        id: 'f-6',
        fieldKey: 'key-custom-q',
        label: 'Preferred IDE or Editor',
        type: 'text',
        required: false,
        category: 'other',
        options: [],
      },
    ];

    it('maps profile fields to corresponding profile values and marks non-core as approved', () => {
      const mapped = mapFieldsToAnswers(mockFields, mockProfile);

      const firstName = mapped.find((m) => m.fieldKey === 'key-first-name')!;
      expect(firstName.answer).toBe('John');
      expect(firstName.source).toBe('profile');
      expect(firstName.status).toBe('approved');

      const lastName = mapped.find((m) => m.fieldKey === 'key-last-name')!;
      expect(lastName.answer).toBe('Doe');
      expect(lastName.source).toBe('profile');
      expect(lastName.status).toBe('approved');

      const email = mapped.find((m) => m.fieldKey === 'key-email')!;
      expect(email.answer).toBe('john.doe@example.com');
      expect(email.status).toBe('approved');
    });

    it('identifies core categories (work_auth, legal) and marks them as needs_review', () => {
      const mapped = mapFieldsToAnswers(mockFields, mockProfile);

      const workAuth = mapped.find((m) => m.fieldKey === 'key-work-auth')!;
      expect(workAuth.category).toBe('work_auth');
      expect(workAuth.status).toBe('needs_review');
      expect(workAuth.needsReviewReason).toContain('Core protected category');

      const legal = mapped.find((m) => m.fieldKey === 'key-legal-terms')!;
      expect(legal.category).toBe('legal');
      expect(legal.status).toBe('needs_review');
      expect(legal.needsReviewReason).toContain('Core protected category');
    });

    it('allows blank optional non-core fields to be approved with decision left_blank', () => {
      const mapped = mapFieldsToAnswers(mockFields, mockProfile);

      const customQ = mapped.find((m) => m.fieldKey === 'key-custom-q')!;
      expect(customQ.answer).toBeNull();
      expect(customQ.decision).toBe('left_blank');
      expect(customQ.status).toBe('approved');
    });

    it('maps reusable answers when available', () => {
      const reusableList = [
        {
          questionHash: 'ide-hash',
          normalizedQuestion: 'preferred ide or editor',
          answer: 'VS Code',
          category: 'other',
        },
      ];

      const mapped = mapFieldsToAnswers(mockFields, mockProfile, reusableList);
      const customQ = mapped.find((m) => m.fieldKey === 'key-custom-q')!;

      expect(customQ.answer).toBe('VS Code');
      expect(customQ.source).toBe('reusable');
      expect(customQ.status).toBe('proposed');
    });
  });

  describe('Summary Hash Computation', () => {
    it('computes deterministic SHA-256 summary hash for answers, resume hash, and portal URL', () => {
      const url = 'https://boards.greenhouse.io/test/jobs/123';
      const resumeHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const answers = [
        { fieldKey: 'key_a', answer: 'Answer A', decision: 'answered' },
        { fieldKey: 'key_b', answer: true, decision: 'answered' },
      ];

      const hash1 = computeSummaryHash(url, resumeHash, answers);
      const hash2 = computeSummaryHash(url, resumeHash, answers);

      // Re-ordered answers array must produce identical hash due to internal sorting
      const hashReordered = computeSummaryHash(url, resumeHash, [answers[1]!, answers[0]!]);

      expect(hash1).toBe(hash2);
      expect(hash1).toBe(hashReordered);
      expect(hash1).toHaveLength(64);

      // Changing URL or answer must alter hash
      const hashDifferentUrl = computeSummaryHash(url + 'x', resumeHash, answers);
      expect(hash1).not.toBe(hashDifferentUrl);
    });
  });

  describe('Step Engine: Detect Platform and Await Submission Decision', () => {
    it('detects Greenhouse platform and sets nextStep to open_portal', () => {
      const result = executeDetectPlatformStep('https://boards.greenhouse.io/example/jobs/99');
      expect(result.type).toBe('next');
      if (result.type === 'next') {
        expect(result.nextStep).toBe('open_portal');
        expect(result.stateUpdates?.platform).toBe('greenhouse');
      }
    });

    it('pauses for manual handover in await_submission_decision', () => {
      const mockCtx = {
        workflowId: 'wf-1',
        applicationId: 'app-1',
        jobId: 'job-1',
        step: 'await_submission_decision' as const,
        state: {},
        version: 1,
      };

      const result = executeAwaitSubmissionDecisionStep(
        'https://boards.greenhouse.io/example/jobs/99',
        'hash123',
        mockCtx
      );

      expect(result.type).toBe('pause');
      if (result.type === 'pause') {
        expect(result.reason).toBe('manual_handover');
        expect(result.stateUpdates?.handoverReady).toBe(true);
      }
    });
  });

  describe('End-to-End Application Preparation and Manual Handover Flow', () => {
    it('executes steps through open_portal, extract_form, map_fields, validate_answers, and manual handover', async () => {
      // 1. Create company and job pointing to Greenhouse fixture
      const compSuffix = Date.now();
      const compName = 'Fixture Corp ' + compSuffix;
      const [comp] = await db
        .insert(companies)
        .values({
          name: compName,
          normalizedName: compName.toLowerCase(),
          primaryDomain: `fixture-${compSuffix}.test`,
          discoveryStatus: 'registered',
        })
        .returning();

      const jobTitle = 'Software Engineer (Fixture Test)';
      const [job] = await db
        .insert(jobs)
        .values({
          companyId: comp!.id,
          title: jobTitle,
          normalizedTitle: jobTitle.toLowerCase(),
          descriptionText: 'Description of software engineer fixture job',
          descriptionHash: 'hash_' + Date.now(),
          canonicalUrl: `${baseUrl}/greenhouse/job-123`,
          applicationUrl: `${baseUrl}/greenhouse/job-123`,
          status: 'shortlisted',
        })
        .returning();

      // 2. Create resume file in storage and database record with unique salt
      const dummyPdf = Buffer.from(
        `%PDF-1.4\n% salt-${Date.now()}-${Math.random()}\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\nxref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \ntrailer<</Size 3/Root 1 0 R>>\nstartxref\n101\n%%EOF`
      );
      const storagePath = `resumes/test_${Date.now()}.pdf`;
      const stored = await storage.put(storagePath, dummyPdf);

      await db.update(resumes).set({ isDefault: false });

      const [parentResume] = await db
        .insert(resumes)
        .values({
          label: 'Main Resume',
          isDefault: true,
        })
        .returning();

      const [resumeVer] = await db
        .insert(resumeVersions)
        .values({
          resumeId: parentResume!.id,
          versionNo: 1,
          label: 'v1.0',
          sha256: stored.sha256,
          storedPath: storagePath,
          sizeBytes: stored.size,
          originalFilename: 'test_resume.pdf',
          status: 'active',
        })
        .returning();

      // 3. Initiate application workflow
      const { applicationId, workflowId } = await applicationService.createFromJob(job!.id);
      expect(applicationId).toBeDefined();
      await applicationService.selectResume(applicationId, resumeVer!.id);

      // Step 1: resolve_url
      await applicationService.executeStep(workflowId);
      let [cp] = await db.select().from(workflowCheckpoints).where(eq(workflowCheckpoints.workflowId, workflowId));
      expect(cp!.step).toBe('verify_domain');

      // Step 2: verify_domain
      await applicationService.executeStep(workflowId);
      [cp] = await db.select().from(workflowCheckpoints).where(eq(workflowCheckpoints.workflowId, workflowId));
      expect(cp!.step).toBe('select_resume');

      // Step 3: select_resume
      await applicationService.executeStep(workflowId);
      [cp] = await db.select().from(workflowCheckpoints).where(eq(workflowCheckpoints.workflowId, workflowId));
      expect(cp!.step).toBe('detect_platform');

      // Step 4: detect_platform
      await applicationService.executeStep(workflowId);
      [cp] = await db.select().from(workflowCheckpoints).where(eq(workflowCheckpoints.workflowId, workflowId));
      expect(cp!.step).toBe('open_portal');

      // Step 5: open_portal (Playwright connects to local fixture)
      await applicationService.executeStep(workflowId);
      [cp] = await db.select().from(workflowCheckpoints).where(eq(workflowCheckpoints.workflowId, workflowId));
      expect(cp!.step).toBe('extract_form');

      // Step 6: extract_form (extracts fields and saves to application_form_fields)
      await applicationService.executeStep(workflowId);
      [cp] = await db.select().from(workflowCheckpoints).where(eq(workflowCheckpoints.workflowId, workflowId));
      expect(cp!.step).toBe('map_fields');

      const savedFields = await db
        .select()
        .from(applicationFormFields)
        .where(eq(applicationFormFields.applicationId, applicationId));
      expect(savedFields.length).toBeGreaterThan(5);

      // Step 7: map_fields (maps candidate profile and marks core categories as needs_review)
      await applicationService.executeStep(workflowId);
      [cp] = await db.select().from(workflowCheckpoints).where(eq(workflowCheckpoints.workflowId, workflowId));
      expect(cp!.step).toBe('validate_answers');

      const savedAnswers = await db
        .select()
        .from(applicationFieldAnswers)
        .innerJoin(applicationFormFields, eq(applicationFieldAnswers.fieldId, applicationFormFields.id))
        .where(eq(applicationFormFields.applicationId, applicationId));
      expect(savedAnswers.length).toBeGreaterThan(5);

      // Step 8: validate_answers (pauses for human review due to core categories / missing answers)
      await applicationService.executeStep(workflowId);
      [cp] = await db.select().from(workflowCheckpoints).where(eq(workflowCheckpoints.workflowId, workflowId));
      expect(cp!.status).toBe('waiting_review');

      let [appRow] = await db.select().from(applications).where(eq(applications.id, applicationId));
      expect(appRow!.status).toBe('awaiting_review');

      // 4. Verify review requests were created
      const reviews = await humanReviewService.list({ jobId: job!.id });
      expect(reviews.length).toBeGreaterThan(0);

      // 5. Answer all review requests (human in the loop)
      for (const rev of reviews) {
        let answerVal: unknown = 'Confirmed answer';
        if (rev.responseSchema?.type === 'boolean') answerVal = true;
        if (rev.responseSchema?.type === 'select' && rev.responseSchema.options?.length) {
          answerVal = rev.responseSchema.options[0]!.value;
        }

        await humanReviewService.respond(rev.id, 'answer', {
          answer: answerVal,
        });
      }

      // Resume workflow once all reviews are resolved
      const resumed = await applicationService.resumeWorkflow(workflowId);
      expect(resumed).toBe(true);

      // Checkpoint is resumed to 'running'
      [cp] = await db.select().from(workflowCheckpoints).where(eq(workflowCheckpoints.workflowId, workflowId));
      expect(cp!.status).toBe('running');

      // Step 8 re-run: validate_answers now passes to fill_form
      await applicationService.executeStep(workflowId);
      [cp] = await db.select().from(workflowCheckpoints).where(eq(workflowCheckpoints.workflowId, workflowId));
      expect(cp!.step).toBe('fill_form');

      // Step 9: fill_form
      await applicationService.executeStep(workflowId);
      [cp] = await db.select().from(workflowCheckpoints).where(eq(workflowCheckpoints.workflowId, workflowId));
      expect(cp!.step).toBe('validate_form');

      // Step 10: validate_form
      await applicationService.executeStep(workflowId);
      [cp] = await db.select().from(workflowCheckpoints).where(eq(workflowCheckpoints.workflowId, workflowId));
      expect(cp!.step).toBe('final_summary');

      // Step 11: final_summary
      await applicationService.executeStep(workflowId);
      [cp] = await db.select().from(workflowCheckpoints).where(eq(workflowCheckpoints.workflowId, workflowId));
      expect(cp!.step).toBe('await_submission_decision');

      [appRow] = await db.select().from(applications).where(eq(applications.id, applicationId));
      expect(appRow!.status).toBe('ready_to_submit');

      // Step 12: await_submission_decision (pauses for manual handover)
      await applicationService.executeStep(workflowId);
      [cp] = await db.select().from(workflowCheckpoints).where(eq(workflowCheckpoints.workflowId, workflowId));
      expect(cp!.status).toBe('paused');

      // 6. User initiates handover and confirms manual submission
      const handoverBundle = await applicationService.startManualHandover(applicationId);
      expect(handoverBundle.applicationId).toBe(applicationId);
      expect(handoverBundle.fieldsCount).toBeGreaterThan(5);

      const confirmResult = await applicationService.confirmManualSubmission(
        applicationId,
        'Submitted on portal successfully'
      );
      expect(confirmResult.status).toBe('submitted');
      expect(confirmResult.submissionSource).toBe('manual_confirmed');

      [appRow] = await db.select().from(applications).where(eq(applications.id, applicationId));
      expect(appRow!.status).toBe('submitted');
      expect(appRow!.submissionSource).toBe('manual_confirmed');
      expect(appRow!.appliedAt).not.toBeNull();

      const [updatedJob] = await db.select().from(jobs).where(eq(jobs.id, job!.id));
      expect(updatedJob!.status).toBe('applied');
    });
  });
});
