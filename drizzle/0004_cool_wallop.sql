CREATE TABLE "job_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"raw" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_source_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"listing_url" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"missing_count" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"company_id" uuid,
	"career_page_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"schedule_cron" text DEFAULT '0 */6 * * *',
	"status" text DEFAULT 'idle' NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"rate_limit" jsonb DEFAULT '{"reqPerMinute": 30}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"actor" text NOT NULL,
	"reason" text,
	"decision_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"title" text NOT NULL,
	"normalized_title" text NOT NULL,
	"seniority" text,
	"description_text" text NOT NULL,
	"description_html" text,
	"location_raw" text,
	"city" text,
	"country" text,
	"work_mode" text DEFAULT 'unknown' NOT NULL,
	"employment_type" text,
	"comp_min" numeric,
	"comp_max" numeric,
	"comp_currency" text,
	"comp_period" text,
	"comp_disclosed" boolean DEFAULT false NOT NULL,
	"posted_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"application_url" text,
	"canonical_url" text,
	"status" text DEFAULT 'new' NOT NULL,
	"status_reason" text,
	"first_discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description_hash" text NOT NULL,
	"primary_listing_id" uuid,
	"possible_duplicate_of" uuid,
	"prefilter_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"new_count" integer DEFAULT 0 NOT NULL,
	"changed_count" integer DEFAULT 0 NOT NULL,
	"unchanged_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"cursor_after" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_snapshots" ADD CONSTRAINT "job_snapshots_listing_id_job_source_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."job_source_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_source_listings" ADD CONSTRAINT "job_source_listings_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_source_listings" ADD CONSTRAINT "job_source_listings_source_id_job_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."job_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_sources" ADD CONSTRAINT "job_sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_sources" ADD CONSTRAINT "job_sources_career_page_id_company_career_pages_id_fk" FOREIGN KEY ("career_page_id") REFERENCES "public"."company_career_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_sync_runs" ADD CONSTRAINT "source_sync_runs_source_id_job_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."job_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_snapshots_listing_hash_idx" ON "job_snapshots" USING btree ("listing_id","content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "job_source_listings_source_external_idx" ON "job_source_listings" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "job_source_listings_job_id_idx" ON "job_source_listings" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_sources_type_idx" ON "job_sources" USING btree ("type");--> statement-breakpoint
CREATE INDEX "job_sources_company_id_idx" ON "job_sources" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "job_sources_status_idx" ON "job_sources" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "job_sources_career_page_id_idx" ON "job_sources" USING btree ("career_page_id");--> statement-breakpoint
CREATE INDEX "job_status_history_job_id_idx" ON "job_status_history" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_status_history_at_idx" ON "job_status_history" USING btree ("at");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_company_id_idx" ON "jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "jobs_posted_at_idx" ON "jobs" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX "jobs_canonical_url_idx" ON "jobs" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "jobs_normalized_title_idx" ON "jobs" USING btree ("normalized_title");--> statement-breakpoint
CREATE INDEX "source_sync_runs_source_id_idx" ON "source_sync_runs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "source_sync_runs_started_at_idx" ON "source_sync_runs" USING btree ("started_at");