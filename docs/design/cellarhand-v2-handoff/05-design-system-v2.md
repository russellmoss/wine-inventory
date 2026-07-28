# 05 · Design System v2

Implementation-ready tokens and component specs. Everything here extends `src/styles/tokens/*.css`. **Additions are marked NEW; changed values are marked CHANGED; everything else is unchanged and must not be touched.**

---

## PART A — TOKENS

### A1. Colour — primitives (unchanged)

```css
--white:        #FFFFFF;
--cream:        #FFF8F1;
--sand:         #C7BCA1;
--wine-primary: #722F37;
--ink:          #000000;

--paper-0:  #FFFFFF;  --paper-50:  #FFF8F1;  --paper-100: #F5F2EC;
--paper-200:#ECE7DC;  --paper-300: #DED7C6;  --paper-400: #C7BCA1;
--ink-600:  #6B6555;  --ink-700:   #4D4A42;  --ink-800:   #2B2A26;
--ink-900:  #14130F;  --ink-950:   #000000;

--maroon: #6B484D;  --deep-green: #175242;  --deep-blue: #095972;
--golden-yellow: #D79F32;  --red: #B63D35;
--lavender: #A98EB1;  --orange: #F19E70;  --bright-mauve: #C06F74;
```

### A2. Colour — NEW primitives

```css
/* Darkened variants of the editorial set, for text and glyphs on light surfaces.
   The raw --golden-yellow (#D79F32) is 2.1:1 on cream and cannot carry text.  */
--golden-ink: #8A6414;   /* 5.1:1 on --cream  */
--red-ink:    #A5342D;   /* 5.4:1 on --cream  */
--green-ink:  #175242;   /* 8.9:1 on --cream — same as --deep-green, aliased for symmetry */
--blue-ink:   #095972;   /* 7.4:1 on --cream */
--ink-500:    #8A8272;   /* NEW. Meta/eyebrow text on white. 4.6:1. Replaces ad-hoc greys. */
--warning-deep-text: #5C440E; /* body text inside a warning tint */
```

**Prohibited:** placing text in `--golden-yellow`, `--orange`, `--lavender` or `--bright-mauve` on any light surface.
**Prune:** `--lavender`, `--orange`, `--bright-mauve` are unused and flagged in DESIGN.md's own backlog. Delete them unless a domain category claims them in this release.

### A3. Colour — semantic aliases

Unchanged: `--surface-page`, `--surface-raised`, `--surface-sunken`, `--surface-inverse`, `--surface-muted`, `--text-primary/secondary/muted/on-dark/accent`, `--border-subtle/default/strong/inverse`, `--accent*`, `--focus-ring`.

**NEW:**

```css
--text-meta:      var(--ink-500);   /* eyebrows, column headers, timestamps */
--surface-tint-warning: rgba(215, 159, 50, 0.12);
--surface-tint-danger:  rgba(182, 61, 53, 0.08);
--surface-tint-info:    rgba(9, 89, 114, 0.10);
--surface-tint-success: rgba(23, 82, 66, 0.10);
--surface-tint-accent:  rgba(114, 47, 55, 0.06);
```

### A4. Status ramp — NEW, and the replacement for `Badge tone="gold"`

This is the highest-leverage token change in the release. Wine is removed from the status vocabulary; it now means brand and primary action only.

| Semantic | Glyph | `--status-*-fg` | `--status-*-bg` | Maps from |
|---|---|---|---|---|
| `neutral` | `○` | `#4D4A42` | `#ECE7DC` | `DRAFT`, `PENDING`, `CANCELLED`, `SKIPPED` |
| `active` | `◐` | `#095972` | `rgba(9,89,114,0.12)` | `ISSUED`, `IN_PROGRESS` |
| `held` | `◔` | `#8A6414` | `rgba(215,159,50,0.16)` | `HELD` **[PROPOSED — Phase 28]** |
| `done` | `●` | `#175242` | `rgba(23,82,66,0.12)` | `APPROVED`, `DONE` |
| `attention` | `▲` | `#A5342D` | `rgba(182,61,53,0.12)` | `REJECTED`, overdue, blockers |
| `review` | `◇` | `#6B484D` | `rgba(107,72,77,0.14)` | `PENDING_APPROVAL` |

```css
--status-neutral-fg: #4D4A42;   --status-neutral-bg: #ECE7DC;
--status-active-fg:  #095972;   --status-active-bg:  rgba(9,89,114,0.12);
--status-held-fg:    #8A6414;   --status-held-bg:    rgba(215,159,50,0.16);
--status-done-fg:    #175242;   --status-done-bg:    rgba(23,82,66,0.12);
--status-attention-fg:#A5342D;  --status-attention-bg:rgba(182,61,53,0.12);
--status-review-fg:  #6B484D;   --status-review-bg:  rgba(107,72,77,0.14);
```

Update `src/lib/work-orders/status-badge.ts` to map onto these six, replacing the current six `BadgeTone` values. `statusTone()` keeps its signature.

### A5. Provenance tokens — NEW (measured vs. estimated)

```css
--provenance-measured-fg: #175242;  --provenance-measured-bg: rgba(23,82,66,0.12);
--provenance-estimated-fg:#8A6414;  --provenance-estimated-bg:rgba(215,159,50,0.16);
```

Labels are always the words **measured** / **≈ estimated**; the colour is reinforcement only.

### A6. Data-visualisation colours — NEW

Ordered series palette, all ≥4.5:1 on `--surface-raised`, distinguishable in the three common colour-vision deficiencies, and each paired with a mandatory non-colour encoding (line dash pattern or marker shape).

| # | Token | Hex | Dash | Marker | Typical use |
|---|---|---|---|---|---|
| 1 | `--viz-1` | `#722F37` | solid | circle | Brix / primary series |
| 2 | `--viz-2` | `#095972` | solid | square | Temperature |
| 3 | `--viz-3` | `#175242` | `6 3` | triangle | pH |
| 4 | `--viz-4` | `#8A6414` | `2 3` | diamond | Free SO₂ |
| 5 | `--viz-5` | `#6B484D` | `8 3 2 3` | cross | TA |
| 6 | `--viz-6` | `#4D4A42` | `1 3` | plus | Malic |

Threshold lines: `--viz-threshold: #8A6414`, always dashed `5 4` at 1.5px, always labelled in the legend with its value and meaning ("yeast floor 16 °C").
Grid: `--viz-grid: #ECE7DC` at 1px; baseline `--viz-axis: #DED7C6`.

### A7. Typography (unchanged families and scale)

```
--font-display: "Big Caslon", "Hoefler Text", "Times New Roman", Georgia, serif;
--font-heading: "Inter Tight", "Inter", -apple-system, …;
--font-body:    "Inter", "Inter Tight", -apple-system, …;
--font-mono:    ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;

weights: 200 300 400 500 600 700
scale px: display-2xl 88 · display-xl 68 · display-lg 52 · h1 40 · h2 32 · h3 25 ·
          h4 20 · body-lg 18 · body 16 · body-sm 14 · caption 13 · overline 12
leading: tight 1.06 · snug 1.18 · normal 1.5 · relaxed 1.65
tracking: display -0.02em · tight -0.01em · normal 0 · wide 0.04em · overline 0.16em
```

**CHANGED — font loading:** `@import` of Google Fonts at the top of `globals.css` is a render-blocking third-party request; on poor cellar wifi the whole type system falls back. Move to `next/font` with `display: swap` and self-hosting, keeping Big Caslon local as it already is.

**NEW — role assignments:**

| Role | Token stack | Size / weight |
|---|---|---|
| Page title (day headline, object name) | `--font-display` 400 | 34px desktop / 30px ≤767 |
| Section title | `--font-heading` 300 | 25px |
| Card / row title | `--font-body` 600 | 15–17px |
| Body | `--font-body` 400 | 15px |
| Meta, column header, eyebrow | `--font-body` 600, `--tracking-overline`, uppercase | 11–12px, `--text-meta` |
| Numeric data | `--font-body` 500–700, `font-variant-numeric: tabular-nums` | matched to context |
| Identity codes (barrel, tank, WO #) | `--font-mono` 400 | 12.5–13px |
| Tasting notes, quotes | `--font-display` 400 | 15px |

**CHANGED — h1 consistency:** currently hand-set per page at 40/36/32/22px. Introduce one `PageHeader` component; `h1` is 34px at ≥768, 30px below, always `--font-display`.

### A8. Spacing and density

Scale unchanged: `0 4 8 12 16 24 32 40 56 72 96 128` (`--space-0`…`--space-11`), gutter `--space-5`.

**NEW — density tokens.** Chrome keeps comfortable spacing; data compresses. This is the mechanism that lets the warm direction scale to 8,000 barrels.

```css
--row-h-comfortable: 56px;  /* nav items, card rows, mobile list rows */
--row-h-default:     46px;  /* standard table rows */
--row-h-dense:       38px;  /* group member rows, expanded detail rows */
--row-h-active:      56px;  /* the row currently being captured */
--cell-pad-x:        8px;
--cell-pad-x-first:  12px;
--section-gap:       24px;
--page-pad-x:        32px;  /* ≥1024 */
--page-pad-x-sm:     16px;  /* ≤767 */
--page-pad-y:        24px;
```

**Rule:** page header, breadcrumb, headline, summary sentence and primary actions always use the comfortable scale. Only tabular data uses `--row-h-dense`.

### A9. Borders and radius

Unchanged: widths `1px` / `1.5px`; radii `xs 4 · sm 6 · md 10 · lg 16 · xl 24 · pill 999`.

**NEW usage rules:** cards `--radius-lg`; controls and table containers `--radius-md`; chips and badges `--radius-pill`; tiles and inline chips `--radius-sm` or `xs`. Not everything is rounded — tiles, ribbon cells and table cells are square or `4px`.

**NEW:** `--border-accent-width: 3px` for the left status rule on a row (overdue, active).

### A10. Elevation (unchanged)

```
--shadow-xs: 0 1px 2px rgba(43,42,38,.06)
--shadow-sm: 0 1px 3px rgba(43,42,38,.08), 0 1px 2px rgba(43,42,38,.04)
--shadow-md: 0 4px 14px rgba(43,42,38,.08), 0 2px 5px rgba(43,42,38,.05)
--shadow-lg: 0 12px 34px rgba(43,42,38,.10), 0 4px 10px rgba(43,42,38,.06)
--shadow-xl: 0 28px 64px rgba(43,42,38,.14)
--shadow-focus: 0 0 0 3px var(--focus-ring)
```

Never blue. Elevation ladder: page 0 · card `sm` · hovered card `md` · popover `lg` · dialog/dock `xl`.

### A11. Focus — CHANGED, and currently missing

There is **no global `:focus-visible` rule** in the codebase and `Button` has no focus styling, so focus falls back to the UA's blue ring inside a warm-paper system.

```css
:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
  border-radius: inherit;
}
--focus-ring: rgba(114, 47, 55, 0.45);      /* unchanged */
--focus-ring-on-dark: rgba(255, 248, 241, 0.65);  /* NEW — dock header, ink surfaces */
```

Required on every interactive element including custom tiles, chips and ribbon cells. Focus is never removed, and never rendered by colour change alone.

### A12. Motion (unchanged tokens, NEW global rule)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### A13. Responsive tokens

```css
--bp-phone-lg: 430px;  --bp-tablet: 768px;  --bp-desktop: 1024px;  --bp-wide: 1440px;
--container-sm: 640px; --container-md: 880px; --container-lg: 1120px; --container-xl: 1320px;
```

### A14. Touch targets — NEW

```css
--touch-min:      44px;   /* absolute floor, every control, every width */
--touch-floor:    56px;   /* primary action on a capture screen */
--touch-floor-lg: 68px;   /* the single tick action on the phone runner */
--touch-nudge:    46px;
```

### A15. Icons — NEW

```css
--icon-nav: 20px;   /* sidebar and menu rows */
--icon-tab: 24px;   /* mobile bottom tabs */
--icon-inline: 17px;/* inside inputs and buttons */
--icon-feature: 40px;/* icon board, empty states */
--icon-stroke: 1.6; /* at 24px viewBox; do NOT scale the stroke with the icon */
```

All domain icons share a `0 0 24 24` viewBox, `fill="none"`, `stroke="currentColor"`, `stroke-width="1.6"`, round caps and joins. Icons never appear without a text label, and never on buttons, form labels or ordinary list rows.

---

## PART B — COMPONENTS

Format: **purpose · variants · sizes · props · states · interaction · a11y · responsive · do/don't**.

### B1. AppShell

**Purpose** Global chrome. **Variants** desktop (sidebar) / compact (bottom tabs).
**Sizes** sidebar 236px (CHANGED from 248); top bar 58px; bottom tabs 56px + safe area.
**Props** `user`, `nav`, `badges`, `connectionState`, `children`.
**States** default · offline · support-view banner (existing) · loading badges.
**Interaction** §1 of the interaction spec. **A11y** skip link first; `aria-current`; `aria-expanded`; one `aria-live` region for connection.
**Responsive** §1 of the responsive spec.
**Don't** render icon-only navigation; render a `0` badge; move focus on a background badge update.

### B2. SectionNav (NEW)

**Purpose** Sub-navigation within a destination (Work orders → Open / Review / Templates).
**Variants** tabs (desktop) / horizontal scroll chips (≤767).
**Sizes** 44px tall. **States** default · active · with count.
**A11y** `role="tablist"` only if it swaps panels without navigation; if it navigates, it is a plain `<nav>` with `aria-current="page"`.
**Don't** use it for more than 5 items — that is a sign the destination should split.

### B3. MobileTabBar (NEW)

**Purpose** Primary navigation ≤1023px. **Sizes** 56px + `env(safe-area-inset-bottom)`; icon 24px; label 12px, always visible.
**States** active (wine icon + label, weight 600) · inactive (`--ink-700`) · with badge.
**A11y** `<nav aria-label="Main">`; active carries `aria-current="page"`; badge has an accessible name ("4 open work orders").
**Don't** hide labels; exceed 4 tabs; put a destructive action here.

### B4. PageHeader (NEW — replaces per-page hand-set h1s)

**Purpose** One header pattern for every screen. Fixes the 40/36/32/22px inconsistency.
**Slots** breadcrumb · eyebrow (optional) · `h1` · summary sentence · actions · meta row.
**Sizes** `h1` 34/30px `--font-display`; summary 15px `--text-secondary`; 24px gap to content.
**Responsive** actions stack below the title at ≤767px. **A11y** exactly one `h1`; the summary is plain text, not a heading.
**Do** write the summary as a sentence about what needs attention. **Don't** put a metric grid here.

### B5. Breadcrumbs (NEW)

Per `01-information-architecture.md` §6. 13px, `--text-muted`, separator `/` in `--paper-400`, final crumb `--text-primary` and not a link.

### B6. Button (CHANGED)

**Variants** primary · secondary · ghost · inverse · link (unchanged set).
**Sizes — CHANGED:**

| Size | Height | Padding | Font | Use |
|---|---|---|---|---|
| `sm` | **44px** (was 34) | 10px 16px | 14px | Dense toolbars — still meets the minimum |
| `md` | **48px** (was 42) | 12px 20px | 15px | Default |
| `lg` | **56px** (was 50) | 16px 26px | 16.5px | Capture primary |
| `xl` (NEW) | **68px** | 18px 24px | 19px | The single phone tick action |

**Props** `variant`, `size`, `iconLeft/Right`, `fullWidth`, `pending`, `pendingLabel`.
**States** default · hover · active · **focus-visible (NEW — currently absent)** · disabled · pending.
**CHANGED — disabled:** `opacity: 0.45` over cream reads as a mauve variant rather than an unavailable state. Replace with `background: var(--paper-200); color: var(--ink-600); border-color: var(--paper-300); cursor: not-allowed`, and always pair a disabled primary with visible text saying why.
**CHANGED — link variant:** `height:auto; padding:0` makes it float off the baseline beside 48px siblings and it is indistinguishable from `ghost`. Give it the same height as its siblings and a persistent underline.
**CHANGED — sizing tokens:** consume `--text-*`, `--space-*`, `--tracking-*` instead of `fontSize: 14.5`, `"11px 20px"`, `0.005em`.
**A11y** `pending` sets `aria-busy` and keeps the accessible name stable. Never disable without a stated reason.
**Don't** put the reason for a disabled button in a `title` — unreachable on touch (the compliance screen does this today).

### B7. IconButton (NEW)

44×44px minimum, icon 20px centred, `--radius-md`, required `aria-label`. Only for genuinely universal actions (close, expand, more). Never for a domain action.

### B8. Input (extend)

**Sizes** `md` 48px · `lg` 56px · `floor` 60px. **Slots** label (always visible) · hint · error · leading/trailing adornment.
**States** default · focus · filled · invalid · disabled · read-only.
**Rules** Visible label always; placeholders never carry the label (the `/bulk` add-row is the clearest violation in the app); required fields carry a visible marker, not just the `required` attribute.
**A11y** `<label for>`, `aria-describedby` for hint and error, `aria-invalid` when errored, `role="alert"` on the error node.

### B9. NumericUnitInput (NEW)

**Purpose** Every measured quantity. **Anatomy** label · planned hint · value field (`tabular-nums`) · unit adornment as a separate non-editable box at the same height · nudge row · derived readout.
**Sizes** field 60px on floor screens, 48px elsewhere; unit box ≥64px wide; nudges 46px.
**Props** `value`, `unit`, `planned`, `nudges[]`, `derived` (a live computed readout), `tolerance`.
**States** default · focused · out-of-tolerance (quiet note, never a block) · invalid · disabled with reason.
**Interaction** `inputMode="decimal"`, `step="any"`; the derived readout updates in an `aria-live="polite"` region (the `DoseForm` live `rate × volume = total` pattern is the model — it is the best error-prevention device in the product).
**Don't** put the unit inside the value; use a spinner; validate on first keystroke.

### B10. Select / Combobox (extend)

Combobox for >10 options with type-ahead (the material picker pattern already does this well). Visible label mandatory — `/ferment/process` currently has three unlabelled principal selects on a core harvest workflow.
**A11y** `role="combobox"` + `aria-expanded` + `aria-controls` + `aria-activedescendant`; keyboard `↑↓ Enter Esc`.

### B11. Checkbox / Radio (extend)

20×20px visual in a 44×44px target. Label is clickable. Group uses `<fieldset><legend>`.

### B12. DateTimeControl (CHANGED)

Native date inputs sit beside DS fields with different heights and a UA calendar glyph — a visible seam in every filter row. Wrap the native input so it matches `Input` metrics, or use a token-styled picker. Always accept typed input.

### B13. Card (keep, adjust)

Unchanged geometry: `--surface-raised`, 1px `--border-strong`, `--radius-lg`, `--shadow-sm`, hover `--shadow-md` + `translateY(-2px)` when interactive.
**CHANGED usage:** cards are for *objects*, not for wrapping every region. At scale, lists become hairline-separated rows inside one card, not a card per row. Avoid card-in-card entirely.

### B14. DataRow (NEW)

**Purpose** The scale workhorse — one row of a dense table or list.
**Variants** default · dense · active (being captured) · expandable · status-ruled (3px left rule).
**Sizes** per `--row-h-*`. **Anatomy** optional disclosure (30px) · identity (mono code + name) · data cells · trailing action.
**States** default · hover · focus-within · active · recorded · error.
**A11y** Real `<tr>`/`<td>` with `scope`; the disclosure is a `<button aria-expanded>`; the whole row is not a link (put the link on the identity cell) so cell text stays selectable.

### B15. ResponsiveTable (NEW)

Wraps a table and applies transformation **A**, **B** or **C** per `04-responsive-spec.md` §4. Props: `transform`, `identityColumn`, `priorityColumns[]`, `virtualise`.
**Required:** sticky identity column for transform C; `scope="col"`/`scope="row"`; a caption or `aria-labelledby`; scroll containers are focusable with `tabindex="0"` and labelled.
**Don't** apply the current global `display:block; white-space:nowrap` mobile treatment — it destroys table semantics.

### B16. FilterBar → SavedViews + Narrow (REPLACES `WorkOrderFilterBar`)

**Anatomy** saved-view chips (ink-filled when active) · active narrowing chips (accent outline, removable) · a `＋ narrow` control · live result count.
**Behaviour** applies live; URL-synced; no Apply button; ≤767px collapses to one "Narrow" button showing the active count, opening a sheet.
**A11y** count in `aria-live`; each chip's accessible name states what removing it does.
**Don't** render a full filter panel at zero results, or above the content on a phone.

### B17. StatusChip

**Purpose** The single status expression. **Anatomy** glyph (`aria-hidden`) + text.
**Variants** the six of §A4. **Sizes** `sm` 24px (tables) · `md` 30px (headers).
**Rule** text is mandatory; colour is never the only signal; wine is never used.

### B18. Badge (CHANGED)

Keep for category labels only. **Rename `tone="gold"` → `tone="wine"`** and remove it from status use. Status goes through `StatusChip`. ~12 call sites plus `/styleguide`.

### B19. ProvenanceBadge (NEW)

`measured` / `≈ estimated`, tokens per §A5, 11–12px pill. Required on every derived quantity. Tooltip and `aria-describedby` carry the derivation ("30 L ÷ 21 barrels, keg K-3, 27 Jul").

### B20. TaskCard / WorkOrderRow

Desktop → `DataRow`; ≤767 → card. **Anatomy** mono number · title · where (group + count) · progress bar with `9/60` · who · due · status chip · primary verb.
Progress bar: 6px tall, `--paper-200` track, `--status-active-fg` fill, always paired with the numeric text.

### B21. VesselIdentityBlock (NEW)

**Purpose** Answer "am I at the right vessel?" **Anatomy** code (`--font-display` 32–36px on a detail page, mono 14px inline) · lot code and wine name · group and location · for barrels: cooperage · oak origin · cooperage year · toast level.
**Rule** A tank tile or barrel row always shows its **lot**, not just its code. "Where is the Syrah?" must be answerable without opening anything.
**States** occupied · empty · needs attention · unknown wine (partial data).

### B22. FillIndicator (NEW)

Vertical fill for a vessel tile or detail. Height encodes volume; a hairline marks the level; volume text always accompanies it. Barrels use it advisorily only — a barrel may never be blocked for being "full".

### B23. GroupRibbon (NEW)

**Purpose** N members in one strip. **Sizes** tile ≥10×14px, 3px gap; 20 cols ≤767, 30 cols ≥768.
**States per tile** not yet · recorded · recorded with note · flagged · current position.
**Interaction** tap to jump; keyboard `←/→` moves, `Enter` jumps.
**A11y** `role="list"`, each tile `role="listitem"` with an `aria-label`; **supplementary only** — the same information exists in counts and the member table.

### B24. StageIndicator (NEW)

Six segments — Harvest · Ferment · Press · Age · Blend · Bottle. Solid = recorded, hollow = planned, accent = current. Always labelled underneath; never colour-only.

### B25. Alert

**Variants** info · warning · danger · success. **Anatomy** glyph · title stating the object and what happened · body stating the ledger consequence · actions.
**Rule** every error names the object, says whether anything was written, and offers the resolving action.
**A11y** `role="alert"` for errors, `role="status"` for success. Never colour-only.

### B26. ActionReceipt (NEW — replaces ad-hoc per-screen success strings)

**Purpose** Persistent confirmation of a recorded act. There is no app-wide toast system today; success is re-implemented across ~69 sites.
**Anatomy** glyph · "X recorded — 218 L into T-04" · "Written to the lot ledger at 12:47 by you." · **Correct this entry** · **See the ledger line**.
**Behaviour** persistent until dismissed or superseded — not a 4-second toast. A ledger write deserves a receipt, not a flash.
**A11y** `role="status"`, focusable, ≥48px actions.

### B27. ConfirmDialog (NEW) and ConfirmButton (CHANGED)

`ConfirmDialog` for irreversible and compliance acts: restates object, scope and consequence; the confirm button names the act ("Archive CH-NEUTRAL-14"), never "OK".
`ConfirmButton` keeps the two-step inline pattern for reversible bulk acts, but **must** lose the 4-second auto-disarm (WCAG 2.2.1 and a mis-click trap caused by the layout shifting back) and **must** name its object instead of a bare "Delete".

### B28. CorrectionDialog (NEW)

Old value → new value, required reason, plain statement of downstream effect ("the 20 other barrels on this keg re-estimate to 1.50 L each"), and the blocked-correction variant naming the later operation with a LIFO unwind action.

### B29. Skeleton (NEW)

Matches the real element's box exactly so nothing shifts on resolve. `--paper-200`, `--radius-xs`, 1.6s pulse, disabled under reduced motion. Paired with a text line ("Loading your work orders…") in an `aria-live="polite"` region.
**Required:** `loading.tsx` for every heavy route. There is one across 57 routes today.

### B30. EmptyState

**Anatomy** what is true · why · 1–2 next actions. Never a dead end.
The `/work-orders` empty state is already exemplary and is the model. The field-notes "Ask an admin to assign your vineyard" dead end is the anti-model: name the admin, offer a request action.

### B31. CommandPalette (NEW)

640px wide, max 60vh, ink surface `--ink-900`, `--radius-lg`, `--shadow-xl`. Groups **Do → Go to → Ask**, each with a visible heading; 5 rows per group with "more"; row 48px with icon, label and disambiguating subtitle; a footer key legend.
**A11y** per `03-interaction-spec.md` §2.

### B32. AIProposalCard (NEW)

**Anatomy** state label ("Draft — nothing created yet") · title · rationale · what it would change (a diff list) · primary "Review & create" · secondary "Edit" · tertiary "Dismiss" · footer "A draft changes nothing until you confirm it."
**Rule** the primary action navigates to the created draft. Never sparkles, never a gradient, never a permanently open panel.

### B33. ProvenancePanel (NEW)

The evidence behind an AI statement: 2–5 chips or rows, each naming a real record and linking to it ("5 Brix readings, 22–27 Jul", "WO #171 fill volumes", "vessel register"). If provenance cannot be produced, the statement is not shown.

### B34. LineageNode / LineageEdge (NEW)

Node: 180–250px card, mono kicker naming the event class (`SPLIT · PRESS 14 OCT`), title, 1–2 facts. Border `--border-strong`; split nodes 1.5px `--accent`; blend nodes 1.5px `--maroon`; planned nodes dashed.
Edge: 1.5–2px path. Continuation `--paper-400` solid; split `--accent`; blend `--maroon`; planned `--paper-400` dashed `5 4`. Legend is mandatory and names every edge type in words.

### B35. EventHistoryItem (NEW)

`when · what happened · quantity + provenance badge · who · work order`. Corrections appear as their own rows showing old → new and the stated reason — history is never rewritten in place.

---

## PART C — COMPOSITION RULES

1. **Chrome comfortable, data dense.** Never compress the page header to fit more rows.
2. **One accent.** Wine appears as the brand mark and the single primary action per view. If two wine buttons are visible, one is wrong.
3. **Status is text + glyph + hue, in that order of importance.**
4. **Every derived number carries a provenance badge.**
5. **Identity is never truncated.** Truncate description instead.
6. **No card-in-card.** A list of objects is rows in one card.
7. **Icons only on domain destinations and act types.** Never on buttons, labels or ordinary rows.
8. **44px, always.** If a design cannot fit 44px targets, the design is wrong, not the rule.
