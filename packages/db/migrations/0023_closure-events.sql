CREATE TABLE "closure_events" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"scope" text NOT NULL,
	"class_id" text,
	"date_start" date NOT NULL,
	"date_end" date NOT NULL,
	"closure_type" text NOT NULL,
	"reason" text NOT NULL,
	"deduct_sessions" boolean NOT NULL,
	"created_by_user_id" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_closure_range" CHECK ("closure_events"."date_end" >= "closure_events"."date_start"),
	CONSTRAINT "ck_closure_scope" CHECK ("closure_events"."scope" IN ('ACADEMY','CLASS'))
);
--> statement-breakpoint
ALTER TABLE "class_sessions" ADD COLUMN "closure_id" text;--> statement-breakpoint
ALTER TABLE "closure_events" ADD CONSTRAINT "closure_events_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closure_events" ADD CONSTRAINT "closure_events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closure_events" ADD CONSTRAINT "fk_closure_class_academy" FOREIGN KEY ("class_id","academy_id") REFERENCES "public"."classes"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_closure_academy_date" ON "closure_events" USING btree ("academy_id","date_start");