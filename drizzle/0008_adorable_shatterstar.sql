CREATE TABLE "human_review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid,
	"job_id" uuid NOT NULL,
	"application_id" uuid,
	"field_id" uuid,
	"category" text NOT NULL,
	"question" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"uncertainty_reason" text,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggested_answer" jsonb,
	"suggestion_confidence" numeric(3, 2),
	"suggestion_rationale" text,
	"required_action" text NOT NULL,
	"response_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"user_answer" jsonb,
	"snoozed_until" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"checkpoint_step" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workflow_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"type" text DEFAULT 'application' NOT NULL,
	"subject_id" uuid NOT NULL,
	"step" text NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"resume_token" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"scope" jsonb NOT NULL,
	"summary_hash" text NOT NULL,
	"summary_snapshot" jsonb NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" text DEFAULT 'user' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"actor" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_field_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field_id" uuid NOT NULL,
	"answer" jsonb,
	"decision" text DEFAULT 'answered' NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"confidence" numeric(3, 2),
	"status" text DEFAULT 'proposed' NOT NULL,
	"approved_at" timestamp with time zone,
	"reviewed_by_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_form_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"page_index" integer DEFAULT 0 NOT NULL,
	"field_key" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selector_strategy" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"step" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_class" text,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"submission_source" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"platform" text DEFAULT 'generic' NOT NULL,
	"application_url" text NOT NULL,
	"verified_domain" boolean DEFAULT false NOT NULL,
	"resume_version_id" uuid,
	"workflow_id" uuid,
	"next_action" text,
	"next_action_due_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"source" text DEFAULT 'copilot' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "human_review_requests" ADD CONSTRAINT "human_review_requests_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_authorizations" ADD CONSTRAINT "application_authorizations_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_field_answers" ADD CONSTRAINT "application_field_answers_field_id_application_form_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."application_form_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_form_fields" ADD CONSTRAINT "application_form_fields_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_tasks" ADD CONSTRAINT "application_tasks_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_version_id_resume_versions_id_fk" FOREIGN KEY ("resume_version_id") REFERENCES "public"."resume_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "human_review_requests_status_idx" ON "human_review_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "human_review_requests_job_id_idx" ON "human_review_requests" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "human_review_requests_application_id_idx" ON "human_review_requests" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "human_review_requests_workflow_id_idx" ON "human_review_requests" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "human_review_requests_category_idx" ON "human_review_requests" USING btree ("category");--> statement-breakpoint
CREATE INDEX "human_review_requests_created_at_idx" ON "human_review_requests" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_checkpoints_workflow_id_idx" ON "workflow_checkpoints" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_checkpoints_status_updated_at_idx" ON "workflow_checkpoints" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "workflow_checkpoints_subject_id_idx" ON "workflow_checkpoints" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "application_authorizations_app_summary_idx" ON "application_authorizations" USING btree ("application_id","summary_hash");--> statement-breakpoint
CREATE INDEX "application_events_application_id_at_idx" ON "application_events" USING btree ("application_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "application_field_answers_field_id_idx" ON "application_field_answers" USING btree ("field_id");--> statement-breakpoint
CREATE INDEX "application_field_answers_status_idx" ON "application_field_answers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "application_field_answers_source_idx" ON "application_field_answers" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "application_form_fields_app_key_idx" ON "application_form_fields" USING btree ("application_id","field_key");--> statement-breakpoint
CREATE INDEX "application_form_fields_category_idx" ON "application_form_fields" USING btree ("category");--> statement-breakpoint
CREATE INDEX "application_tasks_application_id_step_idx" ON "application_tasks" USING btree ("application_id","step");--> statement-breakpoint
CREATE INDEX "application_tasks_status_idx" ON "application_tasks" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_job_id_unique_idx" ON "applications" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "applications_status_idx" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "applications_dedupe_key_idx" ON "applications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "applications_workflow_id_idx" ON "applications" USING btree ("workflow_id");