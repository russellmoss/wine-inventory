---
id: PARITY-IV-4ff487b5
group: finance
incumbent: innovint
capability: Tracking Oak Costs in InnoVint
overlap: both
status: covered
ourApproach: BarrelAsset + BarrelFill drive sum-of-years-digits depreciation over fills, allocated to resident wine by time×space; posts a BARREL CostLine at fill close. Neither incumbent auto-computes this.
aiNativeEdge: Barrel cost is a clean queryable number the assistant surfaces per lot.
evidence: src/lib/cost/barrel.ts
counterpart: vintrace-docs/vintrace-web/costing/adding-storage-costs-for-wines-in-vessel.md
tags:
  - parity
---

# PARITY-IV-4ff487b5 — Tracking Oak Costs in InnoVint

> [!info] Parity (innovint) — we cover this.

- **Incumbent:** innovint
- **Cross-incumbent overlap:** both incumbents — TABLE STAKES
- **Our approach:** BarrelAsset + BarrelFill drive sum-of-years-digits depreciation over fills, allocated to resident wine by time×space; posts a BARREL CostLine at fill close. Neither incumbent auto-computes this.
- **AI-native edge:** Barrel cost is a clean queryable number the assistant surfaces per lot.
- **Evidence:** `src/lib/cost/barrel.ts`
- **Counterpart article:** `vintrace-docs/vintrace-web/costing/adding-storage-costs-for-wines-in-vessel.md`
- **Source:** `innovint-docs/finance/guidance-faq/tracking-oak-costs-in-innovint.md` — see [[assistant-coverage]] / [[system-map]]
