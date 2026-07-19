CREATE TABLE "academy_feature_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"feature" text NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone,
	"granted_by_user_id" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academy_feature_grants" ADD CONSTRAINT "academy_feature_grants_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_feature_grants" ADD CONSTRAINT "academy_feature_grants_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_feature_grants" ADD CONSTRAINT "academy_feature_grants_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_feature_grant_academy" ON "academy_feature_grants" USING btree ("academy_id","feature");