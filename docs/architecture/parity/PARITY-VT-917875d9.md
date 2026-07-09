---
id: PARITY-VT-917875d9
group: vintrace-web
incumbent: vintrace
capability: Bottling and Dry Good Costing
overlap: both
status: partial
ourApproach: buildCogsSnapshot freezes a BottlingCostSnapshot with costPerBottle + componentBreakdown; packagingCost is passed 0 today so per-bottle COGS captures liquid only.
aiNativeEdge: "Once packaging depletion is wired, the assistant explains full per-bottle COGS — a number neither incumbent's API backs."
evidence: src/lib/cost/cogs-write.ts
counterpart: innovint-docs/finance/getting-started/how-to-add-dry-goods-cost-packaging-and-additives.md
tags:
  - parity
---

# PARITY-VT-917875d9 — Bottling and Dry Good Costing

> [!info] Parity (vintrace) — partial — see below.

- **Incumbent:** vintrace
- **Cross-incumbent overlap:** both incumbents — TABLE STAKES
- **Our approach:** buildCogsSnapshot freezes a BottlingCostSnapshot with costPerBottle + componentBreakdown; packagingCost is passed 0 today so per-bottle COGS captures liquid only.
- **AI-native edge:** Once packaging depletion is wired, the assistant explains full per-bottle COGS — a number neither incumbent's API backs.
- **Evidence:** `src/lib/cost/cogs-write.ts`
- **Counterpart article:** `innovint-docs/finance/getting-started/how-to-add-dry-goods-cost-packaging-and-additives.md`
- **Source:** `vintrace-docs/vintrace-web/costing/bottling-and-dry-good-costing.md` — see [[assistant-coverage]] / [[system-map]]
