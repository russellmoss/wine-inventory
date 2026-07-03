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
- **What breaks:** pooled connection saturation under load; per-request `SET` overhead; a missing RLS policy on a new table = silent cross-tenant leak; **transaction-mode poolers (PgBouncer/Neon) do NOT reset session GUCs between transactions — a session-scoped `app.tenant_id` leaks to the next client (D17).**
- **Mitigation (D17/H1):** set tenant id with `SET LOCAL` *inside* each txn (scoped, auto-cleared); the isolation suite must run **through the pooled endpoint**, not just direct Postgres — the leak only manifests through the pooler.
- **Tripwire:** pooled connections thrash / p95 query latency climbs / any new table added without the Phase-12 checklist / **any tenant id set outside a `SET LOCAL` in a txn / isolation tests that only hit direct PG.**
- **Status:** 🟡 (enforced + verified against direct PG; **H1 now WIRED — CI runs the isolation suite through a transaction-mode PgBouncer (`pool_mode=transaction`, `default_pool_size=1`, empty `server_reset_query`) plus a SET-LOCAL no-bleed test (`test/tenant-isolation.test.ts`); flips to 🟢 on first green run**)

### SERIALIZABLE ledger writes need a retry layer, not just a chokepoint (D18/H2)
- **Choice:** ledger writes use SERIALIZABLE + canonical row locking + a single-writer-style chokepoint.
- **Fine until:** low write concurrency (human-paced cellar ops).
- **What breaks:** SSI *aborts* conflicting txns (SQLSTATE 40001) and Postgres provides **no auto-retry** — an unhandled conflict surfaces as a user-facing error; under write-heavy bursts, rollback rates climb.
- **Mitigation (DONE):** `src/lib/db/write-retry.ts` is the single canonical `withWriteRetry` — bounded retry-on-`P2034` (Prisma's code for SQLSTATE 40001 serialization + 40P01 deadlock), cap 5, **full-jitter exponential backoff** (25ms→500ms), and a per-domain `console.warn` on each retry so contention is observable. Used by the ledger chokepoint (`runLedgerWrite`), stock movements, and bottling (three copy-pasted loops consolidated into it, 2026-07).
- **Tripwire:** any `P2034` reaching the user / rising `[write-retry]` warn volume in logs (= growing serialization contention → consider narrowing tx scope or moving reads off the write path per H3).
- **Status:** 🟢 (bounded retry + backoff + logging shipped + consolidated; watch the tripwire as write concurrency grows)

### Projection rebuilds & event-schema evolution (D18/H4)
- **Choice:** event-sourcing-lite — a materialized projection maintained transactionally (not full replay).
- **Fine until:** projection structure + event shapes are stable and the store is small.
- **What breaks:** any change to projection structure or event interpretation forces a rebuild whose cost grows **non-linearly** with store size; concurrent rebuilds ("replay storms") collapse read throughput. This is the #1 event-sourcing operational pain in the literature.
- **Mitigation:** versioned/upcastable events + projection snapshots + throttled, blue-green side-by-side rebuilds — **build while single-tenant (10× cheaper than later).**
- **Tripwire:** first breaking event-schema change / first projection rebuild that can't finish in a maintenance window.
- **Status:** 🟡 (lite model reduces exposure; escape hatches not yet built)

### Derived state & cost computed on read (ledger + cost engine)
- **Choice:** lot state and cost are derived by walking the ledger rather than stored denormalized.
- **Fine until:** lot lineage stays shallow/narrow.
- **What breaks:** deep/wide lineage (many blends, long histories) makes a single lot's query slow.
- **Tripwire:** a single lot timeline / cost rollup query exceeds a comfortable latency (watch in prod).
- **Status:** 🟡 (fine now; candidate for a materialized rollup later)

### Offline-first capture & sync — conflict resolution at scale (D25)
- **Choice:** floor/vineyard capture works at zero connectivity (Phase-6 Dexie outbox today; Phase-28 adds the real op-log/CRDT sync with deterministic conflict resolution).
- **Fine until:** low device count + the current best-effort outbox (idempotent `commandId`, duplicate-as-success, no merge policy).
- **What breaks:** many devices capturing offline through an 8-week harvest → a burst of queued ops on reconnect (sync-storm contention against the SERIALIZABLE ledger); genuine concurrent edits with no merge policy silently last-write-wins or drop; an offline write that reconnects without correct tenant context fails RLS on sync (ties to D17 — see [[security-register]]).
- **Mitigation (D25/Phase 28):** op-log/CRDT with a defined per-op-family conflict-resolution policy; bounded, throttled sync drain (reuse the H2 retry-on-40001 wrapper); a visible sync/exception state; carry tenant id on every queued op and set it via `SET LOCAL` on drain.
- **Tripwire:** reconnect sync drains that exceed a comfortable window / rising 40001 during sync bursts / any concurrent-edit conflict resolved by silent last-write-wins / an offline op that fails RLS on drain.
- **Status:** 🟡 (best-effort outbox only; the conflict-resolution + sync layer is Phase 28)

### AI quality regresses silently without an eval harness (D26/H8)
- **Choice:** the probabilistic shell (NL/voice work-order parsing, document/weigh-tag OCR in Phase 25, blend-solving in Phase 26) is gated by golden datasets + regression evals in CI.
- **Fine until:** the first AI-native write surface ships without evals — it "works in the demo."
- **What breaks:** a model/prompt/library change silently degrades parse/extraction accuracy; a misparse reaches the proposal step at scale (still caught by human approval per D10, but trust + throughput erode); domain-correct cellar-language eval data is expensive to build after the fact.
- **Mitigation (D26/H8):** seed golden datasets with the first AI surface (do-now, single-tenant is cheapest); CI runs the evals and blocks on regression; the deterministic core stays exact/tested (D14).
- **Tripwire:** any AI write surface shipped without an eval suite / a rise in human-corrected proposals / a model/lib bump with no eval delta recorded.
- **Status:** 🟡 (H8 SEEDED 2026-07 — `test/evals/` holds a golden dataset over the shipped assistant write tools + a structural eval that validates it against the REAL registry in CI, with a coverage guard that fails when a new write tool ships ungoverned; a gated LLM-in-the-loop eval runs via `npm run eval:assistant`. Grows with each new AI surface.)

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

## Accounting poster — bounded work + partial index (Phase 15)
- **What:** the QBO post/reconcile/refresh crons enumerate all org ids and sweep pending
  `AccountingDelivery` rows. Each poster run **claims a BOUNDED batch per tenant**
  (`POST_BATCH_PER_TENANT`, default 50) with `FOR UPDATE SKIP LOCKED` + a lease, and drains the rest
  over subsequent ticks — never an unbounded backlog in one invocation (Vercel ~300s cap + QBO
  500/min per realm).
- **What breaks at scale:** (a) a full-table scan of `accounting_delivery` as POSTED history grows —
  mitigated by the **partial index** on `(tenantId, status) WHERE status IN
  ('PENDING','VERIFYING','FAILED')` so sweeps only ever seek the OPEN work; (b) enumerating every org
  each tick when few are connected (fine now; revisit with a connected-org index/materialized list);
  (c) QBO rate limits (429) — the client has its own full-jitter backoff separate from the DB retry.
- **Tripwire:** poster run time approaching `maxDuration`; backlog depth climbing tick-over-tick (the
  dashboard shows queue-by-status); 429s in logs; the partial index dropped.
- **Status:** 🟢 (bounded batch + partial index shipped; drain-over-ticks proven by
  `verify:accounting-idempotency`)

## Commerce7 DTC — poller + inventory sync + per-tenant rate budget (Phase 16)
- **Choice:** an event-driven adapter off our ledger. Inbound = webhook HINT (bounded dirty marker) +
  a poll cron as the single ingest path; outbound = additive-on-increase inventory push; a read-only
  drift check; a revenue-delta poster riding the Phase-15 exactly-once sweep.
- **Fine until:** order/product volume per tenant grows past the bounded per-run batches, or the number
  of connected tenants makes the per-tick org enumeration wasteful.
- **What breaks at scale:** (a) Commerce7's **100 req/min/tenant** cap — mitigated by a per-tenant
  **token-bucket rate budget** shared across poll + refetch + UI fetch, cursor paging, and bounded
  batches (`COMMERCE7_POLL_MAX_PAGES`, `COMMERCE7_DIRTY_BATCH`, `COMMERCE7_MOVE_BATCH`); (b) a
  same-timestamp order on a page boundary — the `(updatedAt, id)` cursor with a 5-min **overlap** re-scans
  the boundary (an already-ingested order diffs to null → no-op); (c) a webhook flood — the dirty-marker
  upsert dedups by order id + a backlog cap sheds load, the cursor sweep still catches everything; (d)
  a scan of `commerce7_order` for dirty rows as history grows — a **partial index** on `(tenantId) WHERE
  dirty = true` keeps it a bounded seek; (e) the outbound push is at-least-once with a claim-first
  watermark (a lost push under-counts C7 → surfaced by the read-only drift check, never double-counts).
- **Tripwire:** poll/inventory run time approaching `maxDuration`; 429s from Commerce7 in logs; the
  dirty-order partial index dropped; drift counts climbing without operator review; a `PUT /order/upsert`
  ever used (id churn — forbidden).
- **Status:** 🟡 (built + proven offline by `verify:commerce7-idempotency`; live-load behavior validated
  in the **Unit-0 sandbox smoke** once keys land)

---
*Seeded 2026-07-02 from known Phase 12 (multi-tenancy) + Phase 8a (cost) context. Grow it every phase.*
