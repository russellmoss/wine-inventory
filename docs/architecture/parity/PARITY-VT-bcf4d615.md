---
id: PARITY-VT-bcf4d615
group: vintrace-web
incumbent: vintrace
capability: Blending In Bond and Taxpaid Wines
overlap: both
status: covered
ourApproach: BLEND with crossesTaxClass auto-posts child +delta to §A5 and each parent -delta to §A20 plus a Part X anomaly; BOND-1 refuses a straddling blend.
aiNativeEdge: Cross-class posting is derived server-side, so any assistant-created blend is compliance-correct.
evidence: src/lib/compliance/form-map.ts
counterpart: innovint-docs/guidance-faqs/frequently-asked-questions/blending-across-tax-classes.md
tags:
  - parity
---

# PARITY-VT-bcf4d615 — Blending In Bond and Taxpaid Wines

> [!info] Parity (vintrace) — we cover this.

- **Incumbent:** vintrace
- **Cross-incumbent overlap:** both incumbents — TABLE STAKES
- **Our approach:** BLEND with crossesTaxClass auto-posts child +delta to §A5 and each parent -delta to §A20 plus a Part X anomaly; BOND-1 refuses a straddling blend.
- **AI-native edge:** Cross-class posting is derived server-side, so any assistant-created blend is compliance-correct.
- **Evidence:** `src/lib/compliance/form-map.ts`
- **Counterpart article:** `innovint-docs/guidance-faqs/frequently-asked-questions/blending-across-tax-classes.md`
- **Source:** `vintrace-docs/vintrace-web/winemaking/blending-in-bond-and-taxpaid-wines.md` — see [[assistant-coverage]] / [[system-map]]
