---
id: PARITY-IV-9c69aea1
group: make
incumbent: innovint
capability: Navigating the Dry Goods Explorer & Details Pages
overlap: both
status: covered
ourApproach: SupplyLot is the batch; planDepletion auto-draws oldest-first under WEIGHTED_AVG or FIFO, method stamped per SupplyConsumption. No expiry field yet.
aiNativeEdge: Oldest-first depletion means the assistant never asks which lot to consume.
evidence: src/lib/cost/deplete.ts
counterpart: vintrace-docs/vintrace-web/purchases/purchase-orders.md
tags:
  - parity
---

# PARITY-IV-9c69aea1 — Navigating the Dry Goods Explorer & Details Pages

> [!info] Parity (innovint) — we cover this.

- **Incumbent:** innovint
- **Cross-incumbent overlap:** both incumbents — TABLE STAKES
- **Our approach:** SupplyLot is the batch; planDepletion auto-draws oldest-first under WEIGHTED_AVG or FIFO, method stamped per SupplyConsumption. No expiry field yet.
- **AI-native edge:** Oldest-first depletion means the assistant never asks which lot to consume.
- **Evidence:** `src/lib/cost/deplete.ts`
- **Counterpart article:** `vintrace-docs/vintrace-web/purchases/purchase-orders.md`
- **Source:** `innovint-docs/make/dry-goods/navigating-the-dry-goods-explorer-details-pages.md` — see [[assistant-coverage]] / [[system-map]]
