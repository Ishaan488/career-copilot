CREATE TABLE "job_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"analysis_id" uuid NOT NULL,
	"profile_revision_id" text,
	"weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"eligibility" text NOT NULL,
	"eligibility_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suitability_total" numeric(5, 2) NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"risk_factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comp_assessment" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"company_assessment" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommendation" text NOT NULL,
	"explanation" text NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"recommendation" text NOT NULL,
	"changed_from" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"subject_id" text NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rules_evaluated" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decision" text NOT NULL,
	"explanation" text NOT NULL,
	"ruleset_version" integer DEFAULT 1 NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"description" text NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "score" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "recommendation" text;--> statement-breakpoint
ALTER TABLE "job_evaluations" ADD CONSTRAINT "job_evaluations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_evaluations" ADD CONSTRAINT "job_evaluations_analysis_id_job_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."job_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_history" ADD CONSTRAINT "recommendation_history_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_history" ADD CONSTRAINT "recommendation_history_evaluation_id_job_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."job_evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_evaluations_job_id_created_at_idx" ON "job_evaluations" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "job_evaluations_recommendation_idx" ON "job_evaluations" USING btree ("recommendation");--> statement-breakpoint
CREATE INDEX "recommendation_history_job_id_at_idx" ON "recommendation_history" USING btree ("job_id","at");--> statement-breakpoint
CREATE INDEX "policy_decisions_scope_subject_idx" ON "policy_decisions" USING btree ("scope","subject_id");--> statement-breakpoint
CREATE INDEX "policy_decisions_decision_idx" ON "policy_decisions" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "policy_decisions_at_idx" ON "policy_decisions" USING btree ("at");--> statement-breakpoint
CREATE INDEX "policy_rules_type_idx" ON "policy_rules" USING btree ("type");--> statement-breakpoint
CREATE INDEX "policy_rules_enabled_priority_idx" ON "policy_rules" USING btree ("enabled","priority");--> statement-breakpoint
CREATE INDEX "jobs_score_idx" ON "jobs" USING btree ("score");--> statement-breakpoint
CREATE INDEX "jobs_recommendation_idx" ON "jobs" USING btree ("recommendation");