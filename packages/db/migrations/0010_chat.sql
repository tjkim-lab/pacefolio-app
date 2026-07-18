CREATE TYPE "public"."chat_category" AS ENUM('GENERAL', 'BILLING', 'HEALTH');--> statement-breakpoint
CREATE TYPE "public"."chat_message_kind" AS ENUM('NORMAL_CHAT', 'NOTICE', 'ACK_REQUIRED', 'URGENT_ACK_REQUIRED', 'OPERATIONAL_TASK');--> statement-breakpoint
CREATE TYPE "public"."chat_message_status" AS ENUM('SENT', 'DELIVERED', 'READ', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."chat_room_type" AS ENUM('OWNER_COACH_DM', 'COACH_ALL', 'CLASS_COACHES', 'GUARDIAN_DM', 'CLASS_GUARDIANS', 'ACADEMY_NOTICE');--> statement-breakpoint
CREATE TABLE "chat_message_acks" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"academy_id" text NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"academy_id" text NOT NULL,
	"sender_user_id" text NOT NULL,
	"kind" "chat_message_kind" NOT NULL,
	"category" "chat_category" DEFAULT 'GENERAL' NOT NULL,
	"status" "chat_message_status" NOT NULL,
	"body" text NOT NULL,
	"context_card" text,
	"related_participant_id" text,
	"resolved_note" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ck_chatmsg_health_participant" CHECK ("chat_messages"."category" <> 'HEALTH' OR "chat_messages"."related_participant_id" IS NOT NULL),
	CONSTRAINT "ck_chatmsg_billing_card" CHECK ("chat_messages"."category" <> 'BILLING' OR "chat_messages"."context_card" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "chat_room_members" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"academy_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone,
	"last_read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chat_rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"academy_id" text NOT NULL,
	"type" "chat_room_type" NOT NULL,
	"title" text NOT NULL,
	"dm_key" text,
	"related_participant_id" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_chatack_message_user" ON "chat_message_acks" USING btree ("message_id","user_id");--> statement-breakpoint
CREATE INDEX "ix_chatack_user" ON "chat_message_acks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_chatmsg_room_created" ON "chat_messages" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_chatmsg_id_academy" ON "chat_messages" USING btree ("id","academy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_chatmember_room_user" ON "chat_room_members" USING btree ("room_id","user_id");--> statement-breakpoint
CREATE INDEX "ix_chatmember_user" ON "chat_room_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_chatroom_id_academy" ON "chat_rooms" USING btree ("id","academy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_chatroom_dmkey" ON "chat_rooms" USING btree ("academy_id","dm_key");--> statement-breakpoint
ALTER TABLE "chat_message_acks" ADD CONSTRAINT "chat_message_acks_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_acks" ADD CONSTRAINT "chat_message_acks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_acks" ADD CONSTRAINT "fk_chatack_message_academy" FOREIGN KEY ("message_id","academy_id") REFERENCES "public"."chat_messages"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "fk_chatmsg_room_academy" FOREIGN KEY ("room_id","academy_id") REFERENCES "public"."chat_rooms"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "fk_chatmsg_participant_academy" FOREIGN KEY ("related_participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_members" ADD CONSTRAINT "chat_room_members_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_members" ADD CONSTRAINT "chat_room_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_members" ADD CONSTRAINT "fk_chatmember_room_academy" FOREIGN KEY ("room_id","academy_id") REFERENCES "public"."chat_rooms"("id","academy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "fk_chatroom_participant_academy" FOREIGN KEY ("related_participant_id","academy_id") REFERENCES "public"."participants"("id","academy_id") ON DELETE no action ON UPDATE no action;