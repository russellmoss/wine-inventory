---
id: PARITY-VT-4bc62741
group: vintrace-web
incumbent: vintrace
capability: Requesting Lab Analysis and Viewing Results
overlap: both
status: covered
ourApproach: recordMeasurementsCore records a panel of readings against exactly one lot (vessel is snapshot context); edit is a soft-void of the whole panel.
aiNativeEdge: record_measurement + record_sample_results (blend → asks which lot); no live-metric roll-forward yet.
evidence: src/lib/chemistry/measurements.ts
counterpart: innovint-docs/make/analysis/how-to-record-analysis-via-direct-action-or-work-order-task.md
tags:
  - parity
---

# PARITY-VT-4bc62741 — Requesting Lab Analysis and Viewing Results

> [!info] Parity (vintrace) — we cover this.

- **Incumbent:** vintrace
- **Cross-incumbent overlap:** both incumbents — TABLE STAKES
- **Our approach:** recordMeasurementsCore records a panel of readings against exactly one lot (vessel is snapshot context); edit is a soft-void of the whole panel.
- **AI-native edge:** record_measurement + record_sample_results (blend → asks which lot); no live-metric roll-forward yet.
- **Evidence:** `src/lib/chemistry/measurements.ts`
- **Counterpart article:** `innovint-docs/make/analysis/how-to-record-analysis-via-direct-action-or-work-order-task.md`
- **Source:** `vintrace-docs/vintrace-web/lab-work/requesting-lab-analysis-and-viewing-results.md` — see [[assistant-coverage]] / [[system-map]]
