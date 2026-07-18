CREATE TYPE "public"."attendance_notice_type" AS ENUM('ABSENCE', 'LATE', 'EARLY_LEAVE');--> statement-breakpoint
CREATE TYPE "public"."attendance_record_status" AS ENUM('PRESENT', 'ABSENT', 'LATE', 'EARLY_LEAVE', 'EXCUSED');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('TRIAL', 'ENROLLED', 'ON_BREAK', 'WITHDRAWN');--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"session_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"status" "attendance_record_status" NOT NULL,
	"reason" text,
	"recorded_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_notices" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"date" date NOT NULL,
	"type" "attendance_notice_type" NOT NULL,
	"reason" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"class_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"status" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_enrollment_status" CHECK ("enrollments"."status" IN ('ACTIVE', 'ENDED'))
);
--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "status" "participant_status" DEFAULT 'ENROLLED' NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_attendance_session_participant" ON "attendance_records" USING btree ("session_id","participant_id");--> statement-breakpoint
CREATE INDEX "ix_attendance_participant" ON "attendance_records" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "ix_notice_participant_date" ON "attendance_notices" USING btree ("participant_id","date");--> statement-breakpoint
CREATE INDEX "ix_enrollment_class" ON "enrollments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "ix_enrollment_participant" ON "enrollments" USING btree ("participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_enrollment_active" ON "enrollments" USING btree ("class_id","participant_id") WHERE "enrollments"."status" = 'ACTIVE';--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "fk_attendance_session_academy" FOREIGN KEY ("session_id","academy_id") REFERENCES "public"."class_sessions"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "fk_attendance_participant_academy" FOREIGN KEY ("participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_notices" ADD CONSTRAINT "attendance_notices_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_notices" ADD CONSTRAINT "attendance_notices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_notices" ADD CONSTRAINT "fk_notice_participant_academy" FOREIGN KEY ("participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "fk_enrollment_class_academy" FOREIGN KEY ("class_id","academy_id") REFERENCES "public"."classes"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "fk_enrollment_participant_academy" FOREIGN KEY ("participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;