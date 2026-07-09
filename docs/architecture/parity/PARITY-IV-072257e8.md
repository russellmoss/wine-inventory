---
id: PARITY-IV-072257e8
group: make
incumbent: innovint
capability: How to Record Filtration (the Filter Action)
overlap: innovint-only
status: covered
ourApproach: filterVesselCore writes a dedicated FILTRATION op with proportional loss + a LotTreatment carrying filter-media taxonomy + micron; beats Vintrace (loss-reason only).
aiNativeEdge: filter_vessel tool; also completable as a WO filtration task.
evidence: src/lib/cellar/treatments.ts
counterpart: ""
tags:
  - parity
---

# PARITY-IV-072257e8 — How to Record Filtration (the Filter Action)

> [!info] Parity (innovint) — we cover this.

- **Incumbent:** innovint
- **Cross-incumbent overlap:** InnoVint only
- **Our approach:** filterVesselCore writes a dedicated FILTRATION op with proportional loss + a LotTreatment carrying filter-media taxonomy + micron; beats Vintrace (loss-reason only).
- **AI-native edge:** filter_vessel tool; also completable as a WO filtration task.
- **Evidence:** `src/lib/cellar/treatments.ts`
- **Source:** `innovint-docs/make/movement-actions/how-to-record-filtration-the-filter-action.md` — see [[assistant-coverage]] / [[system-map]]
