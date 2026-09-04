# Vita

Clinical patient management platform for **Vita GmbH** — a metabolic psychiatry and systemic longevity clinic in Zürich. The platform has two parts:

1. **Public marketing site** — multilingual (de/en/fr), with the *Inflection Edge* self-assessment overlay as the primary CTA.
2. **Patient portal + admin panel** — authenticated and database-backed: patients at `/dashboard`, the clinician at `/admin`.

## Stack

- **Next.js 16** (App Router, `standalone` output) · TypeScript (strict)
- **Tailwind v4** (tokens in `app/globals.css`, no `tailwind.config.*`)
- **PostgreSQL** (self-hosted) via **Drizzle ORM** (`pg` driver)
- **NextAuth 5** (auth) · **Resend** (transactional email)
- **next-intl** (i18n)

## Hosting

Self-hosted on the Hetzner box ("bitbaum") behind Caddy, served at **https://vitareba.orangecat.ch** (vitareba.ch is the intended future domain; it has no DNS yet — see lib/config/company.ts). There is no managed platform — a push to `main` triggers `.github/workflows/deploy.yml`, which calls the fleet's reusable `selfhost-deploy.yml` (in `bitbaum/fleetcrown`): it waits for this commit's CI to go green, builds (`standalone` output), rsyncs the release to the box, swaps a symlink atomically, restarts the systemd service, and health-checks with auto-rollback. Uploaded documents are stored on local disk and served only through the authenticated route `GET /api/documents/[id]/file` — nothing serves the uploads directory publicly. Scheduled `/api/cron/*` jobs run from systemd timers / cron on the box (schedules defined in `CLAUDE.md` → Cron Jobs).

## Getting started

```bash
pnpm install
cp env.local.example .env.local   # fill in DATABASE_URL, auth + Resend secrets
pnpm db:push                      # apply the Drizzle schema to your Postgres
pnpm dev                          # http://localhost:3000
```

## Scripts

```bash
pnpm dev          # dev server
pnpm build        # production build (standalone)
pnpm start        # serve the production build
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run
pnpm db:push      # push schema changes to Postgres
pnpm db:generate  # generate migration files
pnpm db:studio    # Drizzle Studio
```

See [`CLAUDE.md`](./CLAUDE.md) for architecture, conventions, and the full design-system rules.
