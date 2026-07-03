---
id: TRIP-OFFLINE-SYNC
group: scale
severity: high
enforce: observe
signal: "reconnect sync drains exceeding a comfortable window; rising 40001 during sync bursts; a concurrent-edit conflict resolved by silent last-write-wins; an offline op that fails RLS on drain"
decision: "D25 / Phase 28"
status: observe
appliesTo:
  - src/lib/ledger/
tags:
  - tripwire
---

# TRIP-OFFLINE-SYNC — offline capture outgrows the best-effort outbox

> [!warning] Tripwire — revisit when this fires
> Reconnect drains exceeding a window, rising 40001 during sync bursts, a concurrent edit silently last-write-wins, or an offline op failing RLS on drain (missing tenant context). Today it's a best-effort Dexie outbox (idempotent `commandId`, no merge policy).

- **What breaks at scale:** many devices through an 8-week harvest → a sync-storm against the SERIALIZABLE ledger; genuine concurrent edits dropped.
- **Next move (Phase 28):** op-log/CRDT with per-op-family conflict policy; throttled drain reusing the H2 retry; tenant id on every queued op set via `SET LOCAL`.
- **Source:** [[scale-register]] / [[security-register]] (D25/D17), [[system-map]].
