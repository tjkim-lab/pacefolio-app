-- R10-P1-01 배포 전제: 이 migration 은 NOT NULL 컬럼/복합 FK 를 즉시 추가한다.
-- 빈 DB 전용 — 2026-07-17 현재 production/pilot/staging DB 미존재(파일럿 전, 배포 이력 0).
-- 데이터가 있는 DB 에 적용하려면 nullable 추가 → backfill → 검증 → NOT NULL 순서로 재작성할 것.
ALTER TABLE "refund_allocations" DROP CONSTRAINT "fk_ra_refund_academy";
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_refund_id_participant_academy" ON "refunds" USING btree ("id","participant_id","academy_id");
--> statement-breakpoint
ALTER TABLE "refund_allocations" ADD CONSTRAINT "fk_ra_refund_participant_academy" FOREIGN KEY ("refund_id","participant_id","academy_id") REFERENCES "public"."refunds"("id","participant_id","academy_id") ON DELETE no action ON UPDATE no action;
