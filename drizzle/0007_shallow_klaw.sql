CREATE TABLE "company_research" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"legitimacy_status" text DEFAULT 'insufficient_evidence' NOT NULL,
	"legitimacy_score" numeric(5, 2) NOT NULL,
	"signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"risk_factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text NOT NULL,
	"researched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_research_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"research_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"signal_type" text NOT NULL,
	"source_url" text NOT NULL,
	"content_snippet" text NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_research" ADD CONSTRAINT "company_research_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_research_evidence" ADD CONSTRAINT "company_research_evidence_research_id_company_research_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."company_research"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_research_evidence" ADD CONSTRAINT "company_research_evidence_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_research_company_id_researched_at_idx" ON "company_research" USING btree ("company_id","researched_at");--> statement-breakpoint
CREATE INDEX "company_research_legitimacy_status_idx" ON "company_research" USING btree ("legitimacy_status");--> statement-breakpoint
CREATE INDEX "company_research_evidence_company_id_idx" ON "company_research_evidence" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_research_evidence_research_id_idx" ON "company_research_evidence" USING btree ("research_id");--> statement-breakpoint
CREATE INDEX "company_research_evidence_signal_type_idx" ON "company_research_evidence" USING btree ("signal_type");