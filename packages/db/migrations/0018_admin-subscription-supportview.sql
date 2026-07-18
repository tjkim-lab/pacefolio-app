CREATE TYPE "public"."subscription_plan" AS ENUM('BASIC', 'PRO');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED');--> statement-breakpoint
CREATE TABLE "academy_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"plan" "subscription_plan" NOT NULL,
	"status" "subscription_status" NOT NULL,
	"price_krw_monthly" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ck_subscription_price" CHECK ("academy_subscriptions"."price_krw_monthly" > 0 AND "academy_subscriptions"."price_krw_monthly" <= 10000000)
);
--> statement-breakpoint
CREATE TABLE "support_views" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"admin_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"allowed_resources" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_support_view_window" CHECK ("support_views"."expires_at" > "support_views"."issued_at")
);
--> statement-breakpoint
ALTER TABLE "academies" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "academy_subscriptions" ADD CONSTRAINT "academy_subscriptions_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_views" ADD CONSTRAINT "support_views_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_views" ADD CONSTRAINT "support_views_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_subscription_academy" ON "academy_subscriptions" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "ix_support_views_academy" ON "support_views" USING btree ("academy_id");