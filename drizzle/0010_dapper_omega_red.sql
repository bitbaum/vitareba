CREATE TYPE "public"."actor_kind" AS ENUM('human', 'ai', 'system');--> statement-breakpoint
CREATE TABLE "thread_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"kind" "actor_kind" DEFAULT 'human' NOT NULL,
	"role" text,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp,
	"visible_from" timestamp DEFAULT now() NOT NULL,
	"can_write" boolean DEFAULT true NOT NULL,
	"last_read_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "thread_messages" ADD COLUMN "author_actor_id" uuid;--> statement-breakpoint
ALTER TABLE "thread_messages" ADD COLUMN "author_kind" "actor_kind" DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE "thread_messages" ADD COLUMN "generated_by_model" text;--> statement-breakpoint
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "thread_participants_thread_actor_idx" ON "thread_participants" USING btree ("thread_id","actor_id");--> statement-breakpoint
-- ─── Backfill ────────────────────────────────────────────────────────────────
-- Every existing message was written by its sender.
UPDATE "thread_messages" SET "author_actor_id" = "sender_id" WHERE "author_actor_id" IS NULL;--> statement-breakpoint

-- Participants must reproduce EXACTLY who could see what before this ran.
-- Until now any admin could read any thread; a migration that quietly narrowed
-- that would lock the clinic out of live patient conversations. So: the patient,
-- the named clinician if there is one, and every current admin. `visible_from`
-- is the thread's creation time so nobody's view shrinks today. Threads created
-- from here on get explicit participants and the default (join time) applies.
INSERT INTO "thread_participants" ("thread_id","actor_id","kind","role","joined_at","visible_from")
SELECT t."id", t."patient_id", 'human', 'patient', t."created_at", t."created_at"
FROM "threads" t
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "thread_participants" ("thread_id","actor_id","kind","role","joined_at","visible_from")
SELECT t."id", t."clinician_id", 'human', 'clinician', t."created_at", t."created_at"
FROM "threads" t
WHERE t."clinician_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "thread_participants" ("thread_id","actor_id","kind","role","joined_at","visible_from")
SELECT t."id", u."id", 'human', 'clinician', t."created_at", t."created_at"
FROM "threads" t
CROSS JOIN "users" u
WHERE u."role" = 'admin'
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Carry over read state. The old model marked a message read when someone who
-- did not write it opened the thread, so the newest such message is where that
-- participant had caught up to. With two participants this is exact; it is the
-- closest honest reading of a flag that never recorded *who* read it.
UPDATE "thread_participants" p
SET "last_read_at" = (
  SELECT MAX(m."created_at")
  FROM "thread_messages" m
  WHERE m."thread_id" = p."thread_id"
    AND m."read_at" IS NOT NULL
    AND m."author_actor_id" IS DISTINCT FROM p."actor_id"
);
