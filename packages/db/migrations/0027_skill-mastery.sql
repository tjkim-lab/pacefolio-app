CREATE TYPE "public"."badge_award_status" AS ENUM('AWARDED', 'CORRECTED');
--> statement-breakpoint
CREATE TYPE "public"."skill_progress_status" AS ENUM('NOT_STARTED', 'INTRODUCED', 'ASSISTED', 'PRACTICING', 'INDEPENDENT', 'READY_FOR_CLEARANCE', 'CLEARED');
--> statement-breakpoint
CREATE TABLE "badge_awards" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"badge_definition_id" text NOT NULL,
	"skill_id" text,
	"status" "badge_award_status" DEFAULT 'AWARDED' NOT NULL,
	"awarded_at" timestamp with time zone NOT NULL,
	"awarded_by_user_id" text NOT NULL,
	"source_class_session_id" text,
	"corrected_at" timestamp with time zone,
	"corrected_by_user_id" text,
	"correction_reason" text
);
--> statement-breakpoint
CREATE TABLE "badge_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"skill_id" text,
	"name" text NOT NULL,
	"description" text,
	"image_storage_key" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_skill_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"status" "skill_progress_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"practice_count" integer DEFAULT 0 NOT NULL,
	"first_practiced_at" timestamp with time zone,
	"last_practiced_at" timestamp with time zone,
	"clearance_ready_at" timestamp with time zone,
	"cleared_at" timestamp with time zone,
	"cleared_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_clearance_criteria" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"required" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_practice_events" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"class_session_id" text,
	"result" text NOT NULL,
	"coach_note" text,
	"recorded_by_user_id" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_spe_result" CHECK ("skill_practice_events"."result" IN ('INTRODUCED','ASSISTED','PRACTICING','INDEPENDENT','READY_FOR_CLEARANCE'))
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"program_version_id" text NOT NULL,
	"program_level_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"recommended_practice_min" integer,
	"recommended_practice_max" integer,
	"previous_skill_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_baw_active" ON "badge_awards" USING btree ("participant_id","badge_definition_id") WHERE "badge_awards"."status" = 'AWARDED';
--> statement-breakpoint
CREATE INDEX "ix_baw_participant" ON "badge_awards" USING btree ("participant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_bdg_id_academy" ON "badge_definitions" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_bdg_skill_active" ON "badge_definitions" USING btree ("skill_id") WHERE "badge_definitions"."active" = true AND "badge_definitions"."skill_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_psp_participant_skill" ON "participant_skill_progress" USING btree ("participant_id","skill_id");
--> statement-breakpoint
CREATE INDEX "ix_psp_participant" ON "participant_skill_progress" USING btree ("participant_id");
--> statement-breakpoint
CREATE INDEX "ix_psp_skill" ON "participant_skill_progress" USING btree ("skill_id");
--> statement-breakpoint
CREATE INDEX "ix_scc_skill" ON "skill_clearance_criteria" USING btree ("skill_id");
--> statement-breakpoint
CREATE INDEX "ix_spe_participant_skill" ON "skill_practice_events" USING btree ("participant_id","skill_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_skl_id_academy" ON "skills" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_skl_level_name" ON "skills" USING btree ("program_level_id","name");
--> statement-breakpoint
CREATE INDEX "ix_skl_version" ON "skills" USING btree ("program_version_id");
--> statement-breakpoint
ALTER TABLE "badge_awards" ADD CONSTRAINT "badge_awards_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "badge_awards" ADD CONSTRAINT "badge_awards_awarded_by_user_id_users_id_fk" FOREIGN KEY ("awarded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "badge_awards" ADD CONSTRAINT "fk_baw_participant_academy" FOREIGN KEY ("participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "badge_awards" ADD CONSTRAINT "fk_baw_badge_academy" FOREIGN KEY ("badge_definition_id","academy_id") REFERENCES "public"."badge_definitions"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "badge_awards" ADD CONSTRAINT "fk_baw_skill_academy" FOREIGN KEY ("skill_id","academy_id") REFERENCES "public"."skills"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "badge_definitions" ADD CONSTRAINT "badge_definitions_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "badge_definitions" ADD CONSTRAINT "fk_bdg_skill_academy" FOREIGN KEY ("skill_id","academy_id") REFERENCES "public"."skills"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "participant_skill_progress" ADD CONSTRAINT "participant_skill_progress_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "participant_skill_progress" ADD CONSTRAINT "fk_psp_participant_academy" FOREIGN KEY ("participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "participant_skill_progress" ADD CONSTRAINT "fk_psp_skill_academy" FOREIGN KEY ("skill_id","academy_id") REFERENCES "public"."skills"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_clearance_criteria" ADD CONSTRAINT "skill_clearance_criteria_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_clearance_criteria" ADD CONSTRAINT "fk_scc_skill_academy" FOREIGN KEY ("skill_id","academy_id") REFERENCES "public"."skills"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_practice_events" ADD CONSTRAINT "skill_practice_events_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_practice_events" ADD CONSTRAINT "skill_practice_events_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_practice_events" ADD CONSTRAINT "fk_spe_participant_academy" FOREIGN KEY ("participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_practice_events" ADD CONSTRAINT "fk_spe_skill_academy" FOREIGN KEY ("skill_id","academy_id") REFERENCES "public"."skills"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_practice_events" ADD CONSTRAINT "fk_spe_session_academy" FOREIGN KEY ("class_session_id","academy_id") REFERENCES "public"."class_sessions"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "fk_skl_version_academy" FOREIGN KEY ("program_version_id","academy_id") REFERENCES "public"."program_versions"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "fk_skl_level_academy" FOREIGN KEY ("program_level_id","academy_id") REFERENCES "public"."program_levels"("id","academy_id") ON DELETE no action ON UPDATE no action;
