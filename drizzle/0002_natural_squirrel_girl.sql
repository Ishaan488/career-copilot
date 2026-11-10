CREATE TABLE "resume_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"resume_version_id" uuid,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"selected_by" text DEFAULT 'user' NOT NULL,
	"attached_at" timestamp with time zone,
	"attached_sha256" text,
	"label_snapshot" text NOT NULL,
	"version_no_snapshot" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"original_filename" text NOT NULL,
	"stored_path" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"mime" text DEFAULT 'application/pdf' NOT NULL,
	"page_count" integer,
	"label" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resume_versions_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"notes" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resume_attachments" ADD CONSTRAINT "resume_attachments_resume_version_id_resume_versions_id_fk" FOREIGN KEY ("resume_version_id") REFERENCES "public"."resume_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resume_versions_resume_version_idx" ON "resume_versions" USING btree ("resume_id","version_no");