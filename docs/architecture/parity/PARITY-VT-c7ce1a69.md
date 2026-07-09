---
id: PARITY-VT-c7ce1a69
group: vintrace-web
incumbent: vintrace
capability: Decanting Bottles to Bulk
overlap: both
status: partial
ourApproach: reverseBottlingRun atomically removes bottles, restores wine via a SEED op with capacity guard, unwinds cost — but only the exact original run, no standalone arbitrary decant.
aiNativeEdge: undo_operation returns wine to bulk with cost restored by chat.
evidence: src/lib/bottling/run.ts
counterpart: innovint-docs/make/case-goods-in-make/how-do-i-return-bottled-wine-to-a-bulk-wine-lot.md
tags:
  - parity
---

# PARITY-VT-c7ce1a69 — Decanting Bottles to Bulk

> [!info] Parity (vintrace) — partial — see below.

- **Incumbent:** vintrace
- **Cross-incumbent overlap:** both incumbents — TABLE STAKES
- **Our approach:** reverseBottlingRun atomically removes bottles, restores wine via a SEED op with capacity guard, unwinds cost — but only the exact original run, no standalone arbitrary decant.
- **AI-native edge:** undo_operation returns wine to bulk with cost restored by chat.
- **Evidence:** `src/lib/bottling/run.ts`
- **Counterpart article:** `innovint-docs/make/case-goods-in-make/how-do-i-return-bottled-wine-to-a-bulk-wine-lot.md`
- **Source:** `vintrace-docs/vintrace-web/bottling-and-inventory/decanting-bottles-to-bulk.md` — see [[assistant-coverage]] / [[system-map]]
