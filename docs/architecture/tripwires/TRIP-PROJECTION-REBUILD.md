---
id: TRIP-PROJECTION-REBUILD
group: scale
severity: high
enforce: observe
signal: "first breaking event-schema change; first projection rebuild that can't finish in a maintenance window"
decision: "D18 / H4"
status: observe
appliesTo:
  - src/lib/ledger/
tags:
  - tripwire
---

# TRIP-PROJECTION-REBUILD — event-schema evolution outgrows in-place rebuilds

> [!warning] Tripwire — revisit when this fires
> The first breaking change to projection structure or event interpretation, or the first rebuild that can't finish in a maintenance window. Rebuild cost grows non-linearly with store size; concurrent rebuilds ("replay storms") collapse read throughput.

- **What breaks at scale:** the #1 event-sourcing operational pain — build the escape hatch while single-tenant (10× cheaper than later).
- **Next move:** versioned/upcastable events + projection snapshots + throttled blue-green side-by-side rebuilds.
- **Source:** [[scale-register]] (D18/H4), [[system-map]].
