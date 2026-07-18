CREATE TABLE "subscription_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"event_type" text NOT NULL,
	"from_plan" text,
	"to_plan" text,
	"from_price_krw" integer,
	"to_price_krw" integer,
	"from_status" text,
	"to_status" text,
	"actor_user_id" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription_ledger" ADD CONSTRAINT "subscription_ledger_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_ledger" ADD CONSTRAINT "subscription_ledger_subscription_id_academy_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."academy_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_ledger" ADD CONSTRAINT "subscription_ledger_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_subledger_academy_created" ON "subscription_ledger" USING btree ("academy_id","created_at");