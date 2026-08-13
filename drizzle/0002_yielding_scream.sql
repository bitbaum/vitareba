CREATE TABLE "care_team" (
	"clinician_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "care_team_clinician_id_patient_id_pk" PRIMARY KEY("clinician_id","patient_id")
);
--> statement-breakpoint
DROP INDEX "bookings_active_slot_idx";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "clinician_id" uuid;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "ai_consent_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_clinician" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "care_team" ADD CONSTRAINT "care_team_clinician_id_users_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_team" ADD CONSTRAINT "care_team_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_clinician_id_users_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_clinician_slot_idx" ON "bookings" USING btree ("clinician_id","scheduled_at") WHERE "bookings"."status" IN ('pending', 'confirmed') AND "bookings"."scheduled_at" IS NOT NULL;