---
id: TRIP-COMMERCE-RATE
group: scale
severity: high
enforce: observe
signal: "poll/inventory run time approaching maxDuration; 429s from Commerce7 in logs; the dirty-order partial index dropped; drift counts climbing without operator review"
decision: "Phase 16"
status: observe
appliesTo:
  - src/lib/commerce/
tags:
  - tripwire
---

# TRIP-COMMERCE-RATE — DTC poller stays under the per-tenant rate budget

> [!warning] Tripwire — revisit when this fires
> Poll/inventory run time approaching `maxDuration`, 429s from Commerce7 (100 req/min/tenant cap), the `commerce7_order (tenantId) WHERE dirty = true` partial index dropped, or drift counts climbing without operator review.

- **What breaks at scale:** order/product volume past the bounded per-run batches; the per-tenant token-bucket budget shared across poll + refetch + UI fetch gets starved.
- **Watch:** the runtime `signal`. **Guard for the id-churn sibling:** see [[TRIP-COMMERCE-NOUPSERT]].
- **Source:** [[scale-register]] (Phase 16), [[system-map]].
