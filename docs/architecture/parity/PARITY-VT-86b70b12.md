---
id: PARITY-VT-86b70b12
group: vintrace-web
incumbent: vintrace
capability: Recording a Bottling (Packaging Operation)
overlap: both
status: covered
ourApproach: executeBottling draws proportionally across multiple source vessels, writes a balanced BOTTLE op, materializeFinishedGoods creates the SKU + BottlingRun + provenance + RECEIVE movement.
aiNativeEdge: No still-bottling assistant tool yet (only sparkling tirage) — a bottle_wine tool is an open opportunity.
evidence: src/lib/bottling/run.ts
counterpart: innovint-docs/make/movement-actions/how-to-record-a-bottling.md
tags:
  - parity
---

# PARITY-VT-86b70b12 — Recording a Bottling (Packaging Operation)

> [!info] Parity (vintrace) — we cover this.

- **Incumbent:** vintrace
- **Cross-incumbent overlap:** both incumbents — TABLE STAKES
- **Our approach:** executeBottling draws proportionally across multiple source vessels, writes a balanced BOTTLE op, materializeFinishedGoods creates the SKU + BottlingRun + provenance + RECEIVE movement.
- **AI-native edge:** No still-bottling assistant tool yet (only sparkling tirage) — a bottle_wine tool is an open opportunity.
- **Evidence:** `src/lib/bottling/run.ts`
- **Counterpart article:** `innovint-docs/make/movement-actions/how-to-record-a-bottling.md`
- **Source:** `vintrace-docs/vintrace-web/bottling-and-inventory/recording-a-bottling-packaging-operation.md` — see [[assistant-coverage]] / [[system-map]]
