---
id: PARITY-IV-ea3092de
group: make
incumbent: innovint
capability: How to Record an Addition
overlap: both
status: covered
ourApproach: addAdditionCore is a volume-neutral ADDITION op + one LotTreatment per resident lot; resolves a catalog material, computes rate×volume, draws stock + records MATERIAL cost in one tx.
aiNativeEdge: add_addition with an additive-scoped picker that refuses non-additives.
evidence: src/lib/cellar/addition.ts
counterpart: vintrace-docs/vintrace-web/lab-work/multi-additions-operation.md
tags:
  - parity
---

# PARITY-IV-ea3092de — How to Record an Addition

> [!info] Parity (innovint) — we cover this.

- **Incumbent:** innovint
- **Cross-incumbent overlap:** both incumbents — TABLE STAKES
- **Our approach:** addAdditionCore is a volume-neutral ADDITION op + one LotTreatment per resident lot; resolves a catalog material, computes rate×volume, draws stock + records MATERIAL cost in one tx.
- **AI-native edge:** add_addition with an additive-scoped picker that refuses non-additives.
- **Evidence:** `src/lib/cellar/addition.ts`
- **Counterpart article:** `vintrace-docs/vintrace-web/lab-work/multi-additions-operation.md`
- **Source:** `innovint-docs/make/additions/how-to-record-an-addition.md` — see [[assistant-coverage]] / [[system-map]]
