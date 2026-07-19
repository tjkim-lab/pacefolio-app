CREATE TABLE "academy_invite_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"label" text,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academy_invite_codes" ADD CONSTRAINT "academy_invite_codes_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_academy_invite_code_hash" ON "academy_invite_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "ix_academy_invite_academy" ON "academy_invite_codes" USING btree ("academy_id");