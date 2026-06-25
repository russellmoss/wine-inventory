# Design System — Bhutan Wine Company

> Source of truth for the visual language. Tokens live in `src/styles/tokens/*.css`
> and are wired to bare HTML in `base.css`. A live component + token preview renders
> at the `/styleguide` route. **Read this before any visual or UI change. Do not add
> hardcoded colors, fonts, or spacing — reference the tokens.**

## Product Context
- **What this is:** A winery production and inventory platform — bulk wine, bottling
  runs, vessels, finished goods, locations, reports, and an audit log. Not a personal
  cellar tracker; an operational system of record for a working winery.
- **Who it's for:** Cellar and production staff at the Bhutan Wine Company (data entry,
  movement tracking, traceability), plus admins managing reference data and users.
- **Space/industry:** Wine production / inventory operations, with a premium DTC brand
  sensibility carried into an internal tool.
- **Project type:** Data-dense web app (Next.js 16 app router, React 19, Prisma/Neon).

## Aesthetic Direction
- **Direction:** Warm editorial. Paper-and-ink modernism with a single wine accent.
- **Decoration level:** Intentional — typography and warm paper do the work; no
  gradients, no decorative blobs, no icon-in-circle grids. Soft, low shadows only.
- **Mood:** Calm, premium, considered. An operational tool that reads like a well-set
  book rather than a dashboard. Quiet confidence over flash.
- **Anti-slop rules (enforced):** No purple/violet gradients. No blue-tinted shadows
  (shadows are warm, `rgba(43,42,38,*)`). No uniform bubbly radius. Sentence-case
  button labels. One accent color, used sparingly and meaningfully.

## Typography
Tokens: `src/styles/tokens/typography.css`, `fonts.css`. Inter + Inter Tight load from
Google Fonts at the top of `globals.css` (must precede Tailwind). Big Caslon ships
locally from `/assets/fonts/`.

- **Display/Hero:** `Big Caslon` (serif) — `--font-display`. Brand moments, hero
  headings, the `.ds-serif` / `Quote` voice. Falls back to Hoefler Text → Times → Georgia.
- **Headings (h1–h4):** `Inter Tight` — `--font-heading`, weight **300 (light)**,
  tight tracking. The workhorse headline voice.
- **Body / UI:** `Inter` — `--font-body`, weight 400. All running text, controls, tables.
- **Data/Tables:** `Inter` (body). Use `font-variant-numeric: tabular-nums` for aligned
  figures. (No dedicated data face — Inter handles it.)
- **Mono:** `--font-mono` — system mono stack (`ui-monospace`, SF Mono, Menlo, Consolas).

**Weights:** extralight 200 · light 300 · regular 400 · medium 500 · semibold 600 · bold 700.
Headings default to **light (300)**; emphasis comes from size and tracking, not weight.

**Type scale (px):** display-2xl 88 · display-xl 68 · display-lg 52 · h1 40 · h2 32 ·
h3 25 · h4 20 · body-lg 18 · body 16 · body-sm 14 · caption 13 · overline 12.
(`globals.css` clamps `.app-main h1` to 30px on screens ≤767px.)

**Line height:** tight 1.06 · snug 1.18 · normal 1.5 · relaxed 1.65.
**Tracking:** display −0.02em · tight −0.01em · normal 0 · wide 0.04em · overline 0.16em.

**Eyebrow** (`.ds-eyebrow` / `Eyebrow` component): uppercase, overline size, 0.16em
tracking, wine accent color. The standard section-label pattern.

## Color
Tokens: `src/styles/tokens/colors.css`. Always use the semantic aliases, not raw hex.

- **Approach:** Restrained. Cream + ink neutrals carry the UI; one wine accent;
  secondary hues appear only as status and category signals.
- **Brand / accent:** Wine `#722F37` (`--wine-primary` / `--accent`). Hover `#5A2630`,
  press `#4A1F25`, soft `rgba(114,47,55,0.12)`, on-accent text white.
- **Surfaces:** page = cream `#FFF8F1` · raised = white · sunken = `#F5F2EC` ·
  muted = `#ECE7DC` · inverse = ink black.
- **Neutral ramp (warm):** paper-0 `#FFF` → paper-50 `#FFF8F1` → 100 `#F5F2EC` →
  200 `#ECE7DC` → 300 `#DED7C6` → 400/sand `#C7BCA1` → ink-600 `#6B6555` →
  700 `#4D4A42` → 800 `#2B2A26` → 900 `#14130F` → 950 `#000`.
- **Text:** primary = ink-900 · secondary = ink-700 · muted = ink-600 ·
  on-dark = cream · accent = wine.
- **Borders:** subtle `rgba(20,19,15,0.08)` · default paper-300 · strong sand ·
  inverse `rgba(255,248,241,0.18)`.
- **Secondary / editorial set:** maroon `#6B484D` · deep-green `#175242` ·
  deep-blue `#095972` · golden-yellow `#D79F32` · lavender `#A98EB1` · red `#B63D35` ·
  orange `#F19E70` · bright-mauve `#C06F74`.
- **Semantic status:** positive = deep-green · info = deep-blue · warning =
  golden-yellow · danger = red.
- **Focus ring:** `rgba(114,47,55,0.45)` → `--shadow-focus` (3px ring) on `:focus-visible`.
- **Dark mode:** **None — light-only by design.** The warm paper aesthetic is the brand.
  Do not add a dark theme without an explicit decision logged below.

## Spacing
Tokens: `src/styles/tokens/spacing.css`. **Base unit: 8px.** Density: comfortable.

- **Scale:** 0 · 4 · 8 · 12 · 16 · 24 · 32 · 40 · 56 · 72 · 96 · 128 (`--space-0`…`--space-11`).
- **Gutter:** `--space-5` (24px).

## Layout
- **Approach:** Grid-disciplined for app screens; editorial restraint (serif, eyebrows,
  `Quote`) for brand moments. App content lives in `AppShell` (`src/components/AppShell.tsx`).
- **Containers:** sm 640 · md 880 · lg 1120 · xl 1320 (px). App main caps at `--container-xl`.
- **App shell:** desktop = 248px sticky left sidebar (raised surface, strong border) +
  fluid main; mobile = sticky top bar + slide-in drawer, switched at the 768px breakpoint
  via `.bw-shell` / `.bw-mobile-bar` / `.bw-desktop-sidebar`. Wide tables scroll
  horizontally on mobile (`.app-main table`).
- **Border radius:** xs 4 · sm 6 · md 10 · lg 16 · xl 24 · pill 999. Controls use md;
  pills for badges.
- **Border width:** 1px default · 1.5px strong.

## Shadows
Warm, low, never blue — all `rgba(43,42,38,*)`.
- xs `0 1px 2px /.06` · sm (2-layer /.08+/.04) · md (`0 4px 14px /.08` + …) ·
  lg (`0 12px 34px /.10` + …) · xl `0 28px 64px /.14` · focus = 3px wine ring.

## Motion
Calm, editorial. Tokens in `spacing.css`.
- **Easing:** standard `cubic-bezier(0.4,0,0.2,1)` · out `(0.16,1,0.3,1)` ·
  in-out `(0.65,0,0.35,1)`.
- **Duration:** fast 120ms · normal 220ms · slow 400ms.
- **Use:** transitions that aid comprehension (hover, state, drawer). No scroll
  choreography, no decorative animation.

## Tailwind bridge
`globals.css` exposes a small set of tokens as Tailwind v4 utilities via `@theme inline`:
`bg-cream`, `bg-paper`, `bg-sand`, `text-wine`, `text-ink`, `text-ink-muted`,
`font-display`, `font-heading`, `font-body`. For anything outside that set, use the CSS
variables directly (inline styles or class) — that's the established pattern in components.

## Component library
`src/components/ui/` (barrel: `index.ts`). All token-driven, sentence-case labels.
Button · Card · Badge · Avatar · Input · Checkbox · Eyebrow · Metric · Quote ·
ConfirmButton · Modal · ExportCsvButton. Preview them live at `/styleguide`.

- **Button** variants: primary (wine solid) · secondary (outline) · ghost (wine, quiet) ·
  inverse · link. Sizes sm/md/lg (heights 34/42/50).
- **Badge** tones: neutral · gold · green · blue · maroon · red; variants soft/solid/outline.

## Known drift / cleanup backlog
Flagged during the 2026-06-24 documentation pass. Not yet fixed (each touches a
component API or many call sites — fix deliberately, not in a doc pass):

1. **`Badge tone="gold"` renders wine burgundy, not gold** (see `Badge.tsx` comment).
   The real `--golden-yellow` is used for `--warning`. The token name and the API name
   disagree. Rename candidate: `tone="gold"` → `tone="wine"`, update call sites
   (`/styleguide` at minimum).
2. **Component sizing bypasses the scale tokens.** `Button`/`Badge` use raw values
   (`fontSize: 14.5`, heights `34/42/50`, padding `"11px 20px"`, tracking `0.005em`)
   instead of `--text-*`, `--space-*`, `--tracking-*`. The scale exists; consume it so
   resizing the system stays single-source.
3. **`--golden-yellow`, `--lavender`, `--orange`, `--bright-mauve`** are defined but
   lightly used. Keep if they map to real domain categories (e.g. vessel/wine types);
   otherwise prune to keep the palette honest.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-24 | Captured existing in-code system as DESIGN.md (source of truth) | System was mature and coherent in `src/styles/tokens/` but undocumented; created by /design-consultation (document + refine, no research) to stop future drift. |
| 2026-06-24 | Light-only, no dark mode — recorded as intentional | Warm cream-paper palette is the brand; a dark theme would require a deliberate redesign decision, not an inversion. |
| 2026-06-24 | Logged 3 known-drift items rather than auto-fixing | Renaming the Badge `gold` tone and re-tokenizing component sizing touch component APIs / many call sites; left as owner's call. |
