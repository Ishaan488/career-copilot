import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Resumes (Logical group of resume versions, e.g. "General Software Engineer", "Backend Specialist")
export const resumes = pgTable('resumes', {
  id: uuid('id').defaultRandom().primaryKey(),
  label: text('label').notNull(),
  notes: text('notes'),
  isDefault: boolean('is_default').default(false).notNull(),
  status: text('status').default('active').notNull(), // 'active' | 'archived'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Resume Versions (Immutable storage of physical PDF uploads byte-for-byte)
export const resumeVersions = pgTable(
  'resume_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    resumeId: uuid('resume_id').notNull().references(() => resumes.id, { onDelete: 'cascade' }),
    versionNo: integer('version_no').notNull(),
    originalFilename: text('original_filename').notNull(),
    storedPath: text('stored_path').notNull(), // e.g. "data/resumes/<sha256>.pdf"
    sha256: text('sha256').notNull().unique(), // sha256 checksum of exact PDF bytes
    sizeBytes: integer('size_bytes').notNull(),
    mime: text('mime').default('application/pdf').notNull(),
    pageCount: integer('page_count'),
    label: text('label').notNull(),
    notes: text('notes'),
    status: text('status').default('active').notNull(), // 'active' | 'archived' | 'deleted'
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('resume_versions_resume_version_idx').on(t.resumeId, t.versionNo),
  ]
);

// Resume Attachments (Audit snapshot of the exact PDF attached to an application)
export const resumeAttachments = pgTable('resume_attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  applicationId: uuid('application_id').notNull(), // FK to applications (enforced when applications table created)
  resumeVersionId: uuid('resume_version_id').references(() => resumeVersions.id, { onDelete: 'set null' }),
  selectedAt: timestamp('selected_at', { withTimezone: true }).defaultNow().notNull(),
  selectedBy: text('selected_by').default('user').notNull(),
  attachedAt: timestamp('attached_at', { withTimezone: true }),
  attachedSha256: text('attached_sha256'), // Sha256 of the exact file handed to the browser
  labelSnapshot: text('label_snapshot').notNull(),
  versionNoSnapshot: integer('version_no_snapshot').notNull(),
});
