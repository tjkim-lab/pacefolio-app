ALTER TABLE "payments" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "attempt_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_payment_provider_id" ON "payments" USING btree ("provider","provider_payment_id");