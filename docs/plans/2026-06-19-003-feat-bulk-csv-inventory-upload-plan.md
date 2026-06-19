---
title: Bulk CSV Inventory Upload
type: feat
status: draft
date: 2026-06-19
branch: feat/bulk-csv-inventory-upload
depth: standard
units: 4
---

## Overview

Add a bulk CSV upload to the Inventory page so the user can load a whole cellar at once instead of hand-entering wines one at a time. Drop in a CSV, see a preview of exactly what will be created/received, confirm, and the rows flow through the existing stock ledger (`receiveStock`) as RECEIVE movements. Build for wine now, but make the parser and import branch on category so finished goods (merch) come along for free later.

## Problem Frame

Right now stock enters only through three single-row forms ("New wine SKU", "New item & category", "Move stock"). Seeding an entire inventory means dozens of manual round-trips. The user already keeps inventory in a spreadsheet (`Inventory - Sheet1.csv`: `Item, Category, Location, Quantity`, e.g. `2024 Chateau Bon Vivant, Wine, Wine Bar, 100`). The job to be done: "I have a spreadsheet of my cellar, let me push the whole thing in and trust what landed." Doing nothing means slow, error-prone manual entry and no easy re-stock path.

## Requirements

- MUST: A downloadable CSV template with the exact expected columns and one example row.
- MUST: An upload control on the Inventory page that accepts a `.csv`, parses it client-side, and shows a preview before any write.
- MUST: Each valid row creates-or-reuses the wine (`WineSku` by name+vintage+750ml) and location, then records a RECEIVE stock movement and updates the cached balance via the existing `receiveStock()` path (audit included).
- MUST: An explicit `Vintage` column (see Key Decisions). Wine rows require a valid vintage (1900–2027, matching `parseVintage`).
- MUST: Validation surfaces bad rows with row number + reason; nothing is silently dropped. Invalid rows are skipped and reported, valid rows still import.
- MUST: Accept the user's existing file shape too — if `Vintage` is absent/blank, parse a 4-digit year out of the `Item` text (so `2024 Chateau Bon Vivant` still works).
- SHOULD: Make the importer branch on category so a non-"Wine" category maps to a `FinishedGood` (no vintage). Wine is the only path exercised now.
- SHOULD: Tell the user clearly that imported quantities are RECEIVED (added) on top of current on-hand, so re-uploading the same file adds again.
- SHOULD: Find-or-create the `Location` by name (locations are a unique-name registry); show any newly created locations in the preview/summary.
- NICE: Cap the file at a sane row count (e.g. 2000) with a clear message instead of choking.

## Scope Boundaries

**In scope:**
- CSV template download, upload + parse + preview UI, and the import server action.
- Wine bulk import end to end. Finished-goods branch wired but only lightly exercised.
- A pure, unit-tested CSV parsing/validation helper.

**Out of scope:**
- No Prisma schema change and no migration (reuses `WineSku` / `BottledInventory` / `StockMovement` / `Location` / `FinishedGoodCategory`).
- No update/upsert-by-quantity semantics (import is always additive RECEIVE, never "set to"). Editing stays in the existing inline-edit flow.
- No new CSV dependency (papaparse etc.) — hand-rolled RFC-4180-ish parsing, matching the existing `ExportCsvButton` escaping style.
- No background/streaming jobs; synchronous import is fine at this scale.

## Research Summary

### Codebase Patterns
- **Inventory page:** `src/app/(app)/inventory/page.tsx` (server, parallel fetch) + `src/app/(app)/inventory/InventoryClient.tsx` (client). Export button + filters live at `InventoryClient.tsx:161-168`. The `run()` helper (`:44-50`) wraps server-action calls with pending/error state.
- **Write path (reuse, do not reinvent):** `src/lib/stock/movements.ts:103` `receiveStock(kind, itemId, locationId, qty, ctx, reason)` — opens its own `prisma.$transaction`, creates the `StockMovement`, upserts the cached balance (`increment()` `:68`), and writes the audit (`:112`). It already validates the location is active (`:108`).
- **Server actions only (no API routes):** mutations live in `src/lib/inventory/actions.ts`, wrapped by `action()` (`src/lib/actions.ts:35`) which injects `{ actor: { actorUserId, actorEmail } }`. They validate with inline helpers, run a `prisma.$transaction`, then `revalidatePath("/inventory")`.
- **Find-or-create patterns to mirror:** WineSku create + "Wine" category upsert at `actions.ts:50-56`; category create at `:33-41`. `parseVintage` (`:17`, 1900–2027), `parseInt10` (`:22`), `clean` (`:11`) are the validators to reuse.
- **Errors:** throw `ActionError(message, code)`; the client `run()` shows `e.message`. No HTTP status codes.
- **CSV today:** `src/components/ui/ExportCsvButton.tsx` — client blob download, UTF-8 BOM, `escapeCell` doubles quotes. Columns are passed as `{key,label}[]`. No CSV parser dependency exists.
- **UI kit:** `@/components/ui` exports `Card, Input, Button, Badge, Eyebrow, ConfirmButton, ExportCsvButton, Modal`. Styling is inline `React.CSSProperties` with `var(--token)` — not Tailwind classes. Modal pattern used in `BottlingClient.tsx`.

### Prior Learnings
No relevant prior learnings found (`rstack-learnings-search` returned none).

### External Research
None needed — Next.js 16 server actions + Prisma 6 patterns are already established in-repo and reused directly.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Vintage column | **Yes — explicit `Vintage` column**, with fallback to parsing a 4-digit year from `Item` when blank | (a) No column, always parse from name; (b) bake vintage into name | `WineSku` stores vintage as a structured `Int` and it's part of the unique key `(name, vintage, 750)`. Parsing names is fragile ("Chateau 1947 Reserve"). Explicit column is reliable and round-trips; fallback keeps the user's existing file working. |
| Wine vs other categories | Branch on **Category name**: `Wine` (case-insensitive) → `BOTTLED_WINE` (`WineSku`); any other category → `FINISHED_GOOD` (`FinishedGood`) | A separate `Kind` column in the template | The data already models this split (`ItemKind`). Category-as-discriminator keeps the template clean for the wine-only use now and makes merch import a no-op extension later. |
| Atomicity | **Per-row** RECEIVE (each `receiveStock` is its own tx); validate-all-first, then import valid rows, collect per-row failures | One giant transaction | `receiveStock` isn't tx-aware, and per-row lets a mostly-good file land while reporting the few bad rows. Client-side validation catches nearly everything before any write. |
| Location handling | **Find-or-create by name** (`location.upsert` on unique `name`); list new locations in the preview | Error on unknown location | Smoothest bulk path; the preview makes new locations visible so typos are catchable before commit. |
| Import semantics | Always **additive RECEIVE** (never "set to") | Upsert-to-quantity | Matches the ledger's meaning of "received new stock" and keeps the audit trail honest. Warn the user it's additive. |
| CSV parsing | **Hand-rolled** parser in a pure helper | Add `papaparse` | No new dependency; handles quoted fields/commas/BOM, mirrors `ExportCsvButton` escaping. Pure function = easy Vitest coverage. |

**Template columns:** `Item, Vintage, Category, Location, Quantity`
Example row: `Chateau Bon Vivant, 2024, Wine, Wine Bar, 100`

## Implementation Units

### Unit 1: CSV parse + validate helper (pure, tested)

**Goal:** A pure function that turns raw CSV text into validated, typed rows plus per-row errors — the testable core of the feature.
**Files:** `src/lib/inventory/csv.ts` (new)
**Approach:** Export `parseInventoryCsv(text: string): { rows: ParsedInventoryRow[]; errors: RowError[] }`. Strip a leading BOM. Split into records honoring double-quoted fields (commas/newlines inside quotes, `""` escapes) — inverse of `ExportCsvButton.escapeCell`. Map headers case-insensitively to `Item, Vintage, Category, Location, Quantity` (tolerate extra/trailing columns; require Item/Category/Location/Quantity). Per row: trim cells; require non-empty Item/Category/Location; `Quantity` must be a positive integer (reuse the spirit of `parseInt10`/`assertCount`); if `Category` is "Wine" (case-insensitive) require a vintage — from the `Vintage` cell, else extract a single 4-digit year (1900–2027) from `Item` and strip it from the name; non-wine rows ignore vintage. Each `ParsedInventoryRow` carries `{ lineNo, kind: ItemKind, name, vintage?, category, location, qty }`. Skip fully blank lines. Cap at 2000 data rows (return an error past that). No DB access here.
**Tests:** see Unit 4.
**Depends on:** none
**Patterns to follow:** `ExportCsvButton.tsx:16-19` (escaping, BOM), `inventory/actions.ts:17-26` (validation thresholds), `stock/movements.ts:6` (`ItemKind`).
**Verification:** `npm run test` (Unit 4 covers it); `npx tsc --noEmit` clean.

### Unit 2: `importInventory` server action

**Goal:** Take validated rows and land them through the existing ledger, returning a summary the UI can show.
**Files:** `src/lib/inventory/actions.ts` (add export), maybe a small `src/lib/inventory/import.ts` if it keeps `actions.ts` tidy.
**Approach:** `export const importInventory = action(async ({ actor }, rows: ParsedInventoryRow[]) => {...})`. Re-validate server-side (never trust the client): cap count, re-check fields/qty/vintage. For each row: upsert `FinishedGoodCategory` by name; upsert `Location` by unique `name` (default active) — track which were newly created; resolve the item — wine: upsert `WineSku` by `name_vintage_bottleSizeMl` (vintage, 750) with `categoryId` set like `actions.ts:50-56`; good: find-or-create `FinishedGood` by `(name, categoryId)`. Then call `receiveStock(kind, itemId, locationId, qty, actor, "CSV import")`. Wrap each row in try/catch; collect `{ lineNo, error }` failures, counts of `received`, and lists of `newSkus`/`newLocations`/`newCategories`. `revalidatePath("/inventory")`. Return the summary object (server actions can return JSON, cf. `users/actions.ts createUser`).
**Tests:** logic is mostly orchestration over `receiveStock`; covered by manual verification + Unit 1 unit tests for parsing. (No DB test harness exists in repo.)
**Depends on:** Unit 1 (shares `ParsedInventoryRow` type).
**Patterns to follow:** `inventory/actions.ts:43-70` (upsert + create + audit), `stock/movements.ts:103` (`receiveStock`).
**Verification:** From the UI (Unit 3), import the sample file; confirm new rows appear on-hand with correct quantities and an `audit_log` STOCK_MOVEMENT entry per row (`npm run db:studio`).

### Unit 3: Upload UI (modal + template download) on the Inventory page

**Goal:** A clear upload → preview → confirm flow next to the existing Export button.
**Files:** `src/app/(app)/inventory/ImportCsvModal.tsx` (new client component), `src/app/(app)/inventory/InventoryClient.tsx` (wire in button near `:161-168`).
**Approach:** Add an "Import CSV" `Button` and a "Download template" control beside `ExportCsvButton`. Template download = reuse `ExportCsvButton` with columns `Item, Vintage, Category, Location, Quantity` and one example row (`Chateau Bon Vivant, 2024, Wine, Wine Bar, 100`), filename `inventory-template.csv`. Clicking Import opens a `Modal` (from `@/components/ui`) with `<input type="file" accept=".csv">`. On file pick, read text (`file.text()`), run `parseInventoryCsv` (Unit 1), render a preview table: valid rows normal, invalid rows flagged red with their reason; a banner notes "Quantities are RECEIVED (added) to current on-hand" and lists any locations/categories that will be created. The confirm button reads "Import N valid rows" (N excludes invalid), disabled when N=0 or pending; it calls `importInventory(validRows)` via the `run()`/`useTransition` pattern, then shows the returned summary (received count, new SKUs/locations, any server-side row errors) and lets the user close. Styling: inline `var(--token)` styles, matching the surrounding table/`sel` styles.
**Tests:** manual (see Test Strategy).
**Depends on:** Units 1 and 2.
**Patterns to follow:** `InventoryClient.tsx:44-50` (`run`), `BottlingClient.tsx` (Modal usage), `InventoryClient.tsx:193-262` (table styling), `ExportCsvButton.tsx` (download).
**Verification:** `npm run dev`, open `/inventory`, download template, upload the sample file, preview shows 1 valid row, import lands `Chateau Bon Vivant 2024` at `Wine Bar` qty 100.

### Unit 4: Tests for the CSV parser

**Goal:** Lock the parsing/validation contract.
**Files:** `test/inventory-csv.test.ts` (new)
**Approach:** Vitest (`describe/it/expect`, `import { parseInventoryCsv } from "@/lib/inventory/csv"`). Scenarios: (1) clean template row → one valid wine row, name without year, vintage 2024; (2) user's file shape `2024 Chateau Bon Vivant, Wine, Wine Bar, 100` (no Vintage column) → vintage parsed from name, name = "Chateau Bon Vivant"; (3) quoted field containing a comma → parsed as one cell; (4) missing/zero/negative/non-integer Quantity → row error with line number; (5) wine row with no resolvable vintage → row error; (6) non-"Wine" category → `FINISHED_GOOD`, vintage ignored; (7) blank lines skipped; (8) header order/case variations; (9) >2000 rows → cap error.
**Depends on:** Unit 1.
**Patterns to follow:** `test/audit.test.ts:1-10`.
**Verification:** `npm run test` green.

## Test Strategy

**Unit tests:** `test/inventory-csv.test.ts` against the pure `parseInventoryCsv` (Vitest, matching `test/audit.test.ts`). This is where correctness is pinned, since the repo has no DB/component test harness.
**Integration tests:** none added (no existing harness for server actions/DB).
**Manual verification:** `npm run dev` → `/inventory` → Import CSV → upload `Inventory - Sheet1.csv` → preview shows the row valid → Import → on-hand table shows `2024 Chateau Bon Vivant` at `Wine Bar`, qty 100; re-upload and confirm quantity goes to 200 (additive RECEIVE, as warned); check `audit_log` has STOCK_MOVEMENT rows via `npm run db:studio`.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Re-uploading double-counts stock (RECEIVE is additive) | MED | MED | Prominent preview banner; summary states "received N". Out-of-scope upsert-to-quantity noted. |
| Find-or-create location lets typos create junk locations | MED | LOW | Preview lists locations that will be created so the user catches typos before confirming. |
| Vintage parsed wrong from a name with multiple numbers | LOW | MED | Only accept a single standalone 4-digit year 1900–2027; otherwise error the row. Explicit `Vintage` column is the recommended path. |
| Hand-rolled CSV parser mishandles edge quoting | MED | MED | Unit 4 covers quotes/commas/newlines/BOM; mirror `ExportCsvButton` escaping exactly. |
| Large file blocks the request | LOW | MED | 2000-row cap with a clear error; synchronous is fine at cellar scale. |

## Success Criteria

- [ ] A "Download template" control returns `inventory-template.csv` with `Item, Vintage, Category, Location, Quantity` + example row.
- [ ] Uploading the user's `Inventory - Sheet1.csv` previews 1 valid row and imports `Chateau Bon Vivant 2024` at `Wine Bar`, qty 100.
- [ ] Invalid rows are listed with line number + reason and skipped; valid rows still import.
- [ ] Each imported row produces a `StockMovement` (RECEIVE) + balance update + audit entry.
- [ ] Importer branches to `FinishedGood` for non-"Wine" categories.
- [ ] `npm run test` and `npx tsc --noEmit` pass; no regressions.
