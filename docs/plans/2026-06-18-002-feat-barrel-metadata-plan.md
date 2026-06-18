# Plan: Barrel metadata

**Date:** 2026-06-18
**Branch:** `feat/barrel-metadata`
**Size:** Standard (3 units)

## Goal

Give barrels structured metadata, set on the Vessels setup page and visible
(read-only) when clicking into a vessel on the Bulk page.

Metadata fields (barrel-only):
- **Barrel #** — manual integer, unique among barrels (1, 2, 3, ...)
- **Volume** — *reuses existing `capacityL`*, displayed as "Volume" (no new column)
- **Oak origin** — free text (e.g. French, American, Hungarian)
- **Year of cooperage** — integer year
- **Cooperage** — free text (the barrel maker, e.g. Seguin Moreau)
- **Toast level** — free text (e.g. Light, Medium, Medium+, Heavy)

Tanks are unaffected: all new fields are nullable and only shown for barrels.

## Decisions (confirmed with user)

- Volume is the existing `capacityL` — relabel in barrel context, do **not** add a
  duplicate column (keeps fill math single-source).
- Barrel # is **manual entry**, validated unique across barrels. Stored as nullable
  `Int @unique` — Postgres treats NULLs as distinct, so tanks (null) never collide
  and real numbers stay unique. Action layer also pre-checks for a friendly error.

## Unit 1 — Schema + migration

`prisma/schema.prisma` — add to `model Vessel`:
```prisma
barrelNumber  Int?    @unique
oakOrigin     String?
cooperageYear Int?
cooperage     String?
toastLevel    String?
```
Then `npm run db:migrate` (name: `add_barrel_metadata`) to create + apply the
migration, and `npm run db:generate`.

**Verify:** migration file exists under `prisma/migrations/`, `prisma generate` clean.

## Unit 2 — Vessels setup page (write)

`src/lib/vessels/actions.ts`:
- Extend `parseInput` to read the new optional fields (only when `type === "BARREL"`).
  Validate `barrelNumber` is a positive integer if present; `cooperageYear` a sane
  year (1900..current+1) if present; trim text fields, treat empty as null.
- In `createVessel` / `updateVessel`: on barrels, pre-check `barrelNumber` uniqueness
  (excluding self on update) → `ActionError("Barrel # N is already in use.")`. Persist
  new fields in the `data` object. Include them in the audit `diff`/`summarize`.

`src/app/(app)/vessels/VesselsClient.tsx`:
- `VesselRow` type gains the new fields.
- Barrel **add** form: add Barrel #, Oak origin, Year of cooperage, Cooperage, Toast
  level inputs (rendered only for the BARREL `TypeCard`; tanks keep code+capacity only).
- Barrel **edit** modal: same fields with `defaultValue` from the selected row.
- Keep tank forms unchanged.

`src/app/(app)/vessels/page.tsx`: select + map the new fields into `VesselRow`.

**Verify:** create a barrel with full metadata; edit it; duplicate Barrel # rejected;
tank create/edit unchanged.

## Unit 3 — Bulk modal (read)

`src/app/(app)/bulk/page.tsx`: include new fields in the vessel query + map into
`VesselWithContents`.

`src/app/(app)/bulk/BulkClient.tsx`:
- `VesselWithContents` type gains the new fields.
- In the vessel modal (only when `type === "BARREL"`), render a read-only metadata
  block above/below the components table: Barrel #, Volume (`capacityL`), Oak origin,
  Year of cooperage, Cooperage, Toast level. Omit blank fields gracefully.
- Optionally surface Barrel # in the modal title/subtitle.

**Verify:** open a barrel on /bulk → all populated metadata shows; tanks show no
metadata block; empty fields don't render as blanks.

## Out of scope

- CSV export columns for the new metadata (can follow later).
- Backfilling existing barrels (all start null; user fills via edit).

## Success criteria

1. New barrel metadata persists and round-trips through create + edit.
2. Duplicate Barrel # is rejected with a clear message.
3. Bulk modal shows the metadata for barrels, hides it for tanks.
4. `npm run build` + `npm run lint` pass.
5. Tanks behave exactly as before.
