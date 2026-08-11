<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Design System

**Tailwind version:** v4. No `tailwind.config.*` file exists — Tailwind is imported via `@import "tailwindcss"` in `app/globals.css`. There is no `@theme` block. All design tokens are `:root` CSS custom properties in `globals.css`. Do not create a `tailwind.config.*` file. Components use semantic CSS utility classes from `globals.css` plus standard Tailwind utilities. Never use arbitrary values like `bg-[#hex]`.

**JS token file:** `lib/config/theme.ts` exports named constants (`COLOR_INK`, `COLOR_TEAL`, etc.) with hex values mirroring `globals.css`. Use only in JS rendering contexts that cannot read CSS vars (Recharts SVG attributes, Satori OG images, PWA manifest). Values must stay in sync with `globals.css` manually — it is NOT auto-derived. Do NOT use these constants in JSX classNames.

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

Portal-specific CSS lives in `app/(portal)/portal.module.css`.
Admin-specific CSS lives in `app/(admin)/admin.module.css`.
Marketing section CSS: co-located `components/sections/*.module.css`.

### Responsive Strategy

Mobile-first. Base = mobile. `@media (min-width: 768px)` = desktop.
Use `@media (max-width: 767px)` to hide desktop-only elements. Never `max-width: 768px` (off-by-one at exactly 768px).

### SSOT Rule

All design tokens live in `app/globals.css` only. There is no `tailwind.config.*` (Tailwind v4); if one ever existed it MUST reference CSS vars (`'var(--name)'`), never literal values. Components MUST use semantic CSS classes from `globals.css` or standard Tailwind utilities, never arbitrary values like `bg-[#hex]`.

**Violations to fix when touching UI:**
- `bg-[#hex]` / `text-[#hex]` in className → CSS var + semantic class
- `style={{ color: '#hex' }}` → CSS var + className
- Literal hex in tailwind.config → `'var(--name)'` (no config file here — red flag if one appears)
- Same token defined in 2+ files → consolidate to globals.css
- Hex values in `lib/config/theme.ts` diverging from `globals.css` → sync them

**Audit:** `grep -r '\[#' src/` — every result is a violation.

## Codex CLI Baseline

This repo should assume **OpenAI Codex `rust-v0.128.0` or newer** (released **April 30, 2026**).

- Upgrade Codex with `codex update`.
- Do not rely on `--full-auto`. As of `0.128.0`, that flag is deprecated; use explicit permission profiles and trust flows instead.
- Prefer explicit sandbox/approval settings over legacy shorthand when documenting or automating agent runs for this repo.
- If you use the TUI, `0.128.0` adds persisted `/goal` workflows plus `/statusline` and `/title` editing; treat those as optional operator features, not app behavior.
