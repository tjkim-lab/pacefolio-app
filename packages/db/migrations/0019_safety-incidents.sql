CREATE TYPE "public"."guardian_contact_status" AS ENUM('CONTACTED', 'NEEDED', 'NOT_NEEDED');--> statement-breakpoint
CREATE TYPE "public"."incident_severity" AS ENUM('MINOR', 'CAUTION', 'SEVERE');--> statement-breakpoint
CREATE TYPE "public"."incident_type" AS ENUM('MINOR_INJURY', 'CONDITION', 'CLASS_HALT', 'SAFETY_ACCIDENT', 'OTHER');--> statement-breakpoint
CREATE TABLE "safety_incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"session_id" text,
	"reported_by_user_id" text NOT NULL,
	"type" "incident_type" NOT NULL,
	"severity" "incident_severity" NOT NULL,
	"situation" text NOT NULL,
	"location" text,
	"first_aid" text,
	"class_continued" boolean NOT NULL,
	"follow_up_needed" boolean NOT NULL,
	"guardian_contact" "guardian_contact_status" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD CONSTRAINT "fk_incident_participant_academy" FOREIGN KEY ("participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD CONSTRAINT "fk_incident_session_academy" FOREIGN KEY ("session_id","academy_id") REFERENCES "public"."class_sessions"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_incident_academy_occurred" ON "safety_incidents" USING btree ("academy_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ix_incident_participant" ON "safety_incidents" USING btree ("participant_id");