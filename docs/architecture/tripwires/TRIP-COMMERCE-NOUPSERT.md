---
id: TRIP-COMMERCE-NOUPSERT
group: scale
severity: high
enforce: static
forbid: "order/upsert"
in: "src/lib/commerce"
decision: "Phase 16"
status: static
appliesTo:
  - src/lib/commerce/
tags:
  - tripwire
---

# TRIP-COMMERCE-NOUPSERT — never PUT /order/upsert (id churn)

> [!warning] Tripwire — revisit when this fires
> A `PUT /order/upsert` call to Commerce7. It churns order ids, which breaks the `(updatedAt, id)` cursor backstop and the `sale:${orderId}:v${seq}` posting-key idempotency — the exactly-once ingest guarantee depends on stable order ids.

- **What breaks:** id churn = re-ingested orders, double-posted revenue or lost deltas.
- **Enforced by:** `npm run verify:tripwires` greps `src/lib/commerce/` for the endpoint and fails if present.
- **Source:** [[scale-register]] (Phase 16 tripwires), [[system-map]].
