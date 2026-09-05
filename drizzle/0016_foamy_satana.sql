CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"short_name" varchar(80) NOT NULL,
	"clinician_fallback" varchar(80) NOT NULL,
	"assistant_name" varchar(80) NOT NULL,
	"partner_brand" varchar(120),
	"email" varchar(255) NOT NULL,
	"phone" varchar(40),
	"address_street" varchar(200),
	"address_zip" varchar(20),
	"address_city" varchar(120),
	"timezone" varchar(64) DEFAULT 'Europe/Zurich' NOT NULL,
	"founding_year" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
-- Seed this deployment's own practice. Values mirror lib/config/company.ts,
-- which stays the source: build-time surfaces (manifest, OG image, sitemap)
-- render with no database reachable, so clinic identity must exist as a
-- literal too. lib/domain/organization.test.ts fails if the two drift.
-- Idempotent: apply-schema.sh replays migrations on every deploy.
INSERT INTO "organizations" (
	"slug", "name", "short_name", "clinician_fallback", "assistant_name",
	"partner_brand", "email", "phone",
	"address_street", "address_zip", "address_city",
	"timezone", "founding_year"
) VALUES (
	'vita', 'Vita GmbH', 'Vita', 'your clinician', 'Vita Assistant',
	'Surf Your Life', 'vitareba@hin.ch', '+41 78 659 86 13',
	'Zollikerstrasse 183', '8008', 'Zürich',
	'Europe/Zurich', 2024
) ON CONFLICT ("slug") DO NOTHING;
