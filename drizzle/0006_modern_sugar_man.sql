ALTER TABLE "thread_messages" DROP CONSTRAINT "thread_messages_sender_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "thread_messages" ALTER COLUMN "sender_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;