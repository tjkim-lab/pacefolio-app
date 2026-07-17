CREATE TYPE "public"."membership_status" AS ENUM('INVITED', 'ACTIVE', 'SUSPENDED', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."oauth_provider" AS ENUM('kakao', 'naver', 'google', 'apple');--> statement-breakpoint
CREATE TYPE "public"."relationship_type" AS ENUM('MOTHER', 'FATHER', 'GRANDPARENT', 'LEGAL_GUARDIAN', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('OWNER', 'MANAGER', 'COACH', 'DESK', 'DRIVER', 'GUARDIAN', 'PLATFORM_ADMIN');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "academies" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"theme_color" text NOT NULL,
	"theme_ink" text NOT NULL,
	"logo_emoji" text NOT NULL,
	"owner_name" text NOT NULL,
	"billing_cycle_default" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ck_billing_cycle" CHECK ("academies"."billing_cycle_default" IN (1, 3))
);
--> statement-breakpoint
CREATE TABLE "academy_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"academy_id" text NOT NULL,
	"roles" "role"[] NOT NULL,
	"status" "membership_status" NOT NULL,
	"joined_at" date NOT NULL,
	"ended_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ck_membership_roles_nonempty" CHECK (array_length("academy_memberships"."roles", 1) >= 1)
);
--> statement-breakpoint
CREATE TABLE "external_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" "oauth_provider" NOT NULL,
	"provider_subject" text NOT NULL,
	"verified_email" text,
	"verified_phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardian_participant_links" (
	"id" text PRIMARY KEY NOT NULL,
	"guardian_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"academy_id" text NOT NULL,
	"relationship_type" "relationship_type" NOT NULL,
	"is_primary_guardian" boolean NOT NULL,
	"verification_status" "verification_status" NOT NULL,
	"can_view_schedule" boolean NOT NULL,
	"can_view_attendance" boolean NOT NULL,
	"can_view_health_info" boolean NOT NULL,
	"can_receive_photos" boolean NOT NULL,
	"can_pay" boolean NOT NULL,
	"can_request_refund" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_authorization_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" "oauth_provider" NOT NULL,
	"state_hash" text NOT NULL,
	"code_verifier" text NOT NULL,
	"nonce" text,
	"redirect_uri" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"name" text NOT NULL,
	"birth" date NOT NULL,
	"age_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"rotated_from_id" text,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academy_memberships" ADD CONSTRAINT "academy_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_memberships" ADD CONSTRAINT "academy_memberships_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_participant_links" ADD CONSTRAINT "guardian_participant_links_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_participant_links" ADD CONSTRAINT "guardian_participant_links_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_participant_links" ADD CONSTRAINT "guardian_participant_links_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_membership_user_academy" ON "academy_memberships" USING btree ("user_id","academy_id");--> statement-breakpoint
CREATE INDEX "ix_membership_academy_status" ON "academy_memberships" USING btree ("academy_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_external_identity" ON "external_identities" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE INDEX "ix_external_identity_user" ON "external_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_guardian_link" ON "guardian_participant_links" USING btree ("guardian_id","participant_id","academy_id");--> statement-breakpoint
CREATE INDEX "ix_link_participant" ON "guardian_participant_links" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "ix_link_guardian" ON "guardian_participant_links" USING btree ("guardian_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_guardian_user" ON "guardians" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_oauth_state" ON "oauth_authorization_requests" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "ix_oauth_expiry" ON "oauth_authorization_requests" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ix_participant_academy" ON "participants" USING btree ("academy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_session_token_hash" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ix_session_expiry" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ix_session_user_active" ON "sessions" USING btree ("user_id","revoked_at");