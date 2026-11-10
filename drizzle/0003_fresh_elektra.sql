CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"primary_domain" text,
	"industry" text,
	"size_range" text,
	"hq_country" text DEFAULT 'India',
	"website_url" text,
	"notes" text,
	"discovery_status" text DEFAULT 'discovered' NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"origin_ref" text,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"excluded_at" timestamp with time zone,
	"exclude_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_career_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"url" text NOT NULL,
	"ats_type" text DEFAULT 'unknown' NOT NULL,
	"board_id" text,
	"status" text DEFAULT 'candidate' NOT NULL,
	"verification" text DEFAULT 'unverified' NOT NULL,
	"detected_via" text DEFAULT 'manual' NOT NULL,
	"evidence_id" uuid,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_check_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"career_page_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"openings_count" integer,
	"board_alive" boolean,
	"ats_changed" boolean DEFAULT false NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "company_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"kind" text DEFAULT 'official' NOT NULL,
	"verification" text DEFAULT 'unverified' NOT NULL,
	"evidence_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "company_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text DEFAULT 'paste' NOT NULL,
	"total" integer NOT NULL,
	"accepted" integer NOT NULL,
	"rejected" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_monitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"check_interval_hours" integer DEFAULT 24 NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"next_check_at" timestamp with time zone,
	"openings_count" integer,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_monitors_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "company_probe_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"ats_type" text NOT NULL,
	"slug" text NOT NULL,
	"outcome" text NOT NULL,
	"displayed_name" text,
	"name_match_score" numeric,
	"domain_match" boolean,
	"status" text DEFAULT 'pending_confirmation' NOT NULL,
	"probed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_career_pages" ADD CONSTRAINT "company_career_pages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_check_runs" ADD CONSTRAINT "company_check_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_check_runs" ADD CONSTRAINT "company_check_runs_career_page_id_company_career_pages_id_fk" FOREIGN KEY ("career_page_id") REFERENCES "public"."company_career_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_domains" ADD CONSTRAINT "company_domains_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_monitors" ADD CONSTRAINT "company_monitors_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_probe_candidates" ADD CONSTRAINT "company_probe_candidates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_normalized_name_idx" ON "companies" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_primary_domain_idx" ON "companies" USING btree ("primary_domain");--> statement-breakpoint
CREATE UNIQUE INDEX "company_career_pages_comp_ats_board_idx" ON "company_career_pages" USING btree ("company_id","ats_type","board_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_probe_candidates_comp_ats_slug_idx" ON "company_probe_candidates" USING btree ("company_id","ats_type","slug");