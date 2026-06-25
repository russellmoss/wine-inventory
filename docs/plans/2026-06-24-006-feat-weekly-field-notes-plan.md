---
title: Weekly Field Notes, Vineyard Reporting & Harvest Ledger
type: feat
status: completed
date: 2026-06-24
branch: feat/weekly-field-notes
depth: deep
units: 15
---

## Overview

Build a two-sided vineyard-operations system on top of the existing BWC Operating System. Vineyard managers in Bhutan get a fast, thumb-friendly mobile form to log one report every Friday (weather, sprays/fertilizers, per-block vine status, disease/pest photos), plus fast per-block harvest logging (Brix readings during ripening, then a final harvest record). Out-of-country admins get a desktop dashboard with an AI-generated "Weekly Call Briefing" (Claude), a drill-in modal per vineyard, and historic crop yields grouped by vintage year. The job to be done: turn a weekly field walk and a harvest season into structured data, and turn that data into a 3-bullet agenda the owner can act on in a phone call.

## Problem Frame

Right now there is no structured channel between the people who see the vines (managers) and the people who own the decisions (out-of-country admins). Knowledge lives in ad-hoc messages and memory. If we do nothing, problems like "we sprayed Mancozeb, then 40mm of rain washed it off, and nobody reconnected the dots" stay invisible until they show up as disease pressure or a bad vintage.

The real user is the manager on a phone, on bad signal, at the end of a long Friday. If the form is slow or loses data, they won't use it, and the whole intelligence layer is worthless. So the manager UX (speed, pre-population, draft safety) is the load-bearing part, not the AI.

**Product note:** the AI briefing is the flashy part but the durable value is the structured weekly time-series. Even with the AI turned off, 12 weeks of clean block-level data is worth more than any single summary. We build the data model to stand on its own.

## Requirements

- MUST: Add `role` (already exists) usage + `assignedVineyardId` to the user model; managers are scoped to one vineyard.
- MUST: Store weekly submissions with weather, sprays, fertilizers, per-block statuses (JSONB), general notes, and a nullable AI summary.
- MUST: Managers (`role = "user"`) see a mobile-first single-scroll create/view experience scoped to their assigned vineyard.
- MUST: Admins (`role = "admin"`) see a desktop dashboard: AI briefing on top, vineyard directory, click-to-modal raw data + photos.
- MUST: Sidebar gains a collapsible "Vineyards" section with `/vineyards/maps` (read-only), `/vineyards/field-notes`, and `/vineyards/harvest`.
- MUST: Harvest ledger — per-block Brix logging (quick numeric entry over the ripening window) and a final per-block harvest record (total weight + pick date + vintage year); admins view historic yields grouped by vintage year.
- MUST: Master lists for sprays (Mancozeb, Sulfur, Copper, Neem) and fertilizers (NPK, Epsom Salts) with on-the-fly add; new entries sanitized (strip special chars, UPPERCASE) and persisted.
- MUST: Pre-populate a new report from the previous week's report as a baseline.
- MUST: "Apply default healthy status to all blocks" master action.
- MUST: Disease/pest toggle reveals a description box + mobile camera photo upload.
- MUST: Claude integration analyzing this week + prior 3 weeks → "Weekly Call Briefing" with a 3-bullet agenda, stored in DB, rendered only to admins.
- MUST: Manager never blocked waiting on Claude (async generation after save).
- MUST: Local draft autosave so a dropped connection / closed tab never loses an in-progress report.
- SHOULD: Admin can reassign role + vineyard from the existing `/users` page.
- SHOULD: Admin can regenerate the AI briefing on demand.
- NICE (v2, flagged, out of scope here): full offline PWA with service worker + IndexedDB outbox sync.

## Scope Boundaries

**In scope:**
- Schema migration: `User.assignedVineyardId`, new `FieldNote` model, new `FieldInput` master-list model, new `BrixLog` + `HarvestRecord` models.
- Harvest ledger pages/actions: per-block Brix quick-log, final harvest record, admin yields-by-vintage.
- Server actions for create/read of field notes; `/users` assignment.
- Vercel Blob photo upload route + client capture.
- One API route for async Claude generation; the Anthropic client + prompt.
- Sidebar, two new pages, manager mobile form, admin dashboard, drill-in modal.
- `/vineyards/maps` read-only reuse of existing `SatelliteMap` / `BlockDetails`.
- localStorage draft autosave + submit retry.

**Out of scope (with reasons):**
- Full offline PWA / service worker / background sync — large, separate effort; v1 draft autosave covers the actual data-loss failure mode. Flagged as fast-follow.
- Editing/deleting a submitted report — v1 is append-only weekly (one report per vineyard per week). Mis-entries handled in v2 or by admin-only edit later.
- Multi-vineyard managers — one `assignedVineyardId` per user for now.
- Charts/trend visualizations on the admin dashboard — the AI briefing carries trend analysis in v1; visual charts are a follow-up. (Harvest yields-by-vintage is a simple grouped table, not a charting library.)
- Feeding harvest/Brix data into the Claude briefing — v1 keeps the briefing on the weekly field-note window; harvest analytics is its own table view. (Flagged as an easy v2 enhancement.)
- Notifications/reminders to managers on Friday — follow-up.

## Research Summary

### Codebase Patterns
- **Auth/session:** `src/lib/dal.ts` — `getCurrentUser()` (cached, re-fetches role/flags from DB, fails closed), `requireReadyUser()`, `requireAdmin()`. Add `assignedVineyardId` to the `select` at `src/lib/dal.ts:23` and to `AppUser` in `src/lib/access.ts:3-10`.
- **Authorization:** `src/lib/access.ts` `accessDecision()` is pure/unit-tested. `role === "admin"` is the only role check today.
- **Mutations are server actions, not API routes.** `src/lib/actions.ts` exposes `action()` (ready user) and `adminAction()` (admin). Handlers do mutation + `writeAudit()` in one `prisma.$transaction`. Example: `src/lib/users/actions.ts`. The only existing API route is Better Auth (`src/app/api/auth/[...all]/route.ts`). We add API routes ONLY where server actions don't fit (binary file upload, fire-and-forget AI).
- **Audit:** `src/lib/audit.ts` — `writeAudit(tx, {...actor, action, entityType, entityId, changes: diff(before, after), summary})`. New `AuditAction` enum values needed.
- **Prisma:** singleton `src/lib/prisma.ts`. JSON columns already in use: `VineyardBlock.polygon Json?` (schema:196), `AuditLog.changes Json?` (schema:404). Mirror for JSONB.
- **Vineyard data already exists:** `Vineyard`, `VineyardBlock` (blockLabel, varietyId, polygon, sortOrder), `VineyardDetail`. The 6–8 blocks per vineyard come straight from `VineyardBlock` rows — the form enumerates real blocks, it does not hardcode 6–8.
- **Sidebar:** `src/components/AppShell.tsx` — `NavItem[]` arrays (`MAIN`, `SETUP`), `linkStyle()`, collapsible "Setup" group (lines 66–85) with `setupOpen` state and the "respond to navigation during render" pattern (lines 109–120). We add a `VINEYARDS` array + `vineyardsOpen` state mirroring this exactly.
- **Routing:** `(app)` route group (`src/app/(app)/layout.tsx`) wraps authed pages with the shell. New pages live at `src/app/(app)/vineyards/maps/page.tsx` and `.../field-notes/page.tsx`.
- **Read-only map source:** `/reference` → `ReferenceClient.tsx`, `VineyardModal.tsx`, `BlockDetails.tsx`, `src/components/ui/SatelliteMap.client.tsx`. `SatelliteMap` is read-only unless `editable` is passed; import via `SatelliteMap.client.tsx` (dynamic, ssr:false). `MapLegend` shows the variety color key.
- **UI primitives:** `src/components/ui/index.ts` — `Button`, `Card`, `Modal`, `Input`, `Checkbox`, `Badge`, `Eyebrow`, `Metric`, `ConfirmButton`. `Modal` (`Modal.tsx`) has open/onClose/title/maxWidth + Escape handling.
- **Design tokens:** CSS variables only, no hardcoded values (DESIGN.md). Colors `--surface-*`, `--text-*`, `--accent*`, `--danger/--warning/--positive`. Spacing `--space-1..11` (8px grid). Radii `--radius-sm..lg`. Fonts `--font-display/heading/body`. Consumed via inline `style={{ ... "var(--token)" }}` and a few Tailwind aliases.
- **Responsive:** 768px breakpoint via `.bw-shell` / `.bw-mobile-bar` / `.bw-desktop-sidebar` in `globals.css`. Mobile-first: build the manager form to look right at ~360px wide; admin dashboard targets desktop.
- **Tests:** Vitest. Pure logic (sanitizers, access decisions, pre-population merge, rain-vs-spray heuristics for prompt context) is the high-value unit-test surface, mirroring `access.ts` tests.

### Prior Learnings
Learnings search was not reachable in this environment (rstack binaries are POSIX; this is Windows). No blocking gap — the codebase patterns above are the authority. (If `/work` can reach `rstack-learnings-search`, re-run before starting.)

### External Research
- **No `@anthropic-ai/sdk` installed.** `ANTHROPIC_API_KEY` already stubbed in `.env.example`. Add the SDK; call server-side only. Use a current model id (`claude-opus-4-8` or `claude-sonnet-4-6` per the project's model guidance) — `/work` should confirm the exact id via the `claude-api` skill before coding, not hardcode a stale one.
- **API key source:** reuse the existing Anthropic key from `C:\Users\russe\Documents\MW_exam\.env` — copy its `ANTHROPIC_API_KEY` value into this project's local `.env` (and into Vercel's env for deploy). The app only ever reads `process.env.ANTHROPIC_API_KEY`; the MW_exam path is just where the working key lives today. Do NOT commit the key.
- **No blob storage today.** Chosen: **Vercel Blob** (`@vercel/blob`). Needs `BLOB_READ_WRITE_TOKEN` env. Upload via a route handler (server actions can't stream a multipart file body cleanly); store the returned URL string in the block JSON.
- **Next.js 16 / React 19:** App Router only allows global CSS at root (already true here). Route handlers are the right tool for binary upload and fire-and-forget. Read `node_modules/next/dist/docs/` for any 16-specific route-handler/runtime notes before writing the upload + summarize routes (per AGENTS.md).

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Block-status storage | Single `block_level_statuses` JSONB keyed by `VineyardBlock.id` | Per-block child table | Spec calls for JSONB; LLM-friendly; block shape is read/written atomically per week. Vineyard/user stay as real FKs for querying. |
| Sprays/fertilizers master list | New `FieldInput` table (type + `normalizedKey` unique, `name` for display) seeded with defaults | Hardcoded array + free JSON; UPPERCASE-only dedup | On-the-fly adds must persist + dedup. UPPERCASE alone leaves "NEEM"/"NEEM OIL"/"NEEM-OIL" as 3 rows (council); a strip-all-non-alphanumeric `normalizedKey` collapses them while `name` keeps the readable label. |
| Pre-population scope | Carry **block statuses only**; sprays/fertilizers/weather/disease start blank each week | Carry everything (orig spec) | Council (Gemini): carrying chemicals forward → managers forget to uncheck → phantom weekly spray records that corrupt the rain-vs-spray AI analysis. Block phenology/canopy is slow-changing and safe to carry. (User-confirmed.) |
| Report week (`weekOf`) | Manager-selectable, defaults to most-recently-passed Friday; canonical UTC date-only helper | Auto "current Friday" | Council (both): a Saturday submission on bad signal would log against next Friday, skipping/overwriting a week. Selectable + UTC discipline fixes off-by-one + late submissions. (User-confirmed.) |
| Harvest weight capture | `HarvestPick` 1:M per (block, vintage); total auto-rolls-up. Estimate on parent `HarvestRecord` | Single progressive row | Council (Gemini): vineyards pick a block in multiple passes; one row forces manual weight math + loses the pick timeline. (User-confirmed.) |
| AI generation durability | `after()` + tracked status + admin Regenerate; client call uses `keepalive` | Durable cron job; synchronous | Council (Codex): `after()` is best-effort, not a queue; Regenerate is the real recovery path. Lowest infra. Needs Vercel Pro for the 60s ceiling. (User-confirmed.) |
| Prisma `Decimal` at the boundary | Map `Decimal`→`number` in a DTO at the server edge; never pass raw `Decimal` to client components | Pass model objects through | Council (Codex): Prisma `Decimal` breaks across the App Router server/client boundary. `BrixLog.brixValue`, `HarvestRecord.yieldEstimateKg`, `HarvestPick.weightKg`. |
| `AppUser` shape change | One canonical `userSelect` + `toAppUser()` mapper, reused everywhere | Ad-hoc per call site | Council (Codex): adding `assignedVineyardId` to `AppUser` is a plan-wide type change; centralize so no construction site silently omits it. |
| JSON payload integrity | Lightweight runtime validators in `types.ts` + a `schemaVersion` on stored JSON | Trust `JsonValue` | Council (Codex): Prisma `Json` is `JsonValue`, not a domain type. Validate on write, parse on read, version the shape. (No zod in codebase; match the ad-hoc house style.) |
| Photo storage | Vercel Blob, URL stored in JSON | base64 in DB; defer | Already on Vercel; keeps rows small; CDN-served to admin. (User-selected.) |
| AI trigger | Async after save via `POST /api/field-notes/[id]/summarize`, fire-and-forget from client; admin Regenerate button | Sync at submit; on-demand at admin view | Manager never waits on a 10–30s call on bad signal; avoids serverless timeout. (User-selected.) |
| Offline | localStorage draft autosave + submit retry now; PWA outbox flagged for v2 | Full PWA now | 80% of data-loss risk for ~1 unit; PWA is its own project. (User-selected.) |
| Mutations | Server actions for create/read; route handlers only for upload + summarize | All API routes | Matches codebase convention (`action()`/`adminAction()` + audit). Routes reserved for binary/async. |
| `assignedVineyardId` plumbing | Prisma column + `getCurrentUser` select; set via our own `adminAction` | Wire into Better Auth additionalFields | We read/write it through Prisma directly; Better Auth never needs it, avoiding auth-schema churn. |
| One report per vineyard per week | Enforce `@@unique([vineyardId, weekOf])` (Friday-anchored date) | Free timestamps | Prevents duplicate Friday reports; makes "previous week" lookup deterministic. |
| Harvest weight unit | Store canonical **kg** (`Decimal`), convert for display per `VineyardDetail.defaultUnit` | Store in entered unit | Matches existing canonical-metric storage (spacing/elevation); avoids unit ambiguity in aggregates. |
| Brix/harvest vs weekly report | Standalone per-block quick-logs (not part of the Friday note) | Fold into weekly report | Spec wants "fast" entry; Brix is logged many times across ripening; harvest is one-off per block. |
| Harvest tables denormalize `vineyardId` + logger email | Yes (alongside `blockId` FK) | Join through block each time | Clean `groupBy vintageYear`/vineyard aggregates; survives block edits (snapshot like `BottlingRun`). |
| Block delete vs harvest history | `onDelete: Restrict` on `BrixLog`/`HarvestRecord` → block | Cascade | Yield/Brix history is durable record-of-truth; don't let a block edit erase a vintage's data. |
| Yield estimate vs actual | Both on one `HarvestRecord` row (block+vintage), final fields nullable, fills progressively | Separate estimate table | Estimate is logged before harvest; one row keyed by block+vintage lets admins show estimate vs actual without a join. |

## Implementation Units

### Unit 1: Schema migration — User field, FieldNote, FieldInput, enums

**Goal:** Add the data model for field notes, the manager→vineyard link, and the input master list.
**Files:** `prisma/schema.prisma` (modify)
**Approach:**
- `User`: add `assignedVineyardId String?` + relation `assignedVineyard Vineyard? @relation(fields:[assignedVineyardId], references:[id], onDelete: SetNull)`; add index. (Better Auth-owned model; only add the column/relation, leave existing fields.)
- `Vineyard`: add back-relations `managers User[]` and `fieldNotes FieldNote[]`.
- New `FieldNote`: `id`, `vineyardId` (FK, index), `userId String?` (FK manager, **`onDelete: SetNull`** so deleting a user doesn't block/cascade — council C/S9) + snapshot `userEmail String` (durable provenance, mirror BottlingRun:279-281), `weekOf DateTime @db.Date` (Friday anchor, written via the canonical UTC helper — Unit 6), `createdAt`, `updatedAt`, `weatherData Json` (`{rainfallMm, maxTempC, minTempC}`), `spraysApplied Json` (array of `{name, scope:"WHOLE"|"BLOCKS", blockIds:[]}`), `fertilizersApplied Json` (same shape), `blockLevelStatuses Json` (map of blockId→status object), `schemaVersion Int @default(1)` (JSON shape version — council), `generalNotes String?`, `aiSummary String?`, `aiSummaryStatus String @default("PENDING")` (PENDING|READY|FAILED), `aiSummaryAt DateTime?`. `@@unique([vineyardId, weekOf])` (one canonical note per vineyard per week — see design note below), `@@index([vineyardId, weekOf])`.
- New `FieldInput`: `id`, `type String` (`SPRAY`|`FERTILIZER`), `name String` (display, cleaned UPPERCASE), `normalizedKey String` (strip-all-non-alphanumeric UPPERCASE, e.g. `NEEMOIL` — council S3), `isActive Boolean @default(true)`, `createdAt`. `@@unique([type, normalizedKey])`.
- New `BrixLog`: `id`, `blockId` (FK → `VineyardBlock`, `onDelete: Restrict`, index), `vineyardId` (denormalized FK, index), `brixValue Decimal @db.Decimal(4,1)`, `recordedAt DateTime @default(now())`, `createdById String?` + `createdByEmail String` (snapshot), `note String?`. `@@index([blockId, recordedAt])`. **Migration adds a raw `CHECK (brix_value >= 0 AND brix_value <= 40)`** — `Decimal(4,1)` alone allows 999.9 (council S8).
- New `HarvestRecord` (one per block+vintage; holds the estimate + the pick parent): `id`, `blockId` (FK → `VineyardBlock`, `onDelete: Restrict`, index), `vineyardId` (denormalized FK, index), `vintageYear Int` (required, index), `yieldEstimateKg Decimal? @db.Decimal(12,3)` (pre-harvest estimate, canonical kg), `createdById String?` + `createdByEmail String`, `updatedByEmail String?`, `createdAt`, `updatedAt`, `note String?`, `picks HarvestPick[]`. `@@index([vineyardId, vintageYear])`, `@@unique([blockId, vintageYear])`. **`totalWeightKg` is NOT stored — it's the sum of `picks`** (council C6).
- New `HarvestPick` (each pick pass): `id`, `harvestRecordId` (FK → `HarvestRecord`, `onDelete: Cascade`, index), `pickDate DateTime @db.Date`, `weightKg Decimal @db.Decimal(12,3)` (canonical kg), `createdById String?` + `createdByEmail String`, `createdAt`, `note String?`. `@@index([harvestRecordId, pickDate])`.
- Back-relations on `VineyardBlock`: `brixLogs BrixLog[]`, `harvestRecords HarvestRecord[]`; on `Vineyard`: `brixLogs BrixLog[]`, `harvestRecords HarvestRecord[]`.
- `AuditAction` enum: add `FIELD_NOTE_CREATED`, `FIELD_INPUT_CREATED`, `USER_VINEYARD_ASSIGNED`, `BRIX_LOGGED`, `HARVEST_ESTIMATED`, `HARVEST_PICK_RECORDED`.

**Design note — one note per vineyard per week:** `@@unique([vineyardId, weekOf])` treats the note as the vineyard's canonical weekly record regardless of author (a second submission for the same vineyard/week hits the friendly "already submitted" path). This is correct while one manager owns a vineyard. If multiple managers per vineyard becomes real, switch to `@@unique([vineyardId, userId, weekOf])` and have the briefing merge notes — flagged, not built.
**Tests:** none (schema). Validated by generate + migrate succeeding.
**Depends on:** none
**Execution note:** Use `npm run db:migrate` (named migration) so history is tracked, then `npm run db:generate`.
**Patterns to follow:** snapshot-email pattern `prisma/schema.prisma:279-281`; JSON columns `:196`,`:404`.
**Verification:** `npm run db:generate` succeeds; migration applies to a Neon branch without error; `FieldNote`/`FieldInput` appear in the client types.

### Unit 2: Seed master lists + default vineyard assignment helper

**Goal:** Ensure default sprays/fertilizers exist and provide an idempotent seed.
**Files:** `prisma/seed-field-inputs.ts` (create) or extend existing seed; `package.json` (script if needed)
**Approach:** Upsert `FieldInput` rows: SPRAY = MANCOZEB, SULFUR, COPPER, NEEM; FERTILIZER = NPK, EPSOM SALTS (already sanitized form). Idempotent via `upsert` on `[type, name]`.
**Tests:** none (seed) — but the sanitizer it shares (Unit 3) is unit-tested.
**Depends on:** Unit 1
**Verification:** Run seed; `prisma.fieldInput.findMany()` returns the 6 defaults; re-running adds nothing.

### Unit 3: Input sanitizer + shared field-note domain types/helpers

**Goal:** Pure, tested helpers for sanitizing custom input names and the canonical TS types for note payloads.
**Files:** `src/lib/fieldnotes/types.ts` (create), `src/lib/fieldnotes/sanitize.ts` (create), `src/lib/fieldnotes/sanitize.test.ts` (create)
**Approach:**
- `cleanInputName(raw): string` → trim, strip non-alphanumeric-except-space/hyphen, collapse spaces, UPPERCASE; reject empty. (Display name.)
- `normalizeInputKey(raw): string` → strip ALL non-alphanumeric, UPPERCASE (council S3): `"NEEM OIL"`/`"NEEM-OIL"`/`"Neem  Oil"` → `NEEMOIL`. (Dedup key for `FieldInput.normalizedKey`.)
- Lightweight runtime validators (council S7): `parseWeatherData`, `parseBlockStatus`, `parseInputApplication` — validate a `JsonValue` into the typed shape on read, throw on malformed; used by actions before trusting stored JSON. Carry a `schemaVersion`.
- Types: `WeatherData`, `InputApplication`, `BlockStatus` (phenoStage, shootTip, canopyDensity, waterStress, weedPressure, leafConditions[], diseasePestSpotted, diseaseDescription?, photoUrls[]), `DEFAULT_HEALTHY_BLOCK_STATUS` constant, and enum option arrays (phenological stages list, etc.).
**Tests:** `sanitize.test.ts` — `cleanInputName`: `" mancozeb! "`→`MANCOZEB`; `"Epsom Salts"`→`EPSOM SALTS`; `"@@@"`→throws; unicode/emoji stripped; double spaces collapsed. `normalizeInputKey`: `"NEEM OIL"`/`"NEEM-OIL"`/`"neem oil"` all →`NEEMOIL`. Validator round-trips a good payload + throws on a bad one. Mirror `access.ts` test style.
**Depends on:** none
**Verification:** `npx vitest run src/lib/fieldnotes/sanitize.test.ts` green.

### Unit 4: Access layer — surface assignedVineyardId, manager scope guard

**Goal:** Make the assigned vineyard available to gates and provide a manager-scope check.
**Files:** `src/lib/access.ts` (modify), `src/lib/dal.ts` (modify), `src/lib/access.test.ts` (modify/extend)
**Approach:** Add `assignedVineyardId: string | null` to `AppUser`. **Extract one canonical `userSelect` object + a `toAppUser(record)` mapper in `dal.ts`** and route `getCurrentUser` (and any other user fetch) through them, so adding the field can't silently skip a construction site (council C3). Add `assignedVineyardId: true` to `userSelect`. Add pure helper `canManagerAccessVineyard(user, vineyardId): boolean` (admin always true; user only when `assignedVineyardId === vineyardId`). Keep `accessDecision` unchanged. Before coding, grep all `AppUser` construction/return sites and confirm they use the mapper.
**Tests:** extend `access.test.ts` — admin sees any vineyard; user sees only assigned; user with null assignment sees none.
**Depends on:** Unit 1 (the DB select needs the column).
**Execution gate (council S11):** Unit 4 gates everything after it. After Units 1 + 4, run `db:generate` + typecheck/build + a login smoke test with the new `User` shape **before** starting Units 6/7/9/12. Also verify the Better Auth CLI/typegen workflow (if run) doesn't drop `assignedVineyardId` (risk row).
**Verification:** vitest green; type-check passes; login still works.

### Unit 5: Field-input server actions (list + add-on-the-fly)

**Goal:** Read master lists and let any ready user add a sanitized custom input that persists.
**Files:** `src/lib/fieldnotes/input-actions.ts` (create)
**Approach:** `listFieldInputs()` (read, grouped by type). `addFieldInput(type, rawName)` wrapped in `action()`: compute `name = cleanInputName(raw)` + `normalizedKey = normalizeInputKey(raw)` (Unit 3), `upsert` on `[type, normalizedKey]` so "NEEM OIL"/"NEEM-OIL" merge to one row, `writeAudit(FIELD_INPUT_CREATED)` only when newly created, `revalidatePath("/vineyards/field-notes")`. Return the canonical row (existing one if the key already existed).
**Tests:** covered indirectly; sanitizer already unit-tested. Optionally a thin test asserting upsert dedup using a mocked prisma — skip if it fights the singleton.
**Depends on:** Units 1, 3
**Verification:** From the form, adding "neem oil!" yields `NEEM OIL`, appears as a checkbox, survives reload.

### Unit 6: Field-note create + read server actions (manager-scoped)

**Goal:** Create this week's report (scoped to the manager's vineyard) and fetch notes for display + pre-population.
**Files:** `src/lib/fieldnotes/actions.ts` (create), `src/lib/fieldnotes/actions.test.ts` (create for pure pieces), `src/lib/fieldnotes/week.ts` (create), `src/lib/fieldnotes/week.test.ts` (create)
**Approach:**
- `src/lib/fieldnotes/week.ts` (pure, tested): `mostRecentFriday(now): string` and `isValidWeekOf(date): boolean` working in **UTC date-only `YYYY-MM-DD`** discipline (council C4) — no local-time `Date` math. `weekOf` is supplied by the form (defaults to `mostRecentFriday`), validated to be a Friday and not a future week.
- `createFieldNote(input)` via `action()`: take `weekOf` from input; validate it; enforce `canManagerAccessVineyard(ctx.user, input.vineyardId)` (admins any vineyard, managers only their own) — throw `ActionError("FORBIDDEN")` otherwise; validate weather numerics + block coverage via the Unit 3 validators; persist in `prisma.$transaction` with `writeAudit(FIELD_NOTE_CREATED)`, `userEmail` snapshot, `schemaVersion`; set `aiSummaryStatus="PENDING"`. Unique constraint → friendly "already submitted this week" error. `revalidatePath`. Return `{ id }`.
- `getLatestFieldNote(vineyardId)` and `getRecentFieldNotes(vineyardId, n)` (pre-population baseline + admin history + the 3-week AI window). Manager calls scope-checked. Parse stored JSON through the Unit 3 validators on read.
- `buildPrepopulationDefaults(prevNote, currentActiveBlockIds)` pure helper: **carry forward block statuses ONLY**; blank sprays, fertilizers, weather, and disease/photos every week (council C5, user-confirmed). **Intersect** carried block keys with `currentActiveBlockIds` — drop blocks removed since last week, initialize newly-added blocks blank (council S1/block-drift). Tested.
**Tests:** `actions.test.ts` — `mostRecentFriday` across all weekdays + DST/UTC boundaries; `isValidWeekOf` rejects non-Fridays + future weeks; `buildPrepopulationDefaults` carries block statuses, blanks sprays/fert/weather/disease, drops removed blocks, inits new blocks; coverage validation rejects a block missing a status.
**Depends on:** Units 1, 3, 4
**Verification:** vitest green; creating a note as a manager for a foreign vineyard throws FORBIDDEN; second submit same week errors cleanly.

### Unit 7: Vercel Blob photo upload route

**Goal:** Accept a mobile camera photo and return a stored URL.
**Files:** `src/app/api/field-notes/upload/route.ts` (create), `package.json` (add `@vercel/blob`), `.env.example` (add `BLOB_READ_WRITE_TOKEN`)
**Approach:** `POST` route handler: authorize via `getCurrentUser()` (reject anon); **require a `vineyardId` field in the request and re-run `canManagerAccessVineyard(user, vineyardId)` before storing** — otherwise any authed user can dump arbitrary blobs (council C7); read multipart `file`; validate content-type (image/*) + size cap **8MB as a server-side backstop** (the client downscales to <1MB first — see Unit 12); `put()` to Vercel Blob with a random suffix path `field-notes/<vineyardId>/<uuid>.<ext>`; return `{ url }`. No DB write here — the URL is embedded in the note payload at submit. Set `export const runtime = "nodejs"`. Read Next 16 route-handler docs first.
**Tests:** none automated (binary/external); manual. Add a guard unit test only if the auth/validation logic is extracted to a pure helper.
**Depends on:** none (parallel with 5/6); needs Unit 4 for the auth import only.
**Verification:** `curl -F file=@photo.jpg` (authed cookie) returns a Blob URL that loads; oversized/non-image rejected with 400.

### Unit 8: Anthropic client + Weekly Call Briefing prompt + generator

**Goal:** Given a note id, fetch this week + prior 3 weeks and produce the briefing text.
**Files:** `src/lib/fieldnotes/ai.ts` (create), `src/lib/fieldnotes/prompt.ts` (create), `src/lib/fieldnotes/prompt.test.ts` (create), `package.json` (add `@anthropic-ai/sdk`), `.env.example` (already has `ANTHROPIC_API_KEY`)
**Approach:**
- `buildBriefingInput(currentNote, priorNotes[])` pure: assemble a compact, LLM-ready JSON/markdown context (weather series, spray/fert timeline with dates, per-block leaf-condition history). Tested for structure + that it includes prior weeks in chronological order.
- `generateBriefing(noteId)`: load current + prior 3 (`getRecentFieldNotes`), build input, call Anthropic with a strict system prompt. **Framing (council Q1): Claude is a DATA SUMMARIZER, not a diagnostician.** It must cite the logged data and explicitly NOT issue definitive agronomic diagnoses or prescriptions (no "Block 4 has a magnesium deficiency → order X"). It surfaces patterns as observations tied to the record: (a) rain-vs-spray timing mismatch (rain logged after a protectant spray, coverage likely lapsed), (b) task slippage across weeks (what was logged vs not, L7D vs N7D), (c) leaf-condition co-occurring with input gaps stated as a correlation to verify ("Block 4 reported yellowing; no fertilizer logged in 3 weeks"), (d) a scannable briefing ending in a **3-bullet agenda framed as questions/things to confirm with the manager**. `max_tokens` bounded; model id confirmed via `claude-api` skill. Return text.
- Robust: on API error return a typed failure; caller sets `aiSummaryStatus="FAILED"`.
**Tests:** `prompt.test.ts` — input builder includes all weeks, orders chronologically, redacts nothing critical; system prompt contains the four analyses, the 3-bullet-agenda instruction, AND the summarizer-not-diagnostician guardrail (string asserts). No live API call in tests.
**Depends on:** Units 1, 6
**Verification:** vitest green; a manual one-off script against a seeded note returns a sensible 3-bullet briefing.

### Unit 9: Summarize API route (async, fire-and-forget)

**Goal:** Endpoint the client pings after a successful save; runs the generator and stores the result.
**Files:** `src/app/api/field-notes/[id]/summarize/route.ts` (create)
**Approach:** `POST` handler: authorize ready user; load note (scope-check non-admins). Because Claude over 4 weeks of data can take 10–15s, **return an immediate `{ status: "accepted" }` and run generation via Next.js 16 `after()`** (`import { after } from "next/server"`): inside `after()`, call `generateBriefing(id)` (Unit 8), then `update` `aiSummary` + `aiSummaryStatus="READY"` + `aiSummaryAt=now` on success, or `"FAILED"` on error. Set `export const runtime = "nodejs"` and `export const maxDuration = 60` (Pro ceiling; Hobby caps at 10s — call this out for deploy). Idempotent (safe to re-call → powers admin "Regenerate"). **Council reality (C1): `after()` is best-effort, not a durable queue, and the manager's fire-and-forget call must use `fetch(..., { keepalive: true })` so it survives the post-submit navigation.** The durable recovery path is `aiSummaryStatus` + the admin Regenerate button (awaits + polls), NOT `after()` itself. If a run is cut short, status stays `PENDING`/`FAILED` and one Regenerate tap recovers it. (Durable cron-job upgrade is flagged for later but out of scope per user decision.)
**Tests:** none automated (integration/external); manual. If `after()` misbehaves in the deployed Next 16 build, fall back to awaiting generation in-handler with `maxDuration=60`.
**Depends on:** Unit 8
**Verification:** `POST /api/field-notes/<id>/summarize` flips status PENDING→READY and persists text; re-calling regenerates.

### Unit 10: Sidebar — collapsible "Vineyards" section

**Goal:** Add the nav group with the two routes.
**Files:** `src/components/AppShell.tsx` (modify)
**Approach:** Add `VINEYARDS: NavItem[] = [{href:"/vineyards/field-notes", label:"Field notes"}, {href:"/vineyards/harvest", label:"Harvest"}, {href:"/vineyards/maps", label:"Maps"}]`. Mirror the "Setup" collapsible exactly: `vineyardsOpen` state seeded from `VINEYARDS.some(isActive)`, the "respond to navigation during render" expand pattern (`AppShell.tsx:109-120`), and render in both `SidebarContent` instances (desktop + drawer). All three routes visible to all roles (each page branches by role). Use `linkStyle`/tokens already there.
**Tests:** none (presentational).
**Depends on:** none
**Verification:** Sidebar shows "Vineyards" group on desktop + mobile drawer; entering either route auto-expands and highlights.

### Unit 11: `/vineyards/maps` read-only page

**Goal:** Managers + admins view vineyard summaries and interactive maps, no editing.
**Files:** `src/app/(app)/vineyards/maps/page.tsx` (create), `src/app/(app)/vineyards/maps/MapsClient.tsx` (create)
**Approach:** Server page: `requireReadyUser()`; fetch vineyards + blocks + detail (same shape `/reference` page uses). Client renders a read-only directory; clicking a vineyard opens a `Modal` showing `SatelliteMap` (no `editable` prop), `BlockDetails`, `MapLegend` — reuse the `/reference` read-only branch components directly (import `SatelliteMap.client`, `BlockDetails`, `MapLegend`). No setup/edit affordances rendered. If a manager has an `assignedVineyardId`, default-open or pin their vineyard first.
**Tests:** none (presentational); manual.
**Depends on:** Unit 4 (for assignment-aware default)
**Patterns to follow:** `src/app/(app)/reference/ReferenceClient.tsx`, `VineyardModal.tsx` (read-only branch), `BlockDetails.tsx`.
**Verification:** Both roles can open the map + block details; no draw toolbar; nothing is editable.

### Unit 12: `/vineyards/field-notes` — manager mobile form + recent-note card

**Goal:** The core manager experience: see last week's note, create this week's, mobile-first.
**Files:** `src/app/(app)/vineyards/field-notes/page.tsx` (create), `.../FieldNotesRouter.tsx` (create, role switch), `.../manager/ManagerView.tsx` (create), `.../manager/FieldNoteForm.tsx` (create), `.../manager/BlockCard.tsx` (create), `.../manager/useDraft.ts` (create), `.../manager/draft.test.ts` (create), `.../manager/downscaleImage.ts` (create), `.../manager/downscaleImage.test.ts` (create)
**Approach:**
- Server page: `requireReadyUser()`; branch by `user.role` → render `ManagerView` (user) or `AdminDashboard` (admin, Unit 13) via `FieldNotesRouter`. Manager view loads blocks for `assignedVineyardId` + latest note (pre-population baseline). Guard: manager with no `assignedVineyardId` → friendly "ask an admin to assign your vineyard" empty state.
- `ManagerView`: read-only "Most recent field note" `Card` on top, then `[ + Create This Week's Report ]` `Button`. If a report already exists for this week, show it read-only with a "submitted" `Badge`.
- `FieldNoteForm` (single vertical scroll, thumb-friendly): a **week selector** at top (defaults to `mostRecentFriday`, lets a Saturday submission file to the right week — council C4); Weather (numeric `Input`s mm/°C/°C, blank each week); Inputs section (spray + fertilizer multi-select `Checkbox`es from `listFieldInputs`, blank each week, each with WHOLE/BLOCKS toggle + conditional block multi-select; `[ + Add New ]` text field calling `addFieldInput`, optimistic append); a **"Mark remaining/unedited blocks healthy" button** (NOT a master toggle — council S5: it only fills blocks the manager hasn't touched, and asks for confirmation before overwriting any edited block); vertical list of `BlockCard`s (one per real `VineyardBlock`).
- `BlockCard`: phenological stage `Select`, shoot tip (Active/Stagnant), canopy density, water stress, weed pressure (segmented toggles sized for thumbs), leaf condition (Healthy checkbox OR multi-select Edge Burn/Yellowing/Reddening/Chemical Burn/Physical Damage), disease/pest toggle → reveals description textarea + camera upload (`<input type="file" accept="image/*" capture="environment">` → **`downscaleImage()` first** → POST Unit 7 **the moment the photo is selected, in the background while the manager keeps filling the form** (council Gemini-C4) → push the returned URL into block state). Submit only ever sends URL strings, never the binary. Show an inline "compressing…/uploading…" state, a thumbnail on success, and a per-photo retry; the form stays submittable text-only if a photo upload fails.
- `downscaleImage(file): Promise<Blob>`: HTML5 Canvas resize — load into an `Image`, scale so the longest edge ≤ ~1600px, draw to canvas, export JPEG at quality ≈0.7, target < 1MB (step quality down once if still over). This is the key Bhutan-bandwidth guard: a raw 8–12MP phone photo (~5–8MB) becomes ~300–800KB before it ever hits the network. Pure-ish (DOM canvas) — extract the dimension math into a testable `fitDimensions(w, h, max)` function.
- Pre-population: on "Create", seed form state from `buildPrepopulationDefaults(latestNote, currentActiveBlockIds)` — block statuses only, everything else blank (Unit 6).
- `useDraft`: debounced localStorage persistence **keyed by `vineyardId` only** (council S6 — keying by week orphans a Thursday draft finished Saturday); store the chosen `weekOf` + `schemaVersion` *inside* the draft value. On restore, if the draft's `weekOf` differs from the current default, show "draft from <date> — keep editing?". Restore on mount; clear on successful submit. Submit calls `createFieldNote`, then fires `POST /summarize` with `{ keepalive: true }` (survives navigation); retry-with-backoff + clear toast on flaky network.
**Tests:** `draft.test.ts` — pure draft serialize/restore + key derivation; restore after simulated reload returns prior state; clear-on-submit empties the key. (Pull the pure logic out of the hook for testability.) `downscaleImage.test.ts` — `fitDimensions` keeps aspect ratio, caps the longest edge at the max, never upscales a small image, handles portrait + landscape.
**Depends on:** Units 3, 4, 5, 6, 7
**Verification:** On a ~360px viewport: create flow pre-populates from last week, add-new input persists, master "default healthy" fills every block, disease toggle reveals camera upload that returns a URL, draft survives a reload, submit succeeds and triggers summarize.

### Unit 13: `/vineyards/field-notes` admin dashboard + drill-in modal + /users assignment

**Goal:** Admin executive view: AI briefing on top, vineyard directory, click→modal raw data/photos; plus role+vineyard assignment on /users.
**Files:** `.../admin/AdminDashboard.tsx` (create), `.../admin/VineyardNoteModal.tsx` (create), `.../admin/BriefingCard.tsx` (create), `src/app/(app)/users/page.tsx` (modify), `src/app/(app)/users/*Client*.tsx` (modify), `src/lib/users/actions.ts` (modify)
**Approach:**
- `AdminDashboard`: top `BriefingCard` for the most relevant/most-recent briefing (renders `aiSummary`; if `PENDING` show "Generating…", if `FAILED` show error + Regenerate; Regenerate awaits `POST /summarize`). Below, a vineyard directory (`Card`/`ListShell`) of all vineyards with last-report date + a status `Badge`.
- Clicking a vineyard opens `VineyardNoteModal` (reuse `Modal`): that vineyard's latest raw submission — weather, spray/fert timeline, per-block statuses, general notes, and photos (`<img>` from Blob URLs), JSON parsed via the Unit 3 validators. Admin doesn't lose dashboard scroll position (modal overlay). **Make it URL-addressable** — reflect the open vineyard + week in the query string (`?vineyard=…&week=…`) so an admin can deep-link/share a specific week (council Q2 middle ground; keeps the modal UX you wanted while fixing shareability). Include the vineyard's own briefing + Regenerate.
- `/users` assignment: add Role select (admin|user) + Vineyard dropdown per user; new `assignUserVineyard(userId, vineyardId|null)` + `setUserRole` via `adminAction` with `writeAudit(USER_VINEYARD_ASSIGNED)`. Reuse existing users-page form/action patterns (`src/lib/users/actions.ts`).
**Tests:** none for presentational; the assignment action shares the audited `adminAction` pattern (covered by convention). Add a small test if role/vineyard validation logic is extracted.
**Depends on:** Units 6, 8, 9 (briefing), 1/4 (assignment)
**Patterns to follow:** `src/app/(app)/reference/VineyardModal.tsx` (modal), `src/lib/users/actions.ts` (adminAction + audit).
**Verification:** As admin: dashboard shows briefing on top, directory lists vineyards, clicking opens modal with raw data + photos without losing place, Regenerate updates the briefing; /users can set a user to `user` + assign a vineyard and it persists + audits.

### Unit 14: Harvest ledger server actions (Brix + harvest + aggregates)

**Goal:** Manager-scoped writes for Brix and final harvest; reads/aggregations for both roles.
**Files:** `src/lib/harvest/actions.ts` (create), `src/lib/harvest/units.ts` (create — kg↔lb/ton conversions), `src/lib/harvest/units.test.ts` (create), `src/lib/harvest/aggregate.ts` (create), `src/lib/harvest/aggregate.test.ts` (create)
**Approach:**
- All reads **map Prisma `Decimal` → `number` in a DTO at the server edge** (council C2) — `brixValue`, `yieldEstimateKg`, `weightKg` never leave as raw `Decimal`.
- `logBrix(blockId, brixValue, recordedAt?)` via `action()`: resolve the block's `vineyardId`, enforce `canManagerAccessVineyard(ctx.user, vineyardId)`, validate `brixValue` in a sane range (0–35 °Bx; DB CHECK 0–40 backstop), insert `BrixLog` + `writeAudit(BRIX_LOGGED)` in one transaction, snapshot `createdByEmail`. `revalidatePath("/vineyards/harvest")`.
- `recordYieldEstimate(blockId, estimate, unit, vintageYear)` via `action()`: scope-check; convert → canonical kg; `upsert` the `HarvestRecord` parent on `[blockId, vintageYear]` setting **only** `yieldEstimateKg` (never touches picks) + `writeAudit(HARVEST_ESTIMATED)`; stamp `updatedByEmail`.
- `addHarvestPick(blockId, weight, unit, pickDate, vintageYear)` via `action()`: scope-check; convert → canonical kg; get-or-create the `HarvestRecord` parent on `[blockId, vintageYear]`, insert a `HarvestPick` child (pickDate + weightKg) + `writeAudit(HARVEST_PICK_RECORDED)`. Default `vintageYear` from `pickDate`. (Council C6: multiple picks accumulate; total is derived, never manually summed.) Also `deleteHarvestPick(pickId)` for mis-entries (scope-checked, audited).
- Reads: `getBlockBrixHistory(blockId)`; `getLatestBrixByBlock(vineyardId)` — **one query using `DISTINCT ON (block_id) … ORDER BY block_id, recorded_at DESC, id DESC`** (council S2 — no per-block loop), backed by the `@@index([blockId, recordedAt])`; `getVineyardHarvest(vineyardId)` — **one query** loading all `HarvestRecord`s + their picks + block metadata for the vineyard, then aggregate in memory (no per-block/per-vintage queries — council S2).
- `aggregate.ts` pure: `groupYieldsByVintage(records, blocks)` → per-vintage totals (estimate sum + actual sum-of-picks) + per-block breakdown (estimate vs actual total + variance) + per-variety rollup (join via `VineyardBlock.varietyId`). **Variance returns `null`/"N/A" when estimate is null or 0** (council S4 — no divide-by-zero). Works in canonical kg; formatted at the edge.
- `units.ts` pure: `toKg(value, unit)`, `fromKg(kg, unit)` for `"metric"|"imperial"` (kg/lb; ton thresholds for display).
**Tests:** `units.test.ts` — round-trip kg↔lb, ton formatting boundaries. `aggregate.test.ts` — groups by `vintageYear`, sums estimate + sum-of-picks actual, variance math AND the null/0-estimate → "N/A" guard, rolls up by variety, handles a block with estimate-only / picks-only / neither, multiple picks per block, multiple vintages.
**Depends on:** Units 1, 4
**Patterns to follow:** `src/lib/users/actions.ts` (adminAction/action + audit + transaction); canonical-metric storage like `VineyardBlock` spacing.
**Verification:** vitest green; logging Brix/harvest for a foreign vineyard throws FORBIDDEN; re-recording a block's harvest for the same vintage updates rather than duplicates.

### Unit 15: `/vineyards/harvest` page — manager logging + admin yields-by-vintage

**Goal:** Role-switched harvest UI: managers log fast; admins review historic yields.
**Files:** `src/app/(app)/vineyards/harvest/page.tsx` (create), `.../HarvestRouter.tsx` (create), `.../manager/HarvestManagerView.tsx` (create), `.../manager/BrixQuickLog.tsx` (create), `.../manager/HarvestRecordForm.tsx` (create), `.../admin/HarvestYieldsView.tsx` (create)
**Approach:**
- Server page: `requireReadyUser()`; branch by role via `HarvestRouter`. Manager view scoped to `assignedVineyardId` (same no-assignment empty state as Unit 12); admin view spans all vineyards.
- `HarvestManagerView`: vertical list of the vineyard's real `VineyardBlock`s. Each block row: `BrixQuickLog` (single numeric `Input` + Log button → `logBrix`, optimistic, shows last reading + small recent-history peek); a "Yield estimate" numeric input → `recordYieldEstimate` (can be set anytime before harvest); and a `HarvestRecordForm` that **adds a pick** (weight numeric + unit hint from `defaultUnit`, `pickDate`, `vintageYear` prefilled → `addHarvestPick`) and lists the picks logged so far with a running total (delete a mis-entered pick). Multiple passes just add more picks — no manual summing (council C6). Show estimate next to the running actual total. Thumb-friendly, mobile-first like the field-note form; reuse tokens + `Button`/`Input`/`Card`.
- `HarvestYieldsView` (admin): vineyard selector (or all), a grouped table from `groupYieldsByVintage` — rows by vintage year with per-block + per-variety subtotals and a season total, showing **estimate, actual (sum of picks), and variance** columns (variance renders "N/A" when no estimate — council S4), weights formatted via `fromKg` per unit. Optional Brix-at-harvest column where a reading exists near a pick date. No charting lib.
**Tests:** none (presentational); the data logic is covered by `aggregate.test.ts`/`units.test.ts` (Unit 14).
**Depends on:** Units 4, 10, 14
**Patterns to follow:** `src/app/(app)/audit/page.tsx` (filtered table), Unit 12 mobile form patterns.
**Verification:** As manager on a 360px viewport: log a Brix value per block (persists, shows latest), record a final harvest (updates on re-entry). As admin: yields table groups by vintage year with correct totals in the chosen unit.

## Test Strategy

**Unit tests (Vitest, the high-value surface):**
- `sanitize.test.ts` — `cleanInputName` + `normalizeInputKey` dedup (NEEM/NEEM OIL/NEEM-OIL→NEEMOIL) + JSON validators.
- `access.test.ts` (extend) — `canManagerAccessVineyard` matrix.
- `week.test.ts` — `mostRecentFriday` across weekdays + UTC/DST boundaries; `isValidWeekOf` rejects non-Fridays + future weeks.
- `actions.test.ts` — `buildPrepopulationDefaults` carries block statuses only / blanks sprays-fert-weather-disease / drops removed blocks / inits new blocks; block coverage validation.
- `prompt.test.ts` — briefing input builder + system-prompt asserts incl. summarizer-not-diagnostician guardrail (no live API).
- `draft.test.ts` — draft serialize/restore/clear; keyed by vineyardId; stale-week (weekOf inside value) handling.
- `units.test.ts` — kg↔lb/ton conversion + display formatting boundaries.
- `aggregate.test.ts` — yields grouped by vintage year, sum-of-picks actual, variance + null/0 "N/A" guard, per-variety rollup, multiple picks, empty/multi-vintage.
- `downscaleImage.test.ts` — `fitDimensions` aspect-ratio/cap/no-upscale across portrait + landscape.

**Integration / manual:**
- Migration applies on a Neon branch; seed is idempotent.
- Upload route round-trips an image to Vercel Blob; rejects oversized/non-image.
- Summarize route flips PENDING→READY and persists; Regenerate re-runs.
- End-to-end manager flow on a 360px viewport (the real device class).
- Role switch: same URL renders manager vs admin correctly.

**Manual verification (end-to-end):**
1. Assign a test user `role=user` + a vineyard via /users.
2. As that user on a phone-width viewport: create report, add a custom spray, apply default healthy, attach a camera photo, submit, reload mid-form to confirm draft restore.
3. As admin: confirm briefing generates, open the vineyard modal, see the photo, Regenerate.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Summarize cut off by Vercel timeout (Claude takes 10–15s; Hobby caps at 10s, Pro 60s) | MED | MED | Unit 9 returns an immediate ack + runs generation in `after()` with `maxDuration=60` (nodejs runtime); idempotent route + admin Regenerate + `aiSummaryStatus` recover any cut-off run. **Deploy note: needs Vercel Pro for the 60s ceiling**; on Hobby, expect some runs to need a Regenerate tap. |
| Large phone photo (8–12MP, ~5–8MB) fails/times out on rural Bhutan signal | MED | HIGH | Client-side `downscaleImage()` (Unit 12) shrinks to <1MB before upload; 8MB server backstop; per-photo retry; submit allowed text-only if a photo upload fails. |
| Better Auth schema sync clobbers `assignedVineyardId` | LOW | MED | Column is Prisma-only, set via our adminAction; never declared to Better Auth. Confirm `npx @better-auth/cli generate` (if run) doesn't drop it. |
| Stale/incorrect Claude model id | MED | LOW | `/work` confirms current id via `claude-api` skill before coding; isolate in `ai.ts`. |
| JSONB block map drifts from real blocks (block added/removed between weeks) | MED | MED | `buildPrepopulationDefaults` intersects carried keys with current active block IDs (Unit 6); render form from live `VineyardBlock` rows each week; admin view tolerates missing/extra keys. |
| Prisma `Decimal` crashes the server/client boundary | MED | HIGH | Map `Decimal`→`number` in DTOs at the server edge (Units 14/15); never pass raw `Decimal` to client components. |
| Stored JSON shape drifts / malformed | LOW | MED | Lightweight validators parse on read + `schemaVersion` on write (Units 3/6); admin/AI read paths fail loudly, not silently. |
| Phantom weekly spray records (manager forgets to uncheck carried inputs) | — | — | Resolved: pre-population carries block statuses only; sprays/fert blank each week (Unit 6). |
| Late/offline submission files against the wrong week | MED | MED | Manager-selectable `weekOf` defaulting to most-recent Friday + canonical UTC helper (Unit 6). |
| Mobile form too heavy/slow on low-end phones | MED | HIGH | Keep it server-light, no heavy deps; segmented toggles not modals; lazy-load nothing blocking; test at 360px / throttled CPU. |
| Duplicate Friday submission | LOW | LOW | `@@unique([vineyardId, weekOf])` + friendly error. |
| Harvest weight unit confusion (lbs vs kg vs tons) | MED | MED | Store canonical kg; form shows the unit from `defaultUnit` next to the input; convert at edges only; `units.test.ts` locks the math. |
| Brix logged against wrong block on a small screen | MED | LOW | Block label + variety shown on each quick-log row; optimistic UI echoes the saved value; Brix append-only + deletable picks make entries correctable. |
| Variance divide-by-zero (null/0 estimate) | LOW | LOW | `groupYieldsByVintage` returns "N/A" when estimate is null/0 (Unit 14). |
| Upload route abused to store arbitrary blobs | LOW | MED | Route re-runs `canManagerAccessVineyard` against a required `vineyardId` before `put()` (Unit 7). |

## Success Criteria

- [ ] Migration adds `User.assignedVineyardId`, `FieldNote`, `FieldInput`, new audit enum values; `db:generate` clean.
- [ ] Default sprays/fertilizers seeded; custom adds sanitize to UPPERCASE and persist.
- [ ] Manager (role=user) on mobile: sees last week's note, picks the report week (defaults to last Friday), creates this week's with block-status-only pre-population (sprays/fert/weather/disease blank), "mark remaining blocks healthy" (non-destructive), per-block cards, disease photo captured + uploaded in the background to Vercel Blob; draft autosaves (keyed by vineyard) and restores; submit never waits on Claude.
- [ ] Admin (role=admin): dashboard with AI briefing on top, vineyard directory, click→modal raw data + photos without losing place, Regenerate works.
- [ ] Claude briefing analyzes this week + prior 3 weeks and ends with a 3-bullet agenda; stored in DB; shown only to admins.
- [ ] Sidebar "Vineyards" group with `/vineyards/maps` (read-only), `/vineyards/field-notes`, and `/vineyards/harvest` (role-switched).
- [ ] Harvest: managers log per-block Brix, a per-block yield estimate, and one-or-more harvest picks (weight + date) that auto-total per block/vintage; admins see yields grouped by vintage year (estimate vs actual sum-of-picks + variance, "N/A" when no estimate) in the right unit.
- [ ] No raw Prisma `Decimal` crosses to a client component (Brix/yield/pick weights mapped to numbers); JSON read paths validated; `weekOf` uses the canonical UTC helper.
- [ ] `ANTHROPIC_API_KEY` sourced from `C:\Users\russe\Documents\MW_exam\.env` into local `.env` + Vercel env; never committed.
- [ ] Manager scoping enforced server-side (can't create/read another vineyard's notes).
- [ ] `/users` can assign role + vineyard, audited.
- [ ] No hardcoded colors/fonts/spacing — tokens only.
- [ ] All Vitest unit tests pass; no regressions.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Clear two-sided job-to-be-done. |
| Scope Boundaries | HIGH | Offline/PWA explicitly deferred; one-report-per-week clarified. |
| Implementation Units | HIGH | Strong existing patterns (actions, audit, dal, AppShell, /reference maps). |
| Test Strategy | MEDIUM | Pure logic well-covered; upload/summarize/AI are manual/integration by nature. |
| Risk Assessment | MEDIUM | Vercel timeout handled via `after()` + `maxDuration=60` + idempotent Regenerate (needs Pro); photo size handled via client downscale. Remaining open item is confirming `after()` behaves in the deployed Next 16 build (fallback documented in Unit 9). |
| Council Review | DONE | Codex (gpt-5.4) + Gemini (3.1 Pro) reviewed; see `council-feedback.md`. 4 forks resolved by user (pre-fill scope, weekOf, AI durability, harvest picks); all "clear win" findings (Decimal boundary, userSelect mapper, N+1, input dedup, variance N/A, non-destructive default-healthy, draft key, upload auth, summarizer prompt, block-drift intersect, JSON validators) folded into Units 1/3/4/5/6/7/8/9/12/13/14/15. |
