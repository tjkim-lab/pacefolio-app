CREATE TYPE "public"."photo_asset_status" AS ENUM('PENDING_UPLOAD', 'UPLOADED', 'DELETED');--> statement-breakpoint
CREATE TABLE "photo_asset_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"photo_id" text NOT NULL,
	"academy_id" text NOT NULL,
	"participant_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"session_id" text,
	"uploaded_by_user_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"status" "photo_asset_status" NOT NULL,
	"purpose" text,
	"audience" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ck_photo_byte_size" CHECK ("photo_assets"."byte_size" > 0 AND "photo_assets"."byte_size" <= 26214400)
);
--> statement-breakpoint
CREATE TABLE "photo_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"guardian_id" text NOT NULL,
	"policy_version" text NOT NULL,
	"grants" text NOT NULL,
	"channel" text NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photo_asset_participants" ADD CONSTRAINT "photo_asset_participants_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_photo_id_academy" ON "photo_assets" USING btree ("id","academy_id");--> statement-breakpoint
ALTER TABLE "photo_asset_participants" ADD CONSTRAINT "fk_pap_photo_academy" FOREIGN KEY ("photo_id","academy_id") REFERENCES "public"."photo_assets"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_asset_participants" ADD CONSTRAINT "fk_pap_participant_academy" FOREIGN KEY ("participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_assets" ADD CONSTRAINT "photo_assets_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_assets" ADD CONSTRAINT "photo_assets_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_assets" ADD CONSTRAINT "fk_photo_session_academy" FOREIGN KEY ("session_id","academy_id") REFERENCES "public"."class_sessions"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_consents" ADD CONSTRAINT "photo_consents_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_consents" ADD CONSTRAINT "photo_consents_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_consents" ADD CONSTRAINT "fk_pconsent_participant_academy" FOREIGN KEY ("participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pap_photo_participant" ON "photo_asset_participants" USING btree ("photo_id","participant_id");--> statement-breakpoint
CREATE INDEX "ix_pap_participant" ON "photo_asset_participants" USING btree ("participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_photo_storage_key" ON "photo_assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "ix_photo_academy_created" ON "photo_assets" USING btree ("academy_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_photo_consent_participant" ON "photo_consents" USING btree ("academy_id","participant_id");