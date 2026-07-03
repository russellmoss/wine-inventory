---
title: Phase 15 — Two-way QuickBooks Online Accounting Integration
type: feat
status: draft
date: 2026-07-02
branch: main
depth: deep
units: 15
revision: v2 (post-council)
---

## Revision Log

- **v2 (2026-07-02, post-/council):** Reworked the delivery model after Codex + Gemini review.
  Key changes: emission moved **inside** the ledger tx (transactional outbox, was emit-after-
  commit); added a mutable **`AccountingDelivery` state machine** + atomic row-claiming (was a
  two-column `postedAt`/`externalSystemId` stamp); reversals post to the **current open period**
  with **debit/credit swapped, positive amounts** (QBO prohibits negative JE lines); `runAsSystem`
  is **enumerate-only**; token refresh is **serialized per connection**; AP is a **new immutable
  `ApExportEvent`** (receipt→Bill), not driven off mutable `SupplyLot`; mapping UI uses
  **business-friendly account roles + a fallback hierarchy**; **multi-currency ≠ home currency is
  withheld** in v1. Full detail in `council-feedback.md`.

## Overview

Post the winery's already-computed cost/COGS, inventory-value moves, and supply AP into *their
own* QuickBooks Online books, then read back to reconcile — per-tenant OAuth, idempotent posting,
guided chart-of-accounts mapping. We do NOT rebuild the general ledger; QBO is the GL, we are the
operational + cost system of record that feeds it. This is the single strongest integration wedge:
InnoVint has **no** QuickBooks API at all, Vintrace's is one-way/gated — "genuinely bidirectional"
is the differentiator.

Phase 8b already shipped the export seam (`CostExportEvent` + `AccountMapping`,
`prisma/schema.prisma:2111-2158`; builders in `src/lib/cost/export.ts` + `export-emit.ts`). Phase
15 is a **durably-emit → claim → post → verify → reconcile** layer on that seam, not a COGS rebuild.

## Problem Frame

Wineries stitch InnoVint/Vintrace to QuickBooks by hand — "burdensome to manually convey wine
movements to the accountants" (competitive analysis, InnoVint). Vintrace's Xero sync is "only one
way… just data dumps," 1.0/5 on cost tracking. The job the winery hires this for: **their bottling
COGS, inventory adjustments, and supply bills land in QuickBooks automatically and correctly, and
stay reconciled when we amend.** Do nothing and accounting stays the manual seam every incumbent
leaves open.

**Product pressure-test / moat honesty (VISION rider):** two-way QBO is "real but fast-followable"
— a genuine head-start and the strongest proof of the ERP-consolidation thesis, but copyable. The
durable moat is correction-as-first-class-event (D2/D6) feeding **clean reversals** into their
books. So amendment→reversal round-tripping is a first-class exit criterion, not an afterthought.

## Requirements

- MUST: Per-tenant OAuth2 connection to *their* QBO company (realmId); tokens stored tenant-scoped
  + **encrypted at rest** (AEAD, AAD-bound), never in repo/client. No cross-tenant leakage on
  connect/disconnect/reconnect. (D16, D17, D19)
- MUST: **Durable emission** — `CostExportEvent` + a `PENDING` `AccountingDelivery` are written
  **inside the same tx** that mutates cost/ledger. No dual-write; a crash never silently drops a
  posting. (council C1)
- MUST: **Exactly-once posting under crashes + concurrency** — a delivery state machine + atomic
  row-claim + a query-before-post (QBO `DocNumber = postingKey`) so a re-sync/retry/double-sweep
  never double-posts. (council C2, C3)
- MUST: Bottling COGS posts as a balanced QBO `JournalEntry` (debit COGS / credit Inventory Asset)
  that reconciles.
- MUST: A supply *receipt* (purchase-on-credit) posts to Accounts Payable as a QBO `Bill`, sourced
  from a **new immutable `ApExportEvent`** (not mutable `SupplyLot`). (council C-AP)
- MUST: Inventory-value adjustments (post-freeze `CostVarianceEvent`: sold→COGS-variance,
  unsold→inventory-value) post as journals.
- MUST: A D6 correction / amended TTB filing posts as a **reversing** journal — **debit/credit
  swapped, positive amounts**, dated to the **current open period** (never rewrites a closed prior
  period); handle the QBO `Period Closed` fault. Reversal nets to zero. (D6, council C4)
- MUST: All background-worker DB writes set tenant via `SET LOCAL` inside the txn, proven through
  the pooled endpoint; `runAsSystem` **enumerates org IDs only**, never reads/writes tenant rows.
  (D17, council C5) Ledger writes route through `withWriteRetry` (D18/H2); QBO HTTP has its **own**
  retry with a `VERIFYING` path.
- MUST: Withhold posting when cost basis ≠ `KNOWN`, a component is unmapped, or currency ≠ the QBO
  home currency; persist `withheldReason` and surface it. (D14, council C7 + multi-currency)
- SHOULD: Reconcile read-back — confirm a posted entity landed, detect `DELETED_IN_GL`, pull AP
  `Bill` payment status back.
- SHOULD: Provider adapter interface shaped so Xero drops in behind it.
- NICE: Sync-status dashboard (connection health, queue by state, withheld reasons, NEEDS_REAUTH).

## Scope Boundaries

**In scope (v1 = QuickBooks Online):** per-tenant OAuth + encrypted token store + serialized
refresh; durable outbox emission; delivery state machine + claim/post/verify; COGS + inventory-
value journals; supply receipt → AP `Bill` (immutable `ApExportEvent`); reconcile read-back;
D6 correction → current-period reversing journal; guided CoA mapping UI (business roles + fallback
hierarchy) + minimal Vendor; adapter shaped for Xero.

**Out of scope (deferred, why):**
- **Xero adapter implementation** — interface shaped for it; QBO is the open gap, larger US base.
- **Full inbound GL mirroring** — v1 "two-way" = push + reconcile read-back + CoA/payment-status
  pull; we do not pull the whole GL/all payments to mutate our records.
- **Posting the excise-tax liability itself** (5000.24 `taxDollars`) — tax-class-aware *mapping*
  only; positing the accrual is a later boundary.
- **Multi-currency journals** — v1 withholds export when currency ≠ QBO home currency; ERP-side
  translation first. (council multi-currency)
- **WET / regional non-US taxes; payroll (11b); DTC/revenue (16).**
- **QBO inventory `Item` / quantity push** — Items auto-post their own average-cost COGS
  (double-count); no online `InventoryAdjustment` exists. Value effects go as journals; quantity
  stays in our app.
- **QBO batch endpoint** — deferred; v1 posts one JournalEntry/Bill per request (safer recovery
  until the delivery table + per-`bId` handling are proven). (council C3)

## Research Summary

### Codebase Patterns (attach points — file:line)
- **Export seam (reuse):** `CostExportEvent` `schema:2131-2158` (immutable, `@@unique([tenantId,
  postingKey])`, `reversalOfExportEventId`, `component`, `amount Decimal(18,8)`, `debitAccount`,
  `creditAccount`, `currency`, `basisCompleteness`, `sourceType SNAPSHOT|VARIANCE`, `runId`/`skuId`/
  `taxClass`; `postedAt`/`externalSystemId` become *legacy convenience stamps* — the state machine
  now lives in `AccountingDelivery`). `AccountMapping` `schema:2111-2124`. Pure builder
  `buildExportLines(src, map)` `export.ts:58` (withholds on basis≠KNOWN/unmapped, D14; reversal
  negates + `:rev` postingKey). `emitExportForSnapshot` `export-emit.ts:32` (idempotent), `getAccountMap`
  `export-emit.ts:16`, `getExportEvents` `export-emit.ts:82`. `makePostingKey` `cogs.ts:53` =
  `cogs:${runId}:${skuId}:${taxClass ?? "-"}`.
- **Seam gaps Phase 15 fills:** no `emitExportForVariance`; emission not wired to the write path
  (only `verify-cost.ts:291`); no persisted delivery state; no AP export event.
- **Tenant helpers:** `runInTenantTx` `tx.ts:17`, `runInTenantRawTx` `tx.ts:42` (raw claim SQL),
  `runLedgerWrite` `write.ts:38` (SERIALIZABLE + `withWriteRetry`), `runAsSystem` `system.ts:23`
  (owner/BYPASSRLS — **enumerate only**), `runAsTenant` `context.ts:30`. Extension auto-injects
  tenantId + `SET LOCAL` via bound param, pooling-safe (`prisma.ts:49-68`). Checklist `AGENTS.md:53-87`.
- **No encryption helper exists** (zero `createCipheriv/aes-256` matches). better-auth `Account`
  `schema:67-85` is plaintext/global/per-user — not reusable. Crypto hygiene precedent:
  `compliance-reminders/route.ts:12-20` (`timingSafeEqual`).
- **Cron/sweep to mirror:** `vercel.json:4-9` + `compliance-reminders/route.ts` (`runtime="nodejs"`,
  `maxDuration=300`, `CRON_SECRET` gate) + `reminder-sweep.ts:70` (`runAsSystem`→per-tenant
  `runAsTenant`, `BATCH=5`, idempotent PENDING→SENT with stale-retry).
- **Retry:** `withWriteRetry` `write-retry.ts:17` (P2034 only, full-jitter, cap 5) — DB only; QBO
  HTTP needs its own 429/5xx backoff + `VERIFYING`.
- **D6 → reversals (built at cost layer):** `correctOperationCore` `correct.ts:31` preserves
  `observedAt` (for the *TTB filing period*, not the GL posting date); `negateCostForReversedOp`
  `reverse.ts:13` writes negating CostLines + `CostVarianceEvent` (`variance-detect.ts:116`); these
  flow through `buildExportLines` as reversal export events.
- **Tax/forms:** `deriveTaxClass` `tax-class.ts:51`, `formScope` `form-type.ts:15`. `CostComponent`
  enum `schema:1031-1040` (MATERIAL, FRUIT, BARREL, LABOR, OVERHEAD, DOSAGE_LIQUEUR, PACKAGING,
  VARIANCE).
- **No Vendor/PO/AP model** — `SupplyLot` `schema:1857-1879` (`unitCost`, `qtyReceived`,
  `receivedAt`, free-text `lotCode`) is a *receipt*; Vendor + an immutable AP export event are net-new.
- **Cost policy/UI:** `AppSettings` `schema:1071-1098`; Settings `SettingsClient.tsx:152-210`
  ("Cost accounting" card — home for Connect + mapping UI).

### Prior Learnings
- rstack learnings + context-ledger MCP had **no committed decisions**; authoritative decisions
  live in VISION §11, ROADMAP, api-strategy, and the registers.
- Phase-8b cost-plan locals bind the shape we consume: append-only CostLine by component (D2);
  Decimal(18,8) internal / cents at snapshot, residual→VARIANCE (D9); post-bottling edits →
  immutable snapshot + explicit VARIANCE split sold/unsold, never silent recompute (D12);
  **export blocked when basis incomplete (D14)**; costing-method VERSION stamped, closed periods
  never re-valued (D17-local). Do not re-derive.

### External Research (QBO/Xero — current, incl. 2025 changes; full detail in v1 research)
- OAuth2 auth-code; realmId on callback → `/v3/company/{realmId}/`. Access **60 min**; refresh
  **100-day rolling, ROTATES** (persist newest or self-lock-out) + Nov-2025 ~5yr cap + expiry field.
- Idempotency: `?requestid=` short window (not durable); pair with our own map. Store
  `tenantId:postingKey` in `DocNumber`/`PrivateNote` and **query before post**. `SyncToken`
  read-before-write for updates.
- Objects: balanced `JournalEntry` (debits==credits, **positive amounts**, each line
  `AccountRef.value`=`Account.Id`, set `TxnDate`) for COGS/inventory-value; `Bill` (`VendorRef` +
  account-based lines + `DueDate`) for AP. **No online InventoryAdjustment; don't use inventory
  Items.** **Negative JE line amounts are rejected** — reverse by swapping debit/credit.
- **Closed period** → `Period Closed` validation fault; post reversals to the current open period.
- CoA: `SELECT * FROM Account` (paginate ≤1000, `Active=true`); key on `Account.Id`; filter by
  `AccountType`/`Classification`. Multi-currency companies require `CurrencyRef`/`ExchangeRate`.
- Rate: 500/min per realm, 10 concurrent; batch 30/120min (deferred). 429 → backoff. Pin `minorversion`.
- Sandbox free; production gated by app review (~20-day technical). Thin `fetch` client, **Node
  runtime** (need Node crypto). Xero adapter shape: `GET /connections`→`Xero-tenant-id`;
  `ManualJournal` (debit +, credit −, `AccountCode`); `Invoice Type:ACCPAY`; `Idempotency-Key`;
  CoA by `Account.Code`. Normalize behind `accountKey`/`idempotencyKey`/opaque `version`.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Provider first | **QuickBooks Online** | Larger US SMB base; the gap where InnoVint has no API. Xero behind the adapter. |
| Depth of "two-way" v1 | **Push + reconcile read-back** (confirm posted, pull CoA, pull AP payment status) | Honestly bidirectional + shippable; full GL mirroring deferred. Resolves ROADMAP's open question. |
| Emission timing | **Inside the ledger/cost tx (transactional outbox)** — was emit-after-commit | A dual-write drops postings on a crash between commit and emit. (council C1) |
| Delivery/idempotency | **Mutable `AccountingDelivery` state machine + atomic claim + query-before-post (`DocNumber=postingKey`)** — replaces the `postedAt`/`externalSystemId` stamp | Two columns can't distinguish "posted-but-uncstamped" from "never sent"; provider RequestId window is short. (council C2, C3, Gemini idempotency) |
| Concurrency | **Atomic row-claim (`FOR UPDATE SKIP LOCKED`/CAS to `IN_FLIGHT`); one JE/Bill per request, no batch v1** | Prevents double-sweep + unsafe partial-batch retry. (council C3) |
| COGS/inventory object | **`JournalEntry`** (balanced, positive amounts) | We compute COGS; QBO is the GL. Items double-count; no online InventoryAdjustment. |
| Reversal mechanics | **Swap debit/credit, positive amounts, post to current open period** | QBO rejects negative JE lines and closed-period posts; never rewrite filed prior periods. (council C4) |
| AP | **New immutable `ApExportEvent` (receipt = purchase-on-credit) → QBO `Bill`** + minimal `Vendor` | Exit criterion needs AP; an immutable event replays/reverses cleanly (not mutable `SupplyLot`). (council C-AP; your call) |
| Correction posting date | **Auto current open period, surfaced in dashboard; prompt only on `Period Closed` fault** | Zero-touch, keeps the sync flowing. (your call) |
| Mapping UX | **Business-friendly account roles (Inventory Asset / COGS-Expense), not raw Debit/Credit; fallback hierarchy `Component+Tax → Component → Default`** | Winemakers aren't CPAs (~90% mis-map otherwise); a new tax class must not freeze the sync. (Gemini; your call) |
| Default mapping row | **Sentinel `taxClass='*'`** (matches seam accountKey) or unique index on `coalesce(taxClass,'*')` | `NULL` taxClass isn't unique in Postgres. (council C7) |
| Background tenant context | **`runAsSystem` enumerates org IDs only; all tenant reads/writes via `runAsTenant`+`runInTenantTx`/`runInTenantRawTx`, `SET LOCAL` per txn, proven through pooler** | Reading tenant rows under owner bypass defeats RLS. (D17, council C5) |
| Token refresh | **Centralized `getValidAccessToken(connectionId)`, serialized per connection (lease/CAS token version); ambiguous refresh → stop + NEEDS_REAUTH** | Concurrent refresh can persist a stale rotated token and brick the connection. (council C6) |
| Token storage | **New tenant-scoped `AccountingConnection` (`@@unique([tenantId, provider])`) + new AEAD envelope helper (AAD-bound, keyring)** | `Account` is plaintext/global; no KMS in stack — env-key AEAD is the pragmatic D19-aligned choice. |
| Multi-currency | **Withhold export when `currency` ≠ QBO home currency (v1)** | QBO requires CurrencyRef/ExchangeRate; ERP-side translation first. (Gemini) |
| SDK | **Thin fetch adapter (Node runtime); optional `intuit-oauth` for token dance only** | Control of minorversion/requestid/backoff; one interface for QBO+Xero. |

## Security Hardening (folded from the security pass — v2.1)

Applies across Units 1/2/4/5/8. Full threat model in `docs/security/phase-15-security-pass.md`.

- **`state` nonce is server-stored + atomically single-use.** A signed blob alone is not enough
  (replayable). Persist a hashed nonce (new `OAuthState` table or a short-lived store) with
  `tenantId`, `userId`, `sessionId`, `provider`, `redirectUri`, PKCE verifier, `expiresAt`; consume
  with `DELETE … RETURNING` in one txn **before** code exchange; **re-check the current user is
  still an admin of that tenant at consume time**. (SEC-C1)
- **Do not trust the callback `realmId`.** Treat it as a hint; after code exchange derive the
  canonical company ID from a trusted Intuit endpoint and persist *that*. Guard that one active
  `externalRealmId` cannot attach to two tenants (no explicit transfer flow in v1). (SEC-C2)
- **Least-privilege enumerator role for cron — NOT the BYPASSRLS owner.** `runAsSystem` (owner) is
  for migrations only. Add a dedicated enumerator role with read access to the org-ID source and
  **no grant on `AccountingConnection`/token tables**, so a system path *cannot* read secrets even
  by mistake. (SEC-C3 — strengthens council C5)
- **PKCE + hardcoded redirect allowlist.** Generate a PKCE verifier/challenge per connect; send the
  same fixed `redirect_uri` on exchange. Never derive `redirect_uri` from `Host`/`X-Forwarded-Host`;
  use an exact per-environment allowlist; no arbitrary post-auth redirects. (SEC-S1/S2)
- **Locked egress + telemetry redaction.** Hardcode HTTPS Intuit token/revoke origins, disable HTTP
  redirect-following. Globally redact `code`/`access_token`/`refresh_token`/`Authorization` from
  logs; disable Prisma query-param logging on these paths; add a **Sentry `beforeSend` scrubber**
  (Sentry is live in prod) that drops OAuth payloads. (SEC-S3/S4)
- **Disconnect zeroizes first, then revokes.** In one tenant txn: clear ciphertext columns, set
  `DISCONNECTED`, bump `tokenVersion`; commit; then best-effort remote revoke. DB CHECK: non-
  `CONNECTED` rows hold no tokens. (SEC-S5)
- **Authz on every mutating route; address rows by `[tenantId, id]`.** Derive tenant from the server
  session only; check role inside the tenant txn; never trust a request-supplied `tenantId`/global
  `connectionId`. CRON routes: `POST`, `CRON_SECRET` via `timingSafeEqual`, **ignore any caller-
  supplied tenant** and enumerate internally. (SEC-S6/S7)
- **Persist only the refresh token; access token cached in memory / short-lived, not a DB column.**
  Reduces the immediately-usable-secret set on a DB compromise. (SEC-N2)
- **Refresh is row-locked (advisory/`FOR UPDATE`) + CAS; NEEDS_REAUTH only after a locked re-read**
  confirms no newer token was written (avoids false NEEDS_REAUTH from a lost refresh race). (SEC-N4)
- **AAD binds `table|provider|environment|tenantId|connectionId|fieldName|kid`.** (SEC-N1)
- **Encryption-key blast radius — RESOLVED (provisional, revisit before prod GA).** **Per-record
  data key (DEK) wrapped by one key-encryption-key (KEK) in env** — each token row has its own random
  DEK; only the KEK is shared. Smaller blast radius than a single shared key, no external-KMS lift
  now, and the KEK can be upgraded to a cloud KMS later **without re-encrypting rows** (just re-wrap
  DEKs). Env keys split sandbox vs prod. (SEC-C4 — decided by planner while operator away; open to
  revision.)

## Design & UX Specification (v2.2 — from design review)

Calibrated to DESIGN.md (warm editorial, token-driven, App-UI rules, light-only, sentence-case)
and ux-principles.md. All UI reuses `src/components/ui/` (Card, Badge, Button, ConfirmButton, Input,
Checkbox) and the existing `SettingsClient.tsx` card pattern — no new visual language. Never hardcode
color/font/spacing; reference tokens.

**Information architecture (decided):**
- A single **"QuickBooks / Accounting" section in Settings** holds **Connect** (Unit 4) + **account
  mapping** (Unit 6), sitting beside the existing "Cost accounting" card.
- The **sync-status dashboard** (Unit 12) is its **own left-nav item** (recurring operational surface).

**Domain language (ux-principle #5) — the UI NEVER shows internal names.** Say "posted to QuickBooks",
"waiting to sync", "couldn't post — account not mapped", "reversed in QuickBooks". Never `JournalEntry`,
`CostExportEvent`, `externalSystemId`, `realmId`, `debit/credit` (mapping uses account *roles*).

**Delivery status → Badge tone (DESIGN.md semantics; word ALWAYS shown, never color alone):**
| Status | Badge tone | UI label |
|---|---|---|
| POSTED | green (positive) | "Posted to QuickBooks" |
| PENDING / IN_FLIGHT / VERIFYING | blue (info) | "Waiting to sync" / "Sending…" |
| WITHHELD | gold (warning) | "Needs attention — <reason>" |
| FAILED | red (danger) | "Couldn't post — <reason>" |
| DELETED_IN_GL | neutral | "Deleted in QuickBooks" + "Re-push" action |

**Interaction states (Pass 2 — the biggest gap, now specified):**
| Surface | Loading | Empty | Error | Success/Withheld |
|---|---|---|---|---|
| Connect card | skeleton on status check | "Not connected — Connect QuickBooks to sync your books" + wine primary **Connect** button | `NEEDS_REAUTH` banner + **Reconnect** CTA (ux-principle #2, no dead-end) | "Connected to <Company> · last synced <time>" + **Disconnect** (ConfirmButton, ux-principle #6) |
| Account-mapping | skeleton while loading CoA | "Connect QuickBooks first" (gated) OR "N components need an account" with inline pickers | CoA fetch failed → retry affordance | per-row "Mapped ✓" / "Using default" chip; save toast |
| Sync dashboard | skeleton table | "Nothing to sync yet — finalize a bottling to see it here" (warm, not "No items found") | connection error banner + reconnect | counts per status; WITHHELD/FAILED rows link to the fix |

**No dead-ends (ux-principle #2):** after Connect → land on the mapping step (not a bare "connected");
every WITHHELD/FAILED row links **directly to its fix** ("map this account" → the mapping row;
"complete cost basis" → the bottling). After Disconnect → clear "reconnect anytime" state.

**Active surfacing of withheld/failed (decided):** the sync dashboard shows a **"N items need
attention"** count, AND a small badge appears **near the bottling / cost views** where the work
originates, each linking to the exact fix. Operator finds out proactively, not when the accountant asks.

**Accessibility:** mapping dropdowns are keyboard-navigable with associated `<label>`s; controls meet
44px min target; status conveyed by **text + badge, never color alone**; focus-visible uses the
DESIGN.md wine focus ring. Light-only per DESIGN.md (no dark mode).

**AI-slop check:** N/A-to-low — this is calm App-UI reusing existing components; no hero/card-grid/
marketing patterns. Guard: the dashboard must not become a decorative widget mosaic — it's a status
table + a connection card, nothing more (subtraction default).

## Implementation Units

> Ordering principle (council): prove the **durable emit + claim/queue semantics** and a
> crash-recovery gate **before** any QBO posting logic. Unit 0 (app-review) runs in parallel.
> Security items (SEC-*) above are folded into the units they touch.
> UI units (4, 6, 12) follow the **Design & UX Specification** section above.

### Unit 0: Intuit production app-review milestone (non-code, start now)
**Goal:** De-risk the ~20-day technical review / weeks-to-months listing lead time.
**Files:** `docs/plans/phase-15-app-review-checklist.md`; `.env.example` (`QBO_CLIENT_ID`,
`QBO_CLIENT_SECRET`, `QBO_ENVIRONMENT`, `QBO_REDIRECT_URI`, `APP_ENCRYPTION_KEY`).
**Approach:** Create Intuit Developer account + sandbox QBO company; register app; capture
Development keys; draft the security questionnaire (maps to Units 1/2/4/5).
**Verification:** sandbox reachable; keys in local `.env`; checklist created. **Depends on:** none.

### Unit 1: AEAD envelope-encryption helper (AAD-bound, keyring)
**Goal:** AES-256-GCM encrypt/decrypt for tenant OAuth tokens, D19-aligned (crypto-shred = drop key).
**Files:** `src/lib/crypto/envelope.ts`; `test/crypto-envelope.test.ts`.
**Approach:** `createCipheriv('aes-256-gcm')`, random IV per record, require a **32-byte** key from
a **keyring**, serialize `kid:iv:ciphertext:tag`, bind **AAD =
`table|provider|environment|tenantId|connectionId|fieldName|kid`** (SEC-N1) so ciphertext can't be
transplanted across rows/tenants/fields/envs. Old `kid`s stay decryptable (rotation); sandbox and
prod keys are always split. **Key backing (SEC-C4, decided):** **per-record DEK wrapped by an
env KEK** (`APP_ENCRYPTION_KEK` + version) — random 32-byte DEK per token row encrypts the token;
the DEK is stored wrapped alongside the ciphertext; only the KEK lives in env. KEK upgradable to a
cloud KMS later without re-encrypting rows (re-wrap DEKs only). Sandbox/prod KEKs split. Never log
secrets.
**Tests:** round-trip; tampered ct/tag/AAD fails auth; wrong key fails; AAD mismatch (swapped
tenant/field) fails; IV uniqueness; keyring picks correct kid on decrypt.
**Execution note:** test-first. **Depends on:** none. **Verification:** test green.

### Unit 2: Schema — connection, delivery state machine, AP export event, mappings
**Goal:** All new tenant-scoped tables (Phase-12 checklist), plus the delivery state machine.
**Files:** `prisma/schema.prisma`; migrations (`_accounting_enums`, `_accounting_schema`,
`_accounting_rls`); `src/lib/tenant/models.ts` (NOT in GLOBAL_MODELS); `scripts/verify-tenant-
isolation.ts` + `test/tenant-isolation.test.ts` (new cases).
**Approach — new models, all via the 9-step checklist (tenantId, composite FK→`organization`
ON DELETE RESTRICT, per-tenant unique, RLS ENABLE+FORCE + `tenant_isolation` USING **and** WITH
CHECK, app_rls DML grant):**
- `enum AccountingProvider {QBO, XERO}`; `enum ConnectionStatus {CONNECTED, DISCONNECTED,
  NEEDS_REAUTH}`; `enum DeliveryStatus {PENDING, IN_FLIGHT, VERIFYING, POSTED, FAILED,
  WITHHELD, DELETED_IN_GL}`.
- `AccountingConnection` — `@@unique([tenantId, provider])` (one company per tenant/provider);
  `externalRealmId` (canonical, derived from Intuit — SEC-C2; **globally guarded so one realmId
  can't attach to two tenants**), encrypted `refreshTokenCt` + its wrapped
  per-record `dekWrapped` (SEC-C4) **only** (access token is cached in memory/short-lived, NOT a DB
  column — SEC-N2), `refreshTokenExpiresAt` (Nov-2025 field), `scope`,
  `environment`, `status`, **`tokenVersion Int`** (CAS for refresh), `homeCurrency`. Token/realmId
  columns non-null only when `status=CONNECTED` (**DB CHECK: non-CONNECTED rows hold no tokens** —
  SEC-S5).
- `OAuthState` — short-lived server-side single-use nonce store (SEC-C1): hashed `nonce`, `tenantId`,
  `userId`, `sessionId`, `provider`, `redirectUri`, `pkceVerifier`, `expiresAt`.
- **Migration also adds a least-privilege cron *enumerator* role** with read on the org-ID source and
  **no grant on `AccountingConnection`/`OAuthState`/token tables** (SEC-C3); the BYPASSRLS owner is
  migrations-only.
- `AccountingDelivery` — the mutable state machine (immutable seam stays immutable). FK to the
  source export event (composite `(tenantId, exportEventId)`), `connectionId`, `status`,
  `attemptCount`, `requestId`, `externalId`, `externalObjectType`, `postingDate`, `withheldReason`,
  `lastError`, `claimedAt`, `leaseExpiresAt`, `verifiedAt`. `@@unique([tenantId, exportEventId])`.
  **Partial index** `WHERE status IN ('PENDING','VERIFYING','FAILED')`.
- `ApExportEvent` — immutable AP seam mirroring `CostExportEvent`: `postingKey` (`ap:${supplyLotId}`),
  `vendorId?`, `amount`, `debitAccount`, `creditAccount`, `currency`, `receivedAt`, `dueDate?`,
  `reversalOfApExportEventId?`, `basisCompleteness`. `@@unique([tenantId, postingKey])`.
- `Vendor` — tenant-scoped: `name`, `terms?`, `externalVendorId?` (QBO Vendor.Id cache). PII stays
  here (mutable), never in ledger events (D19).
- `AccountMapping` — add the **role model**: store `debitAccount`/`creditAccount` derived from
  business roles; enforce single default via sentinel `taxClass='*'`.
**Tests:** each table isolates tenant A from B **through the pooled endpoint** (D17); default-row
uniqueness holds; delivery unique per export event.
**Depends on:** none. **Verification:** `npm run verify:tenant-isolation` green with new cases.

### Unit 3: Provider adapter interface + thin QBO client
**Goal:** One `AccountingAdapter` (Xero-ready) + a QBO implementation: OAuth + authenticated calls
with its own retry/`VERIFYING`, no batch.
**Files:** `src/lib/accounting/adapter.ts` (interface + normalized types); `src/lib/accounting/qbo/
client.ts` (fetch: `minorversion`, `requestid`, `Fault` parse incl. `Period Closed`, 429/5xx
backoff, **query-before-post** by `DocNumber`); `src/lib/accounting/qbo/oauth.ts` (authorize/
exchange/refresh/revoke); tests with mocked fetch.
**Approach:** Normalize `accountKey`=`Account.Id`, `idempotencyKey`=RequestId, opaque `version`=
SyncToken. **Reversal = swap debit/credit, positive `Amount`.** Node runtime. Do NOT reuse
`withWriteRetry` (P2034-only) for HTTP — separate remote retry with a `VERIFYING` outcome on
ambiguous timeout.
**Tests:** authorize-URL build; code→token parse; refresh returns rotated token; 429 backoff then
succeed; `Fault`/`Period Closed` typed; reversal maps to swapped debit/credit positive amount;
query-before-post finds an existing `DocNumber` and returns its Id.
**Depends on:** none. **Verification:** adapter unit tests green (no network).

### Unit 4: OAuth connect / callback / disconnect + Settings "Connect QuickBooks"
**Goal:** Tenant admin authorizes our app against their QBO company; encrypted, tenant-scoped tokens;
disconnect revokes; reconnect re-links by realmId.
**Files:** `src/app/api/accounting/qbo/{connect,callback,disconnect}/route.ts` (Node);
`src/lib/accounting/connection.ts`; `SettingsClient.tsx` (Connect/Status/Disconnect + home-currency
capture).
**Approach:** **Server-stored, atomically single-use `state` nonce** (`OAuthState`, consumed with
`DELETE … RETURNING` before code exchange) + **PKCE**; **re-check the caller is still an admin of
that tenant at consume time** (SEC-C1). `redirect_uri` from a hardcoded per-env allowlist, never
`Host`/`X-Forwarded-Host`; no arbitrary post-auth redirect (SEC-S1/S2). After exchange, **derive the
canonical `realmId` from Intuit**, not the callback param (SEC-C2). Token/revoke egress locked to
exact Intuit HTTPS origins, redirect-following disabled (SEC-S3). Store via `runInTenantTx` on
`(tenantId, QBO)`; reconnect updates the same row. **Disconnect zeroizes ciphertext + bumps
`tokenVersion` + sets DISCONNECTED in one txn, then best-effort revoke** (SEC-S5). Capture
`homeCurrency`. Admin-gated on every route, rows addressed by `[tenantId, id]` (SEC-S6). Redact
OAuth payloads from logs + Sentry `beforeSend` (SEC-S4). Tokens encrypted (Unit 1).
**Tests:** replayed/forged/expired `state` rejected; non-admin or other-tenant admin cannot
connect/disconnect; callback `realmId` tampering ignored (canonical wins); one realmId can't bind two
tenants; refresh token stored as ciphertext, access token never in DB; disconnect leaves no tokens
(DB CHECK); no OAuth payload reaches logs/Sentry; tenant B cannot complete tenant A's `state`.
**Depends on:** 1, 2, 3. **Verification:** e2e connect against sandbox stores an encrypted,
tenant-scoped token.

### Unit 5: Token access + serialized refresh (`getValidAccessToken` + cron)
**Goal:** Never lose a rotated refresh token; never brick a connection; flag near-expiry.
**Files:** `src/lib/accounting/token.ts` (`getValidAccessToken(connectionId)`); `src/app/api/cron/
accounting-token-refresh/route.ts` (`CRON_SECRET`); `src/lib/accounting/refresh-sweep.ts`;
`vercel.json`.
**Approach:** All token use goes through `getValidAccessToken`, which **serializes refresh per
connection** via a **row lock (advisory/`FOR UPDATE`) + `tokenVersion` CAS** inside `runInTenantTx`;
always persist the newest refresh token; access token cached in memory/short-lived (not persisted —
SEC-N2); store the Nov-2025 expiry. Mark `NEEDS_REAUTH` **only after a locked re-read confirms no
newer token was written** (avoids a false NEEDS_REAUTH from a lost race — SEC-N4); `invalid_grant`
→ NEEDS_REAUTH + stop posting. Cron (`POST`, `CRON_SECRET` via `timingSafeEqual`, ignores any
caller-supplied tenant — SEC-S7) uses the **least-privilege enumerator role** to list org IDs (never
the BYPASSRLS owner, which cannot read the token table — SEC-C3), then per-tenant `runAsTenant`.
**Tests:** rotated token persisted (old discarded); concurrent refresh — only one CAS wins, no stale
overwrite; `invalid_grant`→NEEDS_REAUTH; near-expiry flagged; sweep sets `SET LOCAL` per write
(pooled); no tenant-row read under `runAsSystem`.
**Depends on:** 2, 3. **Verification:** `verify:accounting-refresh` drives a sweep against sandbox.

### Unit 6: CoA read + guided mapping UI (business roles + fallback hierarchy)
**Goal:** Pull the tenant's CoA; let them map component/tax-class to their accounts in plain terms.
**Files:** `src/lib/accounting/coa.ts` (`listAccounts` + AccountType suggestions); `saveAccountMapping`
(via `runInTenantTx`); `src/app/(app)/settings/AccountMappingCard.tsx`.
**Approach:** UI asks for **"Inventory Asset account"** and **"COGS/Expense account"** (never
Debit/Credit); backend derives debit/credit per operation and persists to `AccountMapping`. Filter
suggestions by `AccountType` (COGS→Cost of Goods Sold, inventory→Other Current Asset/Inventory,
AP→Accounts Payable, VARIANCE→shrinkage/expense). **Fallback hierarchy** `Component+Tax → Component →
Default(*)` at resolve time (extend `resolveAccounts` `export.ts:22`), with a "using default"
indicator. Show `FullyQualifiedName`/`AcctNum`. Surface D14 unmapped + non-home-currency withhold
warnings.
**Tests:** save/read round-trip; role→debit/credit derivation correct; fallback resolves
Tax→Component→Default; unmapped flagged; non-home-currency withheld; tenant isolation on writes.
**Depends on:** 3, 4. **Verification:** map all components against sandbox CoA; resolution honors fallback.

### Unit 7: Transactional outbox — emit inside the write tx + variance emitter
**Goal:** Every finalized bottling / variance writes `CostExportEvent` **+** a `PENDING`
`AccountingDelivery` **inside the same tx** (no dual-write); add the variance emitter.
**Files:** `src/lib/cost/export-emit.ts` (make `emitExportForSnapshot` write the delivery row too;
add `emitExportForVariance(varianceEventId, tx)` mapping `soldDelta`→COGS-variance,
`unsoldDelta`→inventory-value); call sites in `src/lib/bottling/run.ts` (~L148-155) and the variance
path (`reverse.ts`/`variance-detect.ts`), all **within** `runLedgerWrite`/the cost tx;
`test/cost-export-*.test.ts`.
**Approach:** Emission is idempotent (`@@unique([tenantId, postingKey])`; variance key
`var:${varianceEventId}:{sold|unsold}`). Persist `withheldReason` when `buildExportLines` returns
`postable:false` (delivery `status=WITHHELD`). Reversal export events carry the `:rev` postingKey.
**Tests:** finalize inside tx emits event **+** PENDING delivery atomically (rollback drops both);
variance emits two mapped lines that net correctly; re-run emits nothing new; withheld → WITHHELD
with reason. Crash-recovery gate: a rolled-back tx leaves neither row.
**Depends on:** 2. **Verification:** `verify:cost` green + new emission/atomicity assertions.

### Unit 8: Outbound COGS/inventory poster (claim → post → verify)
**Goal:** Post `PENDING` deliveries to QBO as balanced journals, exactly-once, crash-safe.
**Files:** `src/app/api/cron/accounting-post/route.ts` (`CRON_SECRET`); `src/lib/accounting/
post-sweep.ts`; `src/lib/accounting/qbo/journal.ts`.
**Approach:** the **least-privilege enumerator role** lists connected org IDs (never the BYPASSRLS
owner, which has no grant on the token/delivery tables — SEC-C3); cron route is `POST` + `CRON_SECRET`
and ignores any caller-supplied tenant (SEC-S7). Per tenant `runAsTenant`: (1) in a
short `runInTenantRawTx`, **atomically claim a BOUNDED batch** (≤`POST_BATCH_PER_TENANT`, default 50)
of PENDING rows → `IN_FLIGHT` with a lease (`FOR UPDATE SKIP LOCKED`), commit; (2) **outside** the
txn, for each: build a balanced JE (assert debits==credits, positive amounts), set
`DocNumber=postingKey` + deterministic `RequestId`, and **query-before-post** (if a JE with that
`DocNumber` exists, adopt its Id); (3) finalize each row individually in `runInTenantTx` → `POSTED` +
`externalId` (or `FAILED`/`VERIFYING` with `lastError`, `attemptCount++`). Never post `WITHHELD`.
**Bounded-work + drain-over-ticks (A1):** each run posts at most the claimed batch and leaves the
rest `PENDING` for the next scheduled tick — never tries to drain an unbounded backlog in one
invocation (Vercel ~300s cap + QBO 500/min). Expired leases return to PENDING (self-healing).
Schedule frequently enough to drain; surface backlog depth on the dashboard (Unit 12).
**ONE poster, ONE state machine (A2):** this sweep runs over the UNION of pending `AccountingDelivery`
rows (COGS + AP), typed by `objectType` (JournalEntry vs Bill) — not a second parallel poster. The
AP `Bill` builder (Unit 10) plugs in as another `objectType`, reusing the identical claim/verify/
idempotency path.
**Tests:** PENDING posts once → POSTED; re-run skips POSTED (no double-post); crash between
QBO-accept and finalize → next run VERIFYING → query finds `DocNumber` → adopts, no duplicate;
concurrent sweeps — only one claims a row (SKIP LOCKED); unbalanced refused; tenant A never touches B.
**Depends on:** 3, 4, 6, 7. **Verification:** a sandbox bottling's COGS is one balanced JE; a
simulated crash-then-resync posts nothing new.

### Unit 9: Reconcile read-back (confirm; DELETED_IN_GL; AP payment status)
**Goal:** The honest two-way leg — confirm posted, detect accountant deletions, pull AP payment status.
**Files:** `src/lib/accounting/reconcile.ts`; wired into `post-sweep` or a sibling cron.
**Approach:** Read each `POSTED` delivery back by `externalId`; if gone → `DELETED_IN_GL` (never
silently re-post; expose a "re-push to GL" action). Pull `Bill` payment status → reflect on the
supply record. Heavy reads off the write path.
**Tests:** posted matches; deleted-in-QBO → DELETED_IN_GL (no re-post); bill marked paid when QBO
shows a BillPayment. **Depends on:** 8 (+10 for AP). **Verification:** reconcile reflects sandbox state.

### Unit 10: Minimal Vendor + supply receipt → AP `Bill` (immutable `ApExportEvent`)
**Goal:** A supply receipt (purchase-on-credit) flows to Accounts Payable.
**Files:** `src/lib/accounting/ap-emit.ts` (emit `ApExportEvent` inside the supply-receipt tx);
`src/lib/accounting/qbo/bill.ts` (build `Bill`); poster path reusing the Unit 8 claim/verify machinery
(deliveries can source from `ApExportEvent` too); minimal Vendor CRUD (Settings/Suppliers).
**Approach:** On a supply receipt, emit an immutable `ApExportEvent` (`ap:${supplyLotId}`, debit
Inventory Asset / credit AP, `DueDate` from terms) + a PENDING delivery — same durable/idempotent
path as COGS. Find-or-create the QBO `Vendor` (cache `externalVendorId`) before the Bill. **PII in
`Vendor` (mutable), never in ledger events (D19).**
**Tests:** receipt → Bill once (idempotent via `DocNumber`); vendor find-or-create no dupes; tenant
isolation on `Vendor`/`ApExportEvent`; no PII in any ledger event.
**Depends on:** 2, 3, 6, 8. **Verification:** a sandbox supply receipt is an A/P Bill under the mapped vendor.

### Unit 11: Correction / amendment → current-period reversing journal (D6)
**Goal:** A D6 correction posts a reversing entry that nets to zero — the moat behavior.
**Files:** ensure reversal `CostExportEvent`s emit (Unit 7); `journal.ts` builds the reversing JE
(**swap debit/credit, positive amounts**, `postingDate`=current open period);
`scripts/verify-accounting-reversal.ts`.
**Approach:** No edit/void in QBO — post the reversal as a new JE dated to the **current open
period** (not the corrected op's `observedAt`, which drives the *TTB filing* period only). On a
`Period Closed` fault, surface a prompt to pick an open date. Idempotent via `:rev` postingKey +
`DocNumber`. Confirm original+reversal net zero on read-back.
**Tests:** correct a bottling → reversal JE with swapped debit/credit, positive amounts, current-
period date; original+reversal net zero; closed-period fault → prompt path; re-sync posts neither twice.
**Depends on:** 7, 8, 9. **Verification:** `verify:accounting-reversal` proves net-zero round-trip.

### Unit 12: Sync-status dashboard
**Goal:** Operator visibility: connection health, queue by delivery state, withheld reasons,
DELETED_IN_GL, NEEDS_REAUTH prompts, last sync/errors.
**Files:** `src/app/(app)/accounting/` (its **own left-nav item**, per the IA decision) + a small
withheld/failed **count-badge surfaced near the bottling/cost views** (active surfacing); read-only
over `AccountingConnection` + `AccountingDelivery` grouped by `status`.
**Approach:** Per the Design & UX Spec — status table using DESIGN.md Badge tones (word always shown,
never color alone), domain-language labels, each WITHHELD/FAILED row **links to its fix** (no
dead-end); "N items need attention" count on the dashboard AND near bottling/cost; DELETED_IN_GL with
re-push; warm empty state; connection card + reconnect CTA. Reuses `src/components/ui/`.
**Tests:** withheld surfaced with reason + fix link; NEEDS_REAUTH → reconnect CTA; count badge appears
near bottling when items need attention; counts match DB.
**Depends on:** 4, 8. **Verification:** dashboard reflects sandbox state.

### Unit 13: Crash-recovery + idempotency verification harness
**Goal:** Prove exactly-once under the failure modes council flagged (this is its own unit per the
"prove durability first" ordering).
**Files:** `scripts/verify-accounting-idempotency.ts`.
**Approach:** Drive: emit → claim → simulate a crash **between QBO-accept and finalize** → resume →
assert no duplicate (VERIFYING→query→adopt); double-sweep concurrently → assert single claim;
rolled-back emit leaves no rows; **backlog > one batch (A1): seed > `POST_BATCH_PER_TENANT` PENDING
rows, run two ticks, assert all drain and none double-post.** All in Demo Winery.
**Depends on:** 7, 8. **Verification:** `verify:accounting-idempotency` green.

### Unit 14: End-to-end verify + docs/register updates
**Goal:** One command proves the exit criteria; docs stay honest.
**Files:** `scripts/verify-accounting.ts` (`verify:accounting`); update `security-register.md`
(token store + `runAsSystem`-enumerate-only + refresh-serialization tripwires), `scale-register.md`
(poller partial-index + rate-limit tripwire), `system-map.md`, `api-strategy.md` (mark H7 Tier-1 QBO
shipped), ROADMAP Phase 15 status.
**Approach:** Sandbox e2e: connect → map → bottle → emit → claim → post → reconcile → correct →
current-period reversal → supply receipt → Bill; assert idempotency (double-sweep) + tenant
isolation (Demo Winery only, never Bhutan Wine Co.).
**Depends on:** 1-13. **Verification:** `npm run verify:accounting` green.

## Test Strategy

**Unit:** crypto AEAD round-trip/tamper/AAD-mismatch (U1); adapter OAuth/backoff/reversal-swap/
query-before-post (U3); emission atomicity + variance (U7); mapping role-derivation + fallback (U6).
**Tenant-isolation:** `AccountingConnection`/`AccountingDelivery`/`ApExportEvent`/`Vendor` isolate
**through the pooled endpoint** (D17); no tenant-row access under `runAsSystem`.
**Crash-recovery/idempotency (U13):** kill between QBO-accept and finalize → no duplicate;
double-sweep → single claim; rolled-back emit → no rows.
**End-to-end (sandbox, U14):** `npm run verify:accounting`, all in Demo Winery.
**Manual:** in a QBO sandbox — balanced JE, A/P Bill, a correction produces a current-period
reversing entry netting to zero, disconnect/reconnect with no leakage.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Dropped posting on crash (dual-write) | MED | HIGH | Transactional outbox — emit event+delivery inside the tx (U7). |
| Double-post on re-sync/retry/double-sweep | MED | HIGH | Delivery state machine + atomic claim + query-before-post on `DocNumber` (U2, U8, U13). |
| Reversal hits a closed period / negative-amount reject | MED | HIGH | Current-period `postingDate` + debit/credit swap + `Period Closed` handling (U3, U11). |
| Lost rotated refresh token / bricked connection | MED | HIGH | `getValidAccessToken` serialized per-connection via CAS; NEEDS_REAUTH on ambiguity (U5). |
| Cross-tenant leak (tokens/rows) | LOW | CRITICAL | Full Phase-12 checklist + RLS FORCE + WITH CHECK; **least-privilege enumerator role with no grant on token tables**; AAD-bound crypto; server-stored single-use PKCE `state` (SEC-C1/C2/C3). |
| Encryption-key compromise decrypts all tenants' tokens | LOW | CRITICAL | Target KMS-backed envelope (per-record DEK); env-split keys; interim env-key sandbox/dev-only (SEC-C4 — open decision). |
| OAuth state replay / victim-company binding | MED | HIGH | Server-stored atomic single-use nonce + PKCE + admin recheck at consume; canonical realmId from Intuit (SEC-C1/C2). |
| Token exfil via logs/Sentry | MED | HIGH | Redact code/tokens/Authorization; disable query-param logging; Sentry `beforeSend` scrubber (SEC-S4). |
| Pooler GUC leak in a background worker (D17) | MED | CRITICAL | Every write via `SET LOCAL` inside the txn; verify through the pooled endpoint (U2, U8). |
| Mapping misconfiguration by non-accountants | MED | MED | Business-role UI (not Debit/Credit) + fallback hierarchy + withhold warnings (U6). |
| Multi-currency JE rejection | MED | MED | Withhold export when currency ≠ home currency in v1 (U6, U7). |
| Poller table-scan at scale | MED | MED | Partial index on delivery `status` (U2). |
| Poster backlog exceeds cron time window → stalled queue (A1) | MED | MED | Bounded batch per tenant per run + drain over ticks + expired-lease self-heal + backlog depth on dashboard (U8, U12); backlog-drain test (U13). |
| Production app-review lead time delays GA | HIGH | MED | Unit 0 in parallel; all dev on sandbox. |

## Success Criteria

- [ ] A Demo Winery bottling's COGS posts to a QBO **sandbox** company as a balanced JournalEntry
      and reconciles (delivery → POSTED with `externalId`).
- [ ] A supply receipt flows to Accounts Payable as a QBO `Bill` under a mapped Vendor, via an
      immutable `ApExportEvent`.
- [ ] An inventory-value adjustment (`CostVarianceEvent` sold/unsold) posts as journals.
- [ ] **Exactly-once:** a re-sync posts nothing new; a simulated crash between QBO-accept and
      finalize recovers via VERIFYING with no duplicate; concurrent sweeps single-claim each row.
- [ ] A D6 correction posts a reversing entry (swapped debit/credit, positive amounts, current
      open period) that nets to zero; a `Period Closed` fault prompts for a date instead of failing.
- [ ] Connect / disconnect / reconnect with no cross-tenant leakage (proven through the pooler);
      concurrent token refresh never persists a stale token.
- [ ] Tokens encrypted at rest (AAD-bound); no token/secret in repo, client, or logs.
- [ ] Mapping UI uses business roles; a new tax class resolves via the fallback hierarchy (no sync
      freeze); unmapped/incomplete-basis/non-home-currency rows are WITHHELD and surfaced.
- [ ] `npm run verify:accounting` + `verify:accounting-idempotency` + `verify:tenant-isolation` green.
- [ ] Adapter interface is provider-neutral (Xero-shaped); no QBO specifics leak.
- [ ] Registers + system-map + api-strategy (H7 Tier-1) + ROADMAP Phase 15 updated.
- [ ] All tests pass; no regressions.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Competitive gap + exit criteria explicit and sourced. |
| Scope Boundaries | HIGH | Open ROADMAP questions resolved; council forks decided. |
| Implementation Units | HIGH | Seam confirmed at file:line; delivery model reworked per council; net-new work bounded. |
| Delivery/idempotency model | HIGH | Was the weakest part (v1); now a claim→post→verify state machine with a dedicated crash-recovery unit. |
| Test Strategy | HIGH | Reuses verify:*/tenant-isolation; adds crash-recovery + idempotency harness. |
| Risk Assessment | HIGH | Each council-flagged failure mode has a concrete mitigation + a test. |

## Review Gates

1. **/council — DONE (v2).** Codex + Gemini; findings folded in; raw in `council-feedback.md`.
2. **Security pass — DONE (v2.1).** Adversarial threat-model of the token store + OAuth flow;
   findings folded into the Security Hardening block + Units 1/2/4/5/8; full report in
   `docs/security/phase-15-security-pass.md`. **One open decision remains: SEC-C4 encryption-key
   backing (KMS-backed vs interim env-key).**

Honors: D2, D7, D16, D17, D19, D20 (H7), D18/H2, D14.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | (skipped — scope/strategy set in ROADMAP/VISION) |
| Council (Codex+Gemini) | `/council` | Independent 2nd opinion | 1 | ISSUES FOLDED | 7 critical → all folded (`council-feedback.md`) |
| Security pass | `/council` (security lens) | Token store + OAuth threat model | 1 | ISSUES FOLDED | 4 CRIT + 7 SHOULD + 4 NIT → folded (`docs/security/phase-15-security-pass.md`) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 2 issues (A1 backlog-bounding, A2 one-poster) → folded; 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score 5/10 → 9/10; IA + states + a11y + withheld-surfacing folded (Design & UX Spec) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | n/a |

**CROSS-MODEL:** Council (Codex+Gemini) and the eng review agree on the delivery-model rework
(transactional outbox + delivery state machine + exactly-once). No unresolved cross-model tension.
**UNRESOLVED:** 0. SEC-C4 (key backing) decided provisionally (per-record DEK/env KEK; revisit before prod GA).
**VERDICT:** COUNCIL + SECURITY + ENG + DESIGN CLEARED — ready to implement (`/work`).

