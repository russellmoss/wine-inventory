# Council Feedback — Bhutan Wine Company Inventory Plan

**Date**: 2026-06-14
**Plan reviewed**: docs/plans/2026-06-14-001-feat-bhutan-wine-inventory-plan.md
**Reviewers**: Codex/gpt-5.4 (schema + auth + data layer), Gemini 3.1 Pro (winemaking domain + data quality + UX)

## Critical Issues

### Schema / data-integrity (both reviewers)
1. **Store `totalBottles`, not `fullCases`+`looseBottles`.** Two columns is a normalization trap (loose can drift to 14, cases/loose desync). Persist one integer `totalBottles`; derive cases/loose in display logic. Affects `BottledInventory`, Units 10/11.
2. **DB-level CHECK constraints, not just app validation.** Add raw-SQL `CHECK (volumeL >= 0)`, `quantity >= 0`, `bottles >= 0`, positive capacity. Protects against bugs, seeds, concurrency, direct SQL. Units 1/8/9/10/11/12.
3. **Soft-delete reference/master data; never hard-delete with history.** Deleting a Variety/Vineyard/Location referenced by a BottlingSource either crashes (FK Restrict) or wipes history (Cascade). Use `isActive` flags + `onDelete: Restrict`/`SetNull`. Units 1/6/7/8/12.
4. **Bottling math: volume drawn ≠ bottles produced.** Real bottling loses volume (line priming, filters, spills, heels). If you force `bottles = drawnL / 0.75`, leftover liters get stuck in the vessel forever. Record `volumeDrawnL` (decremented) AND `bottlesProduced` (user input) separately; the delta is logged bottling loss. Unit 10 + data model.

### Winemaking domain (Gemini)
5. **Missing vintage on bulk `VesselComponent`.** A 2022 Merlot ≠ a 2023 Merlot. Without vintage on bulk, traceability and the SKU's legal vintage can't be proven. A component identity = Variety + Vineyard + **Vintage**. Data model, Units 9/10.
6. **No way to transfer/rack/top-up/add to bulk.** Wine moves between vessels, loses volume to racking/evaporation, gains volume from additions, and blends *before* bottling. Today the only way to reduce a vessel is to fake a bottling run. Need a bulk-movement/adjustment model. BULK, Units 9.

### Auth / Better Auth integration (Codex)
7. **Make Better Auth the schema source of truth, not hand-written models.** Better Auth expects specific `user`/`session`/`account`/`verification` columns (`emailVerified`, `image`, `session.updatedAt`, `account.accountId/providerId/password`); the admin plugin adds `role`, `banned`, `banReason`, `banExpires`, `session.impersonatedBy`. Hand-rolling first guarantees drift on sign-in, createUser, setPassword, revocation. Fix: configure Better Auth + plugins first, generate its schema, add `mustChangePassword` via `additionalFields`. **Reorder: auth schema before the app migration depends on it.** Units 1/3.
8. **Role/disable mismatch.** Plan uses `role ADMIN|USER` enum + `disabled bool`; Better Auth admin uses lowercase string roles `admin`/`user` and `banned` semantics. Uppercase enum won't match plugin defaults, and a `disabled` user can still authenticate unless a sign-in hook rejects them. Align to the plugin (or fully define custom access control + a disablement hook). Units 3/4/13.
9. **`mustChangePassword` has bypass paths.** Better Auth admin endpoints enforce role but know nothing about your password-change flag — an admin flagged for reset could still hit admin APIs. Never expose privileged Better Auth actions to the client; wrap them in server actions behind one `requireReadyUser`/`requireAdmin` gate that also checks the flag. Apply the gate to reads + route handlers too, not just mutations. Units 4/13.
10. **Bottling transaction is not race-safe.** Prisma defaults to ReadCommitted; two concurrent bottling runs can overdraw a vessel. Use an interactive `$transaction` at Serializable isolation with retry, or conditional `updateMany` with row-count checks / optimistic version tokens on every decrement. Unit 10.
11. **Atomic audit doesn't hold for Better-Auth-managed writes.** "mutate + audit in one transaction" breaks when the mutation is `auth.api.createUser`/`setUserPassword`/`removeUser` (separate DB writes). Decide: accept non-atomic auth audit (documented) or use Better Auth database hooks to couple them. Units 3/4/13.

## Design Questions (need your input)

1. **Vintage on bulk wine** — add `vintage` to bulk components (component = variety + vineyard + vintage)? (Strongly recommended; affects legal vintage + traceability.)
2. **Bulk movements** — do you need transfer-between-vessels, racking/topping (volume loss), and additions (volume up) now, or is "fill a vessel, then bottle it" enough for v1? This is the biggest scope lever.
3. **Bottling losses / heels** — model bottling loss explicitly (drawn volume vs bottles produced) and prompt to write off leftover "heel" liters when emptying a vessel?
4. **Finished goods scope** — confirm Finished Goods = non-wine merch only (t-shirts, corkscrews, glasses), and bottled wine lives only in Bottled Inventory (not bridged into Finished Goods)?
5. **Movement ledger vs balance edits** — for bottled wine + finished goods, keep simple editable balances (with audit), or a movement/adjustment ledger (cleaner for transfers/shrinkage)?
6. **Delete policy** — soft-delete (deactivate) everywhere including users, to preserve audit/history? (Recommended.)

## Suggested Improvements
- "Unblended vs blended" by **variety ratio**, not row count: a tank with 2 single-vineyard Merlot rows is still "100% Merlot" (unblended variety). Report total unblended-variety volume vs that variety trapped in blends, aggregated across vessels.
- Bottling UX: user picks **vessel + total liters to draw**; system proportionally deducts each component (don't make them enter per-component volumes).
- `VesselComponent` needs a uniqueness/identity rule (`@@unique([vesselId, varietyId, vineyardId, vintage])`) so decrements aren't ambiguous.
- Audit viewer needs a human-readable translation layer ("Admin changed Loose Bottles 10 → 12 at Winery"), not raw JSON.
- Historical FKs (`BottlingRun.createdById`, `AuditLog.actorUserId`) nullable + `SetNull` + snapshot `actorEmail`/`createdByEmail` so user deletion doesn't break history.
- Add non-unique indexes: `VesselComponent(vesselId)`, `BottlingSource(bottlingRunId|vesselId)`, `BottledInventory(locationId)`, `FinishedGoodInventory(locationId)`, `AuditLog(createdAt)`, `AuditLog(entityType,entityId)`, `AuditLog(actorUserId)`.
- Fix dependency order: audit infra (Unit 5) before any audited auth flow (Units 3/4); Unit 10 depends on Unit 6 (locations); Unit 15 depends on auth setup.

## Things to Consider
- Bottle formats: 750ml locked for v1, but make `bottleSizeMl` an actual multiplier in the math so magnums/half-bottles are a config change later, not a rewrite (case size may also differ, e.g. 6/magnum case).
- Neon/Postgres UTF8 handles "Ser Kem Marp" fine; only revisit collation if non-Latin (Dzongkha) full-text search is needed.

---

## Raw Response — Codex (gpt-5.4)

CRITICAL
- Better Auth schema drift / wrong source of truth (Data Model, Units 1/3/13): plan hand-defines auth models but Better Auth expects its core schema (user.emailVerified, user.image, session.updatedAt, account.accountId/providerId/password); admin plugin adds user.role/banned/banReason/banExpires, session.impersonatedBy. Make Better Auth source of truth first; generate Prisma schema from the exact auth config/plugins; extend user via additionalFields for mustChangePassword.
- Role/disable model conflicts with admin plugin (Units 3/4/13): plugin uses string roles admin/user + banned semantics, not ADMIN|USER enum + disabled bool. disabled=true user can still authenticate unless custom check; uppercase enum won't match. Use plugin's role shape; use banned or add sign-in/session hook rejecting disabled users.
- Auth sequencing is backwards (Units 1 then 3): finalize auth schema before app migration depends on it, or rewrite twice.
- Bottling transaction not race-safe (Unit 10): Prisma default ReadCommitted; concurrent decrements overdraw. Use Serializable interactive tx with retry, or conditional updateMany row-count checks / optimistic tokens. Keep tx short.
- Bottle-count adjustment can create/destroy wine (Unit 10): "round(totalL/0.75), user adjusts" unsafe unless variance modeled. Add lossMl/wasteL with validation produced+loss ≈ consumed within tolerance.
- mustChangePassword gate has bypass paths (Units 4/13): DAL + server actions not enough if route handlers/Better Auth admin endpoints reachable. Wrap privileged auth actions in own server actions behind a single requireActiveUser/requireAdminReadyUser gate; apply to reads + route handlers.
- Atomic audit guarantee fails for Better-Auth-managed writes (Units 3/4/13): auth.api.createUser/setUserPassword/removeUser write separately. Decide: accept non-atomic (documented) or integrate via Better Auth hooks.

SHOULD FIX
- DB CHECK constraints (Units 1/8/9/10/11/12): non-negative volumes/counts, looseBottles 0..11, positive capacity.
- Reference-data delete via FK behavior (Units 1/6/7/8/12): onDelete Restrict for Location/Variety/Vineyard/FinishedGoodCategory/WineSku; deactivate vessels.
- User hard-delete vs audit/history (Units 1/13): soft-delete users or nullable historical FKs with SetNull + snapshot actorEmail/createdByEmail.
- VesselComponent natural uniqueness (Units 9/10): @@unique([vesselId, varietyId, vineyardId,...]) or a true lot entity.
- Bottled inventory storage shape (Units 10/11): store canonical totalBottles; derive case/loose.
- Index coverage underspecified (Units 1/14): VesselComponent(vesselId), BottlingSource(bottlingRunId), BottlingSource(vesselId), BottledInventory(locationId), FinishedGoodInventory(locationId), AuditLog(createdAt), AuditLog(entityType,entityId), AuditLog(actorUserId).
- Dependency order breaks (Units 3/4/5/10/15): Unit 3 LOGIN audit before audit infra; Unit 4 pw-change audit doesn't depend on Unit 5; Unit 10 uses destination locations but doesn't depend on Unit 6; Unit 15 seeds admin but doesn't depend on auth setup.

DESIGN QUESTIONS
- Bulk wine vintage / lot identity (Units 9/10): do contents span vintages/harvest lots/purchased-wine lots? If yes, need vintage/lot dimension.
- What is a real bottled SKU? (Units 10/11): is unique(name,vintage) enough vs immutable skuCode + label fields?
- Hard deletes anywhere? (Units 6/7/8/13): mixes block-when-referenced, deactivation, hard delete for users.
- Movement ledger for bottled/finished goods? (Units 11/12): balance edits vs movement/adjustment ledger for transfers/shrinkage.

Refs: better-auth.com/docs/concepts/database, /docs/adapters/prisma, /docs/plugins/admin; prisma.io transactions; nextjs.org proxy.ts.

## Raw Response — Gemini (3.1 Pro)

CRITICAL
1. Missing vintage on bulk components: add vintage(Int) to VesselComponent; component = Variety+Vineyard+Vintage.
2. No mechanism for bulk transfers/racking/adjustments: add BulkTransaction/VesselAdjustment — transfer A→B (combine components proportionally), adjust down (evaporation/spills/racking), adjust up (water/sugar/acid).
3. Perfect-math bottling fallacy & losses: detach drawn volume from produced volume; record totalVolumeDrawnL (decremented) AND actualBottlesProduced (user input); delta = bottling loss.
4. Data desync storing fullCases+looseBottles separately: store single totalBottles; cases/loose are presentation logic.
5. DB-level volume protection: raw SQL CHECK (volumeL >= 0) on VesselComponent and BottledInventory; let DB reject concurrent over-draws.

SHOULD FIX
1. "Unblended vs blended" too brittle: define by variety ratio (100% one variety = unblended variety regardless of vineyards); aggregate report total 100% Merlot vs Merlot in blends.
2. Proportional drawdown UX: user selects Vessel + Total Liters; system auto-deducts each component proportionally.
3. Deleting master data breaks history: no hard delete for Variety/Vineyard/Location; use isActive soft delete.
4. Audit log UX: translate JSON before->after into human-readable strings for non-technical staff.

DESIGN QUESTIONS
1. Ever bottle non-750ml? bottleSizeMl should be an active multiplier; magnums often 6/case.
2. Are Finished Goods really disconnected from Bottled Wine? Keep separate only if Finished Goods == non-wine merch; else need a bridge.
3. Heels/leftovers: prompt to write off remaining liters as waste when emptying a vessel, or tanks show 2.3L forever.
4. Unicode/collation: UTF8 handles it; full-text indexes may need tweaks for non-Latin script.
