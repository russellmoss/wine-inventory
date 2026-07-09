---
id: PARITY-VT-0c54a180
group: vintrace-web
incumbent: vintrace
capability: Completing Work Orders with Data Discrepancies
overlap: vintrace-only
status: covered
ourApproach: deviation.ts diffs planned vs actual; >1% volume or any rate change forces individual review so bulk-approve only offers exact matches (anti-rubber-stamp).
aiNativeEdge: review_task surfaces the deviation and warns it reverses the ledger op before confirming.
evidence: src/lib/work-orders/deviation.ts
counterpart: ""
tags:
  - parity
---

# PARITY-VT-0c54a180 — Completing Work Orders with Data Discrepancies

> [!info] Parity (vintrace) — we cover this.

- **Incumbent:** vintrace
- **Cross-incumbent overlap:** Vintrace only
- **Our approach:** deviation.ts diffs planned vs actual; >1% volume or any rate change forces individual review so bulk-approve only offers exact matches (anti-rubber-stamp).
- **AI-native edge:** review_task surfaces the deviation and warns it reverses the ledger op before confirming.
- **Evidence:** `src/lib/work-orders/deviation.ts`
- **Source:** `vintrace-docs/vintrace-web/work-orders/completing-work-orders-with-data-discrepancies.md` — see [[assistant-coverage]] / [[system-map]]
