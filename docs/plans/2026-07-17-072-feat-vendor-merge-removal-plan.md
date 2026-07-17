---
title: Vendor merge + removal — dedupe and retire vendors safely (governed-money edge)
type: feat
status: draft
date: 2026-07-17
branch: claude/vendor-merge-removal
depth: deep
units: 9
---

## Overview

Give `/setup/vendors` two operations it doesn't have yet: **MERGE** two vendors that are the
same real supplier (Demo Winery's "Scott Labs" and "Scott Laboratories") into one survivor,
re-pointing every material, supply lot, A/P bill, and contact from the loser onto the survivor
before retiring the loser; and **REMOVE** a vendor that's genuinely no longer needed. Vendors
sit on accounting bills (`ap_export_event`), so this is a governed-money edge — the whole design
is "re-point every reference, never orphan a bill, never leak across tenants."

## Problem Frame

Plan 069 promised "no more typo'd Scott Labs vs Scott Laboratories duplicates" but only gave a
way to *prevent new* dupes at create time. It shipped no way to *fix the dupes that already
exist*, and no way to remove a vendor at all — the only "removal" is a soft `isActive=false`
archive that still clutters the admin list. Demo Winery is living that gap right now: 4 vendors,
two of which ("Scott Labs", "Scott Laboratories") are one company.

You can't just delete one. The DB won't let you — `cellar_material`, `supply_lot`, and
`ap_export_event` all hold `ON DELETE RESTRICT` FKs to the vendor (verified in migrations). That
RESTRICT is the fail-safe that protects A/P history. So the correct operation is a **merge**:
reassign all four reference types onto the survivor, then the loser has zero references and can be
removed cleanly. If we do nothing: the vendor list stays polluted with duplicates, reporting and
contact data fragment across two rows for one supplier, and future bills keep getting filed under
whichever spelling the user happened to pick.

**Product pressure-test finding:** the naive read is "add a delete button." That's a trap — a bare
delete either gets blocked by RESTRICT (useless) or, if someone forces it, orphans posted bills.
The real job is *dedupe*, and merge is the primitive. Remove is the trivial special case (a vendor
with zero references). Build merge properly and remove falls out of it.

## Requirements

- **MUST:** Merge picks a **survivor** and a **loser**; re-points ALL four reference types from
  loser → survivor inside one tenant transaction: `cellar_material.vendorId`, `supply_lot.vendorId`,
  `ap_export_event.vendorId`, `vendor_contact.vendorId`.
- **MUST:** Re-derive the legacy free-text mirror (`cellar_material.vendor` / `vendorUrl`) to the
  survivor's name/url on any re-pointed material (they're kept in sync by `resolveVendorMirror`).
- **MUST:** After a clean re-point, the loser has zero references → hard-delete it (its contacts
  are already moved, so nothing cascades away). Write an audit row with the moved counts.
- **MUST:** Remove = hard-delete a vendor **only when it has zero material/lot/bill references**.
  When it has references, block with a clear message ("used by N materials, M lots, K bills —
  archive it or merge it into another vendor") — never a silent RESTRICT 500.
- **MUST:** Stay single-tenant and RLS-safe. Merge across tenants is impossible by construction
  (composite `(tenantId, vendorId)` FKs) and must be rejected, not attempted.
- **MUST:** Admin-gated (same gate as the existing archive action).
- **MUST:** Handle the `@@unique([tenantId, name])` constraint — a merge frees the loser's name; a
  remove frees it too.
- **SHOULD:** Reconcile the QBO `externalVendorId` cache on merge (survivor keeps its own; if the
  survivor has none and the loser has one, copy it forward so QBO ties survive).
- **SHOULD:** When BOTH vendors carry a *different* `externalVendorId` (two distinct QBO vendors),
  require an explicit admin acknowledgement of the accounting implication and record it to audit —
  do not silently merge two live QBO mappings.
- **SHOULD:** Show a pre-merge impact preview (how many materials/lots/bills/contacts will move)
  before confirming.
- **MUST:** An assistant `merge_vendors` tool (confirm-gated) + a read-only "possible duplicate
  vendors" detector, with a golden eval case (Unit 9 — confirmed in scope at the plan gate).

## Scope Boundaries

**In scope:**
- New cores `mergeVendorsCore`, `removeVendorCore`, and a `getVendorUsage` reference-count loader in
  `src/lib/vendors/vendors.ts`.
- New admin server actions `mergeVendorsAction`, `removeVendorAction` in `src/lib/vendors/actions.ts`.
- Merge + Remove UI in `src/app/(app)/setup/vendors/VendorsClient.tsx` (impact preview + confirm).
- Pure merge/remove validation + planning helpers in `src/lib/vendors/vendors-shared.ts`.
- `verify:tenant-isolation` cases + unit tests.
- A decision-ledger entry legislating merge/remove semantics (currently unlegislated).

**Out of scope:**
- **Merging vendors *inside* QuickBooks.** A local merge does NOT merge the two QBO vendors; already
  posted bills stay in QBO under whichever vendor they posted to. We surface this; we don't automate
  a QBO-side merge (that's a QBO API project + accountant call).
- **Rewriting `ap_export_event` amounts/accounts.** Those events are immutable by design (D19 / PII);
  merge only swaps the `vendorId` pointer.
- **Bulk/auto dedupe.** One explicit merge at a time, admin-driven. No fuzzy auto-merge.
- **Un-merge / undo.** A merge is a durable admin action recorded in audit; there's no one-click
  reversal in this plan (the loser is gone). Flagged as a risk, not built.

## Research Summary

### Codebase Patterns
- **Vendor cores:** `src/lib/vendors/vendors.ts` — `findOrCreateVendorCore`, `createVendorCore`,
  `updateVendorCore`, `archiveVendorCore` (the only "removal" today), `ensureUnknownVendor`,
  `listVendors`. All mutations wrap `runInTenantTx` + `writeAudit`. Pure sanitizers/matchers live in
  `src/lib/vendors/vendors-shared.ts` (no server imports — client + test safe).
- **Actions:** `src/lib/vendors/actions.ts` — `createVendorAction`/`updateVendorAction` are
  `action()` (ready-user); `archiveVendorAction` is `adminAction()` (admin-only). New merge/remove
  actions follow the `archiveVendorAction` gate. `revalidateVendors()` revalidates `/setup/vendors`
  + `/setup/expendables`.
- **UI:** `src/app/(app)/setup/vendors/page.tsx` (RSC, `listVendors`) → `VendorsClient.tsx`
  (search + Add + Edit + admin Archive/Restore). Merge/Remove slot in next to Archive.
- **The four vendor FKs (the whole risk surface):** all raw-SQL composite `(tenantId, vendorId)` →
  `vendor(tenantId, id)`, but each referencing model IS a Prisma model, so re-pointing is a plain
  `updateMany({ where: { vendorId: loserId }, data: { vendorId: survivorId } })` through the tenant
  extension — no `$executeRaw` needed (which keeps us clear of the raw-SQL-scoping gotcha).

  | Table | Column | Nullable | onDelete |
  |---|---|---|---|
  | `cellar_material` | `vendorId` | yes | **RESTRICT** |
  | `supply_lot` | `vendorId` | yes | **RESTRICT** |
  | `ap_export_event` | `vendorId` | yes | **RESTRICT** (the A/P bill ref) |
  | `vendor_contact` | `vendorId` | no | CASCADE |

  A full-schema grep confirms **no other table** references a vendor.
- **Legacy mirror:** `CellarMaterial.vendor` / `vendorUrl` free-text columns are kept in sync from
  `vendorId` by `resolveVendorMirror` (`src/lib/cellar/materials.ts:142-155`). Re-derive on merge.
- **Isolation harness:** `scripts/verify-tenant-isolation.ts` already seeds vendor + vendor_contact
  and asserts the composite FK rejects cross-tenant refs (~lines 560-579). New merge/remove cases go
  alongside. Pure-logic unit tests: `test/vendors-shared.test.ts`.

### Prior Learnings
- **`prismabase-rls-zero-rows-gotcha`** — reading an RLS table via `prismaBase` returns 0 rows, not
  an empty set. Reference-count reads + the merge tx must run tenant-scoped (`runInTenantTx` /
  `runAsTenant` / `listVendors`'s pattern), never bare `prismaBase`.
- **`raw-sql-tenant-scoping`** — `$executeRaw`/`$queryRaw` bypass the tenant extension. We avoid this
  entirely by re-pointing via Prisma `updateMany` through the extended client inside `runInTenantTx`.
  If any raw SQL is unavoidable, it must run in `runInTenantTx`/`runInTenantRawTx` with an explicit
  `"tenantId" = …` predicate (guarded by `verify:raw-sql`).
- **`plan069-vendor-management-shipped`** — the seeded per-tenant **"Unknown / Unspecified"** vendor
  (`ensureUnknownVendor`) is a natural sink and is itself un-removable (it's the fallback). Guard
  merge/remove against targeting it as a *loser*.
- No rstack learning or context-ledger decision exists for vendor merge/dedup → semantics are
  **unlegislated**; capture a decision when built (Unit 8).

### External Research
None needed — no new framework surface; all internal Prisma + tenant-tx patterns.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Re-point vs delete-and-orphan | Re-point all 4 FK types loser→survivor, then delete loser | Force-delete with orphan cleanup | RESTRICT exists to protect A/P history; re-pointing is the only correct dedupe |
| Loser fate after merge | **Hard-delete** the loser (audit records the merge) | Soft-archive the loser | User wants the dup *gone* from the list; the merge audit is the trail; archive would leave clutter |
| Re-point mechanism | Prisma `updateMany` through the tenant extension inside `runInTenantTx` | `$executeRaw` UPDATEs | Each ref is a Prisma model; extension keeps it tenant-scoped and dodges the raw-SQL gotcha |
| Contacts on merge | Re-point `vendor_contact` to survivor (bring them over) | Let CASCADE drop them | Losing the loser's contacts is silent data loss; re-point, user can dedupe by edit |
| Remove when referenced | Block with counts + guidance (archive or merge) | Attempt hard-delete → RESTRICT 500 | Never surface a raw DB error; make the fix path obvious |
| QBO mapping conflict (both have a *different* `externalVendorId`) | Require explicit admin acknowledgement, record to audit; survivor keeps its own mapping | Silently merge / hard-block | The two are distinct live QBO vendors; the user must know past posted bills stay under the old QBO vendor. Recommend accountant review |
| QBO mapping copy-forward | If survivor has no `externalVendorId` and loser has one, copy it to survivor | Leave survivor unmapped | Preserves the QBO tie so future posts still land on a mapped vendor |
| "Unknown / Unspecified" vendor | Cannot be a merge *loser* or a remove target | Allow it | It's the seeded fallback sink; deleting it breaks the null-vendor path |

## Implementation Units

### Unit 1: Pure merge/remove validation + planning helpers

**Goal:** Testable, server-free logic for what a merge/remove is allowed to do.
**Files:** `src/lib/vendors/vendors-shared.ts` (extend), `test/vendors-shared.test.ts` (extend)
**Approach:** Add pure functions: `validateVendorMerge({ loserId, survivorId, unknownVendorId })`
returning an error code union (`SAME_VENDOR`, `LOSER_IS_UNKNOWN`, `MISSING`) or ok; `resolveMergedName`
(survivor's name wins — the loser's name is freed); `resolveMergedExternalVendorId(survivor, loser)`
returning `{ value, conflict: boolean }` per the QBO decision above. Keep the reference-count *shape*
type (`VendorUsage = { materials; lots; apEvents; contacts }`) here so UI + core share it.
**Tests:** same-vendor rejected; loser-is-Unknown rejected; missing ids rejected; name resolution
picks survivor; external-id copy-forward when survivor null + loser set; external-id conflict flagged
when both set and different; no conflict when equal or one side null.
**Depends on:** none
**Execution note:** test-first
**Patterns to follow:** existing pure helpers in `vendors-shared.ts`; `test/vendors-shared.test.ts`.
**Verification:** `npx vitest run test/vendors-shared.test.ts` green.

### Unit 2: Vendor usage / reference-count loader

**Goal:** One tenant-scoped read that returns how many materials, supply lots, A/P events, and
contacts point at a vendor — powering both the UI preview and the remove guard.
**Files:** `src/lib/vendors/vendors.ts` (add `getVendorUsage`)
**Approach:** `getVendorUsage(id, opts?: { tenantId? }): Promise<VendorUsage>` — count via the
extended `prisma` (`cellarMaterial.count`, `supplyLot.count`, `apExportEvent.count`,
`vendorContact.count`) each filtered by `vendorId`, wrapped like `listVendors` (tenant-scoped;
`runAsTenant` when `tenantId` passed). Never `prismaBase` (RLS zero-rows gotcha).
**Tests:** covered indirectly by the isolation script (Unit 7); no pure unit test (DB read).
**Depends on:** Unit 1 (for the `VendorUsage` type)
**Patterns to follow:** `listVendors` tenant-wrap in `vendors.ts:149-171`.
**Verification:** called from the isolation script asserts correct counts before/after merge.

### Unit 3: `mergeVendorsCore`

**Goal:** The heart of the feature — atomically re-point all references and retire the loser.
**Files:** `src/lib/vendors/vendors.ts` (add `mergeVendorsCore`)
**Approach:** `mergeVendorsCore(actor, { loserId, survivorId, acknowledgeQboConflict? })`. Inside one
`runInTenantTx`: (1) load both vendors, run `validateVendorMerge`; (2) compute
`resolveMergedExternalVendorId` — if `conflict` and not `acknowledgeQboConflict`, throw
`ActionError('CONFLICT', …)` with a QBO-conflict message; (3) `updateMany` re-point
`cellar_material`, `supply_lot`, `ap_export_event`, `vendor_contact` from loserId → survivorId;
(4) for re-pointed materials, re-derive the legacy `vendor`/`vendorUrl` mirror to the survivor via
`resolveVendorMirror` (fetch survivor name/url once, `updateMany` the mirror on rows now pointing at
survivor that came from the loser — or simplest correct: set mirror on all of the loser's former
materials); (5) if `resolveMergedExternalVendorId` says copy-forward, update survivor's
`externalVendorId`; (6) `delete` the loser (now zero refs); (7) `writeAudit` with
`{ loserId, survivorId, moved: usageCounts, qboConflictAcknowledged }`. Return
`{ survivorId, moved }`. Follow the ledger-write conventions used in `src/lib/accounting/` given
`ap_export_event` is money-adjacent (single tx, no partial re-point).
**Tests:** exercised end-to-end by Unit 7 isolation cases; pure branches covered in Unit 1.
**Depends on:** Units 1, 2
**Execution note:** characterization-first — write the isolation-script assertions (Unit 7) against
the intended behavior before finalizing the core.
**Patterns to follow:** `updateVendorCore` tx + audit shape (`vendors.ts:96-135`); `resolveVendorMirror`
(`src/lib/cellar/materials.ts:142-155`).
**Verification:** `npm run verify:tenant-isolation` merge case green; `npm run verify:raw-sql` green
(no new raw SQL introduced).

### Unit 4: `removeVendorCore`

**Goal:** Hard-delete a vendor when it's safe; block with guidance when it isn't.
**Files:** `src/lib/vendors/vendors.ts` (add `removeVendorCore`)
**Approach:** `removeVendorCore(actor, id)`. In `runInTenantTx`: guard `id` is not the Unknown vendor
(throw CONFLICT); `getVendorUsage(id)`; if `materials + lots + apEvents > 0` throw
`ActionError('CONFLICT', 'Vendor is used by N materials, M lots, K bills — archive it or merge it
into another vendor instead.')`; else `delete` the vendor (contacts CASCADE) + `writeAudit`. Contacts
alone do NOT block removal (they cascade).
**Tests:** isolation script — remove blocked when referenced, allowed when clean; Unknown-vendor
removal rejected.
**Depends on:** Unit 2
**Patterns to follow:** `archiveVendorCore` gate + audit (`vendors.ts:137-145`).
**Verification:** isolation script remove cases green.

### Unit 5: Server actions

**Goal:** Admin-gated entry points the UI calls.
**Files:** `src/lib/vendors/actions.ts` (add `mergeVendorsAction`, `removeVendorAction`,
`getVendorUsageAction`)
**Approach:** All three `adminAction()` (match `archiveVendorAction`). `mergeVendorsAction` →
`mergeVendorsCore`; `removeVendorAction` → `removeVendorCore`; `getVendorUsageAction` →
`getVendorUsage` (for the preview; or fold usage into the page load if simpler). Each returns
`{ ok, ... }` and calls `revalidateVendors()` on success. Return `{ ok: false, error }` on ActionError
(don't throw — server-action-actionerror-redacted-in-prod pattern).
**Tests:** none direct (thin wrappers).
**Depends on:** Units 3, 4
**Patterns to follow:** `archiveVendorAction` in `actions.ts`.
**Verification:** typecheck + the UI (Unit 6) drives them.

### Unit 6: Merge + Remove UI in VendorsClient

**Goal:** Admin can merge or remove from `/setup/vendors` with a clear impact preview.
**Files:** `src/app/(app)/setup/vendors/VendorsClient.tsx`, maybe a new
`src/components/vendors/MergeVendorModal.tsx`
**Approach:** Add (admin-only) a "Merge" and "Remove" affordance per vendor row (next to
Archive/Restore). **Merge:** open a modal that picks the *survivor* from a `VendorPicker` of the
other vendors, then shows the impact preview from `getVendorUsageAction` ("X materials, Y supply
lots, Z A/P bills, W contacts will move to **<survivor>**; **<loser>** will be permanently
deleted"). If a QBO conflict is detected, show the acknowledgement checkbox before enabling Confirm.
**Remove:** if `getVendorUsage` shows references, the button explains it's used and offers Merge or
Archive instead; if clean, a confirm → `removeVendorAction`. Reuse existing modal/confirm patterns.
**Tests:** manual browser QA (Demo Winery); no jsdom in repo (assistant/UI is manual-QA per
`assistant-dock-history-shipped` learning).
**Depends on:** Unit 5
**Patterns to follow:** `EditVendorModal`/`CreateVendorModal` + Archive button in `VendorsClient.tsx`;
`VendorPicker` (`src/components/vendors/VendorPicker.tsx`).
**Verification:** browser QA — merge Scott Labs → Scott Laboratories on Demo; list drops to 3;
re-point proven by a `runAsTenant` read-back script.

### Unit 7: Isolation cases + governed-money proof

**Goal:** Prove the merge re-points every reference, the loser deletes cleanly, remove is guarded,
and nothing crosses tenants.
**Files:** `scripts/verify-tenant-isolation.ts` (extend), optionally `test/vendors-merge.test.ts`
**Approach:** In the tenant-B block, seed a *loser* vendor with one `cellar_material`, one
`supply_lot`, one `ap_export_event`, and one `vendor_contact`, plus a *survivor* vendor. Run
`mergeVendorsCore`; assert: all four `vendorId`s now equal survivor, the loser row is gone, the
material's legacy `vendor` mirror equals the survivor's name, and counts match. Assert a cross-tenant
merge (survivor in tenant A) is rejected. Assert `removeVendorCore` throws when referenced and
succeeds when clean, and that the Unknown vendor can't be removed. Respect the existing RESTRICT
cleanup ordering (children before vendors).
**Tests:** this IS the test.
**Depends on:** Units 3, 4
**Patterns to follow:** existing vendor isolation block (~`verify-tenant-isolation.ts:560-579`) +
its cleanup ordering (`:760-763`).
**Verification:** `npm run verify:tenant-isolation` green (existing 110 checks + new merge/remove);
`npm run verify:raw-sql`, `npm run verify:naming`, `npx vitest run` green.

### Unit 8: Decision-ledger entry + docs

**Goal:** Legislate the (currently unlegislated) merge/remove semantics, especially the A/P + QBO edge.
**Files:** context-ledger (via `propose_decision`), `docs/architecture/security-register.md` or a
short note if the QBO-conflict handling warrants it, `NOW.md`
**Approach:** Record: merge re-points all four FK types + retires the loser; `ap_export_event` is
re-pointed (never rewritten); local merge ≠ QBO merge; QBO-mapping conflict requires admin ack +
accountant review. Note that D19/PII is unaffected (we only move pointers, add no PII columns).
**Tests:** none.
**Depends on:** Units 3-7 (record what was actually built)
**Verification:** decision recorded; `NOW.md` updated.

### Unit 9: Assistant surface (in scope — confirmed at plan gate)

**Goal:** "merge Scott Labs into Scott Laboratories" by chat + a read-only duplicate detector.
**Files:** `src/lib/assistant/tools/merge-vendors.ts`, registry + commit wiring, golden eval case
**Approach:** A confirm-gated write tool `merge_vendors` wrapping `mergeVendorsAction`, resolving both
vendors by name via `findVendorsByName` (disambiguation picker when ambiguous; surface the impact
preview in the confirm card). Extend `query_vendors` to flag same-normalized-name candidates as
"possible duplicates." Golden eval case is a hard CI gate for write tools (D26/H8).
**Depends on:** Unit 5
**Patterns to follow:** `create-vendor.ts` tool + committer; `registry.ts`/`commit.ts` wiring.
**Verification:** `npm run eval:assistant` golden green.

## Test Strategy

**Unit tests:** pure merge/remove logic in `test/vendors-shared.test.ts` (Unit 1) — validation,
name resolution, QBO external-id copy-forward vs conflict.
**Integration/governed-money proof:** `scripts/verify-tenant-isolation.ts` (Unit 7) is the real
proof — it exercises `mergeVendorsCore`/`removeVendorCore` against a real Neon tenant with all four
reference types seeded, and asserts re-point + clean delete + cross-tenant rejection. This is the
"the script proves the DB" half of the repo's QA doctrine.
**Manual verification:** browser QA on **Demo Winery** — merge "Scott Labs" → "Scott Laboratories",
confirm the list drops from 4 to 3, then a `runAsTenant("org_demo_winery", …)` read-back confirms
every former Scott-Labs material/lot/bill now points at Scott Laboratories. QA fixtures are `QA-*`
prefixed; keep `verify:naming` green before and after.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Merge re-points a bill to a survivor mapped to a *different* QBO vendor → local/QBO mismatch on already-posted bills | MED | HIGH | Detect the `externalVendorId` conflict; require explicit admin ack + audit; recommend accountant review; document that local merge ≠ QBO merge |
| A reference type is missed → orphaned/broken bill | LOW | HIGH | Full-schema grep confirms exactly 4 FKs; isolation script seeds and asserts all 4; RESTRICT would surface a missed one as a delete failure, not silent corruption |
| Merge partially applied (some refs moved, loser delete fails) | LOW | HIGH | Entire operation in one `runInTenantTx`; atomic — all-or-nothing |
| No un-merge / undo | MED | MED | Confirm dialog with explicit impact preview; audit row records the merge; call it out in the UI copy ("permanently deleted") |
| Someone merges/removes the "Unknown / Unspecified" sink | LOW | MED | Guard: Unknown can't be a loser or a remove target |
| Legacy `vendor`/`vendorUrl` mirror left stale on re-pointed materials → UI shows old name | MED | LOW | Re-derive mirror via `resolveVendorMirror` in the same tx (Unit 3 step 4) |
| RLS zero-rows on a bare read during preview/guard | LOW | MED | All reads tenant-scoped via `getVendorUsage`/`listVendors` pattern, never `prismaBase` |

## Success Criteria

- [ ] Merge re-points `cellar_material`, `supply_lot`, `ap_export_event`, and `vendor_contact` from
      loser → survivor and hard-deletes the loser, in one atomic tenant tx, with an audit row.
- [ ] Re-pointed materials show the survivor's name in the legacy mirror (no stale vendor text).
- [ ] Remove hard-deletes a zero-reference vendor and blocks (with counts + guidance) a referenced
      one; the Unknown vendor can't be removed.
- [ ] QBO `externalVendorId`: copy-forward when survivor unmapped; conflict requires admin ack + audit.
- [ ] Cross-tenant merge is rejected.
- [ ] `npm run verify:tenant-isolation`, `verify:raw-sql`, `verify:naming`, `npx vitest run`, and
      `next build` all green.
- [ ] Browser-QA on Demo: "Scott Labs" merged into "Scott Laboratories"; list 4 → 3; read-back proves
      the re-point.
- [ ] Decision-ledger entry recorded; `NOW.md` updated.
