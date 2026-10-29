<!-- fleet:rules:begin — generated from bitbaum/fleet templates/agent-rules.md; edit it there, not here -->

## Org rules

Read `bitbaum/fleet` `AGENTS.md`, `SHARED.md` and the registers it names before
inventing a host, a name, a page or a shared behaviour. Do not copy their facts
into this file.

- **Packages first.** If a `@bitbaum/*` package (or `bip-kit`, `limitkit`,
  `threadkit`, `ai-forms`) already does it, use it and fix a defect in the
  package, not in this app. Every chat is `@bitbaum/chatkit`, every search box
  `@bitbaum/searchkit`, every chart `@bitbaum/chartkit`, accounts
  `@bitbaum/accountkit`, model calls `@bitbaum/ai-kit`. Review this product's
  `package-plan.json` before building anything.
- **One shape per kind.** Things of the same kind look the same and sit in the
  same place (fleet `AGENTS.md`, "One shape per kind").
- **Finished work ships by itself.** Open a non-draft pull request; the fleet
  auto-merge sweep is the only merge path. Never merge by hand, through the
  merge API, with `--auto` or with an admin bypass, and never force-push a
  shared branch.
- **Nothing made up.** A fact on a page or in a doc needs a source that was
  opened; where there is none, the line is removed or softened.
- **Bitcoin orange is for Bitcoin and top-of-funnel actions only.**
- **No model identifier** in anything pushed to a repository.
- Before you finish, run `node <fleet>/scripts/ci/docs-truth-audit.mjs --dir .`:
  the same check the sweep runs on every pull request.

<!-- fleet:rules:end -->

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know


This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## What this is

Clinical patient management for Vita GmbH, a metabolic psychiatry and systemic
longevity clinic in Zürich; the flagship programme is ADHD diagnosis and
optimisation for high performers. Two parts:

1. **Public marketing site** — multilingual (de default, en, fr), landing at
   `/de/`. Its primary action is the Inflection Edge self-assessment overlay,
   which works **without an account**: a visitor experiences the result before
   any auth wall.
2. **Patient portal and admin** — authenticated, at `/dashboard` (patients) and
   `/admin` (clinicians).

Success: a clinician opens the admin and knows, without calling anyone, who
needs attention today; patients check in daily because the portal shows it
matters.

Served at `https://vita.orangecat.ch` from the Hetzner box behind Caddy
(`vitareba.orangecat.ch` 308s its pages there, `/api/*` excepted).
`vitareba.ch` is the intended domain but has no DNS yet — do not probe it; a
"could not resolve host" there is not an outage. Stack: Next.js 16 (App
Router, `standalone`) · TypeScript strict · CSS Modules · self-hosted
PostgreSQL (`pg`) · Drizzle · NextAuth 5 · Resend · next-intl.

Surf Your Life shares the founder and philosophy, not code: never merge the
codebases or share components.

## Commands

```bash
pnpm dev          # localhost:3000
pnpm build        # production build
pnpm verify       # format check + lint + typecheck + test — the pre-done gate (mirrors CI)
pnpm db:generate  # migration after a schema.ts edit — COMMIT the drizzle/*.sql
pnpm db:push      # local dev databases only, never prod
pnpm db:studio    # Drizzle Studio
```

CI (`.github/workflows/ci.yml`) runs the same gates plus `build`. A push to
`main` triggers `.github/workflows/deploy.yml` (loki's reusable
`selfhost-deploy.yml`): it waits for CI, builds, rsyncs the release, swaps a
symlink, restarts the service and health-checks with auto-rollback. Confirm:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://vita.orangecat.ch/de
curl -sS https://vita.orangecat.ch/api/health   # {"ok":true,"schemaCheck":"passed"}
```

## Database

- `lib/db/schema.ts` is the SSOT for every table and relation; `lib/db/index.ts`
  is a lazy Drizzle singleton on a `pg` Pool.
- Migrations are versioned and auto-applied: the deploy's schema step (loki
  `scripts/hetzner/apply-schema.sh`) applies pending `drizzle/*.sql` on every
  deploy, additive-only and transactional; a destructive diff aborts the deploy
  for a human.
- **A new table is owned by `postgres`, not the app's role.** Prod carries
  `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,
  INSERT, UPDATE, DELETE ON TABLES TO vitareba`, and `/api/health` asserts the
  property (`lib/db/schema-usable.ts`). CI cannot see this — its test user owns
  everything — and two features once shipped broken on "permission denied".
- **One practice per deployment.** A second clinic is another deployment with
  its own database, not an `org_id` column: row-level tenancy would make every
  `WHERE` load-bearing for confidentiality, which
  `app/api/user-isolation.test.ts` (patient isolation) does not guard. The
  `organizations` row is seeded from `COMPANY` (`lib/config/company.ts`),
  which stays the source because the manifest, OG image and sitemap render at
  build time with no database; `lib/domain/organization.test.ts` fails if they
  drift. Read the practice through `getOrganization()`
  (`lib/domain/organization.ts`) on any surface that must vary per clinic;
  convert existing `COMPANY.x` reads one surface at a time.

## Routing (`proxy.ts`)

`PUBLIC_API_PREFIXES` (auth, registration, webhooks, cron, health) pass
through and authenticate themselves. The portal prefixes — derived from
`PORTAL_ROUTES` in `lib/config/routes.ts`, plus `/admin` and the private API —
are session-gated with no locale routing: a signed-out API call gets a JSON
401, a page goes to `/login?returnTo=…`, and a non-admin at `/admin` goes to
`/dashboard`. Admins are not pushed out of the patient portal (dual-role
clinicians use both). Locale-prefixed portal paths redirect to the canonical
one; everything else is next-intl marketing, with auth pages localized under
`app/[locale]/(auth)/`. **A new portal route is added to
`PORTAL_ROUTES`** — never to `proxy.ts` — or signed-out users get a 404.

## Where things live

| What | Where |
| --- | --- |
| Design tokens | `app/globals.css` `:root` |
| Company name, email, address, `PORTAL_URL` | `lib/config/company.ts` |
| Programme and phase labels | `lib/config/programmes.ts` |
| Signal thresholds, labels | `lib/config/admin.ts` |
| Assessment questions, dimensions, tiers, scoring | `lib/assessment/data.ts` |
| Availability and slot rules per clinician | `lib/config/scheduling.ts` |
| Regulatory blocks (laws, attribution) | `lib/config/regulation.ts` |
| Portal route paths, `documentFileUrl` | `lib/config/routes.ts` |
| Email templates | `lib/email/templates.ts` |
| Who may read a thread | `thread_participants` (threadkit) — never a role check or `threads.patient_id` |
| Unread state | `thread_participants.last_read_at` |

Adding a team member, changing the company email or adding a programme phase is
one file each; more means the architecture is wrong.

## Patient signal

`computePatientSignal()` in `lib/domain/signals.ts` is pure and tested; a change
updates `lib/domain/signals.test.ts`. Signals are `new` (inside
`NEW_PATIENT_GRACE_DAYS`), `critical` (no check-in for
`NO_CHECKIN_CRITICAL_DAYS`, consecutive declining wellness, or an assessment
drop over `SCORE_DROP_CRITICAL`), `attention` (e.g. no assessment, or no
booking) and `active`; thresholds are in `lib/config/admin.ts`. Used by
`/admin/patients`, `/admin/reports` and `/api/cron/signals`, which alerts on a
first transition to `critical`.

Clinical goal progress is `((current - baseline) / (target - baseline)) * 100`,
never `current / target`. `cron/signals` updates `current` from check-in
averages or assessment scores when a goal has a `metric`.

The assessment is five dimensions of six questions answered 1–5; a dimension
scores `(sum / maxPossible) * 100` and the overall score is their mean. Change
questions or interpretations only in `lib/assessment/data.ts`.

## Roles and AI

- `users.role` (patient/admin) is access; `users.isClinician` marks actual
  doctors. A clinician can be another clinician's patient (`care_team`).
- The AI provider (`lib/ai/`) is OpenAI-compatible (`AI_BASE_URL`, `AI_API_KEY`,
  `AI_MODEL`) and must be EU/CH-hosted under a DPA. AI routes answer **HTTP 451**
  with a `blockId` into `lib/config/regulation.ts` when gated — no provider, or
  no explicit consent (`profiles.aiConsentAt`). The Diagnosis Assistant is
  permanently blocked (MDR/AI Act) and the UI says so.

## Email and documents

- Resend; `RESEND_FROM` must be a domain verified in Resend.
  `onboarding@resend.dev` delivers only to the account owner, so
  `isEmailConfigured()` treats it as unconfigured in production.
  Sequences queue in `emailQueue` and are sent by `cron/emails`; password
  reset and message notifications send immediately.
- Documents live on local disk under `UPLOADS_DIR` (`lib/storage.ts`);
  `documents.fileUrl` is a storage key, not a URL. Nothing serves the uploads
  directory publicly: link with `documentFileUrl(doc.id)`, served by the
  session-checked `GET /api/documents/[id]/file`, which answers 404 (never 403)
  for someone else's document. `lib/storage-discipline.test.ts` enforces it.

## Cron

Every `/api/cron/*` route needs `Authorization: Bearer CRON_SECRET` and is
called by a systemd timer on the box. Times are Zürich wall-clock
(`CLINIC_TIMEZONE`; the timer units pin `Europe/Zurich`).

| Route | Schedule | Purpose |
| --- | --- | --- |
| `cron/signals` | daily 02:00 | compute signals, email admin on new criticals |
| `cron/orphaned-files` | daily 03:00 | delete stored files no document row points at |
| `cron/checkin-reminder` | daily 07:00 | remind patients to check in |
| `cron/emails` | daily 08:00 | process the email queue |
| `cron/checkin-dip-alert` | daily 09:00 | alert admin on wellness dips |
| `cron/weekly-digest` | Sunday 08:00 | weekly summary to patients |
| `cron/calendar-sync` | every 15 min | re-read clinicians' subscribed calendars so commitments block slots |


## Design System

**Tailwind version:** v4. No `tailwind.config.*` file exists — Tailwind is imported via `@import "tailwindcss"` in `app/globals.css`. There is no `@theme` block. All design tokens are `:root` CSS custom properties in `globals.css`. Do not create a `tailwind.config.*` file. Components style themselves with co-located CSS Modules plus the semantic utility classes in `globals.css` — **no Tailwind utility class is used anywhere in this codebase**, and none should be: with no `@theme` block, Tailwind's default palette is what `text-teal-500` would resolve to (`#14b8a6`, not Vita's `--teal` `#2a7a8a`), and no test catches that. Never use arbitrary values like `bg-[#hex]`.

**JS token file:** `lib/config/theme.ts` exports named constants (`COLOR_INK`, `COLOR_TEAL`, etc.) with hex values mirroring `globals.css`. Use only in JS rendering contexts that cannot read CSS vars (Satori OG images, PWA manifest). Values must stay in sync with `globals.css` manually — it is NOT auto-derived. Do NOT use these constants in JSX classNames.

### CSS Custom Properties (`app/globals.css` `:root`)

**Base palette:**
```
--ink:        #1a1a22    Primary text, dark backgrounds
--ink2:       #3a3a4a    Secondary dark text
--muted:      #71727c    Nav links, captions, metadata (WCAG AA on white)
--faint:      #c4c0b8    Decorative lines, faint text
--teal:       #2a7a8a    Primary accent: CTAs, links, active states
--teal-dark:  #1e6672    Teal hover state
--gold:       #b8960a    Secondary accent: highlights, decorative
--off:        #f8f7f4    Off-white section backgrounds
--light:      #f1ede7    Light section backgrounds
--border:     #e5e0d8    Borders, dividers
--warn:       #d4820a    Warning states
--danger:     #e05a5a    Low scores, errors
--purple:     #6366f1    Sleep metric in check-in trend chart
--white:      #ffffff    White
--footer-bg:  #111118    Footer background
```

**Layout:**
```
--section-pad-y: 6rem
--section-pad-x: 3rem
```

**White opacity scale** (for dark/ink-background sections):
```
--white-3 through --white-97   (rgba(255,255,255, N%) scale)
Available steps: 3, 5, 6, 7, 8, 10, 12, 15, 18, 20, 25, 30, 35, 40, 50, 55, 58, 60, 62, 75, 80, 90, 97
```

**Color opacity scales** (computed via `color-mix(in srgb, var(--x) N%, transparent)`):
```
Teal:   --teal-6, --teal-8, --teal-10, --teal-12, --teal-15, --teal-18, --teal-20, --teal-25, --teal-30, --teal-50, --teal-60, --teal-70
Gold:   --gold-6, --gold-12, --gold-20, --gold-30, --gold-70
Danger: --danger-10
Warn:   --warn-8, --warn-10
Muted:  --muted-8, --muted-10, --muted-12, --muted-18
```

**Shadow scale:**
```
--shadow-sm: 0 4px 16px rgba(0,0,0,0.10)
--shadow-md: 0 8px 32px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)
--shadow-lg: 0 8px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)
```

**Border radius scale:**
```
--radius-2xs:  2px
--radius-xs:   0.2rem
--radius-sm:   0.25rem
--radius-md:   0.4rem
--radius-lg:   0.5rem
--radius-xl:   0.875rem
--radius-2xl:  1rem
--radius-full: 50%
--radius-pill: 2rem
```

**Token discipline is CI-enforced** (`lib/design-discipline.test.ts`): raw hex/rgb colors, literal `border-radius` values, and literal transition durations in `*.module.css` fail the test suite — use the token vars above. `style={{}}` in TSX is allowed only for data-driven values (bar widths, config-sourced chart colors) in the test's allowlist.

**Transition timing:**
```
--transition-fast:   0.15s
--transition-normal: 0.3s
--transition-slow:   0.4s
```

**Z-index scale:**
```
--z-nav:           100
--z-overlay:       200
--z-overlay-pb:    201
--z-overlay-close: 202
```

### Typography

| Use | Font | Weight | Class |
|-----|------|--------|-------|
| Section titles | Cormorant Garamond (`--font-cormorant`) | 300 | `.sec-title` — use `<em>` for teal italics |
| Eyebrow labels | DM Sans (`--font-dm-sans`) | 400 | `.eyebrow` — uppercase, tracked |
| Body text | DM Sans | 300 | default (html font-size: 112% = ~17.9px effective) |
| Buttons | DM Sans | 400 | letter-spacing: 0.08em, uppercase |

**Rule:** Cormorant = emotional weight (headings, prices, quotes). DM Sans = clarity (labels, body, buttons).

### Utility CSS Classes (defined in `globals.css` — use these, not arbitrary Tailwind values)

**Layout:**
- `.section-inner` — max-width 1100px, centered
- `.hr-rule` — 1px `--border` divider with 3rem margins
- `.hr-dark` — 1px `--white-5` divider (for dark sections)

**Typography:**
- `.eyebrow` — small uppercase tracked label in `--teal`
- `.eyebrow-gold` — same but in `--gold-70`
- `.sec-title` — large Cormorant serif heading (2.4rem / weight 300)
- `.sec-title-light` — white variant for dark-background sections
- `.sec-title-center` — centered variant
- `.sec-sub` — body subtitle text (`--muted`, max-width 34rem)
- `.section-header` — centered section header wrapper

**Buttons:**
- `.btn-dark` — dark filled CTA (`--ink` bg, white text, uppercase, tracked)
- `.btn-outline` — outlined CTA (transparent, `--ink` border, inverts on hover)

**Tags:**
- `.tags` — flex wrap container for tag pills
- `.tag` — small uppercase teal tag (`--teal-6` bg, `--teal` text)

**Score/state utilities** (use `className=` instead of `style={{ color }}`):
- `.score-good` / `.score-warn` / `.score-bad` — colored score text
- `.pct-good` / `.pct-warn` / `.pct-bad` — profile completeness colors
- `.booking-status-pending` / `.booking-status-confirmed` / `.booking-status-attended` / `.booking-status-cancelled` — badge combos

**Accessibility:**
- `.sr-only` — visually hidden, screen-reader accessible

Shared component classes live in `app/shared.module.css` (`composes:` from portal and admin).
`lib/design-discipline.test.ts` fails CI on raw hex, untokenised radii and transition
durations, stray `style={{}}`, and any `var(--x)` that `globals.css` does not define;
`lib/css-order.test.ts` fails when an `@media` block precedes a base rule it overrides.

**Open:** CSS Modules diverge from the fleet's blessed Tailwind (`fleet/STACK.md`), and the
exceptions column has no entry for it. Resolve it by converting or by recording the exception;
until then, do not convert files opportunistically in unrelated PRs.

Portal-specific CSS lives in `app/(portal)/portal.module.css`.
Admin-specific CSS lives in `app/(admin)/admin.module.css`.
Marketing section CSS: co-located `components/sections/*.module.css`.

### Responsive Strategy

Mobile-first. Base = mobile. `@media (min-width: 768px)` = desktop.
Use `@media (max-width: 767px)` to hide desktop-only elements. Never `max-width: 768px` (off-by-one at exactly 768px).

### SSOT Rule

All design tokens live in `app/globals.css` only. There is no `tailwind.config.*` (Tailwind v4); if one ever existed it MUST reference CSS vars (`'var(--name)'`), never literal values. Components MUST use co-located CSS Modules and the semantic classes from `globals.css`, never Tailwind utilities or arbitrary values like `bg-[#hex]`.

**Violations to fix when touching UI:**
- `bg-[#hex]` / `text-[#hex]` in className → CSS var + semantic class
- `style={{ color: '#hex' }}` → CSS var + className
- Literal hex in tailwind.config → `'var(--name)'` (no config file here — red flag if one appears)
- Same token defined in 2+ files → consolidate to globals.css
- Hex values in `lib/config/theme.ts` diverging from `globals.css` → sync them

**Audit:** `grep -r '\[#' app/ components/ lib/` (there is no `src/` — code lives at the repo root) — every result is a violation.

## Codex CLI Baseline

This repo should assume **OpenAI Codex `rust-v0.128.0` or newer** (released **April 30, 2026**).

- Upgrade Codex with `codex update`.
- Do not rely on `--full-auto`. As of `0.128.0`, that flag is deprecated; use explicit permission profiles and trust flows instead.
- Prefer explicit sandbox/approval settings over legacy shorthand when documenting or automating agent runs for this repo.
- If you use the TUI, `0.128.0` adds persisted `/goal` workflows plus `/statusline` and `/title` editing; treat those as optional operator features, not app behavior.
