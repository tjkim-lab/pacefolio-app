CREATE TYPE "public"."activity_status" AS ENUM('ACTIVE', 'ARCHIVED');
--> statement-breakpoint
CREATE TYPE "public"."growth_tag_role" AS ENUM('PRIMARY', 'SECONDARY');
--> statement-breakpoint
CREATE TYPE "public"."program_mode" AS ENUM('EXPERIENCE', 'SKILL_MASTERY', 'SEASONAL', 'MEASUREMENT', 'COURSE');
--> statement-breakpoint
CREATE TYPE "public"."program_version_status" AS ENUM('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"status" "activity_status" DEFAULT 'ACTIVE' NOT NULL,
	"current_revision_id" text,
	"created_by_user_id" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_revision_growth_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"activity_revision_id" text NOT NULL,
	"growth_domain_id" text NOT NULL,
	"role" "growth_tag_role" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"revision_number" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"instructions" text,
	"easy_variation" text,
	"standard_variation" text,
	"challenge_variation" text,
	"coaching_points" text,
	"safety_notes" text,
	"difficulty_label" text,
	"recommended_age_label" text,
	"recommended_minutes" integer,
	"participant_format" text,
	"space_requirement" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"program_version_id" text NOT NULL,
	"parent_section_id" text,
	"section_type" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_session_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"curriculum_session_id" text NOT NULL,
	"activity_revision_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"recommended_minutes" integer
);
--> statement-breakpoint
CREATE TABLE "curriculum_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"program_version_id" text NOT NULL,
	"section_id" text NOT NULL,
	"name" text NOT NULL,
	"sequence" integer NOT NULL,
	"theme" text,
	"objective" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "growth_domains" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"parent_id" text,
	"code" text,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"color" text,
	"icon" text,
	"report_visible" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_levels" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"program_version_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"description" text,
	"target_age_label" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_modes" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"academy_id" text NOT NULL,
	"mode" "program_mode" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"program_id" text NOT NULL,
	"version_label" text NOT NULL,
	"status" "program_version_status" DEFAULT 'DRAFT' NOT NULL,
	"based_on_version_id" text,
	"published_at" timestamp with time zone,
	"published_by_user_id" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_age_label" text,
	"ownership_type" text DEFAULT 'PRIVATE_ACADEMY' NOT NULL,
	"visibility" text DEFAULT 'PRIVATE' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ck_program_ownership" CHECK ("programs"."ownership_type" IN ('PRIVATE_ACADEMY','PLATFORM_TEMPLATE','MARKETPLACE_PRODUCT','INSTALLED_COPY')),
	CONSTRAINT "ck_program_visibility" CHECK ("programs"."visibility" IN ('PRIVATE','UNLISTED','PUBLIC'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_act_id_academy" ON "activities" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE INDEX "ix_act_academy_status" ON "activities" USING btree ("academy_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_argt_revision_domain" ON "activity_revision_growth_tags" USING btree ("activity_revision_id","growth_domain_id");
--> statement-breakpoint
CREATE INDEX "ix_argt_domain" ON "activity_revision_growth_tags" USING btree ("growth_domain_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_arv_id_academy" ON "activity_revisions" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_arv_activity_number" ON "activity_revisions" USING btree ("activity_id","revision_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_csec_id_academy" ON "curriculum_sections" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE INDEX "ix_csec_version" ON "curriculum_sections" USING btree ("program_version_id");
--> statement-breakpoint
CREATE INDEX "ix_csa_session" ON "curriculum_session_activities" USING btree ("curriculum_session_id");
--> statement-breakpoint
CREATE INDEX "ix_csa_revision" ON "curriculum_session_activities" USING btree ("activity_revision_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cses_id_academy" ON "curriculum_sessions" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE INDEX "ix_cses_section_seq" ON "curriculum_sessions" USING btree ("section_id","sequence");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_gro_id_academy" ON "growth_domains" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE INDEX "ix_gro_academy" ON "growth_domains" USING btree ("academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_plv_id_academy" ON "program_levels" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_plv_version_name" ON "program_levels" USING btree ("program_version_id","name");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_program_mode" ON "program_modes" USING btree ("program_id","mode");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pv_id_academy" ON "program_versions" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE INDEX "ix_pv_program" ON "program_versions" USING btree ("program_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_program_id_academy" ON "programs" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE INDEX "ix_program_academy" ON "programs" USING btree ("academy_id");
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "activity_revision_growth_tags" ADD CONSTRAINT "activity_revision_growth_tags_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "activity_revision_growth_tags" ADD CONSTRAINT "fk_argt_revision_academy" FOREIGN KEY ("activity_revision_id","academy_id") REFERENCES "public"."activity_revisions"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "activity_revision_growth_tags" ADD CONSTRAINT "fk_argt_domain_academy" FOREIGN KEY ("growth_domain_id","academy_id") REFERENCES "public"."growth_domains"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "activity_revisions" ADD CONSTRAINT "activity_revisions_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "activity_revisions" ADD CONSTRAINT "activity_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "activity_revisions" ADD CONSTRAINT "fk_arv_activity_academy" FOREIGN KEY ("activity_id","academy_id") REFERENCES "public"."activities"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "curriculum_sections" ADD CONSTRAINT "curriculum_sections_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "curriculum_sections" ADD CONSTRAINT "fk_csec_version_academy" FOREIGN KEY ("program_version_id","academy_id") REFERENCES "public"."program_versions"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "curriculum_sections" ADD CONSTRAINT "fk_csec_parent_academy" FOREIGN KEY ("parent_section_id","academy_id") REFERENCES "public"."curriculum_sections"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "curriculum_session_activities" ADD CONSTRAINT "curriculum_session_activities_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "curriculum_session_activities" ADD CONSTRAINT "fk_csa_session_academy" FOREIGN KEY ("curriculum_session_id","academy_id") REFERENCES "public"."curriculum_sessions"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "curriculum_session_activities" ADD CONSTRAINT "fk_csa_revision_academy" FOREIGN KEY ("activity_revision_id","academy_id") REFERENCES "public"."activity_revisions"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "curriculum_sessions" ADD CONSTRAINT "curriculum_sessions_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "curriculum_sessions" ADD CONSTRAINT "fk_cses_version_academy" FOREIGN KEY ("program_version_id","academy_id") REFERENCES "public"."program_versions"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "curriculum_sessions" ADD CONSTRAINT "fk_cses_section_academy" FOREIGN KEY ("section_id","academy_id") REFERENCES "public"."curriculum_sections"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "growth_domains" ADD CONSTRAINT "growth_domains_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "growth_domains" ADD CONSTRAINT "fk_gro_parent_academy" FOREIGN KEY ("parent_id","academy_id") REFERENCES "public"."growth_domains"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "program_levels" ADD CONSTRAINT "program_levels_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "program_levels" ADD CONSTRAINT "fk_plv_version_academy" FOREIGN KEY ("program_version_id","academy_id") REFERENCES "public"."program_versions"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "program_modes" ADD CONSTRAINT "program_modes_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "program_modes" ADD CONSTRAINT "fk_pmode_program_academy" FOREIGN KEY ("program_id","academy_id") REFERENCES "public"."programs"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "program_versions" ADD CONSTRAINT "program_versions_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "program_versions" ADD CONSTRAINT "program_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "program_versions" ADD CONSTRAINT "fk_pv_program_academy" FOREIGN KEY ("program_id","academy_id") REFERENCES "public"."programs"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
