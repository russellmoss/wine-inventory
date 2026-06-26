---
title: Rack / Transfer Wine Between Vessels (assistant + app)
type: feat
status: completed
date: 2026-06-25
branch: feat/assistant-voice-mode
depth: standard
units: 8
---

## Overview

Let a user move wine from one vessel to another by saying it in the assistant: "I racked barrel 14 to barrel 16." Any direction (barrel↔barrel, tank↔barrel, tank↔tank). The transfer decrements the source's components, merges them into the destination, optionally accounts for loss to lees, records a queryable `VesselTransfer` row, and writes the audit log — all behind the assistant's confirm-before-write flow so nothing moves until the user approves a preview.

## Problem Frame

Racking (moving wine between vessels, e.g. off the lees) is a core cellar operation, and the assistant explicitly can't do it today — it says "moving wine between vessels (racking) isn't available yet" (`src/lib/assistant/prompt.ts`). There's no server action, no transfer record, nothing. The user hit this directly: "I racked barrel 14 to barrel 16. make the transfer" → refused. Cellar state in the app drifts from reality every time someone racks and can't record it. The job: record a rack accurately (volumes, blend composition, loss) in one sentence, with a confirmation step, and keep a history of rackings.

## Requirements

- MUST: A dedicated assistant **write** tool `rack_wine` (confirm-before-apply) that moves wine between two vessels in any direction.
- MUST: Resolve vessels from free text by type + code ("barrel 14" → `{type: BARREL, code: "14"}`), disambiguating or erroring clearly.
- MUST: Support **full** transfer (default — move everything, source ends empty) and **partial** transfer (a specified number of liters).
- MUST: Support an **optional loss** amount (default 0): volume removed from source = moved; `loss` stays behind/discarded; volume into destination = moved − loss.
- MUST: Enforce invariants transactionally — can't move more than the source holds; destination free capacity ≥ volume added; from ≠ to; both vessels active.
- MUST: Preserve blend composition — moved wine carries its variety/vineyard/vintage breakdown into the destination, merging like components via `@@unique([vesselId, varietyId, vineyardId, vintage])`.
- MUST: Record a persistent **`VesselTransfer`** row (header + component snapshot) and write the existing `AuditLog`, both inside the mutation transaction.
- MUST: A read tool to list recent rackings (newest first, optionally filtered by vessel).
- MUST: Update the system prompt — add the capability, remove racking from the "not available yet" list.
- SHOULD: Exact-sum volume math (no floating-point drift) reusing the centiliter/largest-remainder approach from `bottling/draw.ts`.
- NICE: A racking-history UI view (out of scope here; the table + query tool enable it later).

## Scope Boundaries

**In scope:**
- `VesselTransfer` model + migration.
- Pure transfer math + vessel-reference parsing (unit-tested).
- Transactional `transferWine` server action (mutates components, writes transfer + audit).
- `rack_wine` write tool + committer; `query_transfers` read tool; registry/commit/prompt wiring.

**Out of scope:**
- A racking-history page/UI (the table + query tool make it a later add).
- Fermentation/additions/topping schedules, lees tracking as its own entity (loss is just a number here).
- Splitting one source across multiple destinations in a single command (one→one per call; the model can issue several).
- Changing the generic `db_*` tools (racking is deliberately a dedicated domain tool, not generic CRUD).

## Research Summary

### Codebase Patterns
- **Vessel contents:** `prisma/schema.prisma` — `Vessel` (~336: `code`, `type` BARREL|TANK, `capacityL` Decimal(10,2), `@@unique([type, code])`) and `VesselComponent` (~358: `varietyId`, `vineyardId`, `vintage`, `volumeL`, `@@unique([vesselId, varietyId, vineyardId, vintage])`). No cached volume — current volume = `sum(components.volumeL)`.
- **Volume mutation reference:** `src/lib/bottling/draw.ts` — `computeProportionalDraw(components, consumedL)` splits a draw across components at centiliter granularity with largest-remainder distribution so `sum(deduct) === consumedL` exactly; `bottling/run.ts:69-74` deletes a component when remaining ≤ 0 else updates `volumeL`. Reuse this exact approach.
- **Capacity guard:** `src/lib/bulk/actions.ts:47-52` — `if (others + add > capacity + 1e-9) throw`. Mirror for the destination.
- **Server action shape:** `src/lib/vessels/actions.ts:64-81` (`createVessel`) — `action()` wrapper provides `{ user, actor }`; parse → pre-check (conflict/scope) → `prisma.$transaction(mutation + writeAudit)` → `revalidatePath`. `updateComponentVolume` (`bulk/actions.ts:83-107`) shows component update + audit.
- **Audit:** `src/lib/audit.ts:103-117` — `writeAudit(tx, { ...actor, action, entityType, entityId, changes, summary })`, called inside the transaction; `diff(before, after)` for `changes`.
- **Decimals:** write `new Prisma.Decimal(n)`; read `d.toNumber()` / `Number(d)`; round with `Math.round(n*100)/100`; epsilon `1e-9` on capacity compares.
- **Write-tool pattern:** `src/lib/assistant/tools/adjust-inventory.ts`, `set-yield-estimate.ts` — `run()` resolves targets, builds a `preview`, returns `{ needsConfirmation: true, preview, token: signProposal("tool", resolvedArgs) }`.
- **Sign/commit:** `src/lib/assistant/confirm.ts` — `signProposal(tool, args, ttl)` (HMAC over base64url JSON `{tool, args, exp, nonce}`, `BETTER_AUTH_SECRET`), `verifyProposal`. `src/lib/assistant/commit.ts` — `COMMITTERS` map (name → `(user, args) => Promise<{message}>`), burns the `AssistantConfirmation` nonce (P2002 = already used). Register `rack_wine` here.
- **Resolution helpers:** `src/lib/assistant/tools/resolve.ts` — `resolveExactlyOne(rows, {describe, noneMsg, manyMsg})`. `scope.ts` has vineyard/block resolvers but **no vessel resolver yet**.
- **Tests:** `test/assistant-confirm.test.ts` covers sign/verify. Pure isomorphic logic is unit-tested under `test/` (e.g. voice `test/voice-*.test.ts`). No per-tool unit tests; domain math is the testable surface.

### Prior Learnings
- Context-ledger/learnings stores are empty; no prior racking decisions. Standing instruction: record schema/domain decisions in `.context-ledger` as built.
- Scoping is server-enforced, never model-trusted. Note: **vessels are not vineyard-scoped** in the schema (a `Vessel` has no `vineyardId`; only its components carry `vineyardId`). So `rack_wine` is gated on a ready (non-banned) user like `adjust_inventory`, not pinned to a manager's vineyard. Flag for confirmation in the eng review.
- `AGENTS.md`: Next.js 16, breaking changes — but this feature adds no routes/server-component params, so low exposure. Migration uses Neon `directUrl`.

### External Research
None needed — entirely internal patterns.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| Transfer amount | Full (default) **and** partial liters | Full only | User chose full+partial; `computeProportionalDraw` already does exact splits. |
| Loss to lees | Optional `lossL`, default 0; into-dest = moved − loss | Ignore; model lees entity | User chose optional loss. Keep it a number, not a new entity. |
| History | Dedicated `VesselTransfer` table (header + JSON component snapshot) + `query_transfers` tool | Audit-log only | User chose a queryable history. JSON snapshot handles multi-component (tank) racks and survives vessel edits. |
| Transfer record shape | Header row (`fromVesselId/Code`, `toVesselId/Code`, `volumeL`, `lossL`, `rackedAt`, actor, note) + `components` JSON snapshot `[{varietyName, vineyardName, vintage, volumeL}]` | Normalized child table `VesselTransferComponent` | JSON snapshot matches the app's `changes`-JSON convention, one table/one migration, still queryable by vessel + date. Child-table normalization is a later refinement. |
| Composition on move | Carry source breakdown into dest, scaled by added volume, merge on the component unique key | Lump as one component | Correct blend accounting; merging is what the unique constraint is for. |
| Tool type | Dedicated `rack_wine` write tool (+ committer) | Generic `db_*` | Domain invariants (capacity, can't-overdraw, proportional split, transactional) can't ride on generic CRUD. |
| Math location | Pure `transfer-math.ts` (no `server-only`) consumed by the action | Inline in action | Unit-testable exact-sum math, mirrors `draw.ts`. |

## Implementation Units

### Unit 1: `VesselTransfer` schema model

**Goal:** Persist each rack as a queryable row.
**Files:** `prisma/schema.prisma`
**Approach:** Add `VesselTransfer { id, fromVesselId, toVesselId, fromVesselCode, toVesselCode, volumeL Decimal(10,2), lossL Decimal(10,2) @default(0), components Json, note String?, actorUserId String?, actorEmail String, rackedAt DateTime @default(now()) }`. Relations to `Vessel` for from/to with `onDelete: SetNull` (keep history if a vessel is later removed) — store the code snapshots so history is readable regardless. Add `@@index([fromVesselId, rackedAt])`, `@@index([toVesselId, rackedAt])`, `@@index([rackedAt])`, `@@map("vessel_transfer")`. Add back-relations on `Vessel` (`transfersOut`, `transfersIn`). Follow `AssistantFeedback`/`AuditLog` style.
**Tests:** none (schema); validated by client generation.
**Depends on:** none
**Patterns to follow:** `prisma/schema.prisma` `AuditLog` (~521), `Vessel` (~336).
**Verification:** `npm run db:generate` succeeds; new model types exist.

### Unit 2: Migration

**Goal:** Create the `vessel_transfer` table.
**Files:** `prisma/migrations/<ts>_add_vessel_transfer/migration.sql`
**Approach:** Generate from the schema diff (handled by `/work`, e.g. `prisma migrate dev --create-only`), review the SQL, apply. No raw-SQL hand-editing needed (plain table + indexes + FKs). Neon uses the unpooled `directUrl`.
**Tests:** none (DDL).
**Depends on:** Unit 1
**Patterns to follow:** existing migrations under `prisma/migrations/`.
**Verification:** `npm run db:migrate` clean; `migrate status` "up to date"; table + indexes present (verify via a quick `information_schema` query).

### Unit 3: Pure transfer math + vessel-ref parsing

**Goal:** Exact-sum split logic and free-text vessel parsing, both pure and unit-tested.
**Files:** `src/lib/vessels/transfer-math.ts` (new), `src/lib/vessels/ref.ts` (new)
**Approach:** `transfer-math.ts`: `planTransfer(sourceComponents, drawL, lossL)` → `{ deductions: {id, deduct, remaining}[], additions: {varietyId, vineyardId, vintage, volumeL}[], addedTotalL }`. Reuse the centiliter + largest-remainder method from `bottling/draw.ts` so `sum(deduct) === drawL` and `sum(additions.volumeL) === drawL − lossL` exactly; loss is removed proportionally from the moved breakdown. `ref.ts`: `parseVesselRef(text)` → `{ type: "BARREL"|"TANK", code: string } | null` (recognize "barrel"/"bbl"/"tank" + a code token; normalize). Keep both free of `server-only` imports so vitest can import them directly.
**Tests:** `test/vessel-transfer-math.test.ts` — full transfer (additions == source, source empties); partial split across 2 components sums exactly; loss reduces additions but not deductions; over-draw throws; single-component case. `test/vessel-ref.test.ts` — "barrel 14" → BARREL/14; "tank 1"/"Tank A" → TANK; junk → null; case/spacing.
**Depends on:** none
**Patterns to follow:** `src/lib/bottling/draw.ts:33-72` (`computeProportionalDraw`).
**Verification:** `npm run test` passes the new files; `npm run lint` clean.

### Unit 4: `transferWine` server action

**Goal:** The authoritative, transactional transfer.
**Files:** `src/lib/vessels/transfer.ts` (new; or extend `src/lib/vessels/actions.ts`)
**Approach:** `transferWine({ fromVesselId, toVesselId, drawL?, lossL?, note? })` via the `action()` wrapper. Pre-checks: from ≠ to; both vessels exist & active; load source components; `drawL` defaults to source total, else must be > 0 and ≤ source total; `lossL` ≥ 0 and < `drawL`; destination free capacity (`capacity − currentTotal`) ≥ `drawL − lossL` (epsilon `1e-9`). In `prisma.$transaction`: call `planTransfer`; apply deductions (update `volumeL` / delete at ≤ 0); upsert each addition into the destination merging on the component unique key (increment `volumeL` if the lot exists, else create); create the `VesselTransfer` row (code snapshots + `components` JSON of additions); `writeAudit(tx, { action: "STOCK_MOVEMENT" (or a new "TRANSFER" AuditAction), entityType: "VesselTransfer", entityId, summary: "Racked 225 L Barrel 14 → Barrel 16 …", changes })`. `revalidatePath` the cellar/bulk pages. Return `{ message }`.
**Tests:** covered by Unit 3 math + manual DB verification (no DB-integration harness in repo). Add an `AuditAction` value if "TRANSFER" is chosen — note enum touch.
**Depends on:** Units 1, 3
**Patterns to follow:** `src/lib/vessels/actions.ts:64-81`, `src/lib/bulk/actions.ts:83-107`, `src/lib/bottling/run.ts:53-90`, `src/lib/audit.ts`.
**Verification:** Manually exercise from a script/`db:studio`: full and partial racks update components, write a transfer row + audit, and respect capacity.

### Unit 5: `rack_wine` write tool + committer

**Goal:** The assistant-facing confirm-before-write tool.
**Files:** `src/lib/assistant/tools/rack-wine.ts` (new), `src/lib/assistant/scope.ts` (add vessel resolver)
**Approach:** Add `resolveVessel(text)` to `scope.ts` using `parseVesselRef` + `prisma.vessel.findFirst({ where: { type, code } })`, wrapped with `resolveExactlyOne` semantics (clear none/ambiguous errors; include active check). Tool input: `fromVessel` (string), `toVessel` (string), `volumeL?` (number → omit = full), `lossL?` (number), `note?`. `run()`: resolve both vessels, load source components + dest capacity, compute the plan via `planTransfer` for the preview, build a human preview ("Move 225 L from Barrel 14 → Barrel 16 (Merlot, Bajo 2025); Barrel 14 will be empty, Barrel 16 → 225/228 L"), return `{ needsConfirmation: true, preview, token: signProposal("rack_wine", { fromVesselId, toVesselId, drawL, lossL, note }) }`. `commitRackWine(user, args)`: call `transferWine(args)` (authoritative re-validation lives in the action, since state may change between propose and confirm), return its message.
**Tests:** vessel-ref/math already unit-tested; tool itself verified manually (no per-tool tests in repo).
**Depends on:** Units 3, 4
**Patterns to follow:** `src/lib/assistant/tools/adjust-inventory.ts`, `set-yield-estimate.ts`, `tools/resolve.ts`, `confirm.ts`.
**Verification:** In chat, "rack barrel 14 to barrel 16" yields a confirm card; confirming applies and reports the result; "rack 9999 L …" is rejected with a clear message.

### Unit 6: `query_transfers` read tool

**Goal:** "When did we last rack barrel 14?" / recent rackings.
**Files:** `src/lib/assistant/tools/query-transfers.ts` (new)
**Approach:** Read tool; optional `vessel` (partial/ref) and `limit` (default 10, max 50). Query `VesselTransfer` newest-first by `rackedAt`, optionally filtered to transfers where from/to matches the resolved vessel. Return `{ results: [{ rackedAt, from, to, volumeL, lossL, components }] }`. Mirror `query-recent-harvests.ts` shape.
**Tests:** none (thin read); manual.
**Depends on:** Units 1, 5 (reuses vessel resolution)
**Patterns to follow:** `src/lib/assistant/tools/query-recent-harvests.ts`.
**Verification:** After a rack, "show recent rackings" lists it; filtering by "barrel 14" returns it.

### Unit 7: Registry, committer, and prompt wiring

**Goal:** Make the tools live and described.
**Files:** `src/lib/assistant/registry.ts`, `src/lib/assistant/commit.ts`, `src/lib/assistant/prompt.ts`
**Approach:** Register `rackWineTool` + `queryTransfersTool` in `ALL_TOOLS`. Add `rack_wine: commitRackWine` to `COMMITTERS`. In the prompt: add "transfer (rack) wine between vessels (any direction; full or a set number of liters, with optional loss)" to the Write line and the recent-rackings read to the Read line; **remove racking from the "not available yet" sentence**.
**Tests:** none.
**Depends on:** Units 5, 6
**Patterns to follow:** existing entries in `registry.ts`/`commit.ts`; current `prompt.ts` wording.
**Verification:** Assistant offers racking; no longer says it's unavailable; `npm run build` clean.

### Unit 8: UI status labels

**Goal:** Friendly progress labels for the new tools.
**Files:** `src/app/(app)/assistant/AssistantChat.tsx`
**Approach:** Add to `TOOL_LABELS`: `rack_wine: "Preparing the transfer"`, `query_transfers: "Checking recent rackings"`.
**Tests:** none.
**Depends on:** Unit 7
**Patterns to follow:** existing `TOOL_LABELS` map.
**Verification:** During a rack, the status line reads "Preparing the transfer…".

## Test Strategy

**Unit (Vitest):** `transfer-math.test.ts` (exact-sum full/partial/loss/over-draw/single-component) and `vessel-ref.test.ts` (parsing). These cover the load-bearing logic. Sign/verify already covered by `assistant-confirm.test.ts`.

**Integration:** none added (no DB harness in repo); `transferWine` correctness verified manually against Neon (full + partial + capacity-exceed + loss).

**Manual end-to-end:**
1. "I racked barrel 14 to barrel 16" → confirm card showing volume + breakdown + resulting fills; confirm → Barrel 14 empty, Barrel 16 increased, a `vessel_transfer` row + audit entry written.
2. "rack 100 L from tank 1 to barrel 5, lost 2 L to lees" → tank down 100, barrel up 98, loss recorded.
3. Over-capacity and over-draw are rejected with clear messages; from==to rejected.
4. "when did we last rack barrel 14?" returns the transfer.
5. Multi-component (tank with a blend) rack carries the breakdown into the destination, merging like lots.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Floating-point drift makes volumes not sum | MED | HIGH | Centiliter integer math + largest-remainder (proven in `draw.ts`); assert exact sums in `planTransfer`; unit tests. |
| State changes between propose and confirm (source drained, capacity filled) | MED | HIGH | Authoritative re-validation inside `transferWine`'s transaction; the signed args carry ids + amounts, not stale component rows. |
| Destination merge violates `@@unique` on concurrent racks | LOW | MED | Do the upsert/increment inside the transaction; rely on the unique key; serialize like `bottling/run.ts` if needed. |
| Vessels aren't vineyard-scoped → manager access question | MED | MED | v1: gate like `adjust_inventory` (ready user). Flag in eng review whether managers should rack at all; easy to tighten with an `adminOnly` flag. |
| New `AuditAction` enum value ("TRANSFER") ripples to audit UI filters | LOW | LOW | Prefer reusing `STOCK_MOVEMENT`; if adding "TRANSFER", grep audit filter/label sites and update. |
| Partial transfer "which components" ambiguity | LOW | MED | Partial always draws proportionally across all source components (documented); no per-lot selection in v1. |

## Success Criteria

- [x] "I racked barrel 14 to barrel 16" produces a confirm card and, on confirm, empties the source and increases the destination correctly. (built; verify live in-app)
- [x] Partial transfers and optional loss work and never overdraw or exceed capacity. (validated in transferWine + planTransfer tests)
- [x] Blend composition carries into the destination, merging like lots; volumes sum exactly. (planTransfer exact-sum tests; upsert-increment merge)
- [x] Each rack writes a `VesselTransfer` row + an audit entry inside one transaction.
- [x] `query_transfers` lists recent rackings, filterable by vessel.
- [x] Prompt advertises racking and no longer says it's unavailable.
- [x] New unit tests pass (12 new; 318 total); `npm run lint` (0 errors) and `npm run build` are clean; no regressions.
- [ ] Manual end-to-end click-through in the running app (recommended before merge).
