@~/.claude/CLAUDE.md
@AGENTS.md

# VitaReBa — Project Standards

**What this is:** Clinical patient management platform for VitaReBa GmbH — a metabolic psychiatry & systemic longevity clinic in Zürich, founded by Manuel (also founder of Surf Your Life). Flagship programme is ADHD diagnosis and optimisation for high performers.

The platform has two parts:
1. **Public marketing site** — multilingual (de/en/fr/it), lands at `/de/`, primary CTA is the Inflection Edge self-assessment overlay
2. **Patient portal + admin panel** — authenticated, database-backed, at `/dashboard` (patients) and `/admin` (Manuel)

**Stack:** Next.js 16 (App Router, `standalone` output) · TypeScript strict · Tailwind v4 · self-hosted PostgreSQL (`pg` driver, database `vitareba` on Hetzner bitbaum) · Drizzle ORM · NextAuth 5 · Resend email · self-hosted on the Hetzner box ("bitbaum") behind Caddy, served at `vitareba.orangecat.ch` (`vitareba.ch` is the intended
public domain but is not pointed yet — do not probe it). Neon was decommissioned 2026-06-12. A laptop `.env.local` naming `neon.tech` is leftover garbage, not production. Scheduled jobs run via systemd timers / cron on the box; documents are stored on local disk and served only through an authenticated route.

---

## Mission

**Who:** Manuel Schabus, metabolic psychiatry clinician at VitaReBa Zürich, and his high-performer ADHD patients.
**Problem:** Patients need frictionless daily data collection so their biology is visible; Manuel needs instant clarity on which patients need attention — and the marketing site must let curious visitors experience the Inflection Edge *before* hitting an auth wall.
**Success:** Manuel opens the admin and knows — without calling anyone — exactly who needs attention today. Patients check in daily because the portal shows them it matters. Visitors complete the Inflection Edge without being asked to register first, then convert because the results made them want to.

---

## Architecture

```
proxy.ts                  → Auth guard (portal/admin) + locale routing (marketing) [Next.js middleware]

app/
  (auth)/                 → Non-localized auth pages (/login, /register, etc.) — portal users
  [locale]/(auth)/        → Localized auth pages (/de/login, etc.) — marketing site visitors
  (portal)/               → Patient-facing authenticated area
    dashboard/            → Patient home: assessment results, goals, check-in prompt, booking
    assessment/           → Take the Inflection Edge questionnaire
    assessments/          → History + trend chart
    checkin/              → Daily wellness check-in (sleep, energy, mood, focus, stress)
    bookings/             → Consultation booking (per-clinician slot picker + manual request)
    regulation/           → Regulatory ledger: features switched off by law, with attribution
    messages/[threadId]/  → Secure async messaging with Manuel
    profile/              → Patient profile management
    layout.tsx            → Portal shell with PortalNav
  (admin)/admin/          → Manuel-facing authenticated area
    patients/             → Patient list with signal badges
    patients/[id]/        → Full patient view (tabs: profile, assessments, goals, notes, docs)
    bookings/             → All bookings across patients
    messages/             → All message threads
    reports/              → Live metrics: signal distribution, assessment tiers, programmes
    layout.tsx            → Admin shell
  api/
    auth/                 → NextAuth handler + password reset
    account/              → Registration
    profile/              → Patient profile CRUD
    assessment/           → Save/fetch Inflection Edge results
    checkin/              → Daily check-in upsert/history
    bookings/             → Booking CRUD
    messages/[threadId]/  → Thread messages + email notification on send
    goals/                → Patient clinical goals (read)
    ai/insight            → AI trend reflection for the patient (451 when legally gated)
    account/export        → GDPR Art. 15/20 data export (self-service JSON)
    account/deletion-request → GDPR Art. 17 erasure request (opens tracked thread)
    documents/            → Document list + upload (local-disk storage, lib/storage.ts)
    admin/patients/       → Patient list + detail (admin only)
    admin/patients/[id]/  → Goals, notes, programme assignment (admin only)
    cron/                 → Scheduled jobs (all require CRON_SECRET bearer)
      checkin-reminder    → Daily 07:00 — remind patients to check in
      checkin-dip-alert   → Daily 09:00 — alert admin on wellness dips
      signals             → Daily 02:00 — compute patient signals, alert on critical
      emails              → Daily 08:00 — process email queue
      weekly-digest       → Sunday 08:00 — weekly summary to patients
  [locale]/               → Localized marketing site (de/en/fr/it)
  page.tsx                → Root redirect → /de/
  layout.tsx              → Root layout: fonts, metadata, SessionProvider
  manifest.ts             → PWA manifest (start_url: /dashboard)

components/
  sections/               → Public marketing page sections (14 files, each with .module.css)
  Assessment/             → Inflection Edge overlay (public, no auth required)
  portal/                 → Portal UI: PortalNav, UserDropdown, trend charts
  admin/                  → Admin UI: patient cards, forms, inline compose

lib/
  db/
    schema.ts             → SSOT: all Drizzle table definitions + relations
    index.ts              → Lazy Drizzle singleton (node-postgres `pg` Pool)
  auth/
    index.ts              → NextAuth config (Credentials + Google, DrizzleAdapter)
    guards.ts             → requireSession() / requireAdmin() for API routes
    edge.ts               → Edge-compatible auth for middleware
    types.ts              → Custom session/token types
  config/                 → All constants and labels (SSOT — never hardcode elsewhere)
    company.ts            → Name, email, address, PORTAL_URL, getAdminEmails()
    programmes.ts         → PROGRAMME_CONFIG, PHASE_CONFIG, enum values
    admin.ts              → Signal thresholds, signal labels/colors
    portal.ts             → CHECKIN_SCALE, CHECKIN_HISTORY_DAYS, profile completeness fields
    booking-status.ts     → Booking status labels and badge colors
    email-sequences.ts    → Email send-delay constants
    auth.ts               → BCRYPT_SALT_ROUNDS, token expiry
  domain/                 → Business logic (no HTTP, no rendering)
    signals.ts            → computePatientSignal() — pure, injectable, tested
    profile.ts            → computeProfileCompleteness()
    auth.ts               → Login/register Zod schemas
    email-queue.ts        → enqueueWelcomeSequence(), enqueueAssessmentSequence()
  email/
    index.ts              → sendEmail() via Resend
    templates.ts          → All HTML email template generators
  assessment/
    data.ts               → SSOT: QUESTIONS, DIMENSIONS, INTERPRETATIONS, VERDICT_TIERS, scoreColor()
  utils/
    format.ts             → formatDateShort(), formatDateLong()
  i18n/
    navigation.ts         → next-intl locale navigation helpers

i18n/routing.ts           → Locales: de (default), en, fr, it
messages/                 → Translation files: de.json, en.json, fr.json, it.json
```

---

## Database Schema (Drizzle + self-hosted PostgreSQL)

Tables: `users`, `accounts`, `sessions`, `verificationTokens` (NextAuth), `profiles`, `dailyCheckins` (unique on user_id+date), `assessmentResults`, `bookings`, `documents`, `threads`, `threadMessages`, `threadParticipants`, `patientNotes`, `programmeAssignments`, `clinicalGoals`, `emailQueue`

**Migrations (versioned, auto-applied):** after editing `lib/db/schema.ts`, run
`pnpm db:generate` and COMMIT the new `drizzle/*.sql` — the deploy schema step
(fleetcrown `scripts/hetzner/apply-schema.sh`) applies pending migrations to
prod automatically on every deploy (additive-only, transactional; destructive
diffs abort the deploy for a human). `pnpm db:push` is for local dev DBs only —
never push schema to prod by hand.

**A new table is owned by `postgres`, not by the app.** Migrations are applied
on the box by the superuser, so the app's own role is granted nothing on a table
it does not own: the table exists, the connection works, and every query against
it fails with "permission denied". CI cannot see this — CI has its own database
where the test user owns everything. Two features have shipped broken this way.
Prod now carries `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vitareba`, so new tables are
granted automatically, and `/api/health` asserts the property directly
(`lib/db/schema-usable.ts`) so a deploy that loses it goes red instead of quiet.

---

## SSOT — Where Each Thing Lives

| What | Where | Never in |
|------|-------|----------|
| Design tokens (colors, spacing) | `app/globals.css` `:root` | Hardcoded hex anywhere |
| Shared utility CSS | `app/globals.css` | Duplicated across modules |
| Component-specific CSS | Co-located `.module.css` | `globals.css` or inline `style={{}}` |
| Company info (name, email, PORTAL_URL) | `lib/config/company.ts` | Hardcoded in components |
| Programme/phase labels | `lib/config/programmes.ts` | Any component |
| Signal thresholds + labels | `lib/config/admin.ts` | Any component |
| Assessment questions, scoring | `lib/assessment/data.ts` | Any component |
| Availability / slot rules (per clinician email) | `lib/config/scheduling.ts` | Any component or route |
| Regulatory blocks (laws, attribution, beneficiaries) | `lib/config/regulation.ts` | Any component or route |
| DB schema | `lib/db/schema.ts` | Separate type files |
| Who may read a thread | `thread_participants` (via `threadkit`) | A role check, or `threads.patient_id` |
| Unread state | `thread_participants.last_read_at` | A flag on the message row |
| Portal route paths | `lib/config/routes.ts` PORTAL_ROUTES | Hardcoded strings |
| Auth pages routing | `proxy.ts` (derives from PORTAL_ROUTES) | Scattered guards |

**The 2-file test:** Adding a team member = 1 file. Changing company email = 1 file. Adding a programme phase = 1 file. More than that → architecture is wrong.

---

## Middleware Routing Model

`proxy.ts` at the project root handles two distinct routing concerns (Next.js middleware):

```
/dashboard, /assessment, /assessments, /bookings, /checkin,
/messages, /profile, /admin, /api
  → PORTAL mode: auth-guard only, no locale routing
  → Unauthenticated → redirect to /login?returnTo=...
  → Non-admin hitting /admin → redirect to /dashboard

Everything else (/, /de/*, /en/*, etc.)
  → MARKETING mode: next-intl locale routing
  → Logged-in users on /de/login, /de/register, etc. → redirect to /dashboard or /admin/patients
```

**Adding a new portal route:** Add it to `PORTAL_ROUTES` in `lib/config/routes.ts` — the middleware derives `PORTAL_PREFIXES` from this automatically. No need to touch `proxy.ts`.

---

## Patient Signal System

`lib/domain/signals.ts` → `computePatientSignal()` — pure function, testable.

| Signal | Conditions |
|--------|-----------|
| `new` | Registered < `NEW_PATIENT_GRACE_DAYS` days ago |
| `critical` | No check-in ≥ 5 days, OR 3 consecutive declining wellness days, OR assessment dropped > 10 pts |
| `attention` | No assessment yet, OR has assessment but no booking |
| `active` | Everything normal |

Used in: `/admin/patients` list, `/api/cron/signals` (alerts admin on first `critical` transition), `/admin/reports`.

---

## Roles & AI

- `users.role` (patient/admin) is ACCESS level; `users.isClinician` marks actual
  doctors. Dual roles are by design: a clinician can be another clinician's
  patient (`care_team` table, symmetric pairs allowed). Patient lists =
  role=patient OR anyone treated in care_team.
- AI provider (`lib/ai/`): OpenAI-compatible, env `AI_BASE_URL` + `AI_API_KEY`
  + `AI_MODEL` — must be an EU/CH-hosted provider under a DPA. AI routes return
  **HTTP 451** with a `blockId` into `lib/config/regulation.ts` when gated
  (no provider, or the patient hasn't given explicit consent —
  `profiles.aiConsentAt`). The Diagnosis Assistant is permanently blocked
  (MDR/AI Act) and says so in the UI.

## Cron Jobs

All routes under `/api/cron/*` require `Authorization: Bearer CRON_SECRET`. On the self-hosted box these are triggered by systemd timers / cron entries that curl each route with the bearer token. The table below is the single source of truth for the schedules — the box's timers mirror it:

**All times are Zürich wall-clock** (`CLINIC_TIMEZONE`), not UTC — the box's
timer units pin `Europe/Zurich` via a drop-in. They were plain UTC until
2026-08-15, inherited from the old Vercel cron schedule, which delivered the
"07:00" check-in reminder at 09:00 local.

| Route | Schedule | Purpose |
|-------|----------|---------|
| `cron/emails` | Daily 08:00 | Process email queue (welcome, assessment, engagement sequences) |
| `cron/signals` | Daily 02:00 | Compute signals, email admin on new criticals |
| `cron/checkin-reminder` | Daily 07:00 | Remind patients to check in (skips opted-out + already-done) |
| `cron/checkin-dip-alert` | Daily 09:00 | Alert admin on consecutive wellness dips |
| `cron/weekly-digest` | Sunday 08:00 | Weekly summary email to patients |
| `cron/orphaned-files` | Daily 03:00 | Delete stored files no document row points at (erasure completion) |
| `cron/calendar-sync` | Every 15 min | Re-read each clinician's subscribed calendar so their real commitments block slots |

---

## Clinical Goals

Goals are set by admin per patient (`/api/admin/patients/[id]/goals`). Each goal has:
- `title` — e.g. "Improve sustained focus"
- `metric` — optional key linking to data source: `"focus"`, `"mood"`, `"overallScore"`, etc.
- `baseline`, `target`, `current` — 0–100 integers
- Progress: `((current - baseline) / (target - baseline)) * 100` — NOT `current/target`

`cron/signals` auto-updates `current` from latest check-in averages or assessment scores when `metric` is set.

---

## Email System

- **Provider:** Resend (`lib/email/index.ts`)
- **From address:** `RESEND_FROM` env var. It MUST use a domain that is
  **verified** in Resend. `onboarding@resend.dev` is a sandbox sender that
  delivers only to the Resend account owner — in production it silently
  strands every patient (no welcome mail, no reset link, no notifications), so
  `isEmailConfigured()` treats it as unconfigured when `NODE_ENV=production`.
  Prod currently sends from the verified `fleetcrown.orangecat.ch` with a
  "VitaReBa" display name; move to a `vitareba.ch` sender once that domain is
  delegated and verified.
- **Templates:** `lib/email/templates.ts` — all emails defined here, imported by cron routes and API routes
- **Queue:** `emailQueue` table — sequences scheduled on assessment/registration, processed by `cron/emails`
- **Immediate sends:** password reset, new message notification (fire-and-forget in API routes)

---

## Document Storage

Documents are stored on the box's local disk via `lib/storage.ts` (`putLocal`/`readLocal`/`delLocal`), under `UPLOADS_DIR`. The `documents.fileUrl` column stores the root-relative key (`/uploads/<key>`). Upload via `/api/documents` (POST with FormData); `DocumentAddForm` handles the upload client-side.

**Nothing serves `UPLOADS_DIR` to the public.** Patient documents are read back only through `GET /api/documents/[id]/file`, which requires a session and returns 404 (never 403) for a document that is not yours. Always link with `documentFileUrl(doc.id)` from `lib/config/routes.ts` — never `doc.fileUrl`, which is a storage location, not an authorised URL. `lib/storage-discipline.test.ts` fails CI if a component links it directly.

---

## Assessment — How It Works

The Inflection Edge runs both as a public overlay (marketing site → conversion) and as a logged-in portal page (`/assessment`). Completing the assessment while logged in saves results to the DB.

```
lib/assessment/data.ts
  DIMENSIONS (5)         → Arousal, Divergent, Hyperfocus, Volatility, Environment
  QUESTIONS (30)         → 6 per dimension
  VERDICT_TIERS          → 4 tiers: Deep Friction / Managed Tension / Asymmetric Performance / Optimised
  INTERPRETATIONS        → per-dimension text, 3 tiers each
  scoreColor(score)      → CSS var string for score colouring
```

**Scoring:** Each Q answered 1–5. Per dimension: `(sum / maxPossible) * 100`. Overall: mean of dimension scores.

**To add a question / change interpretations:** Edit only `lib/assessment/data.ts`.

---

## Connection to Surf Your Life

VitaReBa and Surf Your Life are separate brands — same founder, different platforms.

| | VitaReBa | Surf Your Life |
|---|---|---|
| Domain | Clinical / medical | Coaching / transformation |
| Audience | ADHD high performers, longevity patients | Burnout recovery, general wellbeing |
| Contact | `manuel@surfyourlife.org` (SSOT: `lib/config/company.ts`) | Same founder |

**Do not** merge codebases. **Do not** share components. They share philosophy, not code.

---

## Commands

```bash
pnpm dev          # local dev server (localhost:3000)
pnpm build        # production build — run before every push
pnpm lint         # eslint
pnpm db:push      # push schema changes to the self-hosted Postgres
pnpm db:generate  # generate migration files
pnpm db:studio    # Drizzle Studio for DB inspection
pnpm verify       # lint + typecheck + test — the pre-done gate (mirrors CI)
```

**Before declaring any change done, run `pnpm verify`.** It runs the same
hermetic gates as CI (lint + typecheck + the full test suite), so green locally
means green on the shared branch — don't hand work back for manual smoke-testing
that `verify` already covers. CI (`.github/workflows/ci.yml`) re-runs the same
gates plus `build` on every push and PR to `main`.

## Deploy Workflow (self-hosted Hetzner box)

Deployment is a pull-and-restart on the box, not a managed platform push. After `git push`, the box pulls the new commit, runs `pnpm build` (Next.js `standalone` output), and the systemd service is restarted. Verify the site is live before reporting done:

```bash
# Confirm the app responds after a deploy/restart.
# Use the host it is actually served on. `vitareba.ch` has no DNS record yet
# (see the sender note under Email), so probing it fails with "could not
# resolve host" — which reads exactly like an outage and is not one.
curl -sS -o /dev/null -w '%{http_code}\n' https://vitareba.orangecat.ch/de
curl -sS https://vitareba.orangecat.ch/api/health   # {"ok":true,"schemaCheck":"passed"}
```

If it fails: check the service logs on the box (`journalctl -u <vitareba-service> -n 100`), fix, `pnpm build`, push again. Full migration/runbook: `fleetcrown/docs/infrastructure/hetzner-migration.md`.

---

## Red Flags

- Color hex directly in component → use `var(--teal)` etc.
- Inline `style={{}}` in a component → move to co-located `.module.css`
- New portal route not added to `PORTAL_ROUTES` in `lib/config/routes.ts` → unauthenticated users get a 404
- Signal threshold hardcoded in a cron route → belongs in `lib/config/admin.ts`
- Email template inline in an API route → belongs in `lib/email/templates.ts`
- `style={{}}` props on portal/admin pages → use portal.module.css / admin.module.css
- Goal progress as `(current/target)*100` → correct formula is `((current-baseline)/(target-baseline))*100`
- `computePatientSignal` logic modified without updating tests in `lib/domain/signals.test.ts`
