---
title: CSV import — category drift prevention (reference list + "did you mean" suggestions)
type: feat
status: completed
date: 2026-06-21
branch: feat/csv-category-drift-prevention
depth: standard
units: 4
---

## Overview

Extend the just-shipped bulk CSV inventory import so users stop spawning near-duplicate
categories ("Merch" vs "Merchandise" vs "merch."). Two additions: (1) show the existing
category list right in the import modal as copy-paste-able chips so users reuse what's
there, and (2) on upload, fuzzy-match each unrecognized category against existing ones and
offer a per-value "You entered X — did you mean Y?" accept/reject before importing.

## Problem Frame

The category field is a free-text registry (`FinishedGoodCategory.name`, unique). The
import already does case-insensitive find-or-create, so "wine" reuses "Wine" — exact-case
dupes are already prevented. The gap is *near* duplicates: typos, spacing, punctuation, and
abbreviations all create brand-new categories. Over a few uploads the category list turns
into a mess, which breaks the category filter on the inventory table and the per-category
reporting. Doing nothing means slow, silent drift that's annoying to clean up later (you'd
have to re-categorize items by hand). The user explicitly asked for this guardrail.

The same drift applies to **Location** (also a free-text unique registry, also already
passed into the modal). The fix is near-identical, so we generalize and apply it to both.

## Requirements

- MUST: The import modal shows the current list of existing categories the user can copy
  from, distinct from the example template row.
- MUST: Users can still type/keep a brand-new category — suggestions never block import.
- MUST: On upload, each category value that is NOT an exact (case-insensitive) match to an
  existing category is fuzzy-matched; if a close existing match is found, the preview shows
  "You entered X — did you mean Y?" with accept (remap to Y) and reject (keep X) controls.
- MUST: Accept/reject is per distinct category value, not per row (one decision applies to
  every row with that value). Rejecting keeps the new category and imports normally.
- MUST: The reserved "Wine" keyword is never flagged as a suggestion (it's the kind switch).
- SHOULD: Apply the same reference-list + suggestion treatment to Location.
- SHOULD: Fuzzy match is normalization-aware (case, surrounding whitespace, collapsed inner
  spaces, trimmed trailing punctuation) before edit-distance scoring.
- NICE: A "copy" affordance on each existing-category chip (click to copy to clipboard).

## Scope Boundaries

**In scope:**
- `ImportCsvModal.tsx`: reference panel, suggestion UI, per-value remap state, payload rewrite.
- A new pure, unit-tested similarity helper.
- Apply both features to Category and Location (they share the mechanism).

**Out of scope:**
- Server action changes. The remap happens client-side by rewriting `row.category` /
  `row.location` before calling `importInventory`; the existing case-insensitive
  find-or-create then reuses the canonical record. No schema or action edits needed.
- Merging/deduping categories that *already* exist in the DB (this prevents *new* drift; it
  does not clean up historical dupes — that's a separate maintenance task).
- Fuzzy matching of item names or vintages. Categories + locations only.
- Embedding the reference list inside the downloaded CSV file (see Key Decisions — rejected
  because extra rows would be parsed as data and error out).

## Research Summary

### Codebase Patterns
- **"Category" = `FinishedGoodCategory.name`** (`prisma/schema.prisma:303-312`), unique,
  referenced by `WineSku.categoryId` (optional) and `FinishedGood.categoryId` (required).
  "Wine" (case-insensitive) is special: it routes a row to `BOTTLED_WINE`
  (`src/lib/inventory/csv.ts:194`).
- **The modal already has the data client-side.** `ImportCsvModal({ categories, locations })`
  receives `Array<{name}>` for both (`ImportCsvModal.tsx:24-30`), fed from
  `InventoryClient.tsx:165` ← `page.tsx:28`. So the reference list and fuzzy matching need
  **no new fetch** — the existing lists are right there.
- **Exact-CI matching already exists** in the preview: `existingCats`/`existingLocs` are
  lowercased Sets, and `newCats`/`newLocs` are the values not in them
  (`ImportCsvModal.tsx:40-50`). The "Will create N new category(ies)" line
  (`ImportCsvModal.tsx:152-157`) already surfaces unmatched values — the "did you mean"
  layer slots directly on top of `newCats`/`newLocs`.
- **Server reuse is automatic.** `ensureCategory`/`ensureLocation` use `ciName` (case-
  insensitive `findFirst`) before create (`actions.ts:225-253`). If the client rewrites
  "Merch" → "Merchandise", the server finds and reuses the existing "Merchandise".
- **Template mechanism**: `ExportCsvButton` (`src/components/ui/ExportCsvButton.tsx`) takes
  `columns` + `rows` and downloads a BOM-prefixed CSV. The template is a single example row
  (`ImportCsvModal.tsx:19`).
- **Test framework**: `test/inventory-csv.test.ts` exists (node:test style, pure functions).
  The similarity helper should follow the same pure-function/unit-test pattern.

### Prior Learnings
No category-drift or fuzzy-match learnings on file. The CSV import itself was just built
(commits `03b4eba`..`77b5768`), and the last commit already addressed case-dupes and
validation parity — this plan is the next layer (near-dupes).

### External Research
None needed. Edit-distance (Levenshtein) is standard; no new dependency required — a small
pure implementation keeps the bundle lean and stays unit-testable.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Where the reference list lives | In-modal panel of copyable chips | Embed existing categories as rows in the downloaded CSV | Extra CSV rows get parsed as data and error in the preview; a CSV has no clean "reference" region. An in-modal panel is visible exactly when uploading, can't corrupt parsing, and still satisfies "copy and paste those in." |
| Where remapping happens | Client-side (rewrite row value before `importInventory`) | New server param / server-side fuzzy match | Lists are already client-side; server already reuses canonical records via CI find-or-create. Zero action/schema changes, fully testable in the UI, no trust issue (server still re-validates). |
| Suggestion granularity | Per distinct category value | Per row | 50 rows of "Merch" should ask once, not 50 times. One decision maps to all rows with that value. |
| Match algorithm | Normalize (lowercase, trim, collapse inner spaces, strip trailing punctuation) then normalized Levenshtein similarity | Raw Levenshtein; trigram/Jaccard; external lib | Normalization catches the common cases (spacing/case/punctuation) cheaply; normalized edit-distance handles typos. Small pure fn, no dependency. |
| Match threshold | Suggest only when similarity ≥ ~0.8 AND not an exact CI match AND not "Wine" | Always suggest top match; lower threshold | High threshold avoids noisy/wrong suggestions ("Apparel" vs "Barrel"). Tunable constant; covered by tests. |
| Scope of treatment | Category **and** Location | Category only (as literally asked) | Same registry shape, same drift, lists already present — generalizing is near-free and the user's intent (prevent drift) applies equally to locations. |

## Implementation Units

### Unit 1: Fuzzy-match helper (pure, tested)

**Goal:** A pure function that, given a candidate string and a list of existing names,
returns the closest existing name and its similarity score — with normalization and a
threshold — so the UI can decide whether to suggest a remap.
**Files:** `src/lib/inventory/similarity.ts` (new); `test/inventory-similarity.test.ts` (new).
**Approach:** Export `normalize(s)` (lowercase, trim, collapse runs of whitespace to one
space, strip trailing punctuation/periods) and `closestMatch(value, candidates, opts?)`
returning `{ match: string; score: number } | null`. Internals: normalized Levenshtein
distance → similarity `1 - dist/maxLen`. Return the best candidate whose score ≥ threshold
(default ~0.8) and that is not a normalized-exact match (exact matches need no suggestion).
Keep it dependency-free and side-effect-free, mirroring `csv.ts`'s pure-function style.
**Tests:** name input/expected for each: exact-CI ("Wine"/["Wine"]) → null (no suggestion
needed); near-dup ("Merch"/["Merchandise"]) → suggest "Merchandise"; spacing/case
("t shirt"/["T-Shirt"]) → suggest "T-Shirt"; unrelated ("Barrel"/["Apparel"]) → null
(below threshold); empty candidates → null; ties resolve to highest score deterministically.
**Depends on:** none
**Execution note:** test-first
**Patterns to follow:** `src/lib/inventory/csv.ts` (pure, exported types, no DB);
`test/inventory-csv.test.ts` (test layout).
**Verification:** the new test file passes; `npm run lint` clean.

### Unit 2: Existing-category/location reference panel in the modal

**Goal:** Before/at upload, the modal shows the current categories and locations as a
compact, copyable reference so users reuse existing names instead of inventing new ones.
**Files:** `src/app/(app)/inventory/ImportCsvModal.tsx`.
**Approach:** Add a reference section (shown in the pre-import view, near the template
button / column help at lines ~138-146) listing `categories` and `locations` as small
chips. Each chip copies its name to the clipboard on click (with a brief "copied" cue).
Sort alphabetically; if a list is empty, show a muted "none yet" note. Reuse existing
inline style tokens (`var(--text-muted)`, `Badge`) — no new design primitives.
**Tests:** none (presentational); covered by manual verification.
**Depends on:** none
**Patterns to follow:** chip/badge usage via `Badge` from `@/components/ui`; the existing
help paragraph block at `ImportCsvModal.tsx:143-146`.
**Verification:** open the modal with seeded categories/locations; chips render and copy.

### Unit 3: "Did you mean" suggestions + per-value remap (Category)

**Goal:** For each distinct category value in the upload that isn't an exact existing match,
offer a suggestion to remap to the closest existing category; apply the user's choice to all
rows with that value before import.
**Files:** `src/app/(app)/inventory/ImportCsvModal.tsx`.
**Approach:** Derive suggestions from the existing `newCats` memo (`ImportCsvModal.tsx:43-46`):
for each distinct unmatched category, call `closestMatch(value, categories.map(c=>c.name))`
(skip the reserved "Wine"). Hold remap state `Map<originalValue, chosenCanonical|null>`
(null = rejected/keep). Render a suggestions block above the preview table: one row per
distinct value — "You entered **X** — did you mean **Y**?" with Accept / Keep "X" buttons.
The preview table reflects the effective category (show remapped value, maybe a subtle
"→ Y" marker). On import, build the payload by mapping each row's category through the remap
map (default = original) and pass to `importInventory`. The server's CI find-or-create then
reuses the canonical category. Keep "Will create N new categories" accurate by excluding
accepted remaps.
**Tests:** none new at unit level (logic is exercised via the Unit 1 helper tests); add the
remap-application as a small pure helper inside the module only if it simplifies testing.
**Depends on:** Unit 1
**Patterns to follow:** existing `newCats`/`existingCats` memoization
(`ImportCsvModal.tsx:40-50`); `startTransition`/`doImport` payload flow
(`ImportCsvModal.tsx:92-103`).
**Verification:** upload a CSV with "Merch" when "Merchandise" exists → suggestion appears;
Accept → preview shows Merchandise and "new categories" no longer lists it; import reuses
the existing category (no new one created — confirm via the import summary `newCategories`).

### Unit 4: Extend suggestions + reference to Location

**Goal:** Same reference + "did you mean" guardrail for the Location column.
**Files:** `src/app/(app)/inventory/ImportCsvModal.tsx`.
**Approach:** Mirror Unit 3 using `newLocs`/`locations` and a parallel location remap map;
no "Wine" exclusion applies. Factor the suggestion-row rendering and remap state into a
small shared piece so Category and Location don't duplicate logic. Rewrite `row.location`
through the location remap on import alongside the category remap.
**Tests:** covered by Unit 1 helper tests (same function) + manual verification.
**Depends on:** Unit 3
**Patterns to follow:** Unit 3's structure.
**Verification:** upload with a near-dup location → suggestion appears, accept remaps,
import reuses the existing location.

## Test Strategy

**Unit tests:** `test/inventory-similarity.test.ts` covers `normalize` and `closestMatch`
(exact → null, near-dup → suggest, unrelated → null, threshold edges, empty list, tie
determinism). Run with the existing test runner used by `test/inventory-csv.test.ts`.
**Integration tests:** none automated (the import action is unchanged; remap is client-side).
**Manual verification (end-to-end):**
1. Seed/confirm existing categories (e.g. "Wine", "Merchandise") and locations.
2. Open Import CSV → reference panel lists them; clicking a chip copies the name.
3. Upload a CSV with "Merch" and a near-dup location → suggestions render with the right
   "did you mean" targets; "Wine" is never suggested.
4. Accept a suggestion → preview reflects the canonical name; "Will create N new…" updates.
5. Reject a suggestion → the new category/location is kept and created on import.
6. Import → summary `newCategories`/`newLocations` reflects only the genuinely-new values;
   accepted remaps reused the existing records (no near-dup created).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Over-eager suggestions (wrong "did you mean") annoy users | MED | LOW | High threshold (~0.8), normalization first, suggestions are always opt-in (reject keeps original); threshold is a single tunable constant covered by tests. |
| User wanted the list *inside* the downloaded file, not the modal | MED | LOW | Flag in the human gate; the in-modal panel satisfies the copy-paste goal. Embedding-in-CSV remains a fast follow if they insist (would need parser to skip a reference block). |
| Large category list makes the panel noisy | LOW | LOW | Alphabetical, compact chips, scrollable; only shown in the pre-import view. |
| Remap map drift if user edits file/re-uploads | LOW | LOW | Reset remap state on new file selection (hook into existing `onFile`/`reset`). |

## Success Criteria

- [ ] Import modal shows existing categories and locations as copyable reference chips.
- [ ] Uploading a near-duplicate category surfaces a "You entered X — did you mean Y?" prompt.
- [ ] Accepting remaps every row with that value to the canonical name; rejecting keeps it.
- [ ] "Wine" is never offered as a suggestion.
- [ ] Accepted remaps reuse the existing DB record (import summary shows no new near-dup).
- [ ] Location gets the same reference + suggestion treatment.
- [ ] `normalize`/`closestMatch` unit tests pass.
- [ ] No regressions in `test/inventory-csv.test.ts`; `npm run lint` and `npm run build` clean.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | "Category" mapping and drift mechanism confirmed in schema + actions. |
| Scope Boundaries | HIGH | Lists already client-side; server unchanged — small, contained surface. |
| Implementation Units | HIGH | Each unit ≤1-2 files; slots onto existing `newCats`/`newLocs` memos. |
| Test Strategy | MEDIUM | Helper is fully unit-tested; UI remap relies on manual verification (no component test harness in repo today). |
| Risk Assessment | HIGH | Main risk is UX tuning of the threshold, mitigated by opt-in + tests. |
