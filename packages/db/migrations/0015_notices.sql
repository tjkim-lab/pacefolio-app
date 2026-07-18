CREATE TABLE "notices" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"audience" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notice_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"notice_id" text NOT NULL,
	"academy_id" text NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "ix_notice_academy_published" ON "notices" USING btree ("academy_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notice_id_academy" ON "notices" USING btree ("id","academy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notice_receipt" ON "notice_receipts" USING btree ("notice_id","user_id");--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_receipts" ADD CONSTRAINT "notice_receipts_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_receipts" ADD CONSTRAINT "notice_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_receipts" ADD CONSTRAINT "fk_receipt_notice_academy" FOREIGN KEY ("notice_id","academy_id") REFERENCES "public"."notices"("id","academy_id") ON DELETE no action ON UPDATE no action;