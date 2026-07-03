---
id: TRIP-COST-LATENCY
group: scale
severity: medium
enforce: observe
signal: "a single lot timeline / cost rollup query exceeds a comfortable latency in prod"
decision: "Phase 8"
status: observe
appliesTo:
  - src/lib/cost/
tags:
  - tripwire
---

# TRIP-COST-LATENCY — derived-on-read cost/state slows on deep lineage

> [!warning] Tripwire — revisit when this fires
> A single lot's timeline or cost-rollup query exceeding a comfortable latency. Lot state and cost are derived by walking the ledger rather than stored denormalized; deep/wide lineage (many blends, long histories) makes that walk slow.

- **What breaks at scale:** query latency on the hottest read path.
- **Next move:** a materialized rollup for lot state / cost.
- **Source:** [[scale-register]] (Phase 8), [[system-map]].
