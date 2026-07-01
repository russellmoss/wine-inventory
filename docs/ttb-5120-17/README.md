# TTB F 5120.17 — Report of Wine Premises Operations (reference)

Source form for **Phase 14 (Compliance & reporting)**. This folder is reference material only —
the build plan is **not** here; the form-accurate Phase 14 runbook lives in `ROADMAP.md` (Phase 14),
and it gets the full `/plan → /council → /plan-eng-review` pipeline when it's scheduled (after the
universal-timeline-undo work, plan 024).

Contents:
- `TTB-5120.17.pdf` — the official form (TTB F 5120.17sm, 09/2025; "for activity on or after 01/01/2018").
- `TTB-5120.17-extracted-text.txt` — `pdftotext -layout` extraction (structure/labels).
- `page-1.png`, `page-2.png` — rendered pages (150 dpi) for visual layout.

## Structure (build-ready summary)

All of Part I is **US wine gallons** — the app stores litres, so Phase 14 converts L→gal
(÷ 3.785411784) and derives **tax class from ABV**.

**Part I tax-class columns:** (a) ≤16% · (b) >16–21% (incl.) · (c) >21–24% (incl.) ·
(d) artificially carbonated · (e) sparkling (split **BF** bottle-fermented / **BP** bulk-process) ·
(f) hard cider.

- **Part I §A — Bulk wines:** on-hand begin → produced by (fermentation / sweetening / addition of
  wine spirits / blending / amelioration) → received in bond, bottled-wine-dumped-to-bulk, inventory
  gains → TOTAL → bottled (=§B line 2), removed taxpaid, transfers in bond, removed for distilling
  material / to vinegar, used for (sweetening / spirits / blending / amelioration / effervescent /
  testing) → losses, inventory losses → on-hand end.
- **Part I §B — Bottled wines:** on-hand begin → bottled (BF/BP) → received in bond, taxpaid returned
  to bond → TOTAL → removed taxpaid, transferred in bond, dumped to bulk, used for tasting, removed
  for export / family use, used for testing → breakage, inventory shortage → on-hand end.
- **Part III** wine/distilled spirits (proof gal) · **Part IV** materials received/used (grapes
  uncrushed lbs / field-crushed gal / juice / concentrate / sugar → maps to harvest picks + crush) ·
  **Part VI** distilling material & vinegar stock · **Part VII** in-fermenters end-of-period ·
  **Part VIII** nonbeverage · **Part IX** special-natural / 27 CFR 24.218 (vermouth) · **Part X** remarks.

## Rules to encode (footnotes)
- §A line 13 must equal §B line 2 (bottled quantities reconcile).
- Report **blending only when different tax classes are combined** (ftn 5) — affects BLEND ops.
- Sparkling splits BF (fermented in bottle) vs BP (bulk process) (ftn 2).
- Hard cider = CO₂ ≤ 0.64 g/100 mL, apple/pear, 0.5–<8.5% ABV (ftn 1).
- Inventory shortages/losses need a Part X explanation (ftn 4).
- Cadence: monthly; quarterly/annual only under 27 CFR 24.300(g)(2).

## App-mapping hooks (for `/plan` time)
- Each `LotOperation` type → a §A/§B line, keyed by the lot's ABV→tax-class and bulk-vs-bottled state.
- `on-hand begin/end` = the period-boundary folds of `vessel_lot` (bulk) + `bottled_lot_state` (bottled).
- Crush / harvest picks → Part IV. `BLEND` reports on line 5/20 only when it crosses tax classes.
