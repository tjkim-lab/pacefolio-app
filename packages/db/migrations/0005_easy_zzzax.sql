CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text,
	"actor_user_id" text,
	"actor_role" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text,
	"request_id" text,
	"detail" text,
	"success" boolean NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text,
	"event_type" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"payload" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_inbox" ADD COLUMN "status" text DEFAULT 'RECEIVED' NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_inbox" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_inbox" ADD COLUMN "next_retry_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "ix_audit_academy_at" ON "audit_logs" USING btree ("academy_id","at");--> statement-breakpoint
CREATE INDEX "ix_audit_target" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "ix_outbox_unpublished" ON "outbox_events" USING btree ("published_at","created_at");--> statement-breakpoint
CREATE INDEX "ix_inbox_reconcile_queue" ON "webhook_inbox" USING btree ("status","next_retry_at");