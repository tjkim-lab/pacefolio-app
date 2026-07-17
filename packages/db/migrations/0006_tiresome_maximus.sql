CREATE TYPE "public"."refund_status" AS ENUM('REQUESTED', 'MUTUALLY_APPROVED', 'PROCESSING', 'COMPLETED', 'FAILED', 'UNKNOWN', 'REJECTED');
--> statement-breakpoint
CREATE TABLE "refund_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"refund_id" text NOT NULL,
	"payment_allocation_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"academy_id" text NOT NULL,
	"amount" integer NOT NULL,
	CONSTRAINT "ck_ra_amount_positive" CHECK ("refund_allocations"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"payment_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"status" "refund_status" NOT NULL,
	"reason_code" text NOT NULL,
	"reason_text" text,
	"requested_amount" integer NOT NULL,
	"approved_amount" integer,
	"completed_amount" integer,
	"requested_by_user_id" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"guardian_approved_by_user_id" text,
	"guardian_approved_at" timestamp with time zone,
	"academy_approved_by_user_id" text,
	"academy_approved_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"provider_refund_id" text,
	"last_event_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ck_refund_requested_positive" CHECK ("refunds"."requested_amount" > 0),
	CONSTRAINT "ck_refund_no_partial_approval" CHECK ("refunds"."approved_amount" IS NULL OR "refunds"."approved_amount" = "refunds"."requested_amount")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_refund_alloc" ON "refund_allocations" USING btree ("refund_id","payment_allocation_id");
--> statement-breakpoint
CREATE INDEX "ix_ra_payment_allocation" ON "refund_allocations" USING btree ("payment_allocation_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_refund_idem" ON "refunds" USING btree ("academy_id","requested_by_user_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_refund_id_academy" ON "refunds" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE INDEX "ix_refund_payment" ON "refunds" USING btree ("payment_id");
--> statement-breakpoint
ALTER TABLE "refund_allocations" ADD CONSTRAINT "refund_allocations_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "refund_allocations" ADD CONSTRAINT "refund_allocations_payment_allocation_id_payment_allocations_id_fk" FOREIGN KEY ("payment_allocation_id") REFERENCES "public"."payment_allocations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "refund_allocations" ADD CONSTRAINT "refund_allocations_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "refund_allocations" ADD CONSTRAINT "fk_ra_refund_academy" FOREIGN KEY ("refund_id","academy_id") REFERENCES "public"."refunds"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "refund_allocations" ADD CONSTRAINT "fk_ra_invoice_academy" FOREIGN KEY ("invoice_id","academy_id") REFERENCES "public"."invoices"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "fk_refund_payment_academy" FOREIGN KEY ("payment_id","academy_id") REFERENCES "public"."payments"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "fk_refund_participant_academy" FOREIGN KEY ("participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;
