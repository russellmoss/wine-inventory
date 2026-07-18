# System Map

> Plain-English mental model of how the app actually fits together, grounded in the real code.
> No need to read code to use this. When it drifts, ask Claude: *"Read the codebase and refresh
> docs/architecture/system-map.md."* Related: [[scale-register]], [[glossary]], [[ROADMAP]], [[VISION]].

## The stack (one line each)

- **Cellarhand** — the product's brand (renamed from "BWC Operating System"; assets in `design-system/assets/logos`, wired via `src/components/BrandMark.tsx` + `src/app/{icon.svg,apple-icon.png,manifest.ts}`).
- **Next.js 16.2** (app router) + **React 19** + **TypeScript** — `src/app/…`
- **Tailwind v4** — styling via design tokens (see [[DESIGN]]); `src/styles/print.css` for printable work orders.
- **Prisma ORM → Neon serverless Postgres** — **125 models** in `prisma/schema.prisma` (~4.06k lines).
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
- `write.ts` — `runLedgerWrite()`, the single guarded path for ledger writes.
- `actions.ts` — the server actions the UI calls.
- `reverse.ts` + `reverse-guard.ts` — the **universal Undo**: `reverseOperationCore` dispatches an undo for *every* operation family (rack, bottle, sparkling, crush, press, saignée, blend), unwinding in LIFO order with guardrails.
- `math.ts`, `vocabulary.ts` — volume math + naming.

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
- Schema: `SupplyLot`, `CostLine`, `SupplyConsumption`, `OperationCostTransfer`, `LotCostState`, `BottlingCostSnapshot`.
- **Packaging dry-goods (plan 056):** at bottling, packaging materials (glass/closures/labels/capsules)
  deplete from supply lots and **capitalize into a COGS PACKAGING bucket** via `consume-packaging.ts` +
  `transfer.ts` — same conserve-and-negate discipline as fruit/additives (COST-1/2), reversed append-only
  when a bottling run is reversed. Bottling can run standalone (`/bottling`) or as a governed WO task.
- **Active-fraction stock draw (plan 066, ADR 0005):** when a dose is expressed as the *active compound*
  (e.g. grams of SO₂) but the stock is a partial carrier (KMBS is 57.6% SO₂), `consumeMaterialCore`
  scales the stock draw + cost **up** by `1/activeFraction` (guarded to `(0,1]`; omit for the normal
  "amounts already the stock substance" case). The carrier is depleted and costed at its true rate, so
  cost conservation (COST-1) still holds — the winery no longer under-books KMBS.
- Cost is computed largely on read (rollup) — a scale watch-item, see [[scale-register]].
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
- **Voice mode** reuses the *same* `/api/assistant` stream + tool loop (one brain); ElevenLabs does STT + TTS. Server key stays server-side.

### 7. Vineyard + maps — `src/lib/map/`, `src/lib/vineyard/`, `src/lib/harvest/`
Satellite basemap (Esri keyless, or Google Map Tiles if keyed) with drawable blocks (`leaflet` +
geoman), export to PNG or WGS84 shapefile. Harvest: per-block Brix curve + yield estimate + pick passes
(`HarvestRecord` → `HarvestPick`). Plan 039: a pick captures the full fruit snapshot — weight + optional
**Brix / pH / TA** (`phAtPick`/`taAtPick`, ranges from the analyte registry). A pick is written one of three
ways through the SAME `harvest/pick-core.ts`: the manager Add-a-pick form, the assistant `log_harvest_pick`
weigh-in tool (resolve block by NL → draft→confirm), or a work-order `HARVEST_WEIGH_IN` block (§10).

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
  + the dose snapshot `LotTreatment.materialName`) shows the preferred name. Intake is the **Add-expendable
  modal** (`/setup/expendables`): generic/brand, vendor+URL, Category, family, and a purchase (package
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
- **Mandatory Lead (plan 070, WORKORDER-5):** every work order has a **Lead** (a single accountable owner) —
  required at issue and never null. `lead-resolve.ts` resolves it deterministically (explicit → assignee →
  issuer → tenant admin); existing rows are backfilled (`scripts/backfill-work-order-lead.ts`). The Lead is
  editable on an in-flight WO.
- **In-place editing (plan 071, WORKORDER-6):** a WO can be edited in the builder AFTER issue via
  `update-core.ts` (`updateWorkOrderCore`) — but editing **only ever touches PENDING tasks**. A task that has
  been executed (any non-PENDING status — it owns an immutable ledger op, WORKORDER-1) is **LOCKED**: the edit
  may reposition it (seq/groupSeq) but never change its type/fields/payload/assignee, delete it, or touch its
  attempts/op. Reservations re-sync per changed PENDING task; a finalized (APPROVED) or CANCELLED WO can't be
  edited at all.
- **EQUIPMENT category + default-deny doseability (plan 072, WORKORDER-7):** a new `EQUIPMENT` material
  category (spare parts / fittings — clamps, gaskets, stainless) is a stock home that must never be dosed into
  wine. The load-bearing change: `isDoseableCategory` (`src/lib/cellar/material-taxonomy.ts`) is now a
  DEFAULT-DENY **allowlist** — only `{ADDITIVE, OTHER}` may be dosed; **every other/unknown/typo'd category is
  non-doseable** (unrecognized input is coerced to the non-doseable `UNCLASSIFIED` sink). Because
  `MaterialCategory` is a free-text String, a denylist would be doseable-by-default; the allowlist keeps a
  non-additive from being wrongly capitalized into wine COGS (protects WORKORDER-3 / COST-1/2 at the execute seam).
- **Surfaces** (`src/app/(app)/work-orders/`): manager issue (`/new`), a **palette builder** (with post-issue
  edit), floor-first execution checklist (`/[id]/execute`, offline-tolerant via the Dexie outbox),
  review/approval queue (`/review`), printable WO (`/[id]/print` + `print.css`), template + task-type admin
  (`/templates`, `/task-types`), Open|Archive dashboard with a pending-count nav badge. Proven by
  `npm run verify:work-orders` (+ `verify:work-orders-enhancements`); invariants WORKORDER-1 through 7.

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
`developer/support-context.ts`. **Triage outcome notes (plan 064)** capture a versioned disposition note per
item (`developer/triage-notes.ts` / `feedback-outcome.ts`) and an optional **Linear link** (`FeedbackLinearLink`,
`developer/linear-link*.ts`) so a ticket can be tied to its tracker issue; the `/developer` console paginates
and filters the queue (`workspace-query.ts` / `feedback-pagination.ts`). See [[security-register]] — the fence
is the control that lets an autonomous agent touch `main` safely.

### 13. Vendors, expendables intake + invoice ingestion — `src/lib/vendors/`, `src/lib/ingest/`
The supply/purchasing side of the cost engine.
- **Managed vendors (plan 069):** a first-class vendor directory (`/setup/vendors`) reusing the Phase-15 QBO
  `vendor` table + a new tenant-scoped `VendorContact` child. `findOrCreateVendorCore` (`vendors.ts`) is the
  ONE dedup path shared by A/P emit, supply-lot intake, and the backfill — one `vendor` per tenant+name. Pure
  vocab + sanitizers live in `vendors-shared.ts`.
- **Vendor merge + removal (plan 072):** fixes existing dupes (Scott Labs vs Scott Laboratories). **MERGE**
  re-points all vendor references (`cellar_material`, `supply_lot`, `ap_export_event`, `vendor_contact`)
  loser→survivor in ONE `runInTenantTx`, re-derives the legacy material mirror, reconciles the QBO
  `externalVendorId` (carry-forward, or CONFLICT unless acknowledged), then hard-deletes the loser. **REMOVE**
  hard-deletes only an *unreferenced* vendor (else CONFLICT; the Unknown fallback is protected). Cores in
  `vendors.ts`; pure helpers + tests in `vendors-shared.ts`; assistant `merge_vendors` tool + duplicate
  detection in `query_vendors`. Governed-money proof: `npm run verify:vendor-merge` + cross-tenant merge
  rejection in `verify:tenant-isolation`.
- **Invoice / document ingestion (plan 072) — `src/lib/ingest/`:** upload a pile of PDFs/images (invoice,
  proforma, COA, terms), extract with an LLM (`extract-invoice.ts`, `document-blocks.ts`), and persist as
  **editable STAGING** (`IngestedInvoice` + `IngestedInvoiceLine`, status `pending`; `LotDocument` +
  `VendorMaterialCode` for provenance/aliasing). A human reviews (`/setup/expendables/ingest`), then **apply**
  runs ONE invoice through the existing cores in a SINGLE interactive tx injected into
  `createStockMaterialCore` / `receiveSupplyCore` / `findOrCreateVendorCore` — so lines + vendor + A/P commit
  or roll back together (all-or-nothing; **nothing here touches the ledger directly**, keeping costing/A-P/
  tenant/RLS invariants intact). Landed cost (freight/duty/etc.) is allocated across lines
  (`landed-cost.ts`); each line normalizes to a canonical stock unit (`normalize-line.ts`). Assistant
  `ingest_documents` tool mirrors the flow. Proof: `npm run verify:ingest`.

### 14. Inbox — notifications + direct messages — `src/lib/inbox/`
An in-app message center (`/inbox`, plan 068). Two lanes: **notifications** (`InboxNotification` — system/
routing events to one recipient) and **direct messages** (`DirectMessageThread` / `DirectMessage` /
`DirectMessageAttachment` between users in the same tenant). Cores in `channels.ts` / `direct-messages.ts` /
`notifications.ts`; server actions in `actions.ts` / `dm-actions.ts`; `routes.ts` + `payloads.ts` build the
typed deep-links a notification points at. **Recipient isolation is the load-bearing invariant (INBOX-1):** a
notification/DM is readable ONLY by its owner (recipient, or a thread participant) **even within the same
tenant** — enforced by RESTRICTIVE per-user RLS policies keyed on `current_setting('app.user_id', true)` that
AND with `tenant_isolation` (unset `app.user_id` fails closed). The emit path is INSERT-tenant-only (a
same-tenant actor may create a notification FOR another user); reads/updates/deletes are owner-only. Proof:
`npm run verify:inbox-isolation`. See [[security-register]].

## How a typical write flows
1. UI (or the assistant) calls a **server action** — or a **work-order task is completed**, which builds the same core input.
2. The action runs inside the **tenant context** → Prisma auto-injects `tenantId`; **RLS** enforces it at Postgres.
3. Ledger writes go through **`runLedgerWrite`**; the **cost engine** updates alongside. WO completion wraps the ledger op + its `WorkOrderTaskAttempt` + reservation release + audit in that **one** tx.
4. Everything is reversible via the timeline **Undo** (`reverseOperationCore`) — the same path a WO **reject** uses.

---
*Refreshed 2026-07-18 (plans 064–072; 125 Prisma models, ~4.06k schema lines): added **§13 vendors + expendables intake + invoice ingestion** (managed vendor directory + `VendorContact`, vendor **merge/removal** re-pointing all money references in one tx, and LLM **invoice/document ingestion** → editable staging → one-tx apply through the existing cost cores) and **§14 inbox** (notifications + direct messages, per-user RLS recipient isolation, INBOX-1); work orders gained **mandatory Lead** (WORKORDER-5), **in-place post-issue editing that never mutates an executed op** (WORKORDER-6), and an **EQUIPMENT category with default-deny allowlist doseability** (WORKORDER-7); the cost engine added **active-fraction stock draw** for partial carriers like KMBS (plan 066, ADR 0005); developer console gained **triage outcome notes + Linear links** (plan 064). Prior refresh 2026-07-14 (plans 060–061): **multi-lot vessel-reading fan-out** — one whole-tank reading writes one `AnalysisPanel` per co-resident lot sharing a `vesselReadingGroupId` (per-tenant unique = idempotent; vessel-scoped dedup via `coalesce`), the one schema change this cycle (nullable column + two indexes, no RLS change); **multi-vessel maintenance consolidation** (ADR 0004) — "clean B1–B60" is ONE reviewable MAINTENANCE task with members in `plannedPayload.groupActivity`, all-at-once completion + `undoMaintenanceTaskCore`, WORKORDER-3 holds per-event. Prior refresh 2026-07-12 (plans 053–059): WO **builder** — task palette, sequential groups, per-task assignee/priority, WO→WO dependencies, `Location.kind`, the **equipment registry**, record-only **Custom Log task types** + per-tenant field overlays (WORKORDER-4), progressive group-rack (054); **bottling packaging** dry-goods → COGS PACKAGING bucket (056); documented **data migration/import** (§11) and the **feedback + developer auto-fix loop** (§12, plan-059 `triageClass`). Ask Claude to refresh after each phase.*
