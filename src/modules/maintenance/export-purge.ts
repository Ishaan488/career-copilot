import path from 'node:path';
import fs from 'node:fs';
import { getDb } from '@/shared/db';
import { config } from '@/shared/config';
import { logger } from '@/shared/logger';
import { recordAudit } from '@/modules/audit';
import { AppError } from '@/shared/errors';
import {
  candidateProfiles,
  candidateEmails,
  candidatePhones,
  candidateWorkAuthorizations,
  candidateEducation,
  candidateExperience,
  candidateSkills,
  candidateProjects,
  candidateCertifications,
  candidateAwards,
  candidatePublications,
  candidateLinks,
  profileRevisions,
  jobPreferences,
  autonomyPolicies,
  reusableApplicationAnswers,
  resumes,
  resumeVersions,
  resumeAttachments,
  applications,
  applicationTasks,
  applicationFormFields,
  applicationFieldAnswers,
  applicationEvents,
  applicationAuthorizations,
  applicationSubmissions,
  applicationContacts,
  applicationInterviews,
  applicationNotes,
  humanReviewRequests,
  workflowCheckpoints,
} from '@/db/schema';

export interface DataExportSummary {
  exportDir: string;
  exportedAt: string;
  counts: {
    profiles: number;
    resumes: number;
    resumeFilesCopied: number;
    applications: number;
    applicationEvents: number;
    interviews: number;
    contacts: number;
    reusableAnswers: number;
    reviewRequests: number;
  };
}

export interface DataPurgeSummary {
  purgedAt: string;
  deleted: {
    profiles: number;
    resumes: number;
    resumeFilesDeleted: number;
    applications: number;
    applicationEvents: number;
    interviews: number;
    contacts: number;
    reusableAnswers: number;
    reviewRequests: number;
  };
}

/**
 * Exports all user personal data into a timestamped directory (Doc 13 §9).
 * Contains export.json and a resumes/ directory with the PDF files.
 */
export async function exportUserData(options?: { outputDir?: string }): Promise<DataExportSummary> {
  const db = getDb();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseExportDir = options?.outputDir || path.resolve(config.DATA_DIR, 'exports');
  const exportDir = path.join(baseExportDir, timestamp);
  const resumesExportDir = path.join(exportDir, 'resumes');

  await fs.promises.mkdir(resumesExportDir, { recursive: true });

  logger.info({ exportDir }, '[Export] Starting candidate data export');

  // 1. Collect profile and related items
  const profileList = await db.select().from(candidateProfiles);
  const emails = await db.select().from(candidateEmails);
  const phones = await db.select().from(candidatePhones);
  const workAuth = await db.select().from(candidateWorkAuthorizations);
  const education = await db.select().from(candidateEducation);
  const experience = await db.select().from(candidateExperience);
  const skills = await db.select().from(candidateSkills);
  const projects = await db.select().from(candidateProjects);
  const certs = await db.select().from(candidateCertifications);
  const awards = await db.select().from(candidateAwards);
  const publications = await db.select().from(candidatePublications);
  const links = await db.select().from(candidateLinks);
  const revisions = await db.select().from(profileRevisions);
  const preferences = await db.select().from(jobPreferences);
  const policies = await db.select().from(autonomyPolicies);
  const reusableAnswers = await db.select().from(reusableApplicationAnswers);

  // 2. Collect resumes & copy files
  const resumeList = await db.select().from(resumes);
  const versionsList = await db.select().from(resumeVersions);
  const attachmentsList = await db.select().from(resumeAttachments);

  let resumeFilesCopied = 0;
  for (const v of versionsList) {
    if (v.storedPath) {
      const srcPath = path.isAbsolute(v.storedPath)
        ? v.storedPath
        : path.resolve(config.DATA_DIR, v.storedPath);

      if (fs.existsSync(srcPath)) {
        const destFile = path.join(resumesExportDir, path.basename(srcPath));
        try {
          await fs.promises.copyFile(srcPath, destFile);
          resumeFilesCopied++;
        } catch (err) {
          logger.warn({ err, srcPath }, '[Export] Could not copy resume file');
        }
      }
    }
  }

  // 3. Collect applications & lifecycle data
  const appList = await db.select().from(applications);
  const eventList = await db.select().from(applicationEvents);
  const interviewList = await db.select().from(applicationInterviews);
  const contactList = await db.select().from(applicationContacts);
  const submissionList = await db.select().from(applicationSubmissions);
  const noteList = await db.select().from(applicationNotes);
  const authList = await db.select().from(applicationAuthorizations);
  const taskList = await db.select().from(applicationTasks);
  const formFieldList = await db.select().from(applicationFormFields);
  const answerList = await db.select().from(applicationFieldAnswers);

  // 4. Collect review requests
  const reviewList = await db.select().from(humanReviewRequests);
  const checkpointList = await db.select().from(workflowCheckpoints);

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    profile: {
      candidateProfiles: profileList,
      emails,
      phones,
      workAuth,
      education,
      experience,
      skills,
      projects,
      certifications: certs,
      awards,
      publications,
      links,
      revisions,
      preferences,
      policies,
    },
    resumes: {
      resumes: resumeList,
      versions: versionsList,
      attachments: attachmentsList,
    },
    reusableAnswers,
    applications: {
      applications: appList,
      events: eventList,
      interviews: interviewList,
      contacts: contactList,
      submissions: submissionList,
      notes: noteList,
      authorizations: authList,
      tasks: taskList,
      formFields: formFieldList,
      answers: answerList,
    },
    workflows: {
      reviews: reviewList,
      checkpoints: checkpointList,
    },
  };

  const dataFilePath = path.join(exportDir, 'data.json');
  await fs.promises.writeFile(dataFilePath, JSON.stringify(exportPayload, null, 2), 'utf-8');

  const summary: DataExportSummary = {
    exportDir,
    exportedAt: new Date().toISOString(),
    counts: {
      profiles: profileList.length,
      resumes: resumeList.length,
      resumeFilesCopied,
      applications: appList.length,
      applicationEvents: eventList.length,
      interviews: interviewList.length,
      contacts: contactList.length,
      reusableAnswers: reusableAnswers.length,
      reviewRequests: reviewList.length,
    },
  };

  const manifestPath = path.join(exportDir, 'export-manifest.json');
  await fs.promises.writeFile(manifestPath, JSON.stringify(summary, null, 2), 'utf-8');

  await recordAudit({
    actor: 'user',
    action: 'maintenance.data_export',
    entityType: 'system',
    details: summary as unknown as Record<string, unknown>,
  });

  logger.info({ summary }, '[Export] Data export completed successfully');
  return summary;
}

/**
 * Purges candidate personal data (Doc 13 §9).
 * Requires typed confirmation string: 'PURGE_PERSONAL_DATA'.
 * Public job listings and company research are strictly preserved.
 */
export async function purgeUserData(options: { confirmation: string }): Promise<DataPurgeSummary> {
  if (options.confirmation !== 'PURGE_PERSONAL_DATA') {
    throw new AppError(
      'VALIDATION',
      'Typed confirmation "PURGE_PERSONAL_DATA" is strictly required to purge personal data.'
    );
  }

  const db = getDb();
  logger.warn('[Purge] Executing personal data purge');

  // 1. Delete physical resume files
  const existingVersions = await db.select().from(resumeVersions);
  let resumeFilesDeleted = 0;
  for (const v of existingVersions) {
    if (v.storedPath) {
      const filePath = path.isAbsolute(v.storedPath)
        ? v.storedPath
        : path.resolve(config.DATA_DIR, v.storedPath);
      try {
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
          resumeFilesDeleted++;
        }
      } catch (err) {
        logger.warn({ err, filePath }, '[Purge] Could not unlink resume file');
      }
    }
  }

  // 2. Delete resumes DB rows
  await db.delete(resumeAttachments);
  await db.delete(resumeVersions);
  const deletedResumes = await db.delete(resumes).returning();

  // 3. Delete application & tracking DB rows
  await db.delete(applicationNotes);
  const deletedInterviews = await db.delete(applicationInterviews).returning();
  const deletedContacts = await db.delete(applicationContacts).returning();
  await db.delete(applicationSubmissions);
  await db.delete(applicationAuthorizations);
  const deletedEvents = await db.delete(applicationEvents).returning();
  await db.delete(applicationFieldAnswers);
  await db.delete(applicationFormFields);
  await db.delete(applicationTasks);
  const deletedApps = await db.delete(applications).returning();

  // 4. Delete review requests & checkpoints
  const deletedReviews = await db.delete(humanReviewRequests).returning();
  await db.delete(workflowCheckpoints);

  // 5. Delete reusable answers
  const deletedAnswers = await db.delete(reusableApplicationAnswers).returning();

  // 6. Delete profile details & profile
  await db.delete(candidateEmails);
  await db.delete(candidatePhones);
  await db.delete(candidateWorkAuthorizations);
  await db.delete(candidateEducation);
  await db.delete(candidateExperience);
  await db.delete(candidateSkills);
  await db.delete(candidateProjects);
  await db.delete(candidateCertifications);
  await db.delete(candidateAwards);
  await db.delete(candidatePublications);
  await db.delete(candidateLinks);
  await db.delete(profileRevisions);
  await db.delete(jobPreferences);
  await db.delete(autonomyPolicies);
  const deletedProfiles = await db.delete(candidateProfiles).returning();

  const summary: DataPurgeSummary = {
    purgedAt: new Date().toISOString(),
    deleted: {
      profiles: deletedProfiles.length,
      resumes: deletedResumes.length,
      resumeFilesDeleted,
      applications: deletedApps.length,
      applicationEvents: deletedEvents.length,
      interviews: deletedInterviews.length,
      contacts: deletedContacts.length,
      reusableAnswers: deletedAnswers.length,
      reviewRequests: deletedReviews.length,
    },
  };

  await recordAudit({
    actor: 'user',
    action: 'maintenance.data_purge',
    entityType: 'system',
    details: summary as unknown as Record<string, unknown>,
  });

  logger.info({ summary }, '[Purge] Candidate personal data purge completed successfully');
  return summary;
}
