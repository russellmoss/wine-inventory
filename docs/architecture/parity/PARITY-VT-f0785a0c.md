---
id: PARITY-VT-f0785a0c
group: harvest-vintage
incumbent: vintrace
capability: Crush and Extraction
overlap: both
status: covered
ourApproach: crushLotCore consumes HarvestPicks and originates a MUST lot at measured liters (kg is op metadata), multi-vessel via destinations[].
aiNativeEdge: complete_task completes a simple crush by chat.
evidence: src/lib/transform/crush-core.ts
counterpart: innovint-docs/harvest/harvest-workflow-fermentation-tracking/process-fruit-to-volume.md
tags:
  - parity
---

# PARITY-VT-f0785a0c — Crush and Extraction

> [!info] Parity (vintrace) — we cover this.

- **Incumbent:** vintrace
- **Cross-incumbent overlap:** both incumbents — TABLE STAKES
- **Our approach:** crushLotCore consumes HarvestPicks and originates a MUST lot at measured liters (kg is op metadata), multi-vessel via destinations[].
- **AI-native edge:** complete_task completes a simple crush by chat.
- **Evidence:** `src/lib/transform/crush-core.ts`
- **Counterpart article:** `innovint-docs/harvest/harvest-workflow-fermentation-tracking/process-fruit-to-volume.md`
- **Source:** `vintrace-docs/harvest-vintage/crush-and-press/crush-and-extraction.md` — see [[assistant-coverage]] / [[system-map]]
