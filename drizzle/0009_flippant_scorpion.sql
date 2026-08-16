CREATE TABLE "calendar_busy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_id" uuid NOT NULL,
	"clinician_id" uuid NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinician_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinician_id" uuid NOT NULL,
	"label" text NOT NULL,
	"ics_url" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_fetched_at" timestamp,
	"last_error" text,
	"last_event_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_busy" ADD CONSTRAINT "calendar_busy_calendar_id_clinician_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."clinician_calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_busy" ADD CONSTRAINT "calendar_busy_clinician_id_users_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinician_calendars" ADD CONSTRAINT "clinician_calendars_clinician_id_users_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_busy_clinician_idx" ON "calendar_busy" USING btree ("clinician_id","starts_at");