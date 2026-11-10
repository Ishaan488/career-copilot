import { getDb } from '@/shared/db';
import { AppError } from '@/shared/errors';
import { recordAudit } from '@/modules/audit';
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
  autonomyPolicyHistory,
  reusableApplicationAnswers,
} from '@/db/schema/profile';
import { eq, desc, asc, and } from 'drizzle-orm';
import {
  candidateProfileSchema,
  jobPreferencesSchema,
  autonomyPolicySchema,
  reusableAnswerSchema,
  CandidateProfileInput,
  JobPreferencesInput,
  AutonomyPolicyInput,
  ReusableAnswerInput,
  CompletenessReport,
  VerificationStatus,
  CORE_CATEGORIES,
} from './schemas';

// --- Profile Singleton and Sub-resources ---

export async function getOrCreateProfile() {
  const db = getDb();
  let [profile] = await db.select().from(candidateProfiles).limit(1);

  if (!profile) {
    const [inserted] = await db
      .insert(candidateProfiles)
      .values({
        isSingleton: true,
        fullName: '',
        headline: '',
        summary: '',
        timezone: 'Asia/Kolkata',
        currentCity: '',
        currentCountry: 'India',
        preferredContact: 'email',
        currentEmploymentStatus: 'employed',
        verification: 'unverified',
      })
      .returning();

    if (!inserted) {
      throw new AppError('INTERNAL', 'Failed to initialize candidate profile');
    }
    profile = inserted;

    // Record initial revision
    await db.insert(profileRevisions).values({
      profileId: profile.id,
      snapshot: profile,
      reason: 'Initial profile creation',
    });
  }

  const profileId = profile.id;

  // Fetch all child collections
  const [
    emails,
    phones,
    workAuthorizations,
    education,
    experience,
    skills,
    projects,
    certifications,
    awards,
    publications,
    links,
  ] = await Promise.all([
    db.select().from(candidateEmails).where(eq(candidateEmails.profileId, profileId)),
    db.select().from(candidatePhones).where(eq(candidatePhones.profileId, profileId)),
    db.select().from(candidateWorkAuthorizations).where(eq(candidateWorkAuthorizations.profileId, profileId)),
    db.select().from(candidateEducation).where(eq(candidateEducation.profileId, profileId)).orderBy(asc(candidateEducation.sortOrder)),
    db.select().from(candidateExperience).where(eq(candidateExperience.profileId, profileId)).orderBy(asc(candidateExperience.sortOrder)),
    db.select().from(candidateSkills).where(eq(candidateSkills.profileId, profileId)),
    db.select().from(candidateProjects).where(eq(candidateProjects.profileId, profileId)),
    db.select().from(candidateCertifications).where(eq(candidateCertifications.profileId, profileId)),
    db.select().from(candidateAwards).where(eq(candidateAwards.profileId, profileId)),
    db.select().from(candidatePublications).where(eq(candidatePublications.profileId, profileId)),
    db.select().from(candidateLinks).where(eq(candidateLinks.profileId, profileId)),
  ]);

  return {
    ...profile,
    emails,
    phones,
    workAuthorizations,
    education,
    experience,
    skills,
    projects,
    certifications,
    awards,
    publications,
    links,
  };
}

export async function updateProfile(data: CandidateProfileInput, reason = 'User updated profile') {
  const parsed = candidateProfileSchema.parse(data);
  const current = await getOrCreateProfile();
  const db = getDb();

  await db
    .update(candidateProfiles)
    .set({
      ...parsed,
      updatedAt: new Date(),
    })
    .where(eq(candidateProfiles.id, current.id));

  const fullUpdated = await getOrCreateProfile();

  // Create audit log and revision snapshot
  await Promise.all([
    db.insert(profileRevisions).values({
      profileId: current.id,
      snapshot: fullUpdated,
      reason,
    }),
    recordAudit({
      actor: 'user',
      action: 'profile.updated',
      entityType: 'candidate_profile',
      entityId: current.id,
      details: { changedFields: Object.keys(parsed), reason },
    }),
  ]);

  return fullUpdated;
}

export async function getProfileRevisions() {
  const profile = await getOrCreateProfile();
  const db = getDb();
  return db
    .select()
    .from(profileRevisions)
    .where(eq(profileRevisions.profileId, profile.id))
    .orderBy(desc(profileRevisions.createdAt));
}

// --- Section Items CRUD ---

export async function addEmail(email: string, isPrimary = false) {
  const profile = await getOrCreateProfile();
  const db = getDb();

  if (isPrimary) {
    await db
      .update(candidateEmails)
      .set({ isPrimary: false })
      .where(eq(candidateEmails.profileId, profile.id));
  }

  const [item] = await db
    .insert(candidateEmails)
    .values({
      profileId: profile.id,
      email: email.toLowerCase().trim(),
      isPrimary,
      verified: true, // Manual entry is considered user-verified
    })
    .returning();

  return item;
}

export async function deleteEmail(id: string) {
  const db = getDb();
  await db.delete(candidateEmails).where(eq(candidateEmails.id, id));
}

export async function addPhone(e164: string, isPrimary = false) {
  const profile = await getOrCreateProfile();
  const db = getDb();

  if (isPrimary) {
    await db
      .update(candidatePhones)
      .set({ isPrimary: false })
      .where(eq(candidatePhones.profileId, profile.id));
  }

  const [item] = await db
    .insert(candidatePhones)
    .values({
      profileId: profile.id,
      e164: e164.trim(),
      isPrimary,
      verified: true,
    })
    .returning();

  return item;
}

export async function deletePhone(id: string) {
  const db = getDb();
  await db.delete(candidatePhones).where(eq(candidatePhones.id, id));
}

export async function addWorkAuth(country: string, status: string, details?: string | null) {
  const profile = await getOrCreateProfile();
  const db = getDb();

  const [item] = await db
    .insert(candidateWorkAuthorizations)
    .values({
      profileId: profile.id,
      country,
      status,
      details: details ?? null,
      verification: 'verified',
    })
    .returning();

  return item;
}

export async function deleteWorkAuth(id: string) {
  const db = getDb();
  await db.delete(candidateWorkAuthorizations).where(eq(candidateWorkAuthorizations.id, id));
}

export async function addEducation(item: {
  institution: string;
  degree: string;
  department?: string;
  startYear?: number | null;
  graduationYear?: number | null;
  gradeValue?: string | number | null;
  gradeScale?: string;
  coursework?: string[];
  achievements?: string[];
  sortOrder?: number;
}) {
  const profile = await getOrCreateProfile();
  const db = getDb();

  const [created] = await db
    .insert(candidateEducation)
    .values({
      profileId: profile.id,
      institution: item.institution,
      degree: item.degree,
      department: item.department ?? '',
      startYear: item.startYear ?? null,
      graduationYear: item.graduationYear ?? null,
      gradeValue: item.gradeValue ? String(item.gradeValue) : null,
      gradeScale: item.gradeScale ?? 'cgpa10',
      coursework: item.coursework ?? [],
      achievements: item.achievements ?? [],
      sortOrder: item.sortOrder ?? 0,
      verification: 'verified',
    })
    .returning();

  return created;
}

export async function updateEducation(id: string, item: Partial<{
  institution: string;
  degree: string;
  department: string;
  startYear: number | null;
  graduationYear: number | null;
  gradeValue: string | number | null;
  gradeScale: string;
  coursework: string[];
  achievements: string[];
  sortOrder: number;
}>) {
  const db = getDb();
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (item.institution !== undefined) updateData.institution = item.institution;
  if (item.degree !== undefined) updateData.degree = item.degree;
  if (item.department !== undefined) updateData.department = item.department;
  if (item.startYear !== undefined) updateData.startYear = item.startYear;
  if (item.graduationYear !== undefined) updateData.graduationYear = item.graduationYear;
  if (item.gradeValue !== undefined) updateData.gradeValue = item.gradeValue ? String(item.gradeValue) : null;
  if (item.gradeScale !== undefined) updateData.gradeScale = item.gradeScale;
  if (item.coursework !== undefined) updateData.coursework = item.coursework;
  if (item.achievements !== undefined) updateData.achievements = item.achievements;
  if (item.sortOrder !== undefined) updateData.sortOrder = item.sortOrder;

  const [updated] = await db
    .update(candidateEducation)
    .set(updateData)
    .where(eq(candidateEducation.id, id))
    .returning();

  return updated;
}

export async function deleteEducation(id: string) {
  const db = getDb();
  await db.delete(candidateEducation).where(eq(candidateEducation.id, id));
}

export async function addExperience(item: {
  org: string;
  title: string;
  kind?: string;
  startDate: string;
  endDate?: string | null;
  location?: string;
  responsibilities?: string[];
  achievements?: Array<{ text: string; metric?: { value: number; unit: string }; verified?: boolean }>;
  sortOrder?: number;
}) {
  const profile = await getOrCreateProfile();
  const db = getDb();

  const [created] = await db
    .insert(candidateExperience)
    .values({
      profileId: profile.id,
      org: item.org,
      title: item.title,
      kind: item.kind ?? 'job',
      startDate: item.startDate,
      endDate: item.endDate ?? null,
      location: item.location ?? '',
      responsibilities: item.responsibilities ?? [],
      achievements: item.achievements ?? [],
      sortOrder: item.sortOrder ?? 0,
      verification: 'verified',
    })
    .returning();

  return created;
}

export async function updateExperience(id: string, item: Partial<{
  org: string;
  title: string;
  kind: string;
  startDate: string;
  endDate: string | null;
  location: string;
  responsibilities: string[];
  achievements: Array<{ text: string; metric?: { value: number; unit: string }; verified?: boolean }>;
  sortOrder: number;
}>) {
  const db = getDb();
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (item.org !== undefined) updateData.org = item.org;
  if (item.title !== undefined) updateData.title = item.title;
  if (item.kind !== undefined) updateData.kind = item.kind;
  if (item.startDate !== undefined) updateData.startDate = item.startDate;
  if (item.endDate !== undefined) updateData.endDate = item.endDate;
  if (item.location !== undefined) updateData.location = item.location;
  if (item.responsibilities !== undefined) updateData.responsibilities = item.responsibilities;
  if (item.achievements !== undefined) updateData.achievements = item.achievements;
  if (item.sortOrder !== undefined) updateData.sortOrder = item.sortOrder;

  const [updated] = await db
    .update(candidateExperience)
    .set(updateData)
    .where(eq(candidateExperience.id, id))
    .returning();

  return updated;
}

export async function deleteExperience(id: string) {
  const db = getDb();
  await db.delete(candidateExperience).where(eq(candidateExperience.id, id));
}

export async function addSkill(item: {
  name: string;
  category?: string;
  proficiency?: number;
  years?: number | null;
  evidenceNote?: string | null;
}) {
  const profile = await getOrCreateProfile();
  const db = getDb();
  const normalizedName = item.name.toLowerCase().trim();

  const [created] = await db
    .insert(candidateSkills)
    .values({
      profileId: profile.id,
      name: item.name.trim(),
      normalizedName,
      category: item.category ?? 'other',
      proficiency: item.proficiency ?? 3,
      years: item.years ? String(item.years) : null,
      evidenceNote: item.evidenceNote ?? null,
      verification: 'verified',
    })
    .onConflictDoUpdate({
      target: [candidateSkills.profileId, candidateSkills.normalizedName],
      set: {
        name: item.name.trim(),
        category: item.category ?? 'other',
        proficiency: item.proficiency ?? 3,
        years: item.years ? String(item.years) : null,
        evidenceNote: item.evidenceNote ?? null,
        verification: 'verified',
        updatedAt: new Date(),
      },
    })
    .returning();

  return created;
}

export async function deleteSkill(id: string) {
  const db = getDb();
  await db.delete(candidateSkills).where(eq(candidateSkills.id, id));
}

export async function addProject(item: {
  name: string;
  description: string;
  technologies?: string[];
  contributions?: string[];
  outcomes?: string[];
  metrics?: Record<string, unknown>;
  repoUrl?: string | null;
  demoUrl?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const profile = await getOrCreateProfile();
  const db = getDb();

  const [created] = await db
    .insert(candidateProjects)
    .values({
      profileId: profile.id,
      name: item.name,
      description: item.description,
      technologies: item.technologies ?? [],
      contributions: item.contributions ?? [],
      outcomes: item.outcomes ?? [],
      metrics: item.metrics ?? {},
      repoUrl: item.repoUrl ?? null,
      demoUrl: item.demoUrl ?? null,
      startDate: item.startDate ?? null,
      endDate: item.endDate ?? null,
      verification: 'verified',
    })
    .returning();

  return created;
}

export async function deleteProject(id: string) {
  const db = getDb();
  await db.delete(candidateProjects).where(eq(candidateProjects.id, id));
}

export async function addLink(kind: string, url: string) {
  const profile = await getOrCreateProfile();
  const db = getDb();

  const [created] = await db
    .insert(candidateLinks)
    .values({
      profileId: profile.id,
      kind,
      url,
    })
    .returning();

  return created;
}

export async function deleteLink(id: string) {
  const db = getDb();
  await db.delete(candidateLinks).where(eq(candidateLinks.id, id));
}

export async function verifySectionItem(
  section: 'education' | 'experience' | 'skills' | 'projects' | 'work_authorizations',
  id: string,
  verification: VerificationStatus
) {
  const db = getDb();
  switch (section) {
    case 'education':
      return db.update(candidateEducation).set({ verification, updatedAt: new Date() }).where(eq(candidateEducation.id, id)).returning();
    case 'experience':
      return db.update(candidateExperience).set({ verification, updatedAt: new Date() }).where(eq(candidateExperience.id, id)).returning();
    case 'skills':
      return db.update(candidateSkills).set({ verification, updatedAt: new Date() }).where(eq(candidateSkills.id, id)).returning();
    case 'projects':
      return db.update(candidateProjects).set({ verification, updatedAt: new Date() }).where(eq(candidateProjects.id, id)).returning();
    case 'work_authorizations':
      return db.update(candidateWorkAuthorizations).set({ verification, updatedAt: new Date() }).where(eq(candidateWorkAuthorizations.id, id)).returning();
    default:
      throw new AppError('VALIDATION', `Invalid section: ${section}`);
  }
}

// --- Completeness Calculation ---

export function calculateCompleteness(profile: Awaited<ReturnType<typeof getOrCreateProfile>>): CompletenessReport {
  let personal = 0;
  let contact = 0;
  let workAuth = 0;
  let experience = 0;
  let education = 0;
  let skills = 0;
  const missingFields: string[] = [];

  // Personal (20 pts)
  if (profile.fullName && profile.fullName.trim().length > 0) personal += 10;
  else missingFields.push('Full Name');

  if (profile.currentCity && profile.currentCity.trim().length > 0) personal += 5;
  else missingFields.push('Current City');

  if (profile.currentCountry && profile.currentCountry.trim().length > 0) personal += 5;
  else missingFields.push('Current Country');

  // Contact (20 pts)
  const hasPrimaryEmail = profile.emails.some((e) => e.isPrimary || e.email);
  if (hasPrimaryEmail) contact += 10;
  else missingFields.push('Primary Email');

  const hasPhone = profile.phones.length > 0;
  if (hasPhone) contact += 10;
  else missingFields.push('Phone Number');

  // Work Auth (15 pts)
  if (profile.workAuthorizations.length > 0) workAuth += 15;
  else missingFields.push('Work Authorization / Citizenship Status');

  // Experience (20 pts)
  if (profile.experience.length > 0) {
    experience += 10;
    const hasDetails = profile.experience.some(
      (exp) => (exp.responsibilities as string[]).length > 0 || (exp.achievements as unknown[]).length > 0
    );
    if (hasDetails) experience += 10;
    else missingFields.push('Experience Responsibilities or Achievements');
  } else {
    missingFields.push('Work Experience');
  }

  // Education (15 pts)
  if (profile.education.length > 0) education += 15;
  else missingFields.push('Education History');

  // Skills (10 pts)
  if (profile.skills.length >= 3) skills += 10;
  else if (profile.skills.length > 0) {
    skills += 5;
    missingFields.push('At least 3 technical skills (currently ' + profile.skills.length + ')');
  } else {
    missingFields.push('Skills (minimum 3 required)');
  }

  const score = personal + contact + workAuth + experience + education + skills;

  return {
    score,
    breakdown: { personal, contact, workAuth, experience, education, skills },
    missingFields,
  };
}

// --- Strict Verified Snapshot (for Form Autofill Isolation) ---

export async function getVerifiedSnapshot() {
  const profile = await getOrCreateProfile();

  // ONLY verified items are included in snapshot
  const verifiedEmails = profile.emails.filter((e) => e.verified);
  const primaryEmail = verifiedEmails.find((e) => e.isPrimary) || verifiedEmails[0] || null;

  const verifiedPhones = profile.phones.filter((p) => p.verified);
  const primaryPhone = verifiedPhones.find((p) => p.isPrimary) || verifiedPhones[0] || null;

  const verifiedWorkAuth = profile.workAuthorizations.filter((w) => w.verification === 'verified');
  const verifiedEducation = profile.education.filter((e) => e.verification === 'verified');
  const verifiedExperience = profile.experience.filter((e) => e.verification === 'verified');
  const verifiedSkills = profile.skills.filter((s) => s.verification === 'verified');
  const verifiedProjects = profile.projects.filter((p) => p.verification === 'verified');

  return {
    fullName: profile.fullName || null,
    headline: profile.headline || null,
    summary: profile.summary || null,
    currentCity: profile.currentCity || null,
    currentCountry: profile.currentCountry || null,
    address: profile.address || null,
    noticePeriodDays: profile.noticePeriodDays ?? null,
    currentEmploymentStatus: profile.currentEmploymentStatus || null,
    primaryEmail: primaryEmail?.email || null,
    primaryPhone: primaryPhone?.e164 || null,
    workAuthorizations: verifiedWorkAuth.map((w) => ({ country: w.country, status: w.status, details: w.details })),
    education: verifiedEducation.map((e) => ({
      institution: e.institution,
      degree: e.degree,
      department: e.department,
      startYear: e.startYear,
      graduationYear: e.graduationYear,
      gradeValue: e.gradeValue,
      gradeScale: e.gradeScale,
    })),
    experience: verifiedExperience.map((e) => ({
      org: e.org,
      title: e.title,
      kind: e.kind,
      startDate: e.startDate,
      endDate: e.endDate,
      location: e.location,
      responsibilities: e.responsibilities,
      achievements: e.achievements,
    })),
    skills: verifiedSkills.map((s) => ({
      name: s.name,
      normalizedName: s.normalizedName,
      category: s.category,
      proficiency: s.proficiency,
      years: s.years ? Number(s.years) : null,
    })),
    projects: verifiedProjects.map((p) => ({
      name: p.name,
      description: p.description,
      technologies: p.technologies,
      repoUrl: p.repoUrl,
      demoUrl: p.demoUrl,
    })),
    links: profile.links.map((l) => ({ kind: l.kind, url: l.url })),
    generatedAt: new Date().toISOString(),
  };
}

// --- Job Preferences Singleton ---

export async function getPreferences() {
  const db = getDb();
  let [prefs] = await db.select().from(jobPreferences).limit(1);

  if (!prefs) {
    const [inserted] = await db
      .insert(jobPreferences)
      .values({
        isSingleton: true,
        preferredRoles: [],
        excludedRoles: [],
        industries: [],
        excludedIndustries: [],
        locations: [],
        workModes: [],
        compCurrency: 'INR',
        compPeriod: 'annual',
        experienceLevels: [],
        employmentTypes: [],
        prioritizedCompanies: [],
        excludedCompanies: [],
        scoringWeights: {
          roleFit: 30,
          skillMatch: 30,
          comp: 15,
          location: 15,
          companyReputation: 10,
        },
      })
      .returning();

    if (!inserted) {
      throw new AppError('INTERNAL', 'Failed to initialize job preferences');
    }
    prefs = inserted;
  }

  return prefs;
}

export async function updatePreferences(data: JobPreferencesInput) {
  const parsed = jobPreferencesSchema.parse(data);
  const current = await getPreferences();
  const db = getDb();

  const [updated] = await db
    .update(jobPreferences)
    .set({
      preferredRoles: parsed.preferredRoles,
      excludedRoles: parsed.excludedRoles,
      industries: parsed.industries,
      excludedIndustries: parsed.excludedIndustries,
      locations: parsed.locations,
      workModes: parsed.workModes,
      minComp: parsed.minComp ? String(parsed.minComp) : null,
      preferredComp: parsed.preferredComp ? String(parsed.preferredComp) : null,
      compCurrency: parsed.compCurrency,
      compPeriod: parsed.compPeriod,
      experienceLevels: parsed.experienceLevels,
      employmentTypes: parsed.employmentTypes,
      prioritizedCompanies: parsed.prioritizedCompanies,
      excludedCompanies: parsed.excludedCompanies,
      maxNoticePeriodDays: parsed.maxNoticePeriodDays,
      relocation: parsed.relocation,
      scoringWeights: parsed.scoringWeights,
      updatedAt: new Date(),
    })
    .where(eq(jobPreferences.id, current.id))
    .returning();

  await recordAudit({
    actor: 'user',
    action: 'preferences.updated',
    entityType: 'job_preferences',
    entityId: current.id,
    details: { changedWeights: parsed.scoringWeights },
  });

  return updated;
}

// --- Autonomy Policies Singleton ---

export async function getAutonomyPolicy() {
  const db = getDb();
  let [policy] = await db.select().from(autonomyPolicies).limit(1);

  if (!policy) {
    const [inserted] = await db
      .insert(autonomyPolicies)
      .values({
        isSingleton: true,
        version: 1,
        level: 1, // Default Level 1
        autoShortlist: false,
        shortlistThreshold: 70,
        mayPrepareApplications: false,
        mayFillForms: false,
        allowedCompanyIds: [],
        allowedAts: [],
        alwaysReviewCategories: [...CORE_CATEGORIES],
        submissionMode: 'manual_handover', // M11 default
        maxDailyApplications: 5,
      })
      .returning();

    if (!inserted) {
      throw new AppError('INTERNAL', 'Failed to initialize autonomy policy');
    }
    policy = inserted;

    await db.insert(autonomyPolicyHistory).values({
      policyId: policy.id,
      version: 1,
      snapshot: policy,
      reason: 'Initial autonomy policy creation',
    });
  }

  return policy;
}

export async function updateAutonomyPolicy(
  data: AutonomyPolicyInput,
  options: { confirm?: boolean; reason?: string } = {}
) {
  const parsed = autonomyPolicySchema.parse(data);
  const current = await getAutonomyPolicy();
  const db = getDb();

  // Guard: Level 3 is forbidden by schema and code
  if ((parsed.level as number) > 2) {
    throw new AppError('VALIDATION', 'Autonomy level 3 is not supported. Career Copilot v1 strictly allows level 1 or 2.');
  }

  // Guard: If enabling any automated or elevated autonomy setting, explicit confirm flag is required
  const isElevating =
    (!current.mayPrepareApplications && parsed.mayPrepareApplications) ||
    (!current.mayFillForms && parsed.mayFillForms) ||
    (current.submissionMode !== 'automated_authorized' && parsed.submissionMode === 'automated_authorized') ||
    (current.level === 1 && parsed.level === 2);

  if (isElevating && !options.confirm) {
    throw new AppError(
      'FORBIDDEN',
      'Enabling elevated autonomy settings requires explicit user confirmation (confirm: true).'
    );
  }

  const nextVersion = current.version + 1;
  const [updated] = await db
    .update(autonomyPolicies)
    .set({
      version: nextVersion,
      level: parsed.level,
      autoShortlist: parsed.autoShortlist,
      shortlistThreshold: parsed.shortlistThreshold,
      mayPrepareApplications: parsed.mayPrepareApplications,
      mayFillForms: parsed.mayFillForms,
      allowedCompanyIds: parsed.allowedCompanyIds,
      allowedAts: parsed.allowedAts,
      alwaysReviewCategories: parsed.alwaysReviewCategories,
      notificationPrefs: parsed.notificationPrefs,
      submissionMode: parsed.submissionMode,
      maxDailyApplications: parsed.maxDailyApplications,
      updatedAt: new Date(),
    })
    .where(eq(autonomyPolicies.id, current.id))
    .returning();

  // Save revision history and audit log
  await Promise.all([
    db.insert(autonomyPolicyHistory).values({
      policyId: current.id,
      version: nextVersion,
      snapshot: updated,
      reason: options.reason || 'User updated autonomy policy',
    }),
    recordAudit({
      actor: 'user',
      action: 'autonomy.updated',
      entityType: 'autonomy_policy',
      entityId: current.id,
      details: { version: nextVersion, level: parsed.level, submissionMode: parsed.submissionMode },
    }),
  ]);

  return updated;
}

export async function getAutonomyPolicyHistory() {
  const current = await getAutonomyPolicy();
  const db = getDb();
  return db
    .select()
    .from(autonomyPolicyHistory)
    .where(eq(autonomyPolicyHistory.policyId, current.id))
    .orderBy(desc(autonomyPolicyHistory.version));
}

// --- Reusable Application Answers ---

export async function getReusableAnswers(filter?: { category?: string; includeDisabled?: boolean }) {
  const db = getDb();
  let query = db.select().from(reusableApplicationAnswers);

  const conditions = [];
  if (filter?.category) {
    conditions.push(eq(reusableApplicationAnswers.category, filter.category));
  }
  if (!filter?.includeDisabled) {
    conditions.push(eq(reusableApplicationAnswers.disabled, false));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  return query.orderBy(desc(reusableApplicationAnswers.useCount));
}

export async function createReusableAnswer(data: ReusableAnswerInput) {
  const parsed = reusableAnswerSchema.parse(data);
  const db = getDb();

  const [created] = await db
    .insert(reusableApplicationAnswers)
    .values({
      questionKey: parsed.questionKey.trim(),
      questionPatterns: parsed.questionPatterns,
      answer: parsed.answer,
      scope: parsed.scope,
      category: parsed.category,
      coreCategoryConfirmed: parsed.coreCategoryConfirmed,
      authorizedAt: new Date(),
      authorizedNote: parsed.authorizedNote || 'User explicitly authorized reusable answer',
      disabled: parsed.disabled ?? false,
    })
    .returning();

  if (!created) {
    throw new AppError('INTERNAL', 'Failed to create reusable answer');
  }

  await recordAudit({
    actor: 'user',
    action: 'reusable_answer.created',
    entityType: 'reusable_application_answers',
    entityId: created.id,
    details: { questionKey: created.questionKey, category: created.category },
  });

  return created;
}

export async function updateReusableAnswer(id: string, data: Partial<ReusableAnswerInput>) {
  const db = getDb();
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (data.questionKey !== undefined) updateData.questionKey = data.questionKey.trim();
  if (data.questionPatterns !== undefined) updateData.questionPatterns = data.questionPatterns;
  if (data.answer !== undefined) updateData.answer = data.answer;
  if (data.scope !== undefined) updateData.scope = data.scope;
  if (data.category !== undefined) {
    updateData.category = data.category;
    const isCore = (CORE_CATEGORIES as readonly string[]).includes(data.category);
    if (isCore && !data.coreCategoryConfirmed) {
      throw new AppError('VALIDATION', 'Core category requires explicit coreCategoryConfirmed: true');
    }
  }
  if (data.coreCategoryConfirmed !== undefined) updateData.coreCategoryConfirmed = data.coreCategoryConfirmed;
  if (data.authorizedNote !== undefined) updateData.authorizedNote = data.authorizedNote;
  if (data.disabled !== undefined) updateData.disabled = data.disabled;

  const [updated] = await db
    .update(reusableApplicationAnswers)
    .set(updateData)
    .where(eq(reusableApplicationAnswers.id, id))
    .returning();

  return updated;
}

export async function deleteReusableAnswer(id: string) {
  const db = getDb();
  await db.delete(reusableApplicationAnswers).where(eq(reusableApplicationAnswers.id, id));
  await recordAudit({
    actor: 'user',
    action: 'reusable_answer.deleted',
    entityType: 'reusable_application_answers',
    entityId: id,
  });
}

export async function matchReusableAnswer(
  questionText: string,
  context?: { category?: string; ats?: string; companyId?: string }
) {
  const answers = await getReusableAnswers({ category: context?.category, includeDisabled: false });
  const normalizedText = questionText.toLowerCase().trim();

  for (const item of answers) {
    // Check ATS scope if defined
    const scope = item.scope as { atsTypes?: string[]; companyIds?: string[] };
    if (scope.atsTypes && scope.atsTypes.length > 0 && context?.ats) {
      if (!scope.atsTypes.includes(context.ats)) continue;
    }
    if (scope.companyIds && scope.companyIds.length > 0 && context?.companyId) {
      if (!scope.companyIds.includes(context.companyId)) continue;
    }

    const patterns = item.questionPatterns as string[];
    const isMatch = patterns.some((p) => {
      try {
        const regex = new RegExp(p, 'i');
        return regex.test(normalizedText);
      } catch {
        return normalizedText.includes(p.toLowerCase());
      }
    });

    if (isMatch) {
      // Record usage
      const db = getDb();
      const newUseCount = (item.useCount || 0) + 1;
      const lastUsedAt = new Date();
      await db
        .update(reusableApplicationAnswers)
        .set({
          lastUsedAt,
          useCount: newUseCount,
        })
        .where(eq(reusableApplicationAnswers.id, item.id));

      return {
        ...item,
        lastUsedAt,
        useCount: newUseCount,
      };
    }
  }

  return null;
}
