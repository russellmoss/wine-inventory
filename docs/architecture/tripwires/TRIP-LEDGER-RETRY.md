---
id: TRIP-LEDGER-RETRY
group: scale
severity: high
enforce: observe
signal: "any P2034 reaching the user; rising [write-retry] warn volume in logs (growing SERIALIZABLE contention)"
decision: "D18 / H2"
status: observe
appliesTo:
  - src/lib/ledger/
tags:
  - tripwire
---

# TRIP-LEDGER-RETRY — SERIALIZABLE contention climbing

> [!warning] Tripwire — revisit when this fires
> Any `P2034` (SQLSTATE 40001 serialization / 40P01 deadlock) surfacing to the user, or a rising volume of `[write-retry]` warnings — the bounded retry (`withWriteRetry`, cap 5, full-jitter backoff) is absorbing more contention as write concurrency grows.

- **What breaks at scale:** SSI aborts conflicting txns and Postgres gives no auto-retry; under write-heavy bursts, rollback rates climb past the bounded retry.
- **Watch:** log warn volume. **Next move:** narrow tx scope / move reads off the write path (H3).
- **Source:** [[scale-register]] (D18/H2), [[system-map]].
