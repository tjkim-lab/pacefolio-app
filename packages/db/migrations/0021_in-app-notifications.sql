CREATE TABLE "in_app_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_ntf_user_created" ON "in_app_notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_ntf_academy" ON "in_app_notifications" USING btree ("academy_id");