CREATE TYPE "public"."biological_sex" AS ENUM('female', 'male', 'unspecified');--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"kind" varchar(50) NOT NULL,
	"value" numeric(12, 4) NOT NULL,
	"measured_at" timestamp NOT NULL,
	"source" varchar(20) NOT NULL,
	"recorded_by" uuid,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "biological_sex" "biological_sex";--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "measurements_patient_kind_idx" ON "measurements" USING btree ("patient_id","kind","measured_at");