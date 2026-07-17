-- R10-P1-01 배포 전제: 이 migration 은 NOT NULL 컬럼/복합 FK 를 즉시 추가한다.
-- 빈 DB 전용 — 2026-07-17 현재 production/pilot/staging DB 미존재(파일럿 전, 배포 이력 0).
-- 데이터가 있는 DB 에 적용하려면 nullable 추가 → backfill → 검증 → NOT NULL 순서로 재작성할 것.
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
