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
- **Mitigation (DONE):** `src/lib/db/write-retry.ts` is the single canonical `withWriteRetry` — bounded retry-on-`P2034` (Prisma's code for SQLSTATE 40001 serialization + 40P01 deadlock), cap 5, **full-jitter exponential backoff** (25ms→500ms), and a per-domain `console.warn` on each retry so contention is observable. Used by the ledger chokepoint (`runLedgerWrite`), stock movements, bottling (three copy-pasted loops consolidated into it, 2026-07), and **work-order maintenance completion + undo** (`src/lib/work-orders/maintenance.ts` equipment-service / single-vessel / plan-061 group lanes + `src/lib/work-orders/approval.ts` `undoMaintenanceTaskCore` — wrapped 2026-07-13; the group lane fans a `SupplyLot` depletion across up to 60 members, so it's the highest-contention of the four).
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
- **Mitigation (cost half, DONE):** the cost rollup is no longer recomputed on every read — `src/lib/cost/cache.ts` (`LotCostState`, Phase 8 Unit 5) is a **lazy, versioned materialization** of the DAG recompute (`cost/data.ts computeLotCost` stays the authority, D4). It's served from cache when fresh and refreshed **on read** only when the lot's max cost-affecting opId exceeds the cached watermark (`computedThroughOpId`) or the costing-policy version moved — deliberately NOT eagerly fanned out from `writeLotOperation` (that would turn one backdated correction into an O(descendants) SERIALIZABLE write; council/Codex Q1). So the tripwire below now only bites the **first** read after a cost-affecting change (recompute), or the **lot timeline** query, which is still walked on read (uncached).
- **Tripwire:** a single lot timeline query — or the first cost read after a correction on a deep/wide lineage — exceeds a comfortable latency (watch in prod).
- **Status:** 🟡 (cost rollup already materialized (lazy) via `LotCostState`; the lot timeline query remains compute-on-read and is the candidate for materialization next)

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

## AMEND-1 amended-chain cascade is synchronous, in-transaction (Phase 2)

- **What:** appending an op at/inside an already-FILED 5120.17 period marks the whole downstream
  (formType, bond) FILED chain `NEEDS_AMENDMENT` synchronously, in the SAME `runLedgerWrite` tx, folded
  at the `writeLotOperation` chokepoint (`compliance/amend.ts` `cascadeAmendmentsForWrite`). Chosen over
  a queued `NEEDS_CALCULATION` job (Key Decision a) — a queue leaves the chain transiently inconsistent,
  the exact silent-desync the invariant exists to prevent; and the repo has no job-queue infra.
- **Fine until:** the downstream FILED chain per (formType, bond) is short — monthly cadence ⇒ a handful
  of rows; marking is O(rows) via one `updateMany`; the common case is a cheap `findFirst` no-op (an op
  in the current, unfiled period).
- **What breaks at scale:** a custom-crush facility × many bonds × long backdated correction chains could
  push the mark `updateMany` (+ the per-op bond derivation on backdated ops) toward `LEDGER_TX_TIMEOUT_MS`.
- **Tripwire:** a backdated op into a filed period whose `runLedgerWrite` approaches the tx timeout; a
  `NEEDS_AMENDMENT` mark count per correction climbing into the hundreds. **Escape hatch (not built):**
  move to a `NEEDS_CALCULATION` lock + background regen — recorded here, deliberately deferred.
- **Status:** 🟢 (built + proven by the `verify:ttb` AMEND-1 3-period chain; single-winery scale)

## Identity presentation layer — cross-identifier search + rename history (Phase 1)
- **What:** `LotIdentifier` (search index + Phase-3 re-import key), append-only `LotCodeEvent` (rename
  history), per-tenant versioned `NamingTemplate(+Version)`. Cross-identifier search unions three
  bounded, tenant-scoped, indexed queries (Lot by code/displayName, `LotCodeEvent` by from/toValue,
  `LotIdentifier` by value) and merges in memory — resolves to `id` first, never joins on `code`.
- **Fine until:** a single tenant accumulates a very large rename history or identifier set, or a lot
  picker issues the search on every keystroke without debounce.
- **What breaks at scale:** (a) historical-code search scanning `LotCodeEvent` — bounded by
  `@@index([tenantId, toValue])` + `@@index([tenantId, fromValue])`; (b) identifier search — bounded by
  `@@index([tenantId, value])`; (c) the 3-query fan-out is `take limit*3` per source then merged, so it
  never returns unbounded rows; (d) `LotCodeEvent` grows append-only forever (one row per rename) — fine
  at winery scale (renames are rare), but a pathological rename loop would bloat it.
- **Tripwire:** a lot picker calling `searchLotsByIdentifier` unthrottled; the `(tenantId, toValue)` /
  `(tenantId, value)` indexes dropped; a `WHERE code =`/`lotCode =` join appearing in
  `src/lib/{ledger,cost,transform,blend,compliance}` (caught by `verify:naming`'s static scan).
- **Status:** 🟢 (built + guarded by `verify:naming`; winery-scale volumes)

### Bulk migration import publishes a whole batch through the ledger chokepoint (plan: migration/import)
- **Choice:** onboarding import (`src/lib/migration/publish.ts`) writes REAL ledger ops for every seeded lot/position on sign-off, through the same `runLedgerWrite` SERIALIZABLE chokepoint as live cellar ops.
- **Fine until:** a batch of a few hundred lots (a normal winery's back-book).
- **What breaks:** a very large historical import (thousands of lots/ops) in one publish is a long SERIALIZABLE transaction — lock-hold time + retry pressure on the single-writer chokepoint (D18/H2), and memory if the whole batch materializes at once.
- **Tripwire:** a publish that times out / retries repeatedly; import batches trending into the thousands of rows; publish latency climbing.
- **Status:** 🟢 (winery back-book volumes today; if multi-vintage bulk imports get large, chunk the publish).

### Multi-lot vessel-reading fan-out multiplies AnalysisPanel rows (plan 060, chemistry)
- **Choice:** one physical whole-tank reading on a co-ferment vessel writes **N panels** (one per co-resident
  lot), all sharing a `vesselReadingGroupId`, so `AnalysisPanel` row count scales with resident-lot count,
  not with distinct readings. Vessel-scoped views re-collapse the N to one via
  `coalesce(vesselReadingGroupId, id)`, backed by `@@index([vesselId, vesselReadingGroupId])`.
- **Fine until:** a vessel holds only a handful of co-resident lots (the norm — a "one must" tank is a few
  components), and vessel-history/trend queries stay bounded by `take`/date window.
- **What breaks at scale:** a pathological vessel with many resident lots read frequently inflates panel rows
  ~N×; a vessel-scoped dedup that forgot the index would sort-collapse a large row set in memory; a lot-scoped
  view that WRONGLY deduped by group id would drop each co-resident lot's own curve (correctness, not just perf).
- **Tripwire:** the `(vesselId, vesselReadingGroupId)` index dropped; a vessel-scoped reading query NOT using
  `coalesce(vesselReadingGroupId, id)`; resident-lot counts per vessel trending high; a lot-scoped query
  applying the vessel dedup.
- **Status:** 🟢 (additive nullable column + two indexes; winery-scale co-ferment counts; guarded by the
  `(tenantId, vesselReadingGroupId, lotId)` unique + `chemistry-fanout` test).

### All-at-once multi-vessel maintenance completion is one Serializable tx over the member set (plan 061)
- **Choice:** a consolidated maintenance task (`plannedPayload.groupActivity`, "clean B1–B60") completes in
  ONE Serializable `runInTenantTx` that writes one `VesselActivityEvent` per member; undo reverses them in
  one tx too. Timeout is raised to 120s and both are wrapped in `withWriteRetry` for the SERIALIZABLE churn.
- **Fine until:** member sets of tens of barrels (a shed range) — the deliberate all-at-once choice (ADR 0004
  rejected progressive per-batch completion as over-built for a record-only op).
- **What breaks at scale:** a very large member set is a long single Serializable tx — lock-hold time + retry
  pressure, and it materializes N events at once; `NL_WORK_ORDER_MAX_TASKS` no longer caps this path (it's one
  task now), so an unbounded NL range could ask for a huge fan of events.
- **Tripwire:** group-maintenance completion/undo timing out or retrying repeatedly; member counts trending
  into the hundreds; the 120s timeout being hit.
- **Status:** 🟢 (record-only, no ledger fold; barrel-range scale; proven by `verify:group-maintenance`. If
  ranges get large, revisit the deferred progressive/per-batch completion).

### Knowledge-base RAG corpus is GLOBAL + hybrid-retrieved; no ANN index in v1 (plan 079)
- **Choice:** the crawled winemaking corpus (`knowledge_document`/`knowledge_chunk` + friends) is GLOBAL
  reference data (crawled once, shared by all tenants — like `fx_rate`), retrieved via HYBRID search: dense
  pgvector cosine (`embedding <=> $1::vector`, `Unsupported("vector(1024)")`, raw SQL) fused by RRF with a
  generated `tsvector` GIN lexical arm. Retrieval filters the global chunk pool to a tenant's enabled
  sources; empty enabled-set ⇒ zero rows (fail-closed). **No HNSW/IVFFlat index in v1** — an exact
  sequential scan over a few-thousand chunks is single-digit ms and 100% recall.
- **Fine until:** the corpus is in the hundreds–low-thousands of chunks (AWRI + Wine Australia); the
  per-query vector distance + tsvector rank stay cheap; re-embed happens on a change-detected subset.
- **What breaks at scale:** past ~tens of thousands of chunks the exact vector scan gets linear-slow →
  needs an HNSW index (`vector_cosine_ops`), built AFTER data load (never on an empty table); a very large
  enabled-source set widens the `sourceId = ANY(...)` filter; a full re-embed (model swap) is an O(corpus)
  backfill; MMR/RRF over a huge candidate set costs CPU if `k` isn't bounded.
- **Tripwire:** vector queries trending into tens of ms; chunk counts crossing ~10k; a re-embed job
  scanning the whole corpus on every run instead of the changed subset; retrieval `LIMIT k` unbounded.
- **Status:** 🟢 (global shared corpus; exact scan at winery+AWRI scale; HNSW is a documented later add;
  guarded by `verify:knowledge-base` + `verify:tenant-isolation`; see [[decisions/0007-knowledge-base-rag-global-corpus-tenant-subscriptions]]).

### Section-level content filtering strips in place; it does NOT create per-anchor documents (plan 084)
- **Choice:** when a source mixes technical and non-technical content inside ONE url (VT Enology Notes
  puts rot-metabolite chemistry, a paid study-tour ad, and a staff hire announcement on `166.html`), the
  filter splits the RAW HTML on its `<a name="N">` anchors, drops announcement sections by heading
  pattern, and re-emits **one** document with the survivors. It runs pre-extraction because Defuddle
  prunes empty inline elements and every section anchor is empty — 12 anchors in the EN-166 source, 0 in
  the markdown. Opt-in per source via `sectionFilter` in `config.ts`; unset = byte-identical behavior.
- **Why not one document per anchor:** the pipeline is strictly one-document-per-URL and enforces it in
  three independent places — `normalizeCrawlUrl` does `raw.split("#")[0]`, `extractLinks` drops `#`
  hrefs, and alias-dedup keys on the RAW-BYTE hash (so two fragments of one page collide and the second
  is hard-deleted). Per-anchor rows would mean changing all three, i.e. the dedup invariant the whole
  corpus rests on.
- **Fine until:** a handful of sources need it, each a few hundred pages. The split is a regex over
  bytes and the classifier is a pure pattern match — both negligible next to the fetch and the embed.
- **What breaks at scale:** the classifier is heading-pattern based, so a source whose non-technical
  content is not signalled in its headings needs a different strategy (content-body signals, or an LLM
  pass — which at ~900 sections would dominate crawl cost and stop being deterministic). Heading
  patterns are also per-publication: they do NOT transfer between sources.
- **Tripwire:** a second source wanting `sectionFilter` with a materially different markup shape (that
  is the signal to generalize the strategy key rather than special-case it); `verify:vt-enology`
  reporting 0 sections on a non-T1 issue (an unseen template = silent data loss); the T1 fail-open count
  drifting away from ~40; anyone needing per-chunk citation deep-links (`166.html#1`), which is the
  cheaper additive alternative — an `anchor` column on `KnowledgeChunk` — NOT per-anchor documents.
- **Status:** 🟢 (one source, one strategy; pure logic sabotage-tested; guarded by
  `verify:vt-enology` + `test/knowledge-sections-*.test.ts`). ⚠️ `SECTION_FILTER_VERSION` in
  `src/lib/knowledge/sections/index.ts` MUST be bumped whenever a drop pattern changes — it folds into
  `indexedContentHash`, and without a bump the raw bytes are unchanged so every re-crawl short-circuits
  to `skipped:"unchanged"` and the new rules never take effect, silently.

---
*Seeded 2026-07-02 from known Phase 12 (multi-tenancy) + Phase 8a (cost) context. Grow it every phase.*
