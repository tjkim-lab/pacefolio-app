ALTER TABLE "refund_allocations" ADD COLUMN "payment_id" text NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_invoice_id_participant" ON "invoices" USING btree ("id","participant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_alloc_id_invoice" ON "payment_allocations" USING btree ("id","invoice_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_alloc_id_payment" ON "payment_allocations" USING btree ("id","payment_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_refund_id_payment" ON "refunds" USING btree ("id","payment_id");
--> statement-breakpoint
ALTER TABLE "refund_allocations" ADD CONSTRAINT "fk_ra_pa_invoice" FOREIGN KEY ("payment_allocation_id","invoice_id") REFERENCES "public"."payment_allocations"("id","invoice_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "refund_allocations" ADD CONSTRAINT "fk_ra_pa_payment" FOREIGN KEY ("payment_allocation_id","payment_id") REFERENCES "public"."payment_allocations"("id","payment_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "refund_allocations" ADD CONSTRAINT "fk_ra_refund_payment" FOREIGN KEY ("refund_id","payment_id") REFERENCES "public"."refunds"("id","payment_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "refund_allocations" ADD CONSTRAINT "fk_ra_invoice_participant" FOREIGN KEY ("invoice_id","participant_id") REFERENCES "public"."invoices"("id","participant_id") ON DELETE no action ON UPDATE no action;
