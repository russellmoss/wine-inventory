---
id: PARITY-VT-7f317355
group: vintrace-web
incumbent: vintrace
capability: Charging Clients for Winery Work
overlap: both
status: partial
ourApproach: Ops on a CUSTOM_CRUSH_CLIENT lot suppress the CostLine from estate capitalization and record it for bill-back; no billing item, rate, charge object, or service order.
aiNativeEdge: record_bulk_wine_cost posts a manual charge node — the seam to turn any production event into a priced, API-exposed charge (un-extractable from both incumbents).
evidence: src/lib/cost/data.ts
counterpart: innovint-docs/make-advanced-features/owner-based-permissions-system/setting-up-your-custom-crush-permissions.md
tags:
  - parity
---

# PARITY-VT-7f317355 — Charging Clients for Winery Work

> [!info] Parity (vintrace) — partial — see below.

- **Incumbent:** vintrace
- **Cross-incumbent overlap:** both incumbents — TABLE STAKES
- **Our approach:** Ops on a CUSTOM_CRUSH_CLIENT lot suppress the CostLine from estate capitalization and record it for bill-back; no billing item, rate, charge object, or service order.
- **AI-native edge:** record_bulk_wine_cost posts a manual charge node — the seam to turn any production event into a priced, API-exposed charge (un-extractable from both incumbents).
- **Evidence:** `src/lib/cost/data.ts`
- **Counterpart article:** `innovint-docs/make-advanced-features/owner-based-permissions-system/setting-up-your-custom-crush-permissions.md`
- **Source:** `vintrace-docs/vintrace-web/custom-crush-billing/charging-clients-for-winery-work.md` — see [[assistant-coverage]] / [[system-map]]
