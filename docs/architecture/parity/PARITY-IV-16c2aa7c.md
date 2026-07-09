---
id: PARITY-IV-16c2aa7c
group: supply
incumbent: innovint
capability: SUPPLY + Commerce7 Integration
overlap: innovint-only
status: covered
ourApproach: Settled C7 orders diff into append-only SalesExportEvent deltas that deplete finished goods (SALE) AND post DTC revenue through the Phase-15 poster in one SERIALIZABLE tx; refunds are signed reversals. Live sandbox verify pending.
aiNativeEdge: The whole money-loop is assistant-observable; margin.ts gives per-SKU×channel profit.
evidence: src/lib/commerce/ingest.ts
counterpart: ""
tags:
  - parity
---

# PARITY-IV-16c2aa7c — SUPPLY + Commerce7 Integration

> [!info] Parity (innovint) — we cover this.

- **Incumbent:** innovint
- **Cross-incumbent overlap:** InnoVint only
- **Our approach:** Settled C7 orders diff into append-only SalesExportEvent deltas that deplete finished goods (SALE) AND post DTC revenue through the Phase-15 poster in one SERIALIZABLE tx; refunds are signed reversals. Live sandbox verify pending.
- **AI-native edge:** The whole money-loop is assistant-observable; margin.ts gives per-SKU×channel profit.
- **Evidence:** `src/lib/commerce/ingest.ts`
- **Source:** `innovint-docs/supply/using-supply/supply-commerce7-integration.md` — see [[assistant-coverage]] / [[system-map]]
