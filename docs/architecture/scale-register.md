# Scale & Risk Register ⭐

> **This note exists to fix your #1 blind spot:** you make product calls at a high level and
> let Claude handle the deep technical choices — which means the "what breaks this at scale"
> knowledge normally evaporates after each conversation. This note makes it *visible and durable*.
>
> **The working rule:** whenever Claude makes a meaningful architecture decision, have it add
> a row here — *what it chose, why, what breaks it at scale, and the tripwire to revisit.*
> Then tell Claude to **read this file before proposing new architecture** (`docs/architecture/scale-register.md`).
> That turns your blind spot into a checklist Claude consults, instead of something you have to know.
>
> Related: [[system-map]], [[decisions/README|Architecture Decisions]].

## How to read a row
- **Fine until** = roughly when this is expected to hold.
- **What breaks** = the failure mode at scale.
- **Tripwire** = the observable signal that means "revisit now" (a metric, an error, a latency).
- **Status** = 🟢 fine for now · 🟡 watch · 🔴 acting on it.

---

## Register

### Tenant isolation via Postgres RLS + connection pooling
- **Choice:** App connects as `app_rls` (pooled, cannot bypass RLS); tenant set per request via `app.tenant_id`.
- **Fine until:** low-thousands of tenants / normal concurrency.
- **What breaks:** pooled connection saturation under load; per-request `SET` overhead; a missing RLS policy on a new table = silent cross-tenant leak.
- **Tripwire:** pooled connections thrash / p95 query latency climbs / any new table added without following the Phase-12 checklist.
- **Status:** 🟢 (enforced + verified in prod)

### Derived state & cost computed on read (ledger + cost engine)
- **Choice:** lot state and cost are derived by walking the ledger rather than stored denormalized.
- **Fine until:** lot lineage stays shallow/narrow.
- **What breaks:** deep/wide lineage (many blends, long histories) makes a single lot's query slow.
- **Tripwire:** a single lot timeline / cost rollup query exceeds a comfortable latency (watch in prod).
- **Status:** 🟡 (fine now; candidate for a materialized rollup later)

### Neon Postgres cold starts
- **Choice:** Neon serverless Postgres.
- **What breaks:** cold-start latency can surface as timeouts (already seen as P2028 on a verify script).
- **Tripwire:** intermittent connection/timeout errors after idle periods.
- **Status:** 🟡 (known; keep an eye during low-traffic → burst transitions)

<!--
TEMPLATE — copy this block for each new decision:

### <short title>
- **Choice:** …
- **Fine until:** …
- **What breaks:** …
- **Tripwire:** …
- **Status:** 🟢 / 🟡 / 🔴
-->

---
*Seeded 2026-07-02 from known Phase 12 (multi-tenancy) + Phase 8a (cost) context. Grow it every phase.*
