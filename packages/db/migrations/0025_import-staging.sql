CREATE TYPE "public"."import_batch_status" AS ENUM('STAGED', 'COMMITTED', 'REVERTED');
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"target_type" text DEFAULT 'ACTIVITY' NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"status" "import_batch_status" DEFAULT 'STAGED' NOT NULL,
	"mapping" text NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"committed_at" timestamp with time zone,
	"committed_by_user_id" text,
	"reverted_at" timestamp with time zone,
	"reverted_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"import_batch_id" text NOT NULL,
	"source_row_number" integer NOT NULL,
	"raw_payload" text NOT NULL,
	"normalized_payload" text NOT NULL,
	"validation_status" text NOT NULL,
	"validation_messages" text NOT NULL,
	"duplicate_candidate_ids" text NOT NULL,
	"resolution" text DEFAULT 'CREATE' NOT NULL,
	"committed_entity_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_imr_resolution" CHECK ("import_rows"."resolution" IN ('CREATE', 'SKIP')),
	CONSTRAINT "ck_imr_validation" CHECK ("import_rows"."validation_status" IN ('VALID', 'INVALID'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_imb_id_academy" ON "import_batches" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE INDEX "ix_imb_academy_hash" ON "import_batches" USING btree ("academy_id","file_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_imr_batch_row" ON "import_rows" USING btree ("import_batch_id","source_row_number");
--> statement-breakpoint
CREATE INDEX "ix_imr_batch" ON "import_rows" USING btree ("import_batch_id");
--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "fk_imr_batch_academy" FOREIGN KEY ("import_batch_id","academy_id") REFERENCES "public"."import_batches"("id","academy_id") ON DELETE no action ON UPDATE no action;
