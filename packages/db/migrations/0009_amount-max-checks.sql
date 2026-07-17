ALTER TABLE "invoice_lines" ADD CONSTRAINT "ck_line_amount_range" CHECK ("invoice_lines"."amount" BETWEEN -100000000 AND 100000000);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "ck_invoice_total_max" CHECK ("invoices"."total" <= 100000000);--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "ck_alloc_amount_max" CHECK ("payment_allocations"."amount" <= 100000000);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "ck_payment_amount_max" CHECK ("payments"."amount" <= 100000000);--> statement-breakpoint
ALTER TABLE "refund_allocations" ADD CONSTRAINT "ck_ra_amount_max" CHECK ("refund_allocations"."amount" <= 100000000);--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "ck_refund_requested_max" CHECK ("refunds"."requested_amount" <= 100000000);