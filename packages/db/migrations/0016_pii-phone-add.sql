DROP INDEX "ix_rgc_phone";--> statement-breakpoint
ALTER TABLE "guardian_invites" ADD COLUMN "intended_phone_hash" text;--> statement-breakpoint
ALTER TABLE "guardian_verification_sessions" ADD COLUMN "verified_phone_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "guardian_verification_sessions" ADD COLUMN "verified_phone_enc" text NOT NULL;--> statement-breakpoint
ALTER TABLE "registered_guardian_contacts" ADD COLUMN "phone_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "registered_guardian_contacts" ADD COLUMN "phone_enc" text NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_rgc_phone" ON "registered_guardian_contacts" USING btree ("academy_id","phone_hash");