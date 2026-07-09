---
id: PARITY-VT-a3a3b6ed
group: vintrace-web
incumbent: vintrace
capability: Declaring Wine
overlap: both
status: covered
ourApproach: deriveTaxClass auto-picks the class from point-in-time ABV bands; an append-only ChangeOfTaxClassEvent is the dated override.
aiNativeEdge: changeTaxClassCore is a deferred assistant tool — a ready declare_tax_class win.
evidence: src/lib/compliance/tax-class.ts
counterpart: innovint-docs/make/compliance/declare-or-edit-tax-class.md
tags:
  - parity
---

# PARITY-VT-a3a3b6ed — Declaring Wine

> [!info] Parity (vintrace) — we cover this.

- **Incumbent:** vintrace
- **Cross-incumbent overlap:** both incumbents — TABLE STAKES
- **Our approach:** deriveTaxClass auto-picks the class from point-in-time ABV bands; an append-only ChangeOfTaxClassEvent is the dated override.
- **AI-native edge:** changeTaxClassCore is a deferred assistant tool — a ready declare_tax_class win.
- **Evidence:** `src/lib/compliance/tax-class.ts`
- **Counterpart article:** `innovint-docs/make/compliance/declare-or-edit-tax-class.md`
- **Source:** `vintrace-docs/vintrace-web/compliance/declaring-wine.md` — see [[assistant-coverage]] / [[system-map]]
