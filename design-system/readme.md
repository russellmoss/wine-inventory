# Savvy — Design System

A brand & UI design system for **Savvy** (Savvy Wealth), reconstructed from the
official brand assets and the *Master Deck 2026* presentation template. It gives
design agents everything needed to produce on-brand interfaces, decks, and
collateral: the real logos, the signature line-art illustration family, the
color and type foundations, reusable React UI primitives, and a recreation of
the brand slide system.

> **About Savvy.** Savvy is a modern wealth-management firm that pairs human
> financial advisors with technology — a digital-first RIA experience. The brand
> reads as **premium, calm, and editorial**: warm paper tones, a high-contrast
> Caslon wordmark, restrained Savvy Gold accents, and a recurring motif of fine
> gold line-drawings of spheres, orbits, and intersecting circles. The voice is
> trustworthy and human, never loud or "fintech-bro."

---

## Sources used to build this system

These were the inputs. They are recorded so a future maintainer can re-derive or
extend the system; do not assume the reader has access.

| Source | What it gave us |
|---|---|
| `uploads/Savvy Logo(Black\|white).png/.svg` | Primary **Savvy** wordmark (Big Caslon), light & dark |
| `uploads/Savvy Submark (BLK).png` | Interlocking-S submark / monogram |
| `uploads/BigCaslon-Regular.otf`, `BigCaslon-Bold.otf` | The brand display serif binaries |
| `uploads/Master Deck 2026 - Savvy.pptx` | 153-slide master template → palette, type scale, layout system, and the full line-art illustration + icon library (extracted to `assets/`) |
| Brand color spec (provided in brief) | Canonical primary + secondary palette (see `tokens/colors.css`) |

Raw extracted deck text and media live in `scraps/` (working files, not shipped).

---

## CONTENT FUNDAMENTALS — how Savvy writes

The brand voice is **measured, warm, and advisory** — the tone of a trusted
professional, not a hype machine.

- **Person & address.** Speaks *to* the reader as **"you"**, and *as* the firm
  using **"we"**. Advisor-to-client warmth: "Here's how we'd think about it,"
  not "Users can configure…".
- **Casing.** **Sentence case** for nearly everything — titles, buttons, nav.
  The only systematic uppercase is the **tracked eyebrow/overline** label
  (e.g. `SPOTLIGHT`, `CAPTION`, section kickers) which is set in Inter with wide
  letter-spacing. Reserve ALL CAPS for these short labels only.
- **Sentence length.** Short, plain, declarative. Avoids jargon; when a financial
  term is unavoidable it's explained simply. Numbers are concrete ("$500–$1k",
  "2–4 wks").
- **Headline style.** Calm and editorial — a statement, often paired with a
  one-line subtitle. The deck's structural vocabulary: **Title → Subtitle →
  body**, plus **Metric # / Caption** pairs for stats and **Eyebrow** kickers
  for sections.
- **Emoji.** **Never.** The brand expresses warmth through typography, color, and
  the line-art motif — not emoji.
- **Punctuation & symbols.** Real en-dashes and curly quotes. Quotation moments
  use the oversized serif quote-mark graphic, not decorative emoji.
- **Vibe.** Confident, unhurried, premium. Think a private-bank letter rewritten
  for the 21st century: human, literate, never breathless.

**Examples of on-voice phrasing**
- Eyebrow: `WHAT IT INCLUDES` · `SPOTLIGHT` · `OUR APPROACH`
- Title: "A smarter home for your wealth"
- Subtitle: "Advisors and technology, working as one."
- Metric pairing: **$2.4B** / "Assets under advisement"
- Quote: *"Add a quote that captures your mission — the impact you want to
  achieve and who you aim to help."*

---

## VISUAL FOUNDATIONS

**Overall feel.** Warm, editorial, and quiet-luxury. Lots of cream paper, ink-black
type, generous negative space, and a single disciplined accent — Savvy Gold. The
signature device is a family of **fine gold line illustrations** (spheres, globes
with longitude lines, concentric "target" circles, orbits with a planet dot,
overlapping/Venn rings, loose spirals) used large and semi-decorative.

### Color
- **Foundation:** Vanilla `#FFF8F1` paper and White surfaces, with Black ink
  type. A warm off-white `#F5F2EC` is the secondary surface.
- **Accent:** **Savvy Gold `#8E7E57`** — used sparingly for emphasis, rules,
  small marks, and the line-art. **Ecru `#C7BCA1`** is the muted sand used for
  borders, dividers, and quiet fills.
- **Secondary palette** (editorial, old-master muted): Maroon, Deep Green,
  Deep Blue, Golden Yellow, Lavender, Red, Orange, Bright Mauve. Used as
  data-viz categories, section color-coding, and occasional full-bleed
  background blocks — one at a time, never as a rainbow.
- **Inverse:** Black backgrounds carry vanilla text and **white** line-art
  variants. This is the brand's "dramatic" register (covers, quotes, section
  breaks).
- Gradients are **not** part of the system. Color is flat and confident.

### Type
- **Big Caslon** — display serif. The wordmark and rare editorial moments
  (oversized numerals, pull quotes). High contrast, elegant.
- **Inter Tight** — the deck's headline face, almost always **Light (300)** at
  large sizes with slightly negative tracking. This is what makes titles feel
  airy and premium.
- **Inter** — body and UI, Regular/Medium. SemiBold only for small emphasis.
- Eyebrows are Inter, uppercase, ~`0.16em` tracking.
- Scale is large and calm; line-height generous (1.5 body, ~1.1 display).

### Backgrounds
- Predominantly **solid** vanilla/white/off-white, or solid black/secondary
  color for impact. No photographic hero washes by default.
- **Imagery**, when used, is warm-toned, natural-light, candid (people, offices).
  Not cool, not heavily filtered — see `assets/imagery/office-warm.jpg`.
- The line-art illustrations float on solid backgrounds as the primary
  "graphic." They are the texture, in place of patterns or gradients.

### Cards, borders, shadows
- **Cards:** white on vanilla, **`--radius-lg` (16px)** corners, a hairline
  `--border-subtle` or `--border-strong` (ecru), and a **soft, warm, low**
  shadow (`--shadow-sm`/`--shadow-md`). Shadows are brown-tinted, never blue,
  never harsh.
- **Borders:** 1px, ecru or low-alpha ink. Used to delineate calmly; hairline
  gold rules appear as accents.
- No "colored left-border accent" card cliché. No gl_assy gradients.

### Radii
- Controls **10px**, cards **16px**, large panels **24px**. Pills (999px) only
  for tags, avatars, and segmented controls. Corners are gentle, not bubbly.

### Motion, hover & press
- **Calm.** Fades and short eases (120–220ms, `--ease-standard`/`--ease-out`).
  No bounce, no spring, no infinite loops on content.
- **Hover:** buttons/links darken (gold → `--accent-hover`); cards lift one
  shadow step and/or border strengthens. Subtle.
- **Press:** slight darken to `--accent-press` and a 1px settle; no aggressive
  scale-down.
- **Focus:** 3px soft gold ring (`--shadow-focus`).

### Layout
- Editorial grid with generous gutters. Eyebrow → Title → Subtitle is the
  dominant header rhythm. Fixed elements (deck page numbers, small submark) sit
  quietly in corners. Whitespace is a feature, not a bug.

### Transparency & blur
- Used sparingly. Light scrims over imagery for text legibility; low-alpha ink
  for borders. No heavy glassmorphism.

---

## ICONOGRAPHY

Savvy's "iconography" is really two layers:

1. **The line-art illustration family** (the hero motif). Fine single-weight
   strokes in Savvy Gold (or white on dark), drawing celestial/geometric
   forms — spheres, longitude globes, concentric targets, orbits with a dot,
   2- and 3-circle Venn rings, overlapping ring rows, and loose spirals. These
   are extracted to `assets/illustrations/gold/` and `assets/illustrations/white/`.
   Use them large and semi-decorative (section openers, card accents, cover
   art). They replace stock spot-icons in most brand contexts.
   - Plus an oversized **serif quote mark** (`quote-gold.png`, `quote-white.png`)
     for testimonial/quote slides, and a heavy **gold arrow** (`arrow-gold.png`).

2. **Functional UI icons.** The brand deck does not ship a bespoke UI icon font.
   For product/UI work we standardize on **[Lucide](https://lucide.dev)** —
   a clean, ~1.75px stroke, rounded-join open-stroke set that matches the line-art
   sensibility. Load from CDN: `https://unpkg.com/lucide@latest`. This is a
   **documented substitution** (no proprietary set was provided); keep stroke
   weight light and corners rounded to stay on-brand. Use `currentColor` so icons
   inherit text color (ink for default, gold for accent).

- **Emoji:** never used as icons.
- **Unicode glyphs:** the en-dash, curly quotes, and `›` chevrons appear in
  running text; otherwise icons come from the two layers above.

---

## Foundations & tokens

The single entry point consumers link is **`styles.css`** (imports only). It
reaches:

- `tokens/fonts.css` — `@font-face` for Big Caslon + Google import for Inter / Inter Tight
- `tokens/colors.css` — primary, secondary, neutral ramp, semantic aliases
- `tokens/typography.css` — families, weights, scale, tracking, leading
- `tokens/spacing.css` — 8px spacing, radii, warm shadows, motion
- `tokens/base.css` — element defaults + `.savvy-eyebrow` / `.savvy-serif` helpers

---

## Index / manifest

Root files and where to look:

| Path | What it is |
|---|---|
| `styles.css` | **Entry point** — link this. Imports all tokens + fonts + base. |
| `tokens/` | `colors.css`, `typography.css`, `spacing.css`, `fonts.css`, `base.css` |
| `guidelines/` | Foundation specimen cards (Colors, Type, Spacing, Brand) shown in the Design System tab |
| `assets/logos/` | Savvy wordmark (black/white, PNG+SVG) + submark |
| `assets/fonts/` | Big Caslon OTF binaries |
| `assets/illustrations/gold/` · `/white/` | The signature line-art motif family (+ quote mark, arrow) |
| `assets/imagery/` | Warm reference photography |
| `components/core/` | `Button`, `Card`, `Badge`, `Avatar` |
| `components/forms/` | `Input`, `Checkbox` |
| `components/brand/` | `Eyebrow`, `Metric`, `Quote` |
| `slides/` | Seven deck specimen slides (Cover, Section, Content, Metrics, Quote, Agenda, Closing) + `slide-base.css` |
| `ui_kits/website/` | Brand-applied Savvy Wealth homepage built from the primitives |
| `SKILL.md` | Agent-skill manifest for use in Claude Code |
| `scraps/` | Working extraction files (deck text, raw media) — not part of the shipped system |

### Components (read via `window.SavvyDesignSystem_9598d9`)
`Button` · `Card` · `Badge` · `Avatar` · `Input` · `Checkbox` · `Eyebrow` · `Metric` · `Quote`

Each component directory holds `<Name>.jsx`, `<Name>.d.ts`, and a `@dsCard` HTML
preview; `components/*/​*.prompt.md` gives usage notes.

### How consumers use this system
1. Link `styles.css` for tokens + fonts.
2. Load `_ds_bundle.js` (auto-generated) and read components from
   `window.SavvyDesignSystem_9598d9`.
3. Pull logos and line-art from `assets/`.
4. Follow the voice and visual rules above.

