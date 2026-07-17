ALTER TABLE "guardian_invites" ADD COLUMN "allowed_scopes" text[] DEFAULT ARRAY['VIEW_SCHEDULE','VIEW_ATTENDANCE']::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD COLUMN "academy_id" text NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_bp_id_academy" ON "billing_periods" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_invite_id_academy" ON "guardian_invites" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_primary_guardian_per_participant" ON "guardian_participant_links" USING btree ("participant_id") WHERE "guardian_participant_links"."is_primary_guardian" = true;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_invoice_id_academy" ON "invoices" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_participant_id_academy" ON "participants" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_payment_id_academy" ON "payments" USING btree ("id","academy_id");
--> statement-breakpoint
ALTER TABLE "guardian_invite_redemptions" ADD CONSTRAINT "fk_redemption_invite_academy" FOREIGN KEY ("invite_id","academy_id") REFERENCES "public"."guardian_invites"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "guardian_invite_redemptions" ADD CONSTRAINT "fk_redemption_participant_academy" FOREIGN KEY ("participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "guardian_invites" ADD CONSTRAINT "fk_invite_participant_academy" FOREIGN KEY ("participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "guardian_participant_links" ADD CONSTRAINT "fk_link_participant_academy" FOREIGN KEY ("participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "fk_invoice_participant_academy" FOREIGN KEY ("participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "fk_invoice_bp_academy" FOREIGN KEY ("billing_period_id","academy_id") REFERENCES "public"."billing_periods"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "fk_alloc_payment_academy" FOREIGN KEY ("payment_id","academy_id") REFERENCES "public"."payments"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "fk_alloc_invoice_academy" FOREIGN KEY ("invoice_id","academy_id") REFERENCES "public"."invoices"("id","academy_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "registered_guardian_contacts" ADD CONSTRAINT "fk_rgc_participant_academy" FOREIGN KEY ("participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;
