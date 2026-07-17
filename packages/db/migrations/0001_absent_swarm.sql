CREATE TABLE "guardian_invite_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"invite_id" text NOT NULL,
	"academy_id" text NOT NULL,
	"guardian_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"verification_session_id" text NOT NULL,
	"redeemed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardian_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"academy_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"intended_phone" text,
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" integer NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ck_invite_max_uses" CHECK ("guardian_invites"."max_uses" >= 1)
);
--> statement-breakpoint
CREATE TABLE "guardian_verification_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"issued_to_user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"verified_phone" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_by_link_id" text
);
--> statement-breakpoint
CREATE TABLE "registered_guardian_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"phone" text NOT NULL,
	"relationship_type" "relationship_type",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guardian_invite_redemptions" ADD CONSTRAINT "guardian_invite_redemptions_invite_id_guardian_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."guardian_invites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_invite_redemptions" ADD CONSTRAINT "guardian_invite_redemptions_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_invite_redemptions" ADD CONSTRAINT "guardian_invite_redemptions_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_invite_redemptions" ADD CONSTRAINT "guardian_invite_redemptions_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_invite_redemptions" ADD CONSTRAINT "guardian_invite_redemptions_verification_session_id_guardian_verification_sessions_id_fk" FOREIGN KEY ("verification_session_id") REFERENCES "public"."guardian_verification_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_invites" ADD CONSTRAINT "guardian_invites_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_invites" ADD CONSTRAINT "guardian_invites_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_verification_sessions" ADD CONSTRAINT "guardian_verification_sessions_issued_to_user_id_users_id_fk" FOREIGN KEY ("issued_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registered_guardian_contacts" ADD CONSTRAINT "registered_guardian_contacts_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registered_guardian_contacts" ADD CONSTRAINT "registered_guardian_contacts_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_redemption" ON "guardian_invite_redemptions" USING btree ("invite_id","guardian_id","participant_id");--> statement-breakpoint
CREATE INDEX "ix_redemption_invite" ON "guardian_invite_redemptions" USING btree ("invite_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_invite_code_hash" ON "guardian_invites" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "ix_invite_participant" ON "guardian_invites" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "ix_gvs_user" ON "guardian_verification_sessions" USING btree ("issued_to_user_id");--> statement-breakpoint
CREATE INDEX "ix_gvs_expiry" ON "guardian_verification_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ix_rgc_participant" ON "registered_guardian_contacts" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "ix_rgc_phone" ON "registered_guardian_contacts" USING btree ("academy_id","phone");