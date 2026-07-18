CREATE TYPE "public"."class_schedule_type" AS ENUM('FIXED_WEEKLY', 'VARIABLE_BY_WEEKDAY', 'PARTICIPANT_SPECIFIC');--> statement-breakpoint
CREATE TYPE "public"."class_session_status" AS ENUM('SCHEDULED', 'CANCELED', 'EXTRA', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."class_status" AS ENUM('ACTIVE', 'WAITING', 'CLOSED');--> statement-breakpoint
CREATE TABLE "class_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"academy_id" text NOT NULL,
	"coach_user_id" text NOT NULL,
	"status" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_assignment_status" CHECK ("class_assignments"."status" IN ('ACTIVE', 'ENDED'))
);
--> statement-breakpoint
CREATE TABLE "class_schedule_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"academy_id" text NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"participant_id" text,
	CONSTRAINT "ck_slot_weekday" CHECK ("class_schedule_slots"."weekday" BETWEEN 0 AND 6)
);
--> statement-breakpoint
CREATE TABLE "class_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"academy_id" text NOT NULL,
	"date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"participant_id" text,
	"status" "class_session_status" DEFAULT 'SCHEDULED' NOT NULL,
	"canceled_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"name" text NOT NULL,
	"schedule_type" "class_schedule_type" NOT NULL,
	"capacity" integer NOT NULL,
	"room" text,
	"status" "class_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ck_class_capacity" CHECK ("classes"."capacity" > 0 AND "classes"."capacity" <= 200)
);
--> statement-breakpoint
CREATE INDEX "ix_assignment_coach" ON "class_assignments" USING btree ("coach_user_id");--> statement-breakpoint
CREATE INDEX "ix_assignment_class" ON "class_assignments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "ix_slot_class" ON "class_schedule_slots" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "ix_session_class_date" ON "class_sessions" USING btree ("class_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_session_id_academy" ON "class_sessions" USING btree ("id","academy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_session_group_slot" ON "class_sessions" USING btree ("class_id","date","start_time") WHERE "class_sessions"."participant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_session_participant_slot" ON "class_sessions" USING btree ("class_id","date","start_time","participant_id") WHERE "class_sessions"."participant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_class_id_academy" ON "classes" USING btree ("id","academy_id");--> statement-breakpoint
CREATE INDEX "ix_class_academy" ON "classes" USING btree ("academy_id");--> statement-breakpoint
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_assignments" ADD CONSTRAINT "fk_assignment_class_academy" FOREIGN KEY ("class_id","academy_id") REFERENCES "public"."classes"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_schedule_slots" ADD CONSTRAINT "class_schedule_slots_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_schedule_slots" ADD CONSTRAINT "fk_slot_class_academy" FOREIGN KEY ("class_id","academy_id") REFERENCES "public"."classes"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_schedule_slots" ADD CONSTRAINT "fk_slot_participant_academy" FOREIGN KEY ("participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "fk_session_class_academy" FOREIGN KEY ("class_id","academy_id") REFERENCES "public"."classes"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "fk_session_participant_academy" FOREIGN KEY ("participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;