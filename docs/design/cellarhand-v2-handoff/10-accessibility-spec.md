# 10 · Accessibility Specification

**Target: WCAG 2.2 Level AA**, with the touch-target and focus-appearance criteria treated as hard requirements because of the operating environment (gloves, sunlight, one hand).

The measured baseline from the audit: 78% of interactive controls under 44px at 390px (293 of 376); 13–21 tab stops before content on every desktop navigation; zero `aria-current` on nav links across 24 routes; no skip link and no `sr-only` utility anywhere in the codebase; no global `:focus-visible` rule; no global `prefers-reduced-motion` rule. Every one of those is fixed in phase 1.

---

## 1. Structure and landmarks

- One `<h1>` per route — already true everywhere, keep it.
- Heading order never skips. Two routes currently break this (`/vineyards/harvest` h1→h3, `/vineyards/sprays/new` h1→h3, whose heading text is literally "Header").
- Landmarks: `<header>`, `<nav aria-label="Main">`, `<nav aria-label="Breadcrumb">`, `<main id="main">`, `<aside aria-label="Assistant">`.
- Add an `.sr-only` utility (clip-path technique). None exists today.

## 2. Skip navigation

```html
<a href="#main" class="skip-link">Skip to main content</a>
```

First focusable element on every page; visually hidden until focused, then rendered as a wine pill at top-left with the standard focus ring. Target `#main` has `tabindex="-1"`.

**Acceptance:** desktop tab stops before page content drop from 13–21 to **1** on every route.

## 3. Keyboard

Full parity with the mouse everywhere. Specific requirements:

| Pattern | Requirement |
|---|---|
| Nav | Reachable in order; `aria-current="page"` on the active item; group buttons `aria-expanded` + `aria-controls` |
| Command palette | `⌘K` opens; focus trapped; `Esc` closes and restores focus; `↑↓` move, `Enter` opens, `⇧↵` asks |
| Tables | `↑↓` row cursor, `→`/`←` expand/collapse, `Enter` opens. Focus is never trapped |
| Capture grid | `Tab` down the active column, `Enter` records and advances, `Space` ticks |
| Ribbon | `←/→` between tiles, `Enter` jumps. Supplementary — never the only path |
| Tabs | Roving tabindex, `←/→/Home/End` — already correct in `Tabs.tsx` |
| Dialogs | Focus to the heading on open, trapped, `Esc` cancels, focus restored on close |
| Dock | Keeps its existing `Esc` precedence (voice → shrink → close). Do not change |

No keyboard trap anywhere. No bare-key binding for a destructive act.

## 4. Focus visibility

Global `:focus-visible` rule with `--shadow-focus` (3px wine ring). Required on every interactive element **including** custom tiles, chips, ribbon cells and table rows. `Button` currently has no focus styling at all and the only focus rings in `globals.css` are for Leaflet controls, so focus falls back to the UA's blue ring inside a warm-paper system.

Focus indicator must meet WCAG 2.2 **Focus Appearance**: at least a 2px-thick perimeter with ≥3:1 contrast against both the focused element and the adjacent background. On ink surfaces (dock header, command palette) use `--focus-ring-on-dark`.

## 5. Accessible names

Zero nameless controls today — hold that line.

- Every input has a **visible** `<label for>`. Placeholders never carry the label. Four routes currently have visually-labelled but programmatically unassociated controls: `/ferment/process` (3 principal selects on a core harvest workflow), `/compliance` (2 tax-class selects + the Part X textarea), `/inventory`, `/audit`.
- Icon-only controls carry `aria-label`; domain icons beside text are `aria-hidden`.
- A button's accessible name states the act and its object: "Archive CH-NEUTRAL-14", not "Archive".
- Badges with a count: `aria-label="4 open work orders"`.

## 6. Status announcements

One `aria-live` region per concern; never nested; never more than three on a page.

| Concern | Politeness | Text |
|---|---|---|
| Record confirmed | `role="status"` | `C-1410 topped, barrel 11 of 60` |
| Result count | `polite` | `12 work orders` |
| Connection change | `polite` | `No connection. You can't record right now.` |
| Live computed value | `polite` | `32 ppm into 2,480 litres is 79.4 grams` |
| Error | `role="alert"` | the full error sentence |

Errors on the execute screen currently render as a plain `<div style={{color: danger}}>` — not announced, easy to miss below the fold on a phone. That must become `role="alert"`.

## 7. Error association

`aria-invalid="true"` on the field, `aria-describedby` pointing at the message, message container `role="alert"`. The message names what is wrong and what to do. On submit failure, focus moves to the first invalid field.

## 8. Colour independence

**Rule: colour never carries meaning alone.** Every status is hue **+ glyph + text**. Every chart series is colour **+ dash pattern + marker shape**. Every lineage edge type is colour **+ a named legend entry**. Fill indicators encode volume by height and by a printed number.

Contrast minimums, all verified against `--cream #FFF8F1` and `--surface-raised #FFFFFF`:

| Token | On cream | Use |
|---|---|---|
| `--ink-900 #14130F` | 18.7:1 | Primary text |
| `--ink-700 #4D4A42` | 8.6:1 | Secondary text |
| `--ink-600 #6B6555` | 5.6:1 | Muted text |
| `--ink-500 #8A8272` | 4.6:1 | Meta text, ≥12px only |
| `--wine-primary #722F37` | 8.7:1 | Accent text, primary button background (white on wine = 8.7:1) |
| `--deep-blue #095972` | 7.4:1 | Active status |
| `--deep-green #175242` | 8.9:1 | Recorded status |
| `--golden-ink #8A6414` | 5.1:1 | Held / warning text |
| `--red-ink #A5342D` | 5.4:1 | Attention text |

**Never** put text in raw `--golden-yellow` (2.1:1), `--orange`, `--lavender` or `--bright-mauve`.

## 9. Charts and lineage — the accessible alternative

Both the fermentation chart and the lineage graph are `role="img"` with an `aria-label` that states the shape of the data in one sentence — e.g. *"Brix falling from 24.0 to 4.8 and temperature falling from 22.5 to 14.2 degrees between 16 and 27 July."*

**Each is followed by a real, complete data table** in a disclosure titled "Readings as a table" / "Lineage as a table". This is mandatory, not a nice-to-have, and it is the authoritative representation.

**Lineage as a table** — the accessible representation of the DAG:

| When | Event | What it did | Parent lot(s) | Child lot(s) | Volume | Recorded/planned | Work order |
|---|---|---|---|---|---|---|---|
| 22 & 24 Sep 2025 | Harvest | Picked Block 3 and Block 5 | — | 25-PN-04 | 4.8 t | Recorded | #131 |
| 28 Sep – 12 Oct | Fermentation | Fermented in T-09 to dry | 25-PN-04 | 25-PN-04 | 2,520 L | Recorded | #138 |
| 14 Oct 2025 | Press — **split** | Free run stayed 25-PN-04; press fraction became 25-PN-04P | 25-PN-04 | 25-PN-04 (2,140 L), 25-PN-04P (380 L) | 2,520 L in | Recorded | #142 |
| 4 Nov 2025 | Blend — **contributed** | 25-PN-04P went into the 2025 Estate Red | 25-PN-04P | 25-ER-BLEND | 380 L | Recorded | #188 |
| 18 Oct 2025 | Fill | Filled 9 French oak barrels | 25-PN-04 | 25-PN-04 | 2,140 L | Recorded | #171 |
| 12 Feb | Blend — **contributed** | 340 L drawn into the 2024 Estate Red | 25-PN-04 | 24-ER-BLEND | 340 L | Recorded | #201 |
| 27 Jul | Consolidation | Barrels racking down to T-04 | 25-PN-04 | 25-PN-04 | 421 L so far | **In progress** | #253 |
| 4 Aug | Bench trial | Planned against 25-PN-02 | 25-PN-04 | — | — | **Planned** | #260 |

Split and blend are named **in the text of the row**, not only by an edge colour. The table is sorted chronologically and every work-order reference is a link.

## 10. Dialogs

`role="dialog" aria-modal="true"`, labelled by its heading, focus moved to the heading on open, focus trapped, `Esc` cancels, focus restored to the trigger on close. Destructive dialogs do not dismiss on outside click.

The assistant dock is deliberately **not** modal (`aria-modal={false}`) and must stay that way — it is persistent chrome the user works alongside, and making it modal would trap them.

## 11. Motion

Global `prefers-reduced-motion` rule (see `05-design-system-v2.md` §A12). Under reduced motion: no transforms, no skeleton pulse, no chevron rotation, and the voice orb goes static — its state is then carried by the existing text label, which is why the label is not optional.

## 12. Touch targets

44×44px absolute minimum at every width for every interactive element (WCAG 2.2 **Target Size (Minimum)** is 24px; 44px is the product standard because of gloves). Floor primary actions 56–68px. Spacing between adjacent targets ≥8px.

The one sanctioned exception is the ribbon tile (10×14px), because it is supplementary and every tile has a ≥44px equivalent in the member table. Document the exception in code.

## 13. Dense information for screen readers

- Tables use `<caption>` or `aria-labelledby`, `scope="col"` / `scope="row"`, and never `display: block` at any breakpoint (the current global mobile rule destroys row/column semantics).
- The dashboard's "Recent activity" table has no `<th>` and no `<caption>` — the first table a user meets. Fix it.
- Long tables announce their size: "Work orders, 63 rows".
- Group ribbons are `role="list"` with per-tile labels, and are supplementary.
- Numeric columns use `tabular-nums` and are right-aligned so a magnifier user can scan them.
- Row-level actions are reachable without horizontal scrolling: at ≤767px they move into the card, not off-screen.

## 14. Forms on the floor

- `inputMode="decimal"` on every numeric field (already correct in the newer cellar forms).
- Live computed readouts in `aria-live="polite"` — the `DoseForm` `rate × volume = total` pattern is the model.
- Autocomplete/autocapitalize off for codes.
- Never rely on hover: the reason a control is disabled is always visible text, never a `title` (the compliance screen's "Resolve blockers first" tooltip is unreachable on touch and unreliable for AT).

## 15. Testing requirements

| Check | Tool | Gate |
|---|---|---|
| Automated rule violations | axe-core via Playwright, every route, 390 + 1440 | Zero violations |
| Touch targets | Playwright measurement pass at 390px | Zero controls < 44px |
| Tab stops before content | Playwright | ≤1 per route |
| `aria-current` present | Playwright | 1 per route |
| Heading order | axe | No skips |
| Contrast | axe + token unit test | AA on all text |
| Reduced motion | Playwright with the media feature emulated | No transforms applied |
| Screen-reader spot checks | Manual, VoiceOver + NVDA | Runner, keg close-out, correction, lineage table |
