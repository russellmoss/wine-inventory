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
- **Tenancy / direction:** evolving from a single-winery internal tool (Bhutan Wine
  Company) into a **multi-tenant SaaS** for many wineries (see VISION **D16** + ROADMAP
  Phase 12). The visual system here is the **default brand**; **per-tenant branding/theming
  is a future capability** — the tokens stay, their values become tenant-configurable. New
  tenant-facing surfaces (signup, tenant admin, org switcher, per-tenant theme) get a
  design review when they're built.

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
- **Text-safe ink variants (v2):** the editorial hues above are decorative-only —
  `--golden-yellow` is 2.1:1 on cream and cannot carry text. Use `--golden-ink`
  `#8A6414` · `--red-ink` `#A5342D` · `--green-ink` `#175242` · `--blue-ink` `#095972`
  for glyphs and text on light surfaces, `--ink-500` `#8A8272` (via `--text-meta`) for
  eyebrows/column headers/timestamps, and `--warning-deep-text` `#5C440E` inside a
  warning tint. **Never** set text in golden-yellow, orange, lavender or bright-mauve.
- **Surface tints (v2):** `--surface-tint-{warning,danger,info,success,accent}` — the
  quiet wash behind an `Alert` or a flagged row.
- **Status ramp (v2, the single status vocabulary):** six values, each a
  `--status-*-fg` / `--status-*-bg` pair — `neutral ○` · `active ◐` · `held ◔` ·
  `done ●` · `attention ▲` · `review ◇`. Rendered only through `StatusChip`, which
  always pairs the glyph with mandatory text. **Wine is not in this ramp** — it means
  brand and primary action only. `held` is built but unwired.
- **Provenance (v2):** `--provenance-measured-*` / `--provenance-estimated-*`. The
  labels are always the words **measured** / **≈ estimated**; colour reinforces only.
- **Data-viz series (v2):** `--viz-1`…`--viz-6` (Brix · temperature · pH · free SO₂ ·
  TA · malic), plus `--viz-threshold` / `--viz-grid` / `--viz-axis`. Every series
  pairs its colour with a dash pattern and marker shape — colour is never the only
  encoding.
- **Focus ring:** `rgba(114,47,55,0.45)` → `--shadow-focus` (3px ring) on `:focus-visible`,
  with `border-radius: inherit` so the ring traces the control's own shape. On ink/dark
  surfaces use `--focus-ring-on-dark` `rgba(255,248,241,0.65)`.
- **Dark mode:** **None — light-only by design.** The warm paper aesthetic is the brand.
  Do not add a dark theme without an explicit decision logged below.

## Spacing
Tokens: `src/styles/tokens/spacing.css`. **Base unit: 8px.** Density: comfortable.

- **Scale:** 0 · 4 · 8 · 12 · 16 · 24 · 32 · 40 · 56 · 72 · 96 · 128 (`--space-0`…`--space-11`).
- **Gutter:** `--space-5` (24px).
- **Density (v2):** chrome stays comfortable, data compresses. `--row-h-comfortable`
  56 · `--row-h-default` 46 · `--row-h-dense` 38 · `--row-h-active` 56, plus
  `--cell-pad-x` 8 / `--cell-pad-x-first` 12 / `--section-gap` 24 /
  `--page-pad-x` 32 (`-sm` 16) / `--page-pad-y` 24. Page header, breadcrumb, headline,
  summary and primary actions always use the comfortable scale; only tabular data
  uses `--row-h-dense`.
- **Touch targets (v2):** `--touch-min` **44px is the floor at every width**, not a
  phone-only rule · `--touch-floor` 56 (primary action on a capture screen) ·
  `--touch-floor-lg` 68 (the single tick action on a phone runner) · `--touch-nudge` 46.
  If a design cannot fit 44px targets, the design is wrong.
- **Breakpoints (v2):** `--bp-phone-lg` 430 · `--bp-tablet` 768 · `--bp-desktop` 1024 ·
  `--bp-wide` 1440.
- **Icons (v2):** `src/styles/tokens/icons.css` — `--icon-nav` 20 · `--icon-tab` 24 ·
  `--icon-inline` 17 · `--icon-feature` 40, and `--icon-stroke` 1.6 at a 24px viewBox.
  The stroke is a constant: do **not** scale it with the icon.

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
- **Reduced motion (v2):** `globals.css` carries a **global**
  `@media (prefers-reduced-motion: reduce)` rule that collapses every animation and
  transition app-wide. Components no longer need to check the preference individually
  (four of them still do, harmlessly). Anything animated in JS rather than CSS — the
  voice orb's canvas, for one — must still check `matchMedia` itself.

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
  inverse · link. Sizes sm/md/lg/xl — heights **44/48/56/68** (v2 §B6; was 34/42/50).
  `link` shares the sibling height and carries a persistent underline. Disabled gets a
  real surface (`--paper-200` on `--ink-600`), never `opacity`. `pending` sets
  `aria-busy`, blocks pointer + keyboard activation, and holds the button's width.
  Geometry lives in `src/components/ui/button-sizes.ts`.
- **Badge** tones: neutral · **wine** (was `gold`) · green · blue · maroon · red; variants
  soft/solid/outline. **Category labels only** — a status value goes through `StatusChip`.
- **StatusChip** the six-value status ramp (`neutral`/`active`/`held`/`done`/`attention`/
  `review`), glyph + mandatory text, sizes sm 24 / md 30. It replaced seven independent
  status→colour maps, including two that were hand-rolled ternaries inside a JSX attribute.

## Known drift / cleanup backlog
Flagged during the 2026-06-24 documentation pass. Not yet fixed (each touches a
component API or many call sites — fix deliberately, not in a doc pass):

1. ~~**`Badge tone="gold"` renders wine burgundy, not gold.**~~ **RESOLVED 2026-07-28.**
   Renamed to `tone="wine"` across all 31 literal call sites and every typed use, plus
   the same defect in `Avatar` and `Eyebrow` (which had their own `"gold"` tone keys
   rendering wine, with no external call sites). This was a naming fix, not a colour
   change — the pixels never moved. A static test (`test/design-static-guards.test.ts`)
   now fails if `tone="gold"` reappears, and separately if a `Badge` is ever handed a
   status value: **Badge is for categories, `StatusChip` is for status.**
2. **Component sizing bypasses the scale tokens.** ~~`Button`~~ **RESOLVED for `Button`
   2026-07-28** — heights now come from `--touch-*`, padding/tracking/size from
   `--space-*`/`--tracking-*`/`--text-*` where a step exists (see `button-sizes.ts`; the
   few remaining raw values — 48px, 15px, 16.5px, 19px, 10px, 20px, 26px, 18px — have no
   token on the 8px/type scale and are documented as such rather than rounded to fit).
   Still open for `Badge`, which continues to use raw `fontSize: 12.5` / `padding: "5px 11px"`.
3. ~~**`--golden-yellow`, `--lavender`, `--orange`, `--bright-mauve`** are defined but
   lightly used.~~ **RESOLVED 2026-07-28 — keep all four.** They map to a real domain
   category: `src/lib/vineyard/colors.ts` uses their exact hexes as the 8-hue vineyard
   variety palette (map, legend, colour pickers, server-side validation) and names
   `colors.css` as its source of truth. `--golden-yellow` additionally backs
   `--warning`. Pruning them would orphan a live feature. Text use is still forbidden —
   see the text-safe ink variants above.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-24 | Captured existing in-code system as DESIGN.md (source of truth) | System was mature and coherent in `src/styles/tokens/` but undocumented; created by /design-consultation (document + refine, no research) to stop future drift. |
| 2026-06-24 | Light-only, no dark mode — recorded as intentional | Warm cream-paper palette is the brand; a dark theme would require a deliberate redesign decision, not an inversion. |
| 2026-06-24 | Logged 3 known-drift items rather than auto-fixing | Renaming the Badge `gold` tone and re-tokenizing component sizing touch component APIs / many call sites; left as owner's call. |
| 2026-07-28 | **Cellarhand UI/UX v2 Phase 0/1 adopted** — status ramp, provenance, data-viz, density, touch-target, breakpoint and icon tokens added; `.sr-only` + a global reduced-motion rule added; Inter/Inter Tight self-hosted via `next/font`; focus ring switched to `border-radius: inherit`. | Approved design handoff in `docs/design/cellarhand-v2-handoff/`, executed per `docs/plans/2026-07-28-101-feat-cellarhand-v2-phase0-1-reconciliation-plan.md`. The audit baseline was real: 293/376 controls under 44px, zero `aria-current` anywhere, no `.sr-only`, six independent status→colour maps. |
| 2026-07-21 | **Motion exception:** the inline voice orb (dock title bar, plan 089) may animate continuously — the one deliberate deviation from "no decorative animation". | It is persistent chrome that follows the user across routes, so it is gated to move ONLY while audio is flowing (`listening`/`speaking`); still while thinking/idle. The motion then encodes state ("audio is moving now"), which the policy allows, rather than decoration, which it forbids. Enforced by `orbShouldAnimate` in `src/lib/voice/inline-ui.ts` + the `AudioVisualizer` `animate` prop. |
