---
id: PARITY-VT-c4e4389b
group: vintrace-web
incumbent: vintrace
capability: Transferring Wines Between Bonds (US)
overlap: both
status: covered
ourApproach: Dedicated op stamps per-leg source/destBondId; fold posts received leg →§A7/§B3 on dest and removed leg →§A15/§B9 on source as a matched pair.
aiNativeEdge: Reversible via undo_operation (mirror posting swaps legs).
evidence: src/lib/compliance/transfer-in-bond-core.ts
counterpart: innovint-docs/make/movement-actions/bond-to-bond-transfers-b2b.md
tags:
  - parity
---

# PARITY-VT-c4e4389b — Transferring Wines Between Bonds (US)

> [!info] Parity (vintrace) — we cover this.

- **Incumbent:** vintrace
- **Cross-incumbent overlap:** both incumbents — TABLE STAKES
- **Our approach:** Dedicated op stamps per-leg source/destBondId; fold posts received leg →§A7/§B3 on dest and removed leg →§A15/§B9 on source as a matched pair.
- **AI-native edge:** Reversible via undo_operation (mirror posting swaps legs).
- **Evidence:** `src/lib/compliance/transfer-in-bond-core.ts`
- **Counterpart article:** `innovint-docs/make/movement-actions/bond-to-bond-transfers-b2b.md`
- **Source:** `vintrace-docs/vintrace-web/compliance/transferring-wines-between-bonds-us.md` — see [[assistant-coverage]] / [[system-map]]
