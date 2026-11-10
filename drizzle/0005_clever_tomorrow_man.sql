CREATE TABLE "ai_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"output" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task" text NOT NULL,
	"model" text NOT NULL,
	"provider" text NOT NULL,
	"prompt_version" integer DEFAULT 1 NOT NULL,
	"input_hash" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"output_ref" text,
	"status" text NOT NULL,
	"reported_confidence" text,
	"validation_outcome" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"latency_ms" integer,
	"cost_estimate" text,
	"error" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"description_hash" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"task_version" integer DEFAULT 1 NOT NULL,
	"model" text NOT NULL,
	"responsibilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seniority" text,
	"domain" text,
	"tech_stack" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"experience_min_years" integer,
	"experience_max_years" integer,
	"education_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"employment_type" text,
	"location_constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comp_mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"application_conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ambiguities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"injection_suspected" boolean DEFAULT false NOT NULL,
	"raw_output" jsonb,
	"tokens_in" integer,
	"tokens_out" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_skill_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"level" text DEFAULT 'required' NOT NULL,
	"mandatory" boolean DEFAULT true NOT NULL,
	"quote" text,
	"min_years" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "analysis_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_analyses" ADD CONSTRAINT "job_analyses_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_skill_requirements" ADD CONSTRAINT "job_skill_requirements_analysis_id_job_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."job_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_requests_input_task_idx" ON "ai_requests" USING btree ("input_hash","task");--> statement-breakpoint
CREATE INDEX "ai_requests_entity_idx" ON "ai_requests" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "ai_requests_at_idx" ON "ai_requests" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_analyses_unique_idx" ON "job_analyses" USING btree ("job_id","description_hash","schema_version","task_version");--> statement-breakpoint
CREATE INDEX "job_analyses_job_id_idx" ON "job_analyses" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_skill_requirements_analysis_id_idx" ON "job_skill_requirements" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "job_skill_requirements_normalized_name_idx" ON "job_skill_requirements" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "jobs_analysis_status_idx" ON "jobs" USING btree ("analysis_status");