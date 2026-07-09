---
id: PARITY-VT-b93dd6cb
group: vintrace-web
incumbent: vintrace
capability: Adding HFCS and Dosage for Sparkling Wines
overlap: both
status: covered
ourApproach: First-class DOSAGE op adds liqueur, computes final RS off a measured pre-dosage RS, classifyStyle derives the EU sweetness band. Neither incumbent has a dosage primitive.
aiNativeEdge: Disgorge→dosage→finish flow deep-linked to the En Tirage screen.
evidence: src/lib/sparkling/dosage-core.ts
counterpart: innovint-docs/make-advanced-features/sparkling-wine-module/disgorge-dosage-packaging.md
tags:
  - parity
---

# PARITY-VT-b93dd6cb — Adding HFCS and Dosage for Sparkling Wines

> [!info] Parity (vintrace) — we cover this.

- **Incumbent:** vintrace
- **Cross-incumbent overlap:** both incumbents — TABLE STAKES
- **Our approach:** First-class DOSAGE op adds liqueur, computes final RS off a measured pre-dosage RS, classifyStyle derives the EU sweetness band. Neither incumbent has a dosage primitive.
- **AI-native edge:** Disgorge→dosage→finish flow deep-linked to the En Tirage screen.
- **Evidence:** `src/lib/sparkling/dosage-core.ts`
- **Counterpart article:** `innovint-docs/make-advanced-features/sparkling-wine-module/disgorge-dosage-packaging.md`
- **Source:** `vintrace-docs/vintrace-web/sparkling-wine/adding-hfcs-and-dosage-for-sparkling-wines.md` — see [[assistant-coverage]] / [[system-map]]
