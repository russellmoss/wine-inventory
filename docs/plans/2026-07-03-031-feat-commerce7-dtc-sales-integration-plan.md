---
title: Phase 16 — Two-way Commerce7 DTC/sales integration (revenue side of the money loop)
type: feat
status: ready-for-work
date: 2026-07-03
branch: main
depth: deep
units: 13
revision: v3 (v2 cleared + strategy-review amendments)
status: completed (Units 1–11 built on main; live Commerce7 sandbox verification pending — see docs/plans/phase-16-go-live-runbook.md)
---

## Revision Log

- **v1** — initial draft (research-grounded, mirrors the Phase-15 15-unit shape).
- **v2** — folded eng-review + `/council` (Codex gpt-5.4 + Gemini 3.1 Pro) + security pass + design
  review. Structural changes: (1) mutable **order projection + append-only DELTA events** replaces the
  single immutable `sale:${orderId}` event (orders are mutable; `PUT /order/upsert` churns ids); (2)
  inventory model simplified — **C7 is a replica, orders are the only inbound stock signal, outbound is
  additive-on-ERP-increase only, drift is detected not auto-corrected** (kills the absolute-reset
  oversell race + echo-guard); (3) **nonce-bound install** (tenant-hijack fix); (4) explicit
  **exportable-sale payment-state machine** (post Paid only); (5) accounting: DR **undeposited-funds
  clearing** with processing-fee/payout reconciliation flagged as a known gap; (6) poll watermark
  `(updatedAt, id)` with overlap; per-(variant, location) mapping; per-tenant rate budget; auto-recreate
  disabled webhooks; uninstall lifecycle; separate inbound webhook secret. See GSTACK REVIEW REPORT.
- **v3** — strategy-review amendments (additive, review-neutral — no architecture, security, or
  scope-boundary changes to the cleared v2): (1) added **Unit 10b — read-only DTC per-channel margin
  view** (SalesExportEvent revenue deltas × Phase-8 absorption-costed COGS, grouped by WineSku × channel;
  gross-of-fees labeled); (2) named **finished-goods cross-channel allocation/reservation** as an
  explicit deferral (schema must stay allocation-ready); (3) added a sequencing caveat to the Product
  Pressure Test (Phase 16 is the retention/CFO story, NOT ahead of the NL work-order acquisition wedge;
  execution order is owned by ROADMAP.md).

## Overview

Phase 15 pushes COGS + AP to QuickBooks. Phase 16 closes the money loop from the other end: pull
Commerce7 DTC/club/POS **sales** in, deplete finished-goods inventory, and post **DTC revenue** to
the same QuickBooks export seam — so a bottle's whole journey (grape → glass → GL) lands in one system
of record, and finished-goods on-hand is one number, not two. Two-way: pull orders/sales + deplete
inventory, post revenue; mirror finished-goods stock increases back to Commerce7. It is NOT a full GL
mirror, NOT a bidirectional inventory merge, and NOT a Commerce7 store rebuild — it is an event-driven
adapter off our ledger (D20), with our ERP authoritative and Commerce7 as a downstream sales channel.

Competitive frame: InnoVint's Commerce7 link is one-way + 1:1-constrained. Our multi-tenancy lets one
account serve many wineries, each linking their own Commerce7 tenant (`docs/api-strategy.md:76`).

## Problem Frame

A winery today runs production in this ERP and DTC in Commerce7, and reconciles finished-goods counts
and revenue by hand — the exact fragmentation the ROADMAP Phase 16 exit criterion targets ("a DTC sale
depletes finished-goods inventory", `ROADMAP.md:824`). Without this, per-SKU profitability is guesswork
(we have COGS from Phase 8 but no revenue), inventory drifts between the two systems, and the winery's
books miss DTC revenue unless someone keys it in.

**Product pressure test.** Phase 16 sits deliberately *late* ("channel & commercialization, trigger-based,
late", `ROADMAP.md:140-142`), behind the sellable core (compliance + cost + accounting). Honest read:
worth building when there is a design partner on Commerce7, OR to make the demo tell the full grape-to-GL
story. The plan starts the **non-code partner/sandbox milestone (Unit 0) now** while code is built
offline against docs + a mock adapter — not blocked, not over-invested.

Phase 16 completes the rational sales narrative — grape → glass → GL, and now margin per channel (Unit
10b). But it must NOT be sequenced ahead of the natural-language work-order wedge slice for demo purposes.
The NL wedge is the **acquisition** demo (the thing that gets a prospect to lean in); Phase 16 is the
**retention / CFO** story (the thing that makes them stay and expands the account). `status: ready-for-work`
means this plan is buildable, not that it is next in the queue — execution order is owned by ROADMAP.md's
execution sequence, which deliberately places this channel/commercialization tier late.

## Requirements

- **MUST:** Each winery links its OWN Commerce7 tenant via a **nonce-bound install** initiated from
  inside the ERP (the install callback's `tenantId` is NEVER trusted on its own); connections are
  tenant-scoped + RLS-isolated; a given Commerce7 tenant attaches to at most one of our tenants at a time.
- **MUST:** Model orders as a **mutable projection** and emit **append-only delta events** so order
  edits, payment-state transitions, `upsert` id-churn, and refunds are represented correctly — never a
  single immutable snapshot that later edits cannot amend.
- **MUST:** Ingest is exactly-once and atomic — the delta event + inventory movement + PENDING revenue
  delivery commit or roll back together, in ONE SERIALIZABLE tx; a duplicate/replayed order no-ops.
- **MUST:** Only **settled (`Paid`) order economics** post revenue and deplete finished goods; carts,
  drafts, and unpaid orders do not deplete inventory or debit the clearing account.
- **MUST:** A DTC sale depletes finished-goods inventory (`BottledInventory`) via the existing race-safe
  `decrement` + a new `SALE` `StockMovement`, per **(variant, location)**.
- **MUST:** DTC revenue posts to QuickBooks through the SAME `AccountingDelivery` outbox/poster as a new
  export-event source; each delta posts the **difference** (versioned posting/DocNumber), exactly-once.
- **MUST:** Outbound inventory is a **replica push**: additive adjustments ONLY when ERP stock
  *increases* (bottling/positive adjust), idempotent via a per-(variant, location) watermark; NEVER an
  absolute reset in the hot path and NEVER a push triggered by a sale-driven decrement. Drift is
  **detected and surfaced for human review**, never silently auto-corrected.
- **MUST:** Withhold/guard (D14) when a Commerce7 SKU is unmapped or a required sales account is
  unmapped — never guess a SKU match or post an unbalanced/miscoded journal; strand nothing.
- **MUST:** DTC-customer PII is data-minimized (D19) — no PII in immutable delta events, in order-dirty
  markers, in withheld reasons, or in logs/errors; PII lives in a mutable, crypto-shreddable store
  referenced by id (v1 stores none; fetch on-demand from C7 for the UI).
- **MUST:** Every new tenant-scoped table follows the AGENTS.md Phase-12 checklist verbatim, proven
  through the pooled endpoint (H1).
- **MUST:** Webhook authenticity despite no HMAC — separate inbound Basic Auth secret (NOT the app
  Secret Key) + unguessable URL + re-fetch-before-act + a mandatory `(updatedAt, id)` polling reconciler
  backstop that **auto-recreates** a disabled webhook.
- **SHOULD:** Full-order + partial refund/cancel reverses via a compensating delta event (D6).
- **SHOULD:** A sync-status dashboard shows connection health, ingest/delivery counts, unmapped SKUs,
  inventory drift, and webhook health.
- **NICE:** Cursor-paged historical backfill on first connect (bounded, opt-in).

## Scope Boundaries

**In scope (v1):**
- Per-tenant Commerce7 connection via a nonce-bound install + human confirm; uninstall lifecycle.
- Inbound: mutable `Commerce7Order` projection (webhook = hint → dirty marker; poll = single ingest path,
  `(updatedAt, id)` cursor with overlap) → normalize → diff → append-only `SalesExportEvent` DELTAs +
  `SALE` inventory depletion + PENDING revenue delivery (Paid only).
- Outbound: additive inventory adjustments on ERP stock increases, idempotent via a movement watermark;
  a read-only drift detector.
- SKU mapping (Commerce7 variant+location ↔ `WineSku`+location) + sales-account mapping (revenue /
  sales-tax / shipping / **undeposited-funds clearing** / discount) on `AppSettings`; withhold-when-unmapped.
- Revenue delta posting to QBO through the existing poster; full + partial refund/cancel reversal (D6).
- Mock-adapter idempotency harness; sync-status dashboard; docs/register updates; live sandbox verify.

**Out of scope (deferred, explicit — several flagged by council as real gaps, not niceties):**
- **WineDirect adapter** — built later behind the SAME provider-neutral commerce-adapter interface.
- **COGS-on-sale as a NEW posting** — v1 posts DTC **revenue** only; COGS flows from the existing
  Phase-8b sold/unsold cost-variance seam (now fed by `SALE` depletion). The cost job MUST use the sale's
  accounting date to avoid a month-end matching gap (Unit 7). **Confirm with an accountant.**
- **Payout / processing-fee reconciliation** — DR undeposited-funds clearing at gross leaves a hanging
  balance equal to processor fees + a batched-net-payout gap. v1 does NOT ingest C7/processor payouts;
  the clearing account is reconciled manually/elsewhere. **Flagged as a known accounting gap the operator
  must close before relying on the DTC cash tie-out.**
- **Unpaid / Net-30 / on-account orders posting to A/R** — v1 posts Paid orders only; deferred/unpaid
  orders are held (not posted to A/R) and surfaced in the dashboard.
- **Gift cards, store credit, tips** — surfaced/withheld, not mapped to GL in v1 (they distort the JE).
  Discounts ARE handled (a discount line in the revenue delta).
- **Full customer/club sync** — customers referenced by opaque Commerce7 id only.
- **Multi-currency** — v1 assumes the tenant's home currency (USD).
- **POS-hardware / cart flows** — only settled orders ingested, never carts/drafts.
- **Finished-goods allocation/reservation across channels** (club / tasting room / wholesale) — deferred;
  Phase-16 schema choices (per-(variant, location) movements, channel captured on the order projection and
  the deltas) must remain allocation-ready. Natural follow-on phase.

## Research Summary

### Codebase Patterns (reuse blueprint — file:line)

**Transactional-outbox + exactly-once poster (REUSE):**
- `src/lib/accounting/post-sweep.ts` — `claimBatch()` (60-77): `UPDATE … FOR UPDATE SKIP LOCKED` + lease
  + attemptCount++. `postOne()`/`postBill()` (84-187): query-before-post via `findByDocNumber` → adopt or
  post → finalize. `runAccountingPostSweep(deps?)` (189-249) with injectable `adapterFactory` + `orgIds`
  (the DI seam the idempotency harness uses).
- `AccountingDelivery` (`prisma/schema.prisma:2279-2304`): `PENDING → IN_FLIGHT → {POSTED | VERIFYING |
  FAILED}`, plus `WITHHELD`, `DELETED_IN_GL`. XOR CHECK `accounting_delivery_one_source`
  (migration 20260702050100:164-165) — **Phase 16 changes it to exactly-one-of-three.**
- Immutable sources `CostExportEvent` (`schema:2139-2167`), `ApExportEvent` (`schema:2256-2277`) —
  `@@unique([tenantId, postingKey])`. Phase 16 adds `SalesExportEvent` (delta-shaped).
- Emit-inside-tx: `src/lib/cost/export-emit.ts` (`emitExportForSnapshot`/`createDeliveryForExport`
  43-121) — PENDING delivery in the SAME tx as the immutable event; D14 withhold (`export.ts` 58-87).
- Reconcile read-back: `src/lib/accounting/reconcile.ts` (`getById` → `DELETED_IN_GL`).
- **Least-privilege enumerator (REUSE, do NOT rebuild):** `src/lib/accounting/enumerator.ts` — the
  `accounting_enumerator` role (SEC-C3, SELECT on `organization` only, `DATABASE_URL_ENUMERATOR`).
  Phase-16 crons reuse `listAllOrgIds()`; extend its grants ONLY to the new read tables it must scan.
  Cron routes: `src/app/api/cron/accounting-*` (constant-time `CRON_SECRET`, `nodejs`, `maxDuration=300`).
- Mock-adapter idempotency harness: `scripts/verify-accounting-idempotency.ts` (DI + `crashOnce`).
- Adapter fault taxonomy: `src/lib/accounting/adapter.ts` `ProviderFault`/`ProviderFaultKind` (69-87).

**Finished-goods / inventory seam (depletion target):**
- `BottledInventory.totalBottles` (`schema:686-700`), `@@unique([tenantId, wineSkuId, locationId])`.
  `StockMovement` (`schema:657-684`) append-only ledger; `MovementKind` = `RECEIVE | ADJUST | TRANSFER`
  only — **no SALE kind yet.**
- `src/lib/stock/movements.ts` — race-safe `decrement()` (77-90): conditional `updateMany` with
  `totalBottles: { gte: amount }`, throws `CONFLICT`; wrapped in `withWriteRetry(() => runInTenantTx(...))`
  + `StockMovement` + `writeAudit`.
- `WineSku` (`schema:563-592`) — two PARTIAL unique indexes (vintaged vs `WHERE isNonVintage`);
  `findOrCreateWineSku` (`src/lib/bottling/sku.ts`) is find-or-create. `materializeFinishedGoods`
  (`src/lib/bottling/materialize.ts:47-107`).

**Account/SKU mapping + withhold (D14):** `src/lib/accounting/coa.ts`/`components.ts` (role-based, rank
never hide, delete-row-when-cleared → withhold); AP accounts live on `AppSettings` (`schema:1095-1096`)
— **Phase 16 puts DTC sales accounts on `AppSettings` too.** UI: `AccountingConnectionCard.tsx`,
`AccountMappingCard.tsx`.

**Tenant plumbing:** `runAsTenant`/`requireTenantId` (`src/lib/tenant/context.ts`), `runInTenantTx`
(`tx.ts:17-28`, `SET LOCAL` first stmt, D17), `runInTenantRawTx` (`tx.ts:42-61`), `runLedgerWrite`
(SERIALIZABLE + `withWriteRetry`), `runAsSystem` (owner, enumerate-only). K12: pass `tenantId` explicitly
into cached fns.

### Prior Learnings (from project memory)

- **Clone Phase 15, don't rebuild** (`phase15-qbo-plan-review-complete.md`): outbox emitted inside the
  write tx, exactly-once poster, `AccountingDelivery` state machine, least-privilege enumerator, reconcile,
  mock-adapter DI harness.
- **SEC-C4 KEK→KMS before prod GA** — env-resident KEK; shared prerequisite. The app Secret Key is a
  single app-global high-value credential → same posture (env now, KMS-backed access before GA).
- **H1 (urgent):** prove tenant isolation THROUGH the Neon pooler in CI; every new table lands in that suite.
- **Raw SQL bypasses tenancy** (`raw-sql-tenant-scoping.md`): `runInTenantRawTx`/`runInTenantTx`;
  `verify:raw-sql`.
- **Prisma/Neon-on-Windows** (`prisma-neon-migrations-windows.md`): hand-author SQL via `migrate diff …
  --script | grep -v search_vector` → `migrate deploy` → `generate` (stop dev server first). **Enum rule:**
  new enum values (`SALE`, `CommerceProvider`, delta `kind`) in ISOLATED `ALTER TYPE` migrations committed
  BEFORE any column defaults to them.
- **Demo Winery only** (`demo-winery-testing-convention.md`) — connect the C7 sandbox under Demo Winery
  (Phase-15 accidentally persisted under Bhutan — don't repeat).
- **Commit straight to main** (`prefers-working-on-main.md`).

### External Research (Commerce7 API, mid-2026 — cite URLs in code comments)

**⚠️ AUTH: NOT OAuth2.** App ID + App Secret Key over HTTP Basic Auth + a **`tenant:` header** naming the
winery. A winery authorizes by **installing** the app; the Install URL receives a POST with `tenantId` +
installer info. **No per-tenant tokens, no rotation, no PKCE.** Secret Key is app-global, long-lived,
from `dev-center.platform.commerce7.com`. Sources: `developer.commerce7.com/docs/{commerce7-apis,
app-apis-webhooks,create-an-app}.md`.

**Reuse boundary (honest):** the Phase-15 **OAuth/token machinery does NOT transfer** — `token.ts`
(serialized refresh + CAS), `connection.ts` `exchangeCode`, and the AEAD refresh-token store are
QBO-specific and are NOT rebuilt. What transfers: outbox + delivery state machine + claim/post/verify
poster + reconcile + enumerator cron + mock-adapter harness + provider-neutral adapter shape +
tenant-scoped-table checklist. **We DO reuse the Phase-15 `OAuthState` single-use-nonce pattern** — not
for tokens, but for the **install nonce** (Unit 3). `envelope.ts` is reused ONLY if we store a per-tenant
webhook secret; v1 uses an app-level inbound webhook secret in env (separate from the app Secret Key).

**Endpoints (base `https://api.commerce7.com/v1`, REST only — no GraphQL):** `GET /order` (filter
`updatedAt` `gte:`/`btw:`, `channel`, `fulfillmentStatus`), `GET /order/{id}` — `id` (stable UUID),
`orderNumber`, `paymentStatus` (Paid/Authorized/Cancelled), `items[]` (sku, qty, price cents, tax),
discounts, `tenders[]`, `total`. **`PUT /order/upsert` is delete-then-recreate → id churn; never use it.**
`GET /product` variants carry `sku`, `price` cents, and per-variant/per-location inventory
(`availableForSaleCount`, `inventoryLocationId`). Inventory write: **adjust(delta) or reset(absolute)** —
exact endpoint unconfirmed (Unit 0). `GET /customer/{id}` — PII; v1 stores none.

**Pagination/limits:** offset default 50, **past page 100 throttled to 1 req/60s** → use **cursor
paging** for backfill. **100 req/min/tenant.**

**Webhooks (weak auth):** Order Create/Update/Delete (no `order.paid` — inspect `paymentStatus`). Payload
`{object, action, payload, tenantId}`. **No HMAC — only optional Basic Auth.** **48h of failures →
permanently auto-disabled (must recreate).** → secret URL + separate Basic Auth + re-fetch-before-act +
`(updatedAt,id)` polling reconciler + auto-recreate.

**Other:** no idempotency-key header; money in cents; timestamps UTC (admin displays tenant-local — do
day-boundaries in the winery tz); inventory per-variant AND per-location. Refund/partial-refund endpoints
undocumented → confirm in sandbox (Unit 0); partial refunds are a *routine* state (handle in v1).

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| **Auth / connection** | App-global Basic Auth (App ID + Secret Key in env) + per-tenant install record (C7 slug, scopes, status). NO token. | Rebuild QBO per-tenant OAuth | Commerce7 has no OAuth/tokens. |
| **Install trust (tenant-hijack fix)** | **Nonce-bound install:** ERP user clicks Connect → mint a single-use nonce (reuse the `OAuthState` pattern) → pass as `state` in the setup URL → on the install callback verify the nonce + same workspace + require explicit admin confirm before enabling polling. Strict-validate the tenant slug. | Trust the callback `tenantId` | Council P0 (both): an unauthenticated callback lets an attacker link a victim's C7 tenant to their workspace. |
| **Order model (core correction)** | **Mutable `Commerce7Order` projection** keyed by C7 order id; normalize the current economic snapshot; **diff vs last-known**; emit append-only `SalesExportEvent` **DELTAs** (`SALE` / `ADJUSTMENT` / `REVERSAL` / `REFUND`). `postingKey = sale:${orderId}:v${deltaSeq}`. | Single immutable `sale:${orderId}` event | Council P0 (both): orders are mutable (edits, payment-state, `upsert` id-churn); one immutable snapshot can't be amended → dropped revenue/inventory. |
| **Exportable-sale state machine** | Emit sale/deplete/post ONLY on `paymentStatus=Paid`; ignore carts/drafts; unpaid/Net-30 → held + surfaced (not posted). | Post on order-create | Council: debiting clearing for unpaid orders inflates cash; carts deplete phantom inventory. |
| **Inventory source-of-truth + two-way model (simplified)** | ERP authoritative; **Commerce7 = replica.** Inbound stock signal = **orders only** (SALE depletion). Outbound = **additive adjust on ERP stock *increase* only** (bottling RECEIVE / positive ADJUST), idempotent via a per-(variant,location) **movement watermark**; NEVER absolute-reset in the hot path, NEVER push on a sale decrement. **Drift detector is read-only** → surfaces conflicts for human review (esp. if a C7 operator hand-edits inventory). | Absolute-reset + echo-guard + "diverge beyond unpushed sales" | Council P0 (both): the reset has an oversell race; the divergence math is a distributed lock with no lock. Additive-on-increase + orders-in is race-free and far simpler. |
| **Order dedup / idempotency** | `SalesExportEvent` `@@unique([tenantId, postingKey])` where `postingKey=sale:${orderId}:v${deltaSeq}`; delivery query-before-post by the same key; ingest tx is SERIALIZABLE so a duplicate aborts atomically. | orderId alone | Versioned key represents each delta once; UNIQUE + SERIALIZABLE tx gives exactly-once. |
| **Delivery source (outbox)** | Extend `AccountingDelivery` with `salesExportEventId?`; XOR CHECK → **exactly-one-of-three**. | Parallel table + poster | Reuses the whole poster/reconcile/dashboard. |
| **Revenue posting** | Post each delta as a QBO JournalEntry of the **difference**: DR **undeposited-funds clearing** (Paid only), CR revenue + CR sales-tax-payable + CR shipping-income; discount as a contra line. No QBO customer (PII-min). | SalesReceipt + QBO customer; per-order DR bank cash | JE-of-delta reuses `postJournalEntry` + avoids double-book on edits; undeposited-funds (not bank cash) because payouts are batched-net. |
| **Processing fees / payouts** | **Deferred + flagged:** gross-to-clearing leaves a hanging balance = fees; v1 does not ingest payouts. | Book estimated fee at sale; payout pipeline | Council P1 (both): real gap. Documented in Scope + go-live runbook; operator reconciles manually until a payout pipeline is built. |
| **Period matching (COGS)** | The Phase-8b cost/variance job posts COGS on the **sale's accounting date** (winery-local business date), same date as the revenue delta. | Cost posts on its own batch date | Council P1 (both): revenue-July / COGS-August wrecks month-end margin. |
| **DTC-customer PII (D19)** | Immutable deltas + dirty markers + withheld reasons + logs carry **only opaque ids + amounts + SKU refs**. No PII stored in v1; on-demand fetch for UI. | Cache name/email | Data-minimization; nothing to shred if nothing stored; council flagged PII-at-rest via error/withheld paths. |
| **Webhook authenticity** | **Separate inbound Basic Auth secret** (NOT the app Secret Key) + unguessable URL + re-fetch-before-act + `(updatedAt,id)` poll backstop + **auto-recreate** on disable. Webhook only writes a bounded, deduped `Commerce7Order` dirty marker before returning 200. | Trust payload; reuse app secret; alert-only | No HMAC; 48h-disable is unrecoverable; a shared secret widens blast radius. |
| **Poll watermark** | `(updatedAt, id)` composite cursor with an overlap window; advance only past a fully-drained page. | `updatedAt` alone | Council P1: same-timestamp orders on a page boundary get skipped. |
| **SALE inventory ledger** | Add `SALE` to `MovementKind` (isolated enum migration); deplete via existing `decrement()`. | Ride `ADJUST` | First-class, auditable, feeds Phase-8b sold/unsold. |
| **Unmapped SKU / account** | Withhold (D14): record the order projection + dirty state, but do NOT emit the immutable delta / deplete / post until SKU + accounts mapped; re-emit on map. | Auto-match by SKU string | Never guess a match or post a miscoded journal; C7 remains the durable source so nothing is lost. |
| **Refunds** | Full AND partial refund/cancel → compensating `REFUND`/`REVERSAL` delta (D6): reversing revenue delta + re-increment inventory. | Defer partial; mutate original | Partial refunds are routine, not edge; append-only correction (D2/D6). |
| **Enumerator** | Reuse `accounting_enumerator` + `listAllOrgIds()`; extend grants to new read tables only. | New commerce enumerator role/module | DRY; the role already has exactly the least privilege. |

## Security Hardening (threat-model, folded from the security pass)

- **App Secret Key** = single app-global credential, total blast radius. Env only, never a DB column,
  scrubbed from Sentry/logs (extend `src/lib/observability/redact.ts` for `tenant`/Authorization/Secret/
  App-Id). Per-environment credentials (no lower-env reuse); KMS-backed access alongside the SEC-C4 move.
- **Install callback** = nonce-bound (single-use `OAuthState`-pattern nonce tied to the initiating admin
  + workspace) + strict tenant-slug validation + explicit human confirm before polling. Handle the C7
  **uninstall** callback → set DISCONNECTED, stop polling, best-effort delete the webhook.
- **Webhook**: unguessable path + a **separate** inbound Basic Auth secret (constant-time compare) +
  reject on tenant mismatch (payload `tenantId` must match a CONNECTED record) + re-fetch before acting.
  Bound the dirty-marker table: upsert keyed by `(tenantId, orderId)` so a flood dedups to one row per id;
  cap the backlog; a fake id that 404s on refetch is dropped (mitigates the DoS council flagged without
  needing Redis). IP-allowlist if C7 publishes ranges.
- **Cron** enumerates via `accounting_enumerator` (no secret-table grant); per-tenant reads under app_rls.
- **PII**: assert (test) `SalesExportEvent` + `Commerce7Order` + dirty markers have no PII columns; never
  log raw C7 payloads (error, withheld, dead-letter). Redact customer fields everywhere.
- **Rate budget**: a per-tenant token bucket shared across poll + refetch + UI on-demand fetch so the
  100 req/min/tenant cap can't be blown (append a scale-register entry).
- All new tables: RLS ENABLE+FORCE + USING & WITH CHECK on `current_setting('app.tenant_id', true)`,
  proven through the pooler (H1).

## Design & UX Specification (folded from the design review)

Reuse the Phase-15 Settings patterns (DESIGN.md tokens; `ux-principles.md`):
- **`Commerce7ConnectionCard.tsx`** (mirrors `AccountingConnectionCard.tsx`): status badge, a **"Connect
  Commerce7"** button that starts the nonce-bound install, a post-callback **confirm step** ("Link
  <winery> to this workspace?"), Disconnect. Never shows the app secret. Surfaces a **webhook-health**
  chip (last successful event; amber when stale).
- **`Commerce7MappingCard.tsx`** (mirrors `AccountMappingCard.tsx`): SKU-match rows (C7 variant+location ↔
  `WineSku`+location; match, never silently create — respect the NV partial-unique split), plus
  winery-wide sales-account selects (revenue / sales-tax / shipping / undeposited-funds clearing /
  discount) reusing the CoA picker (`loadChartOfAccounts`, `rankAccountsForRole` extended for the new
  roles). Skeleton while C7 data loads; block half-filled rows; surface unmapped count.
- **Sync-status view** extends `src/lib/accounting/dashboard.ts`: connection health, ingest/delivery
  counts by status (incl. WITHHELD/FAILED/DELETED_IN_GL), unmapped-SKU attention row, **inventory-drift**
  attention row (read-only — "review", not "auto-fix"), **held-unpaid-orders** row, webhook-health.
- **DTC margin report** (Unit 10b): one table/report surface — rows = `WineSku` × channel, columns =
  revenue / COGS / margin / margin %. Reuse the Phase-15 report components + DESIGN.md tokens; domain
  language. A persistent inline caveat label ("revenue gross of processor fees") sits on the surface, not
  buried in a tooltip, so margin is never read as final-net.
- Empty/loading/error states for all four; reduced-motion-aware; domain language, no GL jargon.

## Implementation Units

### Unit 0: Commerce7 App Partner application + sandbox milestone (non-code, start now, parallel)

**Goal:** Sandbox + App ID + Secret Key + confirm the undocumented API surfaces, without blocking code.
**Files:** `docs/plans/phase-16-app-partner-checklist.md`.
**Approach:** Apply at `commerce7.com/partners-developer-apply`. On approval: create the app, capture App
ID + Secret Key, declare minimal scopes (Order Read, Product Read + inventory-write, Customer Read), set
the Install URL (with `state` nonce support) + webhook URL + a **dedicated inbound webhook Basic Auth
secret**. Confirm in sandbox: (1) inventory adjust vs reset endpoint + payload, (2) 429 body + `Retry-After`,
(3) refund / partial-refund + post-fulfillment edit + `upsert` id-churn behavior, (4) install-callback +
uninstall exact payloads, (5) whether C7 publishes webhook source IPs. Pull the live OpenAPI. Connect the
sandbox under **Demo Winery**.
**Tests:** n/a. Exit = keys in hand + findings appended to this plan.
**Depends on:** none. **Verification:** `GET /product` curl with app creds + `tenant:` header returns 200.

### Unit 1: Schema — connection, order projection, delta events, mapping, SALE, 3-way delivery

**Goal:** All Phase-16 tables + enum changes, tenant-checklist-compliant + RLS + the delivery extension.
**Files:** `prisma/schema.prisma`; hand-authored migrations; `src/lib/tenant/models.ts` (NOT in
GLOBAL_MODELS); `scripts/verify-tenant-isolation.ts` + `test/tenant-isolation.test.ts`.
**Approach:** Each model per the Phase-12 checklist (tenantId `@default("")` + `@@index`, composite FK →
organization ON DELETE RESTRICT, per-tenant uniques, `@@unique([tenantId, id])` where referenced):
- `Commerce7Connection` — `provider CommerceProvider @default(COMMERCE7)`, `status ConnectionStatus`,
  `externalTenantId` (slug), `scopes String[]`, `installedByUserId?`, `webhookId?`, `webhookConfiguredAt?`,
  `lastWebhookAt?`. `@@unique([tenantId, provider])`; partial unique `(provider, externalTenantId) WHERE
  status='CONNECTED'`. NO token columns.
- `Commerce7InstallState` — single-use nonce (reuse the `OAuthState` shape): `nonceHash`, `userId`,
  `expiresAt`. `@@unique([tenantId, nonceHash])`.
- `Commerce7SkuMap` — `externalProductId`, `externalVariantId`, `externalSku`, `externalInventoryLocationId`,
  `wineSkuId?` (composite FK), `locationId?`, `lastPushedMovementSeq BigInt @default(0)` (outbound
  watermark), `active`. `@@unique([tenantId, externalVariantId, externalInventoryLocationId])`.
- `Commerce7Order` (MUTABLE projection, NO PII) — `commerce7OrderId`, `commerce7OrderNumber`,
  `commerce7CustomerId?` (opaque), `channel`, `paymentStatus`, `fulfillmentStatus`, `normalizedSnapshot
  Json` (sku+qty+cents+tax+discount, no PII), `lastDeltaSeq Int @default(0)`, `dirty Boolean`,
  `lastSeenUpdatedAt`, `occurredAt`. `@@unique([tenantId, commerce7OrderId])`, `@@index([tenantId, dirty])`,
  `@@index([tenantId, lastSeenUpdatedAt, commerce7OrderId])` (poll watermark).
- `SalesExportEvent` (IMMUTABLE delta, NO PII) — `postingKey` (`sale:${orderId}:v${deltaSeq}`),
  `commerce7OrderId`, `deltaSeq`, `kind SalesDeltaKind` (SALE|ADJUSTMENT|REVERSAL|REFUND), `currency`,
  `revenueDelta Decimal(18,8)`, `salesTaxDelta`, `shippingDelta`, `discountDelta`, `lineDeltas Json`
  (skuRef + qtyDelta, no PII), `revenueAccount?`/`clearingAccount?`/`taxAccount?`/`shippingAccount?`/
  `discountAccount?`, `reversalOfSalesExportEventId?`, `accountingDate`, `occurredAt`, `createdAt`.
  `@@unique([tenantId, postingKey])`, `@@unique([tenantId, id])`, `@@index([tenantId, commerce7OrderId])`.
- DTC sales accounts on `AppSettings` (columns, like AP): `dtcRevenueAccount`, `dtcTaxAccount`,
  `dtcShippingAccount`, `dtcClearingAccount`, `dtcDiscountAccount`.
- Extend `AccountingDelivery`: `salesExportEventId?` (composite FK) + `@@unique([tenantId,
  salesExportEventId])`.
- Enums (ISOLATED migrations, Windows rule): `MovementKind += SALE`; new `CommerceProvider
  {COMMERCE7, WINEDIRECT}`; new `SalesDeltaKind`; delivery XOR CHECK → exactly-one-of-three.
- Migrations: hand-author via `migrate diff … --script | grep -v search_vector`; split enum `ALTER TYPE`;
  per-table RLS migration (ENABLE + FORCE + `tenant_isolation` USING & WITH CHECK); app_rls DML grants;
  extend `accounting_enumerator` SELECT to the new read tables; change the delivery CHECK.
**Tests:** isolation cases per new table THROUGH the pooler (H1); a schema test asserting `SalesExportEvent`
+ `Commerce7Order` have no PII column.
**Depends on:** none. **Execution note:** enum migrations first, isolated. **Verification:**
`verify:tenant-isolation` + `verify:raw-sql` green; diff→deploy clean.

### Unit 2: Provider-neutral commerce adapter + Commerce7 REST client + mock

**Goal:** A `CommerceAdapter` seam (WineDirect-ready) + a real client (rate-budgeted) + a mock.
**Files:** `src/lib/commerce/adapter.ts`, `src/lib/commerce/commerce7/{config,client,index}.ts`,
`src/lib/commerce/mock.ts`, `src/lib/commerce/rate-budget.ts`.
**Approach:** Interface: `listOrdersSince(ctx, cursor)`, `getOrder(ctx, id)`, `listProducts(ctx, cursor)`,
`getVariantInventory(ctx, variantId, locationId)`, `adjustInventory(ctx, variantId, locationId, delta)`
(additive; the outbound primitive), `getCustomerRef(ctx, id)` (opaque). `ProviderCallContext = {appId,
secretKey (env), tenantSlug, environment}`. Client: Basic Auth + `tenant:` header, **cursor pagination**,
backoff on 429/5xx (reuse `QboClient` backoff shape; honor `Retry-After` per Unit 0), `redirect:"error"`,
hardcoded `api.commerce7.com` egress allowlist, **never log credentials**, money cents→Decimal,
timestamps→tz-aware. **Per-tenant rate budget** (token bucket) shared across all call sites. Mock:
in-memory orders/products/inventory + a `crashOnce` seam + a settable order that can be EDITED between
polls (to test delta ingest).
**Tests:** `test/commerce7-client.test.ts` — fault classification, cursor paging, cents/tz normalization,
additive-adjust semantics, rate-budget throttling.
**Depends on:** none. **Verification:** `npm test` new suites green.

### Unit 3: Connection — nonce-bound install, connect card, disconnect, uninstall, one-install guard

**Goal:** A winery links its C7 tenant via a trust-bound install; global install guard; uninstall lifecycle.
**Files:** `src/app/api/commerce7/install/route.ts` (verify nonce → stage a PENDING_CONFIRM connection),
`src/app/api/commerce7/uninstall/route.ts`, `src/lib/commerce/connection.ts`
(`beginInstall`/`consumeInstallNonce`/`confirmInstall`/`disconnect`/`getConnectionSummary`),
`src/lib/commerce/actions.ts` (`adminAction`-gated), `src/app/(app)/settings/Commerce7ConnectionCard.tsx`,
wire into `SettingsClient.tsx` + `page.tsx`.
**Approach:** `beginInstall` mints a single-use nonce (reuse the `OAuthState` mechanics) bound to the
admin + workspace and returns the C7 setup URL with `state=nonce`. The install callback verifies the
nonce (single-use delete), strict-validates the tenant slug, and stages a `PENDING_CONFIRM` record; an
explicit admin **confirm** flips it CONNECTED and registers the webhook (with the separate inbound
secret). One-install guard via the partial unique index (catch P2002 → friendly message). Uninstall
callback → DISCONNECTED + stop polling + delete webhook. Never render the app secret.
**Tests:** `test/commerce7-connection.test.ts` — nonce single-use + replay rejected + workspace binding;
install-guard P2002; confirm gating; uninstall.
**Depends on:** Units 1, 2. **Verification:** connect→confirm→disconnect states render under Demo Winery.

### Unit 4: SKU + sales-account mapping (UI + read models + withhold)

**Goal:** Map C7 variant+location ↔ `WineSku`+location and set DTC sales accounts; withhold when unmapped.
**Files:** `src/lib/commerce/mapping.ts` (`getSkuMap`/`saveSkuMap`/`getSalesAccountMap`/`saveSalesAccountMap`/
`resolveSaleAccounts`/`resolveSkuMapping`), `src/app/(app)/settings/Commerce7MappingCard.tsx`, extend
`src/lib/commerce/actions.ts`.
**Approach:** Fetch C7 products via the adapter (cached with explicit tenantId — K12) + our `WineSku` list;
render match rows per (variant, location) (match, never silently create) + winery-wide sales-account
selects reusing the CoA picker (extend `rankAccountsForRole` for revenue/tax/shipping/clearing/discount).
Save upserts complete rows only; clearing → unmapped → withhold. Mirror `AccountMappingCard` half-filled
guard + unmapped count.
**Tests:** `test/commerce7-mapping.test.ts` — resolve mapped/unmapped; withhold reason; per-location
resolution; account-role ranking.
**Depends on:** Units 1, 2. **Verification:** mapping card shows unmapped count; a full row clears it.

### Unit 5: Inbound sync — order projection, diff→delta ingest, depletion (webhook hint + poll ingest)

**Goal:** Ingest orders exactly-once as a mutable projection → append-only DELTAs + `SALE` depletion +
PENDING revenue delivery, atomic, Paid-only, withhold on unmapped.
**Files:** `src/app/api/commerce7/webhook/route.ts` (separate Basic Auth, bounded dirty-marker upsert,
fast 200), `src/lib/commerce/ingest.ts` (`syncOrder` — normalize→diff→emit deltas, the SERIALIZABLE core),
`src/lib/commerce/normalize.ts` (C7 order → economic snapshot; PII-free), `src/lib/commerce/diff.ts`
(snapshot diff → deltas), `src/lib/commerce/sales-emit.ts` (`emitSalesDelta` + `createDeliveryForSale`,
mirror `cost/export-emit.ts`), extend `src/lib/stock/movements.ts` (`depleteForSale` using `SALE` +
`decrement`; `restoreForRefund` re-increment), `src/app/api/cron/commerce7-poll/route.ts`,
`src/lib/commerce/poll.ts`.
**Approach:** Webhook = hint only: verify auth + tenant match → upsert `Commerce7Order.dirty=true` (deduped
by order id) → 200. Poll cron (single ingest path) drains dirty orders + sweeps `(updatedAt,id)` cursor
with overlap; for each: re-fetch via adapter, **filter to settled/Paid** (skip carts/drafts), normalize,
load the last-known snapshot, **diff**, and if `paymentStatus=Paid` and SKU+accounts mapped → in ONE
`runLedgerWrite` (SERIALIZABLE) tx: bump `lastDeltaSeq`, insert the immutable `SalesExportEvent` delta(s)
(`sale:${orderId}:v${seq}`, accounts filled, `accountingDate` = order paid date in winery tz),
`depleteForSale` (or `restoreForRefund` on negative delta) via `decrement`, and create the PENDING revenue
`AccountingDelivery` — all atomic; update the projection snapshot + clear dirty in the same tx. Unmapped →
keep the projection + dirty, emit NOTHING (withheld; re-emit after mapping). Duplicate/replayed order → the
diff yields no new delta OR the UNIQUE aborts → no-op. Advance the poll watermark only past a fully-drained
page. Never log raw payloads.
**Tests:** `test/commerce7-ingest.test.ts` — Paid happy path (delta+SALE+delivery in one tx); duplicate
order → no second delta; **order EDITED between polls → adjustment delta of the difference** (qty up, qty
down, line added, tax changed); unpaid/cart → nothing; unmapped SKU → withheld, inventory untouched;
rolled-back tx leaves no rows; insufficient stock → CONFLICT surfaced; watermark same-timestamp pair not
skipped; webhook bad-creds/tenant-mismatch rejected + dirty-marker flood dedups.
**Depends on:** Units 1–4. **Verification:** mock order ingests once; edit → one adjustment; re-poll no-ops.

### Unit 6: Outbound inventory — additive-on-increase replica push + read-only drift detector

**Goal:** Mirror ERP finished-goods INCREASES to Commerce7 idempotently; detect drift for human review.
**Files:** `src/lib/commerce/inventory-sync.ts` (`pushInventoryIncreases`), `src/lib/commerce/inventory-drift.ts`
(`detectDrift`), `src/app/api/cron/commerce7-inventory/route.ts`.
**Approach:** Per connected tenant, per mapped (variant, location): find `StockMovement`s that INCREASE
on-hand (RECEIVE, positive ADJUST) with `seq > lastPushedMovementSeq` (bounded batch), sum the delta, call
`adjustInventory(+delta)` ONCE, then advance `lastPushedMovementSeq` transactionally (idempotent via the
watermark — a retry before the advance re-sums the same movements to the same delta; after the advance it's
a no-op). **Never** push on SALE/negative movements (C7 already decremented itself on its own sale). The
**drift detector** is read-only: compare ERP on-hand vs C7 `availableForSaleCount` per (variant, location);
if they diverge beyond in-flight ingested sales, record a drift row + dashboard attention (a C7-operator
hand-edit shows up here) — never auto-write.
**Tests:** `test/commerce7-inventory-sync.test.ts` — a RECEIVE pushes +delta; an ingested SALE pushes
NOTHING; double-run before watermark advance = one net effect, after = no-op; drift surfaced not written.
**Depends on:** Units 1, 2, 5. **Verification:** mock: RECEIVE → +push; SALE → no push; re-run → no-op.

### Unit 7: Sales → accounting poster (revenue deltas) — extend the exactly-once poster

**Goal:** Post each revenue DELTA to QBO through the existing poster, exactly-once, as the difference.
**Files:** extend `src/lib/accounting/post-sweep.ts` (a `salesExportEventId` branch), `src/lib/accounting/
journal.ts` (`buildSalesDeltaJournal` — DR clearing, CR revenue/tax/shipping, discount contra; balanced in
cents; a REFUND/REVERSAL delta mirrors the signs), reuse `findByDocNumber`/`postJournalEntry`; extend
`reEmitPostable` to re-emit sales deltas that became postable after mapping.
**Approach:** New sweep branch: `postingKey (sale:orderId:vN) → docNumberFor` → query-before-post → adopt or
post the delta JournalEntry → finalize `POSTED`. Because each delta is the difference and carries a unique
versioned DocNumber, an order edit posts only the incremental entry (no double-book). Same fault mapping
(`period_closed`/`validation`→FAILED; transient→VERIFYING). Withheld deltas stay `WITHHELD` until re-emit.
The revenue delta's `accountingDate` is the tie-point the Phase-8b cost job also uses (period matching).
No COGS here.
**Tests:** `test/commerce7-post.test.ts` (mock QBO adapter) — a delta posts once; crash-between-accept-and-
finalize adopts on next sweep; concurrent double-sweep single-claims; an edit posts only the difference; a
refund posts a mirror entry; unbalanced journal refused pre-network.
**Depends on:** Units 1, 5 + the Phase-15 poster. **Verification:** mock sweep posts a delta JE once, re-sweep no-ops.

### Unit 8: Reconcile — missed webhooks, refunds/cancels (D6), read-back, drift, webhook auto-recreate

**Goal:** Backstop missed webhooks; represent refunds/cancels as delta reversals; verify posted revenue;
surface drift; self-heal the webhook.
**Files:** `src/lib/commerce/reconcile.ts` (poll `(updatedAt,id)` to catch missed/updated orders; a
Cancelled/refunded order → a `REFUND`/`REVERSAL` delta via the Unit-5 diff path), extend
`src/lib/accounting/reconcile.ts` for sales deliveries (getById → DELETED_IN_GL),
`src/lib/commerce/webhook-health.ts` (detect stale/disabled webhook → **recreate** it via the adapter).
**Approach:** The poll reconciler is the ingest backstop; this unit adds the refund/cancel correction (via
the same normalize→diff→delta path, so a partial refund is just a negative-delta adjustment), the read-back
for revenue deliveries, and webhook self-healing (if `lastWebhookAt` is stale beyond a threshold, or a probe
shows the webhook missing/disabled, recreate it and log).
**Tests:** `test/commerce7-reconcile.test.ts` — paid→full-cancel nets inventory + revenue to zero;
paid→partial-refund nets the difference; a missed webhook is caught by the poll; a stale webhook is
recreated; drift reported not written.
**Depends on:** Units 5, 6, 7. **Verification:** mock: paid→cancel nets to zero; stale webhook recreated.

### Unit 9: Crash-recovery + idempotency verification harness (mock DI, offline)

**Goal:** Prove exactly-once end-to-end offline: ingest, delta-on-edit, revenue post, no double-decrement,
no outbound loop, refund reversal.
**Files:** `scripts/verify-commerce7-idempotency.ts` (+ `verify:commerce7-idempotency`).
**Approach:** Mirror `verify-accounting-idempotency.ts` in `org_demo_winery`, small batches, mock commerce +
mock QBO via DI. Prove: (1) rolled-back ingest leaves no order/event/movement/delivery; (2) a normal
ingest+sweep posts revenue + depletes once, re-run posts/deletes nothing; (3) an order EDITED between polls
emits exactly one adjustment delta and posts exactly its difference; (4) crash-between-accept-and-finalize
adopts on next sweep (one JE); (5) concurrent double-poll/double-sweep single-claims (FOR UPDATE SKIP
LOCKED); (6) an outbound RECEIVE pushes once and re-runs no-op (watermark), an ingested SALE never pushes;
(7) a duplicate webhook no-ops; (8) a full + a partial refund each net correctly.
**Tests:** the script IS the test.
**Depends on:** Units 5–8. **Verification:** `npm run verify:commerce7-idempotency` all pass.

### Unit 10: Sync-status dashboard

**Goal:** Connection health, ingest/delivery counts, unmapped SKUs, drift, held-unpaid, webhook health.
**Files:** extend `src/lib/accounting/dashboard.ts` (or `src/lib/commerce/dashboard.ts`), a settings/
`/accounting` view; reuse the delivery-by-status read model.
**Approach:** Connection status + delta/delivery counts by status (incl. WITHHELD/FAILED/DELETED_IN_GL) +
unmapped-SKU attention + inventory-drift attention (read-only, "review") + held-unpaid-orders + a
webhook-health indicator (alert if `lastWebhookAt` stale). Domain language; DESIGN.md tokens.
**Tests:** `test/commerce7-dashboard.test.ts` — counts + attention rows.
**Depends on:** Units 1, 5–8. **Verification:** dashboard renders under Demo Winery with seeded data.

### Unit 10b: DTC per-channel margin view (read-only)

**Goal:** The strategic payoff — a read-only "DTC margin" view/report joining ingested revenue against
Phase-8 absorption-costed COGS, grouped by `WineSku` × channel, so a winery sees per-SKU, per-channel
profitability. NO posting logic, NO GL writes — read-only aggregation only.
**Files:** extend `src/lib/accounting/dashboard.ts` (or a sibling `src/lib/commerce/margin.ts`), a report
surface under the settings/`/accounting` view (reuse the existing dashboard/report components).
**Approach:** Aggregate `SalesExportEvent` revenue deltas (net of `discountDelta`, excluding tax/shipping)
grouped by `commerce7OrderId → skuRef → WineSku` and by **channel** (already on the `Commerce7Order`
projection and carried on the deltas) against the Phase-8 absorption COGS for the same SKUs
(`BottlingCostSnapshot` / the sold/unsold cost-variance seam, keyed by `skuId`). Read-only join +
roll-up; pass `tenantId` explicitly (K12). The view MUST carry an explicit **"revenue gross of processor
fees"** caveat, tied to the documented undeposited-funds / payout-reconciliation gap (Scope + Key
Decisions), so margin is never silently overstated. Domain language; reuse Phase-15 report components and
DESIGN.md tokens.
**Tests:** `test/commerce7-margin.test.ts` — the join/aggregation against seeded Demo Winery data
(revenue deltas × Phase-8 COGS) produces correct per-SKU × per-channel margin; a refund/adjustment delta
nets into the SKU's margin; the gross-of-fees label is present.
**Depends on:** Units 5, 7 (revenue deltas exist) + Phase-8 cost seam. **Verification:** the margin view
renders per-SKU × per-channel from seeded orders, labeled gross-of-fees.

### Unit 11: End-to-end verify + docs/register updates + live sandbox verification

**Goal:** One green end-to-end proof + honest docs; then verify against the real sandbox.
**Files:** `scripts/verify-commerce7.ts` (+ `verify:commerce7`), `docs/architecture/system-map.md`,
`docs/architecture/security-register.md` (DTC-PII entry; app-secret + no-HMAC-webhook + install-nonce
entries), `docs/architecture/scale-register.md` (poller + inventory-sync + rate-budget entries, four-part
shape), `docs/api-strategy.md` (mark the Commerce7 row built), `AGENTS.md` (Commerce7 section),
`docs/.brain-refresh-marker`, `docs/plans/phase-16-go-live-runbook.md` (incl. the flagged fee/payout
reconciliation gap), `ROADMAP.md`. Seed: `npm run seed:demo-commerce7` (Demo Winery).
**Approach:** `verify:commerce7` runs the full loop on Demo Winery with mock adapters (connect → ingest →
edit → deplete → post revenue delta → push increase → refund reversal → reconcile). Then, once Unit 0
delivers keys, a live smoke against the sandbox tenant. Fold the Unit-0 findings (the five unconfirmed
items) into the adapter config comments. Set the security-register PII flag to reflect reality (nothing
stored → 🟢 with a tripwire).
**Tests:** `verify:commerce7` is the gate; full suite + build clean.
**Depends on:** Units 1–10. **Verification:** `verify:commerce7` green; `npm run build` clean; sandbox smoke passes.

## Test Strategy

**Unit tests** (`test/commerce7-*.test.ts`, Vitest): client normalization + fault + rate-budget; connection
nonce/guard/uninstall; mapping resolve/withhold per-location; **normalize + diff** (the delta engine — the
riskiest new logic, test heavily); ingest transactional atomicity + edit→adjustment; additive-on-increase
idempotency; revenue-delta journal balance + refund mirror; **margin join/aggregation** (Unit 10b —
revenue deltas × Phase-8 COGS grouped by WineSku × channel against seeded Demo Winery data).
**Idempotency/crash harness** (`scripts/verify-commerce7-idempotency.ts`): mock DI, offline — exactly-once
for ingest + edit-delta + revenue post + no double-decrement + no outbound loop + refunds.
**Tenant isolation** (`verify-tenant-isolation` + test): every new table blocked cross-tenant THROUGH the
pooler (H1); `verify:raw-sql`.
**End-to-end** (`verify:commerce7`): full loop on Demo Winery (mock), then live sandbox smoke.
**Manual:** connect→confirm states; mapping unmapped→mapped; dashboard attention rows.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Order-edit / payment-state handling incomplete (the delta engine) | MED | HIGH | Mutable projection + diff→delta; heavy `diff`/`normalize` unit tests + edit cases in the idempotency harness. |
| Two-way inventory loop / double-decrement | LOW | HIGH | Replica model: orders-in only, additive-on-increase-out, watermark idempotency, read-only drift; proven Unit 9. |
| Install-callback tenant hijack | LOW | HIGH | Nonce-bound install + workspace binding + human confirm + slug validation. |
| Clearing account never ties out (fees/net payouts) | HIGH | MED | Documented gap; DR undeposited-funds; operator reconciles manually until a payout pipeline is built. Flagged in runbook. |
| Revenue/COGS period mismatch | MED | MED | Cost job uses the sale's accounting date; accountant confirm. |
| Undocumented C7 endpoints (inventory write, refunds, install/uninstall payloads, `upsert` churn) | HIGH | MED | Unit 0 confirms in sandbox; adapter isolates each call. |
| Webhook auto-disable (48h, unrecoverable) | MED | HIGH | Poll backstop + auto-recreate + dashboard health. |
| App-Secret leak (total blast radius) | LOW | HIGH | Env only, redaction, per-env creds, KMS-backed access (with SEC-C4). |
| PII leak via error/withheld/marker/log | LOW | HIGH | No PII stored; schema tests; redaction; never log raw payloads. |
| Rate limit (100/min/tenant) | MED | MED | Per-tenant token bucket across all call sites; cursor paging; bounded batches. |
| Webhook-flood DoS on dirty markers | LOW | MED | Dedup by order id + backlog cap + 404-on-refetch drop; IP-allowlist if published. |

## Success Criteria

- [ ] A Commerce7 sandbox order ingests exactly once (Paid only), depletes finished goods via a `SALE`
      movement per (variant, location), and creates a PENDING revenue delivery — all in one SERIALIZABLE tx.
- [ ] An order EDITED after ingest emits exactly one adjustment delta and posts only the difference.
- [ ] A full and a partial refund/cancel net inventory and revenue correctly via reversal deltas (D6).
- [ ] The revenue delta posts a balanced JournalEntry to QBO exactly once (crash-recovery proven).
- [ ] Outbound inventory pushes only on ERP increases, idempotent via the watermark; never on a sale.
- [ ] Inventory drift is detected and surfaced (never auto-written).
- [ ] A per-SKU, per-channel margin view renders from ingested sandbox orders joined to Phase-8 COGS,
      labeled gross-of-fees.
- [ ] An unmapped SKU/account withholds (nothing stranded; re-emits after mapping).
- [ ] The install callback cannot link a C7 tenant without a valid nonce + admin confirm.
- [ ] Every new table is RLS-isolated THROUGH the pooler (`verify:tenant-isolation` green, H1).
- [ ] No DTC-customer PII in any immutable event, projection, marker, or log.
- [ ] `verify:commerce7` + `verify:commerce7-idempotency` green; full suite + `npm run build` clean.
- [ ] Registers + system-map + api-strategy + AGENTS updated; go-live runbook (incl. the fee/payout gap) written.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | ROADMAP/VISION/api-strategy explicit. |
| Scope Boundaries | HIGH | v1/deferred lines sharpened; fee/payout + AR gaps flagged, not hidden. |
| Order model (projection + deltas) | HIGH | Council-driven correction; the biggest risk is now the diff engine, which is heavily tested. |
| Two-way inventory model | HIGH | Simplified to replica + additive-on-increase + read-only drift — race-free by construction. |
| Sales→accounting posting | MEDIUM | Delta-of-difference is sound; DR/CR direction + fee/payout tie-out + AR handling need an accountant. |
| DTC margin view (Unit 10b) | HIGH | Read-only aggregation over deltas already produced + the Phase-8 COGS seam; no new posting/GL surface; gross-of-fees caveat prevents overstatement. |
| Implementation Units | MEDIUM | Precise reuse blueprint; a few C7 endpoints unconfirmed until Unit 0 (isolated in the adapter). |
| Test Strategy | HIGH | Mirrors the proven Phase-15 harness; adds edit/refund/drift cases. |
| Risk Assessment | HIGH | Known unknowns enumerated + isolated. |

## Review Gates (status)

1. `/plan-eng-review` — DONE (folded): reuse-vs-rebuild boundary validated; structural wins applied
   (reuse enumerator; webhook-as-hint single ingest path; one SERIALIZABLE ingest tx; AppSettings for
   accounts; JE-of-delta shape). No blocking architecture issues remain.
2. `/council` (Codex gpt-5.4 + Gemini 3.1 Pro) — DONE (folded): 4 P0 + multiple P1/P2. All folded — see
   Revision Log + Key Decisions + the report below.
3. Security pass (council security lens, run in the same pass) — DONE (folded): install-nonce, separate
   webhook secret, app-secret blast radius, PII-at-rest paths, webhook DoS. See Security Hardening.
4. `/plan-design-review` — DONE (folded via analysis): connect/confirm card, per-(variant,location)
   mapping card, drift/held-unpaid/webhook-health dashboard rows; reuses proven Phase-15 components.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | skipped (phase already on ROADMAP; product frame in-plan) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (folded) | 5 structural wins folded (enumerator reuse, webhook-as-hint, single SERIALIZABLE ingest tx, AppSettings accounts, JE-of-delta) |
| Council (Codex + Gemini) | `/council` | Independent adversarial 2nd opinion | 1 | ISSUES FOLDED | 4 P0 (immutable-event→projection+deltas; install-hijack→nonce; inventory-reset race→replica model; implicit payment-state→Paid-only), 5 P1 (clearing/fees, period-matching, poll watermark, per-location, delta-not-gross post), 3 P2 (PII-at-rest, webhook auto-recreate, webhook DoS) — ALL folded |
| Security pass | `/council` (security lens) | PII + secrets + webhook authenticity (required — PII enters here) | 1 | ISSUES FOLDED | install-nonce, separate inbound webhook secret, app-secret blast radius/KMS, PII-at-rest redaction, webhook-flood bounding, uninstall lifecycle — folded into Security Hardening |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (folded via analysis) | connect+confirm card, per-(variant,location) mapping, drift/held-unpaid/webhook-health dashboard rows; reuses Phase-15 `AccountingConnectionCard`/`AccountMappingCard`/dashboard |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not run (eng review surfaced no DX gap) |

**CROSS-MODEL:** Codex and Gemini independently agreed on all 4 P0s (order-model, install-hijack,
inventory-reset race, payment-state) — strong consensus, high confidence in the corrections.

**UNRESOLVED (for the user / an accountant, not blocking `/work`):**
- Revenue JE DR/CR direction + the undeposited-funds-clearing tie-out + fee/payout reconciliation gap +
  unpaid-order A/R handling — v1 reads; **confirm with an accountant** before the DTC cash tie-out is relied on.
- Whether v1 should post COGS-on-sale or leave it to the Phase-8b variance seam (plan chose the latter;
  same-accounting-date matching mitigates the timing gap).

**VERDICT:** ENG + COUNCIL + SECURITY + DESIGN CLEARED (all findings folded) — ready for `/work`. Unit 0
(sandbox/app-partner) runs in parallel and gates only the final live verification, not the build.

**v3 NOTE:** The v3 strategy-review amendments (Unit 10b margin view, allocation deferral, sequencing
caveat) are additive and review-neutral — no architecture, security, or scope-boundary changes to the
cleared v2 — so the review verdicts above stand unchanged.
