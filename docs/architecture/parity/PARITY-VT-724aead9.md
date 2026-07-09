---
id: PARITY-VT-724aead9
group: vintrace-web
incumbent: vintrace
capability: Cost Console
overlap: both
status: covered
ourApproach: Folds ledger-order CostEvents; TRANSFER moves parent→child cost by volume ratio, normal loss keeps cost, abnormal loss writes off pro-rata; conservation asserted per op.
aiNativeEdge: blend/rack/transfer assistant tools trigger cost movement with no extra step.
evidence: src/lib/cost/rollup.ts
counterpart: innovint-docs/finance/getting-started/how-does-innovint-distribute-costs.md
tags:
  - parity
---

# PARITY-VT-724aead9 — Cost Console

> [!info] Parity (vintrace) — we cover this.

- **Incumbent:** vintrace
- **Cross-incumbent overlap:** both incumbents — TABLE STAKES
- **Our approach:** Folds ledger-order CostEvents; TRANSFER moves parent→child cost by volume ratio, normal loss keeps cost, abnormal loss writes off pro-rata; conservation asserted per op.
- **AI-native edge:** blend/rack/transfer assistant tools trigger cost movement with no extra step.
- **Evidence:** `src/lib/cost/rollup.ts`
- **Counterpart article:** `innovint-docs/finance/getting-started/how-does-innovint-distribute-costs.md`
- **Source:** `vintrace-docs/vintrace-web/costing/cost-console.md` — see [[assistant-coverage]] / [[system-map]]
