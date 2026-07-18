CREATE TYPE "public"."experience_participation" AS ENUM('FULL', 'PARTIAL', 'OBSERVED', 'NOT_PARTICIPATED');
--> statement-breakpoint
CREATE TYPE "public"."session_activity_result" AS ENUM('COMPLETED', 'PARTIAL', 'NOT_DONE', 'REPLACED');
--> statement-breakpoint
CREATE TABLE "class_program_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"class_id" text NOT NULL,
	"program_version_id" text NOT NULL,
	"program_level_id" text,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"start_curriculum_session_id" text,
	"allow_individual_progress" boolean DEFAULT true NOT NULL,
	"coach_edit_policy" text DEFAULT 'REPLACE_ALLOWED' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_cpa_status" CHECK ("class_program_assignments"."status" IN ('ACTIVE', 'ENDED')),
	CONSTRAINT "ck_cpa_edit_policy" CHECK ("class_program_assignments"."coach_edit_policy" IN ('REPLACE_ALLOWED', 'PLAN_LOCKED'))
);
--> statement-breakpoint
CREATE TABLE "participant_experience_events" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"class_session_id" text NOT NULL,
	"activity_revision_id" text NOT NULL,
	"growth_domain_id" text NOT NULL,
	"participation" "experience_participation" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_by_user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_activity_results" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"session_plan_id" text NOT NULL,
	"activity_revision_id" text NOT NULL,
	"result" "session_activity_result" NOT NULL,
	"replacement_activity_revision_id" text,
	"coach_note" text,
	"confirmed_by_user_id" text NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_sar_replacement" CHECK ("session_activity_results"."result" <> 'REPLACED' OR "session_activity_results"."replacement_activity_revision_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "session_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"class_session_id" text NOT NULL,
	"class_program_assignment_id" text NOT NULL,
	"curriculum_session_id" text,
	"source_program_version_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cpa_id_academy" ON "class_program_assignments" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE INDEX "ix_cpa_class" ON "class_program_assignments" USING btree ("class_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cpa_active" ON "class_program_assignments" USING btree ("class_id","program_version_id") WHERE "class_program_assignments"."status" = 'ACTIVE';
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pxe_dedup" ON "participant_experience_events" USING btree ("participant_id","class_session_id","activity_revision_id","growth_domain_id");
--> statement-breakpoint
CREATE INDEX "ix_pxe_participant_domain" ON "participant_experience_events" USING btree ("participant_id","growth_domain_id");
--> statement-breakpoint
CREATE INDEX "ix_pxe_participant_occurred" ON "participant_experience_events" USING btree ("participant_id","occurred_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sar_plan_activity" ON "session_activity_results" USING btree ("session_plan_id","activity_revision_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_spl_id_academy" ON "session_plans" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_spl_session_assignment" ON "session_plans" USING btree ("class_session_id","class_program_assignment_id");
--> statement-breakpoint
CREATE INDEX "ix_spl_assignment" ON "session_plans" USING btree ("class_program_assignment_id");
--> statement-breakpoint
ALTER TABLE "class_program_assignments" ADD CONSTRAINT "class_program_assignments_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "class_program_assignments" ADD CONSTRAINT "class_program_assignments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "class_program_assignments" ADD CONSTRAINT "fk_cpa_class_academy" FOREIGN KEY ("class_id","academy_id") REFERENCES "public"."classes"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "class_program_assignments" ADD CONSTRAINT "fk_cpa_version_academy" FOREIGN KEY ("program_version_id","academy_id") REFERENCES "public"."program_versions"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "class_program_assignments" ADD CONSTRAINT "fk_cpa_level_academy" FOREIGN KEY ("program_level_id","academy_id") REFERENCES "public"."program_levels"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "participant_experience_events" ADD CONSTRAINT "participant_experience_events_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "participant_experience_events" ADD CONSTRAINT "participant_experience_events_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "participant_experience_events" ADD CONSTRAINT "fk_pxe_participant_academy" FOREIGN KEY ("participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "participant_experience_events" ADD CONSTRAINT "fk_pxe_session_academy" FOREIGN KEY ("class_session_id","academy_id") REFERENCES "public"."class_sessions"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "participant_experience_events" ADD CONSTRAINT "fk_pxe_revision_academy" FOREIGN KEY ("activity_revision_id","academy_id") REFERENCES "public"."activity_revisions"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "participant_experience_events" ADD CONSTRAINT "fk_pxe_domain_academy" FOREIGN KEY ("growth_domain_id","academy_id") REFERENCES "public"."growth_domains"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session_activity_results" ADD CONSTRAINT "session_activity_results_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session_activity_results" ADD CONSTRAINT "session_activity_results_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session_activity_results" ADD CONSTRAINT "fk_sar_plan_academy" FOREIGN KEY ("session_plan_id","academy_id") REFERENCES "public"."session_plans"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session_activity_results" ADD CONSTRAINT "fk_sar_revision_academy" FOREIGN KEY ("activity_revision_id","academy_id") REFERENCES "public"."activity_revisions"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session_activity_results" ADD CONSTRAINT "fk_sar_replacement_academy" FOREIGN KEY ("replacement_activity_revision_id","academy_id") REFERENCES "public"."activity_revisions"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "fk_spl_session_academy" FOREIGN KEY ("class_session_id","academy_id") REFERENCES "public"."class_sessions"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "fk_spl_assignment_academy" FOREIGN KEY ("class_program_assignment_id","academy_id") REFERENCES "public"."class_program_assignments"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "fk_spl_curriculum_academy" FOREIGN KEY ("curriculum_session_id","academy_id") REFERENCES "public"."curriculum_sessions"("id","academy_id") ON DELETE no action ON UPDATE no action;
