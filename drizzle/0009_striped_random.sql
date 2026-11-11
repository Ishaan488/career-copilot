CREATE TABLE "application_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"attempt_no" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"authorization_id" uuid,
	"intent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clicked_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"verification_evidence" jsonb,
	"screenshot_path" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_submissions" ADD CONSTRAINT "application_submissions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_submissions" ADD CONSTRAINT "application_submissions_authorization_id_application_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."application_authorizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_submissions_app_idx" ON "application_submissions" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "application_submissions_active_unique_idx" ON "application_submissions" USING btree ("application_id") WHERE status IN ('intent', 'clicked', 'verified', 'unverified');