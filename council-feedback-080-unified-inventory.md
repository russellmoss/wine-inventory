# Council Feedback — Plan 080 Unified Inventory Refactor
**Date**: 2026-07-19
**Reviewers**: Codex gpt-5.4 (types + data layer + accounting invariants), Gemini 3.1-pro (product logic + data quality + UX)
**Plan**: docs/plans/2026-07-19-080-refactor-unified-inventory-plan.md

## Headline
Both models independently flagged the SAME top issue: the "silent fallback to all-location FIFO" for
consumption (the fix added in eng-review) **destroys per-location truth**. That's a genuine reversal — the
eng-review fix trades one wrong (UNKNOWN cost) for another (fabricated location balances). Plus three more
CRITICALs neither the plan nor eng-review caught: a `targetKind` default footgun, mixed-invoice GL-account
routing to QuickBooks, and the finished-goods cost model being a single mutable column.

## Critical Issues (cross-model, ranked)

### C1 — Consumption location model is wrong either way [Codex + Gemini AGREE]
The eng-review "silent fallback to all-location FIFO when the op's location is empty" makes per-location
on-hand permanently false: dose yeast in Cellar A (0 there), system secretly draws from "Winery", location
data never reflects reality. Codex: no silent cross-location fallback — require a source location OR keep
legacy stock in an explicit `unassigned` bucket and consume only from there until migrated. Gemini: allow
**negative inventory at the op's location** (accurately "we consumed it here, we owe a receipt/transfer") +
flag negatives for mandatory cycle-count reconciliation; never cross-contaminate. **This is the #1 decision.**

### C2 — `IngestedInvoiceLine.targetKind @default("MATERIAL")` is a silent-misposting footgun [Codex]
Old extractor/manual callers keep compiling, stage lines with no explicit discriminator, and apply treats
them as materials. Worse than a compile break. Fix: expand/contract — nullable target fields, a TS
discriminated union for staging/apply input, REQUIRE explicit target before apply, backfill legacy rows,
then drop the default.

### C3 — Mixed invoice → QuickBooks GL-account routing [Gemini]
"One aggregate A/P Bill" with a single debit account corrupts the balance sheet when lines span categories:
a $4000 pump → Fixed Assets, a $2 clamp → Supplies Expense, 12 merch wines → Inventory Asset. The current
`emitApExportForInvoice` posts to ONE `apInventoryAccount`. Mixed target kinds MUST map each line to its own
GL account by category. Accounting requirement, not a preference. The bill stays ONE (AP-1 intact) but needs
per-line account coding.

### C4 — Finished-goods cost model: a single mutable `unitCogs` column is not governed cost [Codex + Gemini]
Codex: one mutable column on WineSku/FinishedGood can't preserve receipt history / partial depletion /
valuation, and putting it on BOTH is a dual source of truth (last-writer-wins). Gemini: internally-produced
wine keeps specific-lot costing from bottling (unchanged); only 3rd-party FG (library buy-backs, merch) need
a cost, via WEIGHTED-AVERAGE through a receipt layer, not last-cost (a single buy-back at 300% markup would
whipsaw COGS). Convergence: don't store mutable FG cost on the SKU; use a FG receipt/cost-layer table, or
keep FG-invoice receipts non-authoritative and out of governed cost math for v1.

### C5 — `createdEquipmentAssetId?` singular FK can't represent qty>1 → N assets [Codex]
Plan says one line can create N assets but stores a single FK → loses provenance/reconciliation/undo. Fix: a
join table `IngestedInvoiceLineCreatedAsset(lineId, assetId)`.

### C6 — Wave ordering exposes mixed-target behavior before U5 exists [Codex]
U4 (manual invoice, Wave 1), U7 (+Add invoice, Wave 2), U12 (add-invoice tool, Wave 1) all surface
mixed-target intake, but U5 (the branch that routes non-material targets) is Wave 3. Result: feature gaps or
silent MATERIAL fallback. Fix: Wave 1 invoices are MATERIALS-ONLY; gate every mixed-target staging/UI/tool
behind U5.

### C7 — Mixed-invoice residual-allocation rule missing [Codex]
qty>1 asset creation + integer FG receipts + tax/shipping allocation + FX + base-currency rounding will make
Σ(created costs) ≠ the one aggregate bill unless a deterministic residual policy is defined: per-line base
amount, per-unit base-cost quantization, residual to last unit/line; test EXACT equality.

## Should-Fix (fold into /refine)
- **S1 Micro-lot fragmentation** [Gemini]: DB keeps split lots for cost; UI GROUPs by SKU+location+expiry
  ("10kg at Cellar A"), not raw 2.5kg micro-lots. (Also design-review.)
- **S2 LotDocument provenance by COPYING is incorrect** [Codex]: copies diverge; later source docs don't
  reach split children. Model lineage (`splitFromLotId`/lot-edge), derive transitively — REVERSES the
  eng-review "mirror LotDocument" fix.
- **S3 MaterialMovement integrity** [Codex]: composite FKs `(tenantId,materialId/locationId/supplyLotId)`;
  ENUM `kind` not free string; index real read paths. (Tensions with house "validated strings" pattern.)
- **S4 FIFO determinism/concurrency** [Codex]: order `(receivedAt,id)` + matching/partial-on-open index;
  `FOR UPDATE` stable order OR tested serializable-retry for concurrent transfer/adjust; single Decimal
  scale + round before write.
- **S5 listMaterials N+1** [Codex]: one aggregate grouped by `(materialId,locationId)`; batch-hydrate
  location metadata.
- **S6 Equipment cost currency muddy under COST-4** [Codex]: `purchaseCostBase` or full
  `sourceCurrency/sourceAmount/fxRate/baseAmount` (mirror SupplyLot FX quintet).
- **S7 SupplyLot.locationId deploy safety** [Codex]: nullable, NO `@default("")`; ensure/create system
  location per tenant FIRST; backfill; deploy writers with explicit locationId; THEN FK + NOT NULL.
- **S8 Vintage soft-confirm ONLY when Category=Wine** [Gemini]: never on merch.
- **S9 Chooser friction** [Gemini]: one screen — AI dropzone on top, manual form below, drop→autofill.
  (Design-review.)
- **S10 FX on manual entry** [Gemini]: manual form + AI review capture currency + locked FX rate.
- **S11 FG resolve/create authority** [Codex]: resolve/create WineSku/FinishedGood at REVIEW time, not
  apply-time auto-create (irreversible).
- **S12 LotDocument exactly-one-of CHECK** [Codex]: if generalized with nullable equipmentAssetId, add a
  CHECK so a row points at exactly one of supplyLot/asset.

## Design Questions — ANSWERED by council (need your sign-off)
1. **FG COGS rule** → internally-produced wine keeps specific-lot cost from bottling; 3rd-party/merch use
   WEIGHTED-AVERAGE via a receipt layer (not last-cost). Relax "never overwrite" to "lock ONLY when
   provenance = an internal bottling run" so a library buy-back CAN be costed.
2. **Equipment qty>1** → decide by CATEGORY, not qty: Equipment (capitalized) → N individual
   trackable/depreciable assets; Parts (expensed) → 1 lot, qty N (consumable-style).
3. **Opening-lot correction after split** → cascade the corrected cost to all UNCONSUMED child lots; if ANY
   child already hit COGS, lock the origin + force a manual journal entry. No retroactive COGS mutation.

## Cross-model vs USER tension (NOT auto-applied — user sovereignty)
- **Gemini recommends KILLING the in-progress read-only tab** ("inventory is for doing; a read-only tank
  list is a dead-end"). This contradicts the user's EXPLICIT requirement for an in-progress reflection
  surface. The requirement STANDS unless the user changes it. If kept: make it per-vessel + click-through,
  not a flat list.

---
## Raw Response — Codex (gpt-5.4)

CRITICAL
- targetKind @default("MATERIAL") silent misposting footgun → expand/contract, discriminated union, require explicit target.
- createdEquipmentAssetId? can't represent qty>1 → join table IngestedInvoiceLineCreatedAsset.
- consume fallback to all-location FIFO destroys location truth → no silent cross-location fallback; require source or explicit unassigned bucket.
- SupplyLot.locationId @default("") + composite FK deployment-unsafe → nullable no default; create system location; backfill; deploy writers; then FK; then NOT NULL.
- backfill assumes every tenant has system Winery location → migration must create/resolve canonical system location per tenant first.
- routing asset/FG branches inside applyIngestedInvoiceCore risks AP-1 unless side-effect free → pure inner helpers accepting outer tx + emitAp=false; one outer tx, one outbox event.
- FG cost single mutable unitCogs not a governed cost model → FG receipt cost-layer table, or keep FG receipt non-authoritative.
- unitCogs on both WineSku and FinishedGood = dual source of truth → pick one authoritative entity or receipt layers.
- MaterialMovement under-specified → composite FKs, enum not free string, index read paths.
- transfer provenance by copying LotDocument incorrect → model lineage (splitFromLotId), derive transitively.
- phase ordering wrong: U4/U7/U12 expose mixed-target before U5 → Wave 1 materials-only, mixed-target behind U5.
- mixed invoice math needs residual-allocation rule → per-line base amount, per-unit quantization, residual to last unit/line, test exact equality.

SHOULD FIX
- FIFO scan index incomplete → order (receivedAt,id) + matching/partial index.
- updateMany+gte doesn't prevent transfer thrash from stale reads → FOR UPDATE stable order or serializable-retry tested.
- decimal decrement needs a quantization rule → single scale, round before write.
- listMaterials GROUP-BY likely N+1 → one aggregate query grouped by (materialId,locationId).
- equipment cost fields muddy under COST-4 → purchaseCostBase or source amount/rate.
- LotDocument nullable equipmentAssetId needs exactly-one-of CHECK constraint.
- opening-lot correction is a corruption path not an open question → block after any split/transfer or use immutable opening-stock artifact.
- validation gates underspecified per wave → W1 migration dry-run+isolation+concurrent-transfer+AP-1-exact-one; W2 build+RSC boundary; W3 mixed-invoice matrix + rounding.

DESIGN QUESTIONS
- if consumption stays location-agnostic, what location on MaterialMovement CONSUME? "none/best-effort" = broken audit.
- FG resolve/create authority: manual review vs assistant vs apply-time auto-create? auto-create in apply risky/irreversible.
- accounting meaning of a FG invoice receipt before a real FG cost-layer model exists?
- assistant parity insufficient → invariant for proposal payload typing so tools can't stage missing targetKind/locationId/ambiguous ids.

## Raw Response — Gemini (3.1-pro)

CRITICAL
1. Backfill + dosing fallback destroys location tracking → abandon silent cross-location fallback; allow NEGATIVE inventory at the op's location + flag for mandatory cycle-count reconciliation.
2. Mixed invoice GL routing to QuickBooks → aggregate bill with one debit account corrupts balance sheet; route each line to its GL account by item type/category (Fixed Assets vs Supplies Expense vs Inventory Asset).
3. Foreign currency omission → manual form + AI review must capture Currency + Exchange Rate; sync in source currency or explicit locked rate.

SHOULD FIX
4. FIFO micro-lot fragmentation on transfers → UI must group by SKU+Location+Expiry; raw micro-lot list unusable.
5. Vintage soft-confirm on merchandise → apply strictly only when Category=Wine.
6. Read-only In-Progress tab is a dead end → Gemini recommends killing it; USER requirement — keep, make useful.
7. Manual vs AI chooser friction → one screen: AI dropzone on top, manual form below, drop→autofill.

DESIGN QUESTIONS (answered)
8. FG COGS: internally-produced keeps specific-lot from bottling; 3rd-party/merch = weighted-average (not last-cost); relax "never overwrite" to "lock only if provenance = internal bottling run".
9. Equipment qty>1: decide by category — Equipment→N individual assets (tag/depreciate); Parts→1 lot qty N.
10. Opening-lot correction after split: cascade to unconsumed children; if any child consumed, lock + manual journal entry; no retroactive COGS mutation.
