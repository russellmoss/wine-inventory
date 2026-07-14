# ADR 0005 — SO₂ additions book stock at the material's active fraction

- Status: accepted
- Date: 2026-07-14
- Plan: `docs/plans/2026-07-14-066-fix-so2-kmbs-ledger-active-fraction-plan.md`

## Context

An SO₂ addition is specified by winemakers as a target in **ppm of SO₂** (mg/L). But the stock
material actually poured is usually **potassium metabisulfite (KMBS)**, which is only **57.6% SO₂**
by mass. The booking path (`recordNeutralDoseTx` → `consumeMaterialCore`) computed the dose as grams
of SO₂ and depleted/costed the SupplyLot **1:1 against that number** — never applying the KMBS active
fraction. Result: every ppm-based SO₂ addition **under-depleted and under-costed KMBS by ~1.74×**
(1 / 0.576). Inventory read high; SO₂ COGS read low. (The execution-view display was corrected earlier
in Plan 065; this ADR concerns the booked ledger, Plan 066.)

## Decision

1. **The recorded treatment stays the delivered active compound.** `LotTreatment.computedTotal`
   remains **grams of SO₂ delivered** — the physical truth of what the wine received.
2. **The stock draw + cost use the stock mass.** For a **ppm/mg/L (MG_L basis)** dose of a material
   whose `kind === "SO2"`, `consumeMaterialCore` scales the SupplyLot depletion and MATERIAL cost up by
   `1 / activeFraction` (KMBS: 18 g SO₂ → 31.25 g KMBS). Delivered ≠ stock mass, and they legitimately
   diverge for a partial-strength carrier.
3. **Active fraction source:** the material's `CellarMaterial.percentActive` when set (0 < p ≤ 100),
   else the canonical `KMBS_SO2_FRACTION` (0.576). So KMBS materials are correct out of the box; a
   **non-KMBS SO₂ source** (a different salt, a liquid SO₂ solution) MUST have its own `percentActive`
   set or it will be booked as if it were KMBS.
4. **Scope of the correction:** only the `MG_L` basis (an SO₂-target). `g/hL` / `g/L` express grams of
   the *substance* already, and absolute units (`g`, `kg`) carry the stock mass directly — none of those
   are scaled. The correction lives in the governed cost module (`src/lib/cost/consume.ts`), gated by an
   optional `activeFraction` the caller supplies, so every non-SO₂ consumer is byte-for-byte unchanged.
5. **History is not rewritten.** Ledger history is append-only (correction-as-event is the moat). Past
   SO₂ additions booked at the old (1.74×-low) quantity are **left as they are**; a read-only advisory
   (`scripts/so2-underbooking-report.ts`) surfaces the aggregate under-booked KMBS so an operator can
   decide whether to post a correcting adjustment. We do **not** silently backfill.

## Consequences

- Going forward, SO₂ COGS and KMBS inventory are correct for ppm-based additions.
- A discontinuity exists between pre- and post-fix bookings (surfaced by the advisory, documented here).
- WORKORDER-3 is unaffected: maintenance SO₂ (barrel gassing) is overhead and never hit this path.
- COST-1 conservation still holds — only the *input quantity* changed, not the balancing.
- Tripwire: if a non-KMBS SO₂ material is added without `percentActive`, it is treated as 57.6% SO₂.
  Setting `percentActive` on such materials is the operator's responsibility (noted in the picker UI copy
  is a possible follow-up).
