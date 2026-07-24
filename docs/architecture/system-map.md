# System Map

> Plain-English mental model of how the app actually fits together, grounded in the real code.
> No need to read code to use this. When it drifts, ask Claude: *"Read the codebase and refresh
> docs/architecture/system-map.md."* Related: [[scale-register]], [[glossary]], [[ROADMAP]], [[VISION]].

## The stack (one line each)

- **Cellarhand** — the product's brand (renamed from "BWC Operating System"; assets in `design-system/assets/logos`, wired via `src/components/BrandMark.tsx` + `src/app/{icon.svg,apple-icon.png,manifest.ts}`).
- **Next.js 16.2** (app router) + **React 19** + **TypeScript** — `src/app/…`
- **Tailwind v4** — styling via design tokens (see [[DESIGN]]); `src/styles/print.css` for printable work orders.
- **Prisma ORM → Neon serverless Postgres** — **146 models** in `prisma/schema.prisma` (~4.74k lines).
- **better-auth** — authentication (`@node-rs/argon2` for password hashing).
- **Vercel** — hosting. `npm run build` runs `prisma migrate deploy` first, so **deploys apply migrations automatically**.
- **Sentry** — error monitoring (`instrumentation.ts`, `sentry.*.config.ts`) → auto-opens GitHub issues.

## How the code is organized
- `src/app/` — pages + API routes. Everything real lives under the **`(app)`** route group (inventory, lots, vessels, blend, bottling, compliance, samples, reports, assistant, settings, users, audit…). Auth pages (login, reset-password) sit outside it.
- `src/lib/<domain>/` — the brains. One folder per domain: `tenant`, `ledger`, `transform`, `cost`, `compliance`, `accounting`, `commerce`, `work-orders`, `equipment`, `assistant`, `voice`, `blend`, `bottling`, `sparkling`, `cellar`, `ferment`, `harvest`, `vineyard`, `chemistry`, `inventory`, `stock`, `migration`, `feedback`, `developer`, `offline`, `onboarding`, `map`, etc.
- `src/components/` — UI. `src/styles/` — tokens.
- `scripts/` — verification + seeding (`verify:ttb`, `verify:cost`, `verify:reverse`, `seed:demo-tenant`, …).

---

## The major subsystems

### 1. Multi-tenancy + isolation (the backbone) — `src/lib/tenant/`
Every winery is a **tenant**. The tenant is carried through the request in an `AsyncLocalStorage`
context and **auto-injected** into every DB query, so app code rarely passes `tenantId` by hand.
Postgres **Row-Level Security (RLS)** enforces isolation at the database itself — the app connects
as the restricted **`app_rls`** role, which *cannot* bypass RLS.
- `context.ts` — `runAsTenant()`, `getTenantId()`, `requireTenantId()`, `injectTenantId()`.
- `tx.ts` — `runInTenantTx()` for transactions.
- `system.ts` — `runAsSystem()` for owner-level cross-tenant maintenance (bypasses RLS).
- `models.ts` — `GLOBAL_MODELS` denylist: the auth tables (User/Session/Account/Verification/Organization/Member/Invitation) are the **only** non-tenant-scoped tables.
→ This is the #1 area to watch as you grow. See [[scale-register]].

### 2. The lot ledger (the spine) — `src/lib/ledger/`
A **lot** is a tracked quantity of wine (`Lot`, `LotOperation`, `LotOperationLine`, `VesselLot`,
`LotLineage`, `LotStateEvent` in the schema). Every action is an **append-only operation**; current
state is *derived* from the ledger, not stored loosely.
- `write.ts` — `runLedgerWrite()`, the single guarded path for ledger writes. It is also the ONLY
  write site for the `VesselLot` occupancy projection, which is what lets **LEDGER-12** be enforced in
  one place: a vessel holds **at most one lot**, a lot may occupy **many vessels**
  ([[0008-one-lot-per-vessel]]). The guard is monotone (`assertNoWorsenedCoResidence` — an op may never
  ADD a lot to a vessel), backed by a `(tenantId, vesselId)` unique index. `write.ts` also folds
  `VesselComponent`, the vessel's **composition** (variety/vineyard/vintage shares), attributing every
  lot — including origin-less blend lots — through lineage via `composeLeaves`.
- `combine.ts` + `combine-state.ts` — `decideCombineRoute`, the ONE decision every combining operation
  (rack, crush, press, saignée, topping, blend) makes about identity: **KEEP** (destination empty),
  **ABSORB** (the resident wine grows, keeping its identity), **NEW_BLEND** (mint a new lot). Refuses
  across bond, form, ferment state, and tax class — each refusal naming its legal escape. A **cross-OWNER
  combine is NO LONGER refused** (plan 093 Unit 6 / council C2): refusing it deadlocked the daily topping
  op (facility wine into a client barrel), so the receiving owner now dominates the scalar result and the
  consumed minority owner's fraction is captured as a pending `BillableWineConsumed` row at execution
  (bill-don't-block); bond stays absolute (it blocks even the NEW_BLEND escape — a real TTB boundary).
- `actions.ts` — the server actions the UI calls.
- `reverse.ts` + `reverse-guard.ts` — the **universal Undo**: `reverseOperationCore` dispatches an undo for *every* operation family (rack, bottle, sparkling, crush, press, saignée, blend), unwinding in LIFO order with guardrails.
- `math.ts`, `vocabulary.ts` — volume math + naming.
- **Ownership projection (plan 093, custom-crush) — `src/lib/owner/`.** A lot's `ownerId` is a SCALAR,
  MAINTAINED projection (NULL = Estate/facility), re-stampable like `VesselComponent` — NOT immutable
  ledger truth. The immutable record is a **`CHANGE_OWNERSHIP`** op (`change-ownership-core.ts`),
  CONDITIONAL on the bond delta: same bond = a title-only re-stamp posting **no ledger line** (respecting
  LEDGER-2's no-noop rule); host↔AP (distinct BWN) = title + a symmetric transfer-in-bond pair (balanced,
  LEDGER-6). Descendant rows carry their lot's CURRENT owner read from the column at the write chokepoint,
  never re-walked from lineage (**OWNER-1** — re-deriving would resurrect a pre-change owner). Compliance
  keys off BOND, not `ownerId`, but an AP owner's bond wins in `deriveBond` (`compliance/bond.ts`). ⚠️
  `ownerId` is a data MODEL only — there is **no owner-scope RLS yet** (that is plan 092); see
  [[security-register]]. Guarded by `npm run verify:owner-model` (OWNER-1).

### 2a. Identity presentation layer (Phase 1) — `src/lib/lot/`
Separates durable identity from the human label (NAMING-1/2). `Lot.id` is the ONLY opaque identity and
carries all lineage/cost/ledger FKs; `Lot.code` is a **mutable, unique-per-tenant** human label and
`Lot.displayName` a **mutable, NON-unique** free-text label (presented as `displayName ?? code`).
- `naming-template.ts` — a per-tenant, versioned tokenized `NamingTemplate`(+`Version`) renderer; the
  built-in default **delegates to `buildLotCode`** (byte-for-byte parity). `generate.ts` renders new
  codes through the tenant's active template.
- `rename.ts` — `renameLotCore`/`setDisplayNameCore`/`swapLotCodes`: append an **`LotCodeEvent`** (the
  single source of truth for rename history) and **never rewrite `LotOperationLine` snapshots** (the
  moat vs. incumbents). A `code` collision **offers** a disambiguation (never silently applies it).
- `identify.ts` — `LotIdentifier` (external/source ids + the current-code convenience row) + cross-
  identifier search that resolves **to `id` first** (current code, displayName, historical codes via
  `LotCodeEvent`, legacy ids) — nothing downstream joins on the mutable `code`.
- Guarded by `npm run verify:naming` (NAMING-1/2). New tenant-scoped tables `LotIdentifier`,
  `LotCodeEvent`, `NamingTemplate`, `NamingTemplateVersion` (composite `(tenantId, refId)` FKs in raw SQL).

### 3. Transforms (fruit → wine) — `src/lib/transform/`
The operations that change a lot's identity: `crush-core.ts` (`crushLotCore`), `press-core.ts`
(`pressLotCore`), and `reverse.ts` (`reverseTransformCore`) which restores stock + lineage on undo.

### 4. Cost engine (Phase 8a) — `src/lib/cost/`
Cost follows the wine. Fruit/supply cost attaches at crush and is carried, rolled up, and *negated on
reversal* through the same operations as the ledger.
- `rollup.ts`, `consume.ts`, `deplete.ts`, `cogs.ts`/`cogs-write.ts`, `policy.ts`, `reverse.ts`, `cache.ts`, `transfer.ts`.
- Schema: `SupplyLot`, `CostLine`, `SupplyConsumption`, `OperationCostTransfer`, `LotCostState`, `BottlingCostSnapshot`,
  `MaterialMovement`, `FinishedGoodReceipt`.
- **Per-location consumables (plan 080).** `SupplyLot.locationId` is NOT NULL (expand/contract closed in U13a)
  with a COMPOSITE-tenant FK to `location(tenantId,id)`; on-hand is a GROUP BY over lots, so physical location
  and cost basis live on the SAME row. A transfer is a FIFO **lot-split** carrying cost/age/expiry/vendor/FX and
  a `splitFromLotId` lineage edge (STOCK-2). `MaterialMovement` is the append-only per-location ledger
  (RECEIVE|ADJUST|TRANSFER|CONSUME, signed `deltaQty`, paired transfer legs). Consumption past a location's
  on-hand goes NEGATIVE there at a KNOWN weighted-avg cost rather than cross-pulling — negative lots are inert
  to FIFO/WA (both filter `qtyRemaining > 0`) and are the "needs cycle-count" signal.
- **Purchased finished-goods cost (plan 080 U7).** `FinishedGoodReceipt` is an append-only weighted-average
  cost layer for merch / wine bought in or bought back. Internally-bottled wine is NOT valued here — it keeps
  its specific-lot COGS frozen in `BottlingCostSnapshot` (COST-3). MSRP is a price and sits on the SKU; COGS
  deliberately does not (council C4 — a mutable cost column is a second source of truth with no history).
- **Packaging dry-goods (plan 056):** at bottling, packaging materials (glass/closures/labels/capsules)
  deplete from supply lots and **capitalize into a COGS PACKAGING bucket** via `consume-packaging.ts` +
  `transfer.ts` — same conserve-and-negate discipline as fruit/additives (COST-1/2), reversed append-only
  when a bottling run is reversed. Bottling can run standalone (`/bottling`) or as a governed WO task.
- Cost is computed largely on read (rollup) — a scale watch-item, see [[scale-register]].
- **Cost surfacing (plan 080 / feedback #372):** `cost-display.ts` (`summarizeConsumableCost`) is a pure,
  read-only fold over a consumable's in-stock supply lots that shows the operator the blended cost of what
  they hold — how many priced shipments the average is built from, and whether any in-stock shipment is
  missing a price (so the average is flagged incomplete). It reuses the engine's `weightedAvgUnitCost`
  rather than recomputing (single source of truth, COST-1); unpriced lots are excluded, never counted as
  $0 (COST-2); it never writes (COST-3). Consumed by `ConsumablesSection.tsx`.
- **Currency (Phase 037):** one tenant-wide currency (`AppSettings.currency`, from {USD, EUR, NZD, AUD, ZAR, GBP}), set on the Settings "Cost accounting" card. It is a DISPLAY LABEL only — no FX conversion. The pure helper `src/lib/money/currency.ts` (`coerceCurrency`/`currencySymbol`/`formatMoney`) drives the symbol; `CurrencyProvider`/`useCurrency` (`src/components/money/`) push it into client cost inputs (symbol prefix via `Input iconLeft`) + displays, and `getTenantCurrency` feeds server pages. Each `SupplyLot` stamps the currency it was entered under, so changing the setting never re-values history. Orthogonal to `costingPolicyVersion` — a currency change does NOT bump it (D17). TTB excise `taxDollars` intentionally stays `$` (federal statutory USD).

### 5. Compliance engines (Phase 14) — `src/lib/compliance/`
Generates the two federal TTB reports from the ledger:
- **5120.17** (operations) and **5000.24** (excise/tax) — **one shared table** (`ComplianceReport`),
  strictly separated by `formType` (`form-type.ts`, `form-map.ts`) so the two filing chains never cross.
- `cbma.ts` (tax-credit ladder), `excise.ts`/`generate-excise.ts`, `fill-pdf.ts`/`fill-5000-24-pdf.ts` (produce the actual PDFs via `pdf-lib`), `deadlines.ts` + `reminders.ts` + `ics.ts` (deadline reminders + calendar), `anomaly.ts`.

### 6. The assistant (chat + voice) — `src/lib/assistant/` + `src/lib/voice/`
A natural-language assistant over the whole app, powered by `@anthropic-ai/sdk`.
- `run.ts` — the tool-use loop; `tools/` + `registry.ts` — the actions it can take; `scope.ts` — permissions.
- **Writes require explicit confirmation:** `confirm.ts` + `commit.ts` (signed-token / single-use nonce).
- `conversations.ts` / `history.ts` — persisted, shared across text + voice.
- **Read tools** answer without a write: alongside cellar-contents / measurements / operations queries, the
  assistant can read a lot/vessel's **operation history** and **measurement history** and rank vessels by an
  analyte, and sweep for **overdue work** — all read-only, no confirmation gate.
- **Voice mode** reuses the *same* `/api/assistant` stream + tool loop (one brain); ElevenLabs does STT + TTS. Server key stays server-side.
  - **Inline in the dock (plan 089):** voice runs *inline* in the assistant dock (an audio-reactive title-bar
    orb + the dock's own transcript), NOT a full-screen overlay, so the page the assistant navigates to stays
    visible/clickable. `VoiceInlinePanel`/`VoiceHeaderOrb` replaced the retired `VoiceOverlay`.
  - **Pronunciation lexicon (plan 091):** `src/lib/voice/lexicon.ts` is a pure term→phonetic matcher (single-pass
    alternation, longest-match-first, accent-tolerant, idempotent/no-cascade) wired LAST in `toSpeakable` after
    `normalizeUnits`, so TTS says winery terms right. ⚠️ It shipped with the lexicon table **EMPTY** — machinery
    only, a no-op for users until the table is populated by ear (issue #464 still open). The TTS→STT screening
    approach was tried and documented as a **negative result** (Scribe normalizes to the intended word, so it
    cannot measure pronunciation) — do not rebuild it.

### 7. Vineyard + maps — `src/lib/map/`, `src/lib/vineyard/`, `src/lib/harvest/`
Satellite basemap (Esri keyless, or Google Map Tiles if keyed) with drawable blocks (`leaflet` +
geoman), export to PNG or WGS84 shapefile. Harvest: per-block Brix curve + yield estimate + pick passes
(`HarvestRecord` → `HarvestPick`). Plan 039: a pick captures the full fruit snapshot — weight + optional
**Brix / pH / TA** (`phAtPick`/`taAtPick`, ranges from the analyte registry). A pick is written one of three
ways through the SAME `harvest/pick-core.ts`: the manager Add-a-pick form, the assistant `log_harvest_pick`
weigh-in tool (resolve block by NL → draft→confirm), or a work-order `HARVEST_WEIGH_IN` block (§10).
- **Custom-crush intake spine (plan 093) — `src/lib/grower/`, `src/lib/harvest/weigh-tag-core.ts`,
  `src/lib/owner/`.** Three first-class parties/records fill the biggest both-incumbent gap: a **`Grower`**
  (the party that farmed the fruit; `Vineyard`/`VineyardBlock.growerId` composite FKs replace the free-text
  `manager`, `isEstate` flags the winery's own blocks), an **`Owner`** (the party that OWNS the wine —
  a custom-crush client or AP proprietor; `kind` is a validated TEXT union, not a DB enum), and a per-TRUCK
  **`WeighTag`** scale ticket (gross/tare/net; a **gap-free per-tenant monotonic** `tagNumber` allocated via
  a `WeighTagCounter` counter-row + `SELECT … FOR UPDATE`, NOT `MAX()+1`; **voided, never deleted**, like
  `LotTreatment`). Owner/grower/block attach at the **`WeighTagLine`** (bin) level, and a `HarvestPick`
  links back via `weighTagLineId` — **receive-now-assign-later** (a NULL `ownerId` + `needsOwnerAssignment`
  disambiguates "estate" from "unresolved"; crush refuses an unresolved line). `HarvestPick.sold` flags
  fruit sold OUT (TTB Part IV removal). Surfaces: `/setup/clients` (Owners) + `/setup/growers` admin and
  the `/vineyards/harvest/weigh-tags` weigh-in screen, all gated by `AppSettings.customCrushEnabled`
  (default off, inert until opt-in — mirrors `sparklingEnabled`/K14). Assistant tools `change_ownership`
  + `log_weigh_tag` (`src/lib/assistant/tools/`). Proof: `npm run verify:owner-model`.

### 8. Accounting integration (Phase 15) — `src/lib/accounting/` + `src/lib/crypto/`
Two-way QuickBooks Online off the Phase-8b cost export seam (does NOT rebuild the GL). A
**transactional outbox**: freezing a COGS snapshot / writing a variance / receiving a supply emits an
immutable export event **+** a PENDING `AccountingDelivery` in the SAME tx (no dual-write). Crons then
**claim → post → verify**: the poster claims a bounded batch (`FOR UPDATE SKIP LOCKED` + lease),
builds a balanced JournalEntry (or AP Bill), and **queries-before-post by DocNumber** for exactly-once
under crashes/concurrency; reconcile reads back (`DELETED_IN_GL`); reversals post mirror-image to the
current open period (D6). Per-tenant OAuth with the **refresh token AEAD-envelope-encrypted**
(`crypto/envelope.ts`); access token in memory only. A least-privilege `accounting_enumerator` role
lists org ids on the cron path (never the owner). `adapter.ts` is provider-neutral (Xero-ready);
`qbo/{oauth,client,journal,bill}.ts` is the only QBO-specific code. UI: Settings connect + mapping
cards, `/accounting` dashboard. See [[security-register]] + [[scale-register]].

**Invoice ingest → A/P** (`src/lib/ingest/`): a supplier invoice (LLM-extracted or hand-entered) is reviewed
line-by-line, then applied in ONE atomic tx that creates each line's target and emits A/P **once** as a single
aggregate `ApExportEvent` keyed `apinv:<invoiceId>` → one multi-line QBO Bill (AP-1). Foreign-currency invoices
convert at a dated ECB rate at ingestion; the lot's cost is frozen in base currency and never FX-revalued
(COST-4). Plan 080 U5 made it a **mixed invoice** — parts, capitalized equipment and finished goods on ONE
document: each line carries a `targetKind` ∈ {MATERIAL, EQUIPMENT_ASSET, FINISHED_GOOD} (nullable, no default —
a null target is a hard needsAck, never a silent MATERIAL guess), and codes to its OWN GL account
(`AppSettings.apInventoryAccount` / `apFixedAssetAccount` / `apSuppliesExpenseAccount`; an unconfigured account
WITHHOLDS the invoice rather than miscode it). A line for N pumps mints N `EquipmentAsset`s, tracked by the
append-only `IngestedInvoiceLineCreatedAsset` join (composite-tenant FK, RLS-isolated per the Phase-12
checklist) so a reversal knows exactly what to undo. Proof: `npm run verify:ingest`.

### 9. Commerce7 DTC/sales integration (Phase 16) — `src/lib/commerce/`
The revenue side of the money loop (built, live-sandbox-pending). An event-driven adapter off our ledger:
Commerce7 DTC/club/POS **sales** in → a MUTABLE `Commerce7Order` projection → normalize → **diff** →
append-only `SalesExportEvent` DELTAs, Paid-only, in ONE SERIALIZABLE ingest tx that also depletes
finished goods (a `SALE` `StockMovement`) and emits a PENDING revenue delivery. The webhook is a HINT
(HMAC-routed, bounded dirty marker); the **poll cron is the single ingest path** + `(updatedAt,id)` cursor
backstop. Revenue posts through the SAME Phase-15 poster (a `salesExportEventId` branch → `buildSalesDeltaJournal`),
so the delivery source is now **exactly-one-of-three** (cost | ap | sales). Outbound inventory is
additive-on-increase only (watermark-idempotent); drift is read-only. `adapter.ts` is provider-neutral
(WineDirect-ready); `commerce7/{config,client}.ts` is the only C7-specific code (Basic Auth, no OAuth,
env-resident secret). PII is data-minimized (D19). Install is nonce-bound. UI: Settings connect + mapping
cards, `/accounting` Commerce7 section + a read-only per-channel margin view. See [[security-register]] +
[[scale-register]] + `docs/plans/phase-16-go-live-runbook.md`.

### 10. Work orders (Phase 9 + 9.1) — `src/lib/work-orders/`
The **issue → execute → auto-log → approve → finalize** engine, so completing a task IS the record —
the manager never re-keys what the crew did. 8 tables (`WorkOrder`, `WorkOrderTask`, `WorkOrderTaskAttempt`,
`WorkOrderTemplate` + `…Version`, `Reservation`, `VesselActivityEvent` + `…SupplyUse`). One engine, typed
task **kinds**: OPERATION / OBSERVATION / MAINTENANCE.
- **State changes on completion, not approval.** Marking a task done writes the **real, immutable** ledger
  op immediately (via the existing cores' new `…Tx` forms — `rackWineTx`, `topVesselTx`, `filterVesselTx`,
  `recordNeutralDoseTx`, `capManagementTx`, `crushLotTx`, `pressLotTx` — all in ONE `runLedgerWrite`,
  `execute.ts`). "Pending-approval" is a state on the **task/attempt**, never on the op (invariant
  **WORKORDER-1**). Each execution is an append-only `WorkOrderTaskAttempt` (`commandId`-idempotent), so
  redo-after-reject keeps history.
- **Approve = finalize; reject = `reverseOperationCore`** (the plan-024 universal Undo — a new CORRECTION,
  never a row edit). Approve/reject use compare-and-swap on `PENDING_APPROVAL`; a reject blocked by a later
  op (LEDGER-11) surfaces as a conflict. Authority is a minimal `authority.ts` (`canApprove`,
  admin + auto-finalize-self-executed; Phase-23-replaceable). Bulk approve segregates deviations.
- **Multi-lot vessel readings (plan 060, `src/lib/chemistry/`):** one physical whole-tank reading on a
  co-ferment/multi-lot vessel **fans out** to one `AnalysisPanel` per co-resident lot, all sharing a
  `vesselReadingGroupId` (VISION D2 intact — each panel still attaches to exactly ONE lot, so each lot keeps
  its own curve). The group id is derived **deterministically** from the capture's stable `clientRequestId`
  (`planVesselReadingFanout` in `fanout-plan.ts`, DB-free + unit-tested), and a per-tenant
  `@@unique([tenantId, vesselReadingGroupId, lotId])` makes the fan-out **idempotent** (a retry/offline
  re-sync collides → P2002 → no-op). NULL group = an ordinary single-lot reading (NULLs are distinct in
  Postgres uniques, so legacy rows never collide — effectively partial). **Vessel-scoped** views (vessel
  History, `/bulk` trends, panel counts) dedup by `coalesce(vesselReadingGroupId, id)` over
  `@@index([vesselId, vesselReadingGroupId])`; **lot-scoped** views must NOT dedup.
- **Two other lanes:** OBSERVATION tasks (`observations.ts`) write chem/tasting/ferment readings directly,
  no gate. MAINTENANCE tasks (`vessel-activity.ts`, `maintenance.ts`) are LOTLESS — a `VesselActivityEvent`
  (+ optional OVERHEAD `VesselActivitySupplyUse`, WORKORDER-3). Kinds: temp-setpoint / clean / sanitize / steam /
  gas, plus (plan 044) **ozone / SO₂ treatment / wet-storage solution change** for the barrel shed. NOTE:
  **bâtonnage (lees stirring) is NOT a maintenance task** — stirring lees is about the wine, so it rides
  `CAP_MGMT` as a volume-neutral per-lot `LotTreatment` (a `BATONNAGE` `CapKind`, no migration), and the wine
  lot's timeline shows the stir (approve/reject like any cap op).
- **Vineyard-block target (plan 039, the minimal Phase-20 seam):** a `WorkOrderTask.blockId` (composite-FK'd
  `(tenantId, blockId) → vineyard_block(tenantId, id)`) + a `"block"` FieldType let ONE observation block —
  `HARVEST_WEIGH_IN` ("fruit intake / weigh-in") — target a vineyard block. Completing it routes through
  `harvest-observations.ts` (off `completeObservationTaskCore`) and writes a **`HarvestPick`** (weight + optional
  Brix/pH/TA) to the block's current-vintage record via the shared `harvest/pick-core.ts` — NOT an `AnalysisPanel`,
  NO ledger op, straight to DONE. The block + readings are RUN-TIME (execute sub-form `HarvestWeighInTaskForm`,
  never a template default — like vessel/lot). This is deliberately the SMALLEST vineyard-WO seam; **Phase 20
  extends it** (general block-activity ledger, cross-block fan-out, farming cost) rather than rebuilding it.
  (cleaning, temp-setpoint, gas/blanket, filtration), and any sanitizer/gas consumed drains as **OVERHEAD**
  via append-only `VesselActivitySupplyUse` — never a wine `CostLine`/`SupplyConsumption`, kept out of the
  cost DAG (invariant **WORKORDER-3**; preserves COST-1/2 conservation).
- **Multi-vessel maintenance consolidation (plan 061, ADR 0004):** "clean B1–B60" is now ONE reviewable
  MAINTENANCE task carrying its member set in `plannedPayload.groupActivity`
  (`{ activityType, memberVesselIds, memberCodes }` JSON — no columns, no join table, mirrors group-rack's
  `groupRack`), instead of the old plan-060 fan-out to N record-only tasks (which also blew
  `NL_WORK_ORDER_MAX_TASKS = 25`). Completion is **all-at-once**: one Serializable tx (`maintenance.ts`,
  120s timeout for big ranges) writes one record-only `VesselActivityEvent` per member (each keyed
  `${commandId}:${vesselId}`), task straight to DONE. Undo is `undoMaintenanceTaskCore` (`approval.ts`) —
  reverses every member `VesselActivityEvent` and **reopens to PENDING** (record-only tasks stay
  re-completable; REJECTED→DONE isn't legal), authed to admin/developer OR the recorder (self-undo, group-rack
  parity). WORKORDER-3 holds **per event** (N members ⇒ N × per-vessel dose, overhead-only). Proof:
  `npm run verify:group-maintenance`. The load-bearing rule: *one reviewable task ≠ one ledger op.*
- **Reservation = advisory soft holds** (`reservations.ts`, `atp.ts`): issuing a WO allocates source volume /
  destination capacity / supply qty; `available-to-promise = on-hand − open allocations` **warns, never
  blocks**; the hard guarantee stays the ledger capacity/stock invariants at commit (**WORKORDER-2**).
  Supply reserve-on-issue → deplete-on-complete (draw-to-zero reports a shortfall, never goes negative).
- **Cap management as a WO (plan 043):** a `CAP_MGMT` OPERATION task type routes completion through
  `capManagementTx` (extracted from the cellar `capManagementCore`) — volume-neutral, reserves nothing.
  Technique is a `CapKind` **validated string** (pumpover / punchdown / cold-soak / maceration / **pulse-air**),
  NOT a DB enum, so pulse-air needed no migration + no reverse/correct/edit wiring. **Rack-and-return
  (délestage)** is modeled as a two-leg RACK template (`SYS-DELESTAGE`: out origin→holding, back
  holding→origin) reusing `rackWineTx` — no new op type. **Batch completion** (`completeTasksBatchCore` /
  `completeTasksBatchAction`, mirroring `bulkApproveTasksCore`) completes N tanks at once — N independent
  `runLedgerWrite` txs, per-tank pass/fail, one `commandId` per task; the execute screen's `BatchCapExecutor`
  is the "punch down 3, 4, 5" UI. The assistant can ISSUE a cap-management WO by chat
  (`issue_cap_management_wo`, draft→confirm, deep-links to the WO).
- **Due-TIME precision (#472):** a WO can be requested for a date AND a time of day ("tomorrow at 9am"), not
  just a date. `work_order.dueAt` was already a timestamp; the new `dueAtHasTime` boolean records whether a
  clock time was actually *asked for* (the instant alone can't tell "the 23rd" from "the 23rd at midnight", and
  midnight work is real at harvest) so the UI shows a time only when one was requested. Additive, NOT NULL
  default `false` — every legacy row was date-only. `src/lib/work-orders/due-at.ts` + `DueAt.tsx` own the parse/render.
- **Winery clock (#473, follow-on to due-time):** work is planned where the wine is, so the winery gets its own
  operating timezone — `AppSettings.timeZone` (nullable IANA zone id, e.g. `America/Los_Angeles`; NULL = "not
  configured" → every reader falls back to the viewer's browser zone, exactly the pre-column behaviour). Set on
  `/settings` (`WineryTimeZoneCard`); pushed app-wide via `WineryTimeZoneProvider` and consumed by `LocalTime.tsx`
  so an owner in New York sees a Bhutan winery's 9am pumpover on the *winery's* clock. Validated against `Intl`
  in app code (a bogus zone degrades to the fallback), not a DB CHECK (the tz database changes over time).
- **Templates** (`templates.ts`, `template-vocabulary.ts`, `system-templates.ts`): typed-field vocabulary
  (never free-form), versioned clone-on-customize; an issued WO snaps the version it used; recurring +
  pay-basis stub (`recurring.ts`). Seeded via `npm run seed:work-order-templates`.
- **Material picker + taxonomy (Phase 034 → 036):** the `material` field renders `MaterialFilterPicker`
  (family filter chips + fuzzy search via `src/lib/inventory/material-search.ts`, reusing the `similarity`
  engine — no new deps), scoped by task type via `materialScopeForTask`. Phase 036 makes the **main category
  STORED** (`CellarMaterial.category`) — it is the cost-safety authority (`isDoseableCategory`, the server
  WORKORDER-3 guard at the execute seam), so a user-invented family routes correctly; `categoryOf(kind)` is a
  backfill fallback. The **family** (the `kind` column, chips via `familyLabel`) is now user-extensible
  ("+ add family"); the fine-grained `subcategory` level is retired from the UI (column dormant). Materials
  carry brand/generic display metadata + `preferGeneric` — `materialDisplayName` (used at every render site
  + the dose snapshot `LotTreatment.materialName`) shows the preferred name. Intake is the **Add-consumable
  modal** (Inventory -> Consumables; `/setup/expendables` is now a permanent redirect): generic/brand, vendor+URL, Category, family, and a purchase (package
  amount + unit + total cost) that `deriveOpeningLot` (`src/lib/cost/intake-cost.ts`) converts into the
  canonical per-stock-unit cost. **Units** live in `src/lib/units/measure.ts` (mass g/mg/kg/oz/lb, volume
  mL/L/fl oz/gal, count) — imperial converts to the metric canonical at intake AND in the dose path
  (`DOSE_UNIT_LABELS`, `stockConversionFactor`); cross-dimension → UNKNOWN cost (D14), never $0. Adding a
  `MATERIAL_KIND` built-in is still a const edit; the Phase-036 fields are one columns-only migration.
- **Builder + planning (plan 053):** a WO is composed from a **task palette** into ordered, sequentially-
  gated **groups** (`group-gating.ts`), each task with its own **assignee + priority**, plus **WO→WO
  dependencies** (`work_order_dependency`) and planning fields. A `Location.kind` classifies where work
  happens (cellar/warehouse/crush_pad/lab/bottling/…), and an **equipment registry** (`src/lib/equipment/`,
  `EquipmentAsset`) advisory-links presses/filters/pumps to tasks (`work_order_task_equipment`, surfaced never
  blocking — WORKORDER-2; equipment maintenance is record-only). **Record-only Custom Log task types**
  (`custom-log*.ts`, `WorkOrderTaskType` — no `kind`/`opType` column, so they touch no ledger/cost) plus
  **per-tenant field overlays** (`WorkOrderTaskTypeOverlay`: a HIDEABLE-field allowlist + relabel/reorder) let
  a winery add & tune its own task types at `/work-orders/task-types` — guarded by invariant **WORKORDER-4**.
- **Progressive group completion (plan 054):** a group barrel-down / rack-to-tank can finish in passes
  ("4 now, the rest tomorrow") — `group-rack-progress.ts`/`group-rack-select.ts` complete a subset as one
  reviewable task, per-batch op + LIFO reject, no schema (the attempt model is already N-op-capable).
- **Surfaces** (`src/app/(app)/work-orders/`): manager issue (`/new`), a **palette builder**, floor-first
  execution checklist (`/[id]/execute`, offline-tolerant via the Dexie outbox), review/approval queue
  (`/review`), printable WO (`/[id]/print` + `print.css`), template + task-type admin (`/templates`,
  `/task-types`), Open|Archive dashboard with a pending-count nav badge. Proven by `npm run verify:work-orders`
  (+ `verify:work-orders-enhancements`); invariants WORKORDER-1/2/3/4.

### 11. Data migration / onboarding import — `src/lib/migration/`
Batch-imports a winery's **existing** data (vintrace/innovint/CSV) so onboarding doesn't start from zero —
the import half of the moat. A `MigrationImportBatch` moves DRAFT → PREFLIGHT_BLOCKED → READY_FOR_REVIEW →
SIGNED_OFF → PUBLISHED (or DISCARDED). Parse → map entities/fields (`migration_entity_mapping` /
`migration_field_mapping`) → **reconcile** against expected totals (`migration_reconciliation_item`: vessel/lot
volume, cost, finished-goods, TTB total, chemistry, lineage) → on sign-off, **`publish.ts` writes REAL ledger
operations** (via `writeLotOperation`/`runLedgerWrite`) plus lot identifiers + tax-class events, seeding lots/
positions (`migration_seed_lot`/`migration_seed_position`) and preserving raw source rows (`legacy_operation`).
Tenant-scoped + append-only, so an import is just more ledger history — reversible like any op. Files:
`batch.ts`, `publish.ts`, `generic-fixture.ts`, `units.ts`, `types.ts`, `actions.ts`.

### 12. Feedback + the developer auto-fix loop — `src/lib/feedback/` + `src/lib/developer/`
The product's self-healing loop. Users file a **bug/feature ticket** (`FeedbackTicket`) or a **thumbs-down** on
an assistant reply (`AssistantFeedback`), optionally with screenshots (`FeedbackAttachment`, fed to the fix
agent as vision). Per-tenant automation modes (`AppSettings`: REPORT_ONLY | PLAN_MODE | AGENTIC_FIX,
`feedback/automation.ts`) decide whether an `AutomationRun` spawns; AGENTIC_FIX dispatches a GitHub-Actions fix
agent that writes code **inside a fence** (UI/assistant + widened cellar-floor `src/lib` domains, NEVER
money/ledger/tenancy/audit — plan 052, gated by `verify:feedback-fence` + `feedback-domain-verify`). The
`/developer` console + the `/bug-triage` skill work the backlog; each item carries a **`triageClass`
disposition** (DEFECT | MODEL_BEHAVIOR | PRODUCT_GAP | NOT_A_BUG | UNCLEAR, plan 059) the goalie assigns from
root cause, so the fixer is never fed a product-gap it can't fix. Support-tenant impersonation via
`developer/support-context.ts`. See [[security-register]] — the fence is the control that lets an autonomous
agent touch `main` safely.

### Inventory IA — ONE page, three sections (plan 080)

`/inventory` is the single inventory surface, with three URL-addressable sections
(`?section=finished|consumables|equipment`). URL-driven rather than client tab state, because the assistant's
`navigate` tool, the old-route redirects and shared links all have to resolve to a specific section. Each
section is its own async server component rendered only when active, so switching tabs does not run the other
sections' queries.

- **Finished goods** — Wine / Merchandise sub-tabs, per-location on-hand, and the "+ Add" modal (category
  pick-or-create, optional vintage with a WINE-ONLY blank-vintage soft-confirm, MSRP, optional opening stock
  which writes both the stock movement and a `FinishedGoodReceipt`).
- **Consumables** — the former `/setup/expendables`. Per-location on-hand plus Receive / Adjust / Transfer
  (`material-stock-core.ts`), with a negative location balance surfaced as "needs reconcile". A Transfer is a
  FIFO lot-split that conserves both quantity and cost basis (STOCK-2). Plan 080 U15 lets Receive state its
  quantity **by the pack** (`qtyUnit` = "roll"/"case"/…); the pack size is resolved server-side into the
  material's stock unit (custom units per tenant) before any write, converting quantity and unit-cost together.
- **Equipment & parts** — the `EquipmentAsset` registry (now carrying acquisition cost + vendor + FX
  provenance) alongside quantity-tracked EQUIPMENT-category materials, which are surfaced BY CATEGORY so no
  data moves and nothing double-counts. Parts stay expensed, never capitalized (WORKORDER-7).

Old routes `/setup/expendables` and `/setup/equipment` are PERMANENT redirects, not deletions — both are
reachable from bookmarks, older assistant `navigate` payloads, `revalidatePath` calls and the ingest review
screen. "Expendables" is renamed to "Consumables" in user-facing copy and assistant tool DESCRIPTIONS only;
model names, tool `name` strings, committer keys and parity evidence paths are unchanged.

## How a typical write flows
1. UI (or the assistant) calls a **server action** — or a **work-order task is completed**, which builds the same core input.
2. The action runs inside the **tenant context** → Prisma auto-injects `tenantId`; **RLS** enforces it at Postgres.
3. Ledger writes go through **`runLedgerWrite`**; the **cost engine** updates alongside. WO completion wraps the ledger op + its `WorkOrderTaskAttempt` + reservation release + audit in that **one** tx.
4. Everything is reversible via the timeline **Undo** (`reverseOperationCore`) — the same path a WO **reject** uses.

---
*Refreshed 2026-07-24 (brain auto-refresh; plan 093 custom-crush data foundation, #484–#487): a new
**ownership + intake spine**. `Owner` (party that owns the wine; scalar `ownerId` projection added to ~25
tables), `Grower` (party that farmed the fruit; `Vineyard`/`Block.growerId`), and a per-truck `WeighTag`
scale ticket (gap-free monotonic number via `WeighTagCounter`; void-not-delete) with owner/grower/block on
its `WeighTagLine`s — 5 new tables + a `CHANGE_OWNERSHIP` op (§2, conditional on the bond delta) + a
`BillableWineConsumed` record (cross-owner blend is now allow-and-bill, NOT refused — §2/combine). All new
tables took the full Phase-12 tenant-isolation checklist (`verify:tenant-isolation` green); the ~25
`ownerId` columns are a data MODEL only — **no owner-scope RLS yet** (plan 092), so no client-facing read
path until then ([[security-register]]). New invariant **OWNER-1** (`ownerId` is a maintained projection,
never re-derived from lineage; `verify:owner-model`). Surfaces gated by `AppSettings.customCrushEnabled`
(default off). The 26 drift-flagged invariant notes were reviewed and left intact — the new code was
written to CONFORM to them (title-only ownership change posts no line per LEDGER-2; TIB pair is balanced
per LEDGER-6); OWNER-1 is the one genuinely-new invariant and was already added. Prior refresh 2026-07-23
(plans 088–091 + #472/#473): the **one-lot-per-vessel** refactor
(plan 088, LEDGER-12 / [[0008-one-lot-per-vessel]]) was already captured in §2 by its own PR — a vessel holds
AT MOST ONE lot (`(tenantId, vesselId)` unique + monotone `assertNoWorsenedCoResidence` + `decideCombineRoute`
KEEP/ABSORB/NEW_BLEND), and every write folds `VesselComponent` composition via `composeLeaves`; this pass
added the scale note for that per-write fold ([[scale-register]]). New user-facing time features: **work-order
due-TIME precision** (#472, `dueAtHasTime` — additive column) and the **winery operating clock** (#473,
`AppSettings.timeZone` — additive nullable column, NULL falls back to the viewer's zone) — both are additive
columns on EXISTING tenant-scoped tables, no new table / no RLS change, so the Phase-12 checklist and TENANT-1
did not move. Assistant gained **operation-history / measurement-history read tools** + an overdue-work sweep;
voice went **inline in the dock** (plan 089, `VoiceOverlay` retired) and got a **pronunciation lexicon**
(plan 091, `voice/lexicon.ts`) that shipped with an EMPTY table (issue #464 open). The 22 drift-flagged
invariant notes were reviewed and left intact (the changes reinforce or are orthogonal to them; `verify:invariants`
green). Prior refresh 2026-07-21 (plan 080 / feedback #372 cost surfacing): added `cost-display.ts`
(`summarizeConsumableCost`) — a pure read-only fold that shows the blended cost of on-hand consumables +
a priced/unpriced shipment count, reusing the engine's `weightedAvgUnitCost` (COST-1) and excluding
unpriced lots (COST-2), consumed by `ConsumablesSection.tsx`. No schema, RLS, or ledger-invariant change;
the four cost/ledger invariant notes reviewed for drift and left intact (the file upholds them). Prior refresh
2026-07-20 (plan 080 Waves 3–5; 140 Prisma models, ~4.54k schema lines): **mixed invoice ingest** — parts + capitalized equipment + finished goods on ONE supplier invoice, still ONE aggregate A/P Bill (AP-1); each line carries a `targetKind` discriminator + review-time-resolved FG target and codes to its OWN GL account (new `AppSettings.apFixedAssetAccount`/`apSuppliesExpenseAccount`), an unconfigured account WITHHOLDS rather than miscodes; a line minting N equipment assets is tracked by the new RLS-isolated `IngestedInvoiceLineCreatedAsset` join (the only new table this cycle, Phase-12 checklist verbatim). **Receive-by-the-pack** (`resolveReceiptQuantity`) — consumable Receive states qty in a pack unit and resolves it server-side into the stock unit before any write, converting qty + unit-cost together (STOCK-2 conserved). No RLS-model or ledger-invariant change. Prior refresh 2026-07-14 (plans 060–061; 115 models): **multi-lot vessel-reading fan-out** — one whole-tank reading writes one `AnalysisPanel` per co-resident lot sharing a `vesselReadingGroupId` (per-tenant unique = idempotent; vessel-scoped dedup via `coalesce`), the one schema change this cycle (nullable column + two indexes, no RLS change); **multi-vessel maintenance consolidation** (ADR 0004) — "clean B1–B60" is ONE reviewable MAINTENANCE task with members in `plannedPayload.groupActivity`, all-at-once completion + `undoMaintenanceTaskCore`, WORKORDER-3 holds per-event. Prior refresh 2026-07-12 (plans 053–059): WO **builder** — task palette, sequential groups, per-task assignee/priority, WO→WO dependencies, `Location.kind`, the **equipment registry**, record-only **Custom Log task types** + per-tenant field overlays (WORKORDER-4), progressive group-rack (054); **bottling packaging** dry-goods → COGS PACKAGING bucket (056); documented **data migration/import** (§11) and the **feedback + developer auto-fix loop** (§12, plan-059 `triageClass`). Ask Claude to refresh after each phase.*
