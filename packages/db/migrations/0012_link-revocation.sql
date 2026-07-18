ALTER TYPE "public"."verification_status" ADD VALUE 'REVOKED';--> statement-breakpoint
ALTER TABLE "guardian_participant_links" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guardian_participant_links" ADD COLUMN "revoked_by_user_id" text;--> statement-breakpoint
ALTER TABLE "guardian_participant_links" ADD COLUMN "revocation_reason_code" text;