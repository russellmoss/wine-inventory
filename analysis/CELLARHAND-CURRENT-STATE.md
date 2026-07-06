# Cellarhand — Current State Brief (for the incumbent teardown)

> **Purpose.** A strictly factual snapshot of what Cellarhand *actually implements today* vs.
> what is *planned* vs. *absent*, so every teardown agent compares the incumbents against our
> real state, not against the vision. **Every comparison must tag our side one of three ways:**
> **[IMPLEMENTED]** (code exists and is wired), **[PLANNED]** (named in VISION/ROADMAP, not built),
> **[ABSENT]** (neither built nor on the roadmap).
>
> Descriptive only — no recommendations here. Citations are `path:line`. Compiled from a direct
> read of the schema + naming/migration code and four read-only codebase-survey agents (2026-07).
>
> **Prior-art note:** VISION.md references `docs/competitive-analysis-vintrace-innovint.md` and
> `docs/STRATEGY.md` — **neither file exists** in the repo (only `docs/api-strategy.md` does). This
> teardown *is* that competitive analysis; there is no prior doc to defer to.

---

## 0. Architecture in one paragraph

Cellarhand is a multi-tenant winery-production ERP built on an **append-only lot + operation
ledger** (VISION §3, D2). A `Lot` is a durable cuid identity; every cellar action is an immutable
`LotOperation` with signed `LotOperationLine`s (double-entry volume, `vesselId=null` = the external
counter-account); current state (`VesselLot`, `BottledLotState`, cost, barrel fills) is a
**transactional fold** of the ledger, never the source of truth. Writes funnel through **one
chokepoint** `runLedgerWrite → writeLotOperation` at SERIALIZABLE isolation with `commandId`
idempotency (`src/lib/ledger/write.ts:38-294`). Corrections are **append-only compensating events**,
never in-place edits (D6/D15). Phases 1–8 (the production spine) + 12 (multi-tenancy) + 15 (QBO) are
shipped; 9 (work orders), 14 (TTB compliance) are partial; 13 (migration) and 17–30 are unbuilt.

---

## 1. Entities that exist (core production domain)

Schema: `prisma/schema.prisma` (90 models). Core production entities and their role:

| Entity | Role | Cite |
|---|---|---|
| **Lot** | durable batch identity; `id` cuid surrogate, `code` unique-per-tenant, `form`/`afState`/`mlfState`/`status`/`ownership`/`productType`/`carbonation`, origin snapshots, `provenanceComplete`, `isLegacy`/`legacySnapshot`, `sublotTag` | `schema:1137-1212` |
| **LotOperation** | immutable ledger event; `id Int autoincrement` = monotonic fold order; `type OperationType`; `correctsOperationId @unique`; `commandId @unique`; `batchId` (group fan-out) | `schema:1217-1254` |
| **LotOperationLine** | signed `deltaL`; `bucket` (VESSEL/EXTERNAL/BOTTLE_STORAGE); durable `lotCode`/`vesselCode` snapshots | `schema:1259-1285` |
| **VesselLot** | **projection**: `(vesselId, lotId, volumeL)`; row at functional-zero (0.01 L) is **deleted, never stored at 0** | `schema:1290-1304`; delete at `write.ts:212-213` |
| **VesselTransfer** | derived 1:1 read-model of one RACK op (`lotOperationId @unique`); legacy revert columns retained | `schema:531-565` |
| **LotLineage** | parent→child DAG edges; `kind` = `SPLIT`/`BLEND` (**`TRANSFORM` documented but never written**); `fraction` | `schema:1308-1327` |
| **LotHarvestSource** | pick→lot consumption join (single source of "pick remaining"); crush uses this, **not** a lineage edge | `schema:1337-1351` |
| **LotVineyard** | a lot's source-vineyard SET (union over lineage at blend); drives RBAC lens | `schema:1422-1435` |
| **LotStateEvent** | every form/AF/MLF change (`kind`, `fromValue`/`toValue` text, `commandId`) | `schema:1358-1382` |
| **HarvestRecord / HarvestPick** | intake: record per `(block,vintage)`; pick with `weightKg`, optional `brixAtPick`/`phAtPick`/`taAtPick` | `schema:412-459` |
| **BlendTrial / BlendTrialComponent** | OFF-ledger bench trial; zero ledger impact until PROMOTED → real BLEND op | `schema:1466-1514` |
| **WineSku / BottlingRun / BottlingSource / BottledLotState** | finished-goods: catalog SKU (nullable vintage + `isNonVintage`), bottling run, run↔lot source links (all-nullable origin), 1:1 continuable-bottle projection | `schema:569-659,1389-1414` |
| **StockMovement / BottledInventory / FinishedGood(Inventory)** | finished-goods ledger (`RECEIVE/ADJUST/TRANSFER/SALE`) + cached balances | `schema:663-754` |
| **LotTreatment / AnalysisPanel / AnalysisReading / Sample / LotTastingNote** | measurements riding the timeline: additions/finings, chem panels (analyte = code-validated string, not enum), lab samples with lifecycle, sensory notes | `schema:1524-1800` |
| **CostLine / SupplyLot / SupplyConsumption / OperationCostTransfer / LotCostState / BarrelAsset / BarrelFill / CostVarianceEvent** | Phase-8 cost DAG projection over the ledger | `schema` (cost block) |
| **ComplianceReport / ComplianceProfile** | one generalized TTB filing table (two form types) + per-tenant filing profile | `schema:1820-1875` |
| Integrations | `AccountingConnection`/`CostExportEvent`/`ApExportEvent`/`AccountingDelivery` (QBO); `Commerce7*`/`SalesExportEvent` (DTC) | `schema` (accounting/commerce blocks) |

**`VesselComponent`** (`schema:504-523`) is the **retired** pre-ledger projection — superseded by the
Lot/VesselLot spine, kept for legacy/Day-Zero reads only.

---

## 2. Event / operation types that exist

`OperationType` enum (`prisma/schema.prisma:876-911`; TS `src/lib/ledger/vocabulary.ts:9-37`). **All 21
values have a wired writer** [IMPLEMENTED]:

`SEED` (`bulk/actions.ts:122`, bottling-reversal restore), `RACK` (`vessels/rack-core.ts`), `LOSS`
(`cellar/loss.ts:52`), `ADJUST`/`DEPLETE` (`bulk/actions.ts:184,241`), `BOTTLE` (`bottling/run.ts:131`),
`ADDITION`/`FINING` (`cellar/addition.ts` via config), `TOPPING` (`cellar/topping.ts`), `FILTRATION` &
`CAP_MGMT` (`cellar/treatments.ts`), `BLEND` (`blend/blend-core.ts:241`), `CRUSH`
(`transform/crush-core.ts`), `PRESS`/`SAIGNEE` (`transform/press-core.ts`), `TIRAGE`/`RIDDLING`/
`DISGORGEMENT`/`DOSAGE`/`FINISH` (`sparkling/*-core.ts`), `REMOVE_TAXPAID` (`compliance/removal-core.ts`),
`CORRECTION` (reversal cores only). Line-level `reason` is a controlled enum
(`vocabulary.ts:77-100`).

**Not modeled as ledger ops:**
- Fermentation **start/inoculation** — AF/MLF are `Lot` vectors recorded via `LotStateEvent`, not ops. [by design]
- **Evaporation / angel's share** — a *derived* concept (`reason:"evaporation"` = "DERIVED from topping,
  not a recorded event", `vocabulary.ts:85`); no periodic evaporation op. [by design]
- **Bâtonnage / pump-over / punch-down** — folded into the single volume-neutral `CAP_MGMT` op; no
  dedicated bâtonnage or cold-stabilization (tartrate) op type. [ABSENT as distinct types]
- **Bottled/finished §B TTB removals** — only **bulk §A** `REMOVE_TAXPAID` is a ledger op; still-wine §B
  is folded from sales `StockMovement`, sparkling in-process §B is "a documented follow-on"
  (`compliance/removal-core.ts:16-19`). [PLANNED]

---

## 3. Operations, work orders & the correction model

**Ledger write model [IMPLEMENTED].** `runLedgerWrite` (`src/lib/ledger/write.ts:38-67`): single
`$transaction` at `Serializable`, `withWriteRetry(...,5)` on P2034, tenant from ALS via
`requireTenantId()` (fails closed), `SET LOCAL app.tenant_id` first (RLS). `writeLotOperation`
(`write.ts:107-294`): `assertBalanced` (Σ deltaL≈0), cross-tenant guard, folds VesselLot (non-negative +
0.01 L dust sweep), enforces vessel capacity, then folds barrel-fill cost, BottledLotState, and the
legacy `vessel_component` table in the same tx. DB CHECK constraints (`volumeL>0`, `deltaL<>0`) live in
raw migration SQL (`schema:864-865`).

**Correction model [IMPLEMENTED] — append-a-reversing-event, never mutate/delete.** This is the
architectural centerpiece and the incumbents' #1 pain (VISION "Moat honesty").
- Universal dispatcher `reverseOperationCore` (`src/lib/ledger/reverse.ts:107-154`): loads op, fails closed
  if missing/cross-tenant/already-reversed, routes by `reversibilityOf(type)` to a family core: cellar
  (`correctOperationCore`), rack (`revertTransferCore`), sparkling (`reverseSparklingOperationCore`),
  bottle (`reverseBottlingRun`), transform (`reverseTransformCore`), blend (`correctBlendCore`).
- **LEDGER-10** (D6): undo = a new `CORRECTION` op whose lines are the exact inverse, linked via
  `correctsOperationId @unique` (double-correct dies at the DB). Guard: `verify:reverse`.
- **LEDGER-11** (D15): a correction is **blocked if any later non-correction op touched the affected
  (vessel,lot) positions** (`reverse-guard.ts:16-28` `laterTouchedKeys` excludes CORRECTIONs, enabling
  LIFO chain-unwind), not merely on volume availability. Guard: `verify:reverse-transform`.
- Compensating op carries the corrected op's `observedAt`, so amending a filed period drives an Amended
  TTB report (`cellar/correct.ts:120`). Cost is negated by identity (`negateCostForReversedOp`).
- **No-undo ops:** `CORRECTION`, `SEED`, `ADJUST`, `DEPLETE` are non-reversible via the dispatcher
  (`reverse.ts:84-87`) — the remedy is recording a new adjustment. [gap]

**Work-order engine [IMPLEMENTED core; PLANNED extensions].** Task kinds `OPERATION`/`OBSERVATION`/
`MAINTENANCE`/`NOTE` (`schema:2585-2590`). **State changes at completion, not approval** (WORKORDER-1):
completing an OPERATION task writes the real immutable ledger op through the family **tx-forms**
(`rackWineTx`/`topVesselTx`/`filterVesselTx`/`capManagementTx`/`crushLotTx`/`pressLotTx`/
`recordNeutralDoseTx`) inside **one** `runLedgerWrite` (`execute.ts:64-208,293-348`); the attempt sits
`PENDING_APPROVAL`. Approve = flip task state, no op mutation; **reject = `reverseOperationCore`**
CORRECTION (blocked → compensates, restores PENDING_APPROVAL) (`approval.ts`). Reservations are
**advisory/expiring, WARN-not-block**; hard guarantee only at commit (WORKORDER-2). Authority = **admins
only in v1**; full RBAC deferred to Phase 23 (`authority.ts:11-14`). MAINTENANCE supply use is OVERHEAD,
never wine COGS (WORKORDER-3). **[PLANNED]:** NL/voice WO authoring (the flagship AI wedge), shared
vineyard reuse (Phase 20).

---

## 4. TTB / compliance engine state

One generalized `compliance_report` table backs **two forms**, `formType`-scoped so filing chains never
cross (`src/lib/compliance/form-type.ts`).

**[IMPLEMENTED] end-to-end (compute → DRAFT → gate → FILE → fill real PDF):**
- **F 5120.17 Report of Wine Premises Operations** (`OPS_FORM`): `generate.ts` (`foldPeriod` line 229,
  `generateReport` 415, `markReportFiled` 471), pure fold `period-fold.ts`, single op→line map
  `form-map.ts` (§A 1–31 / §B 1–20, disposition table, footnotes), `tax-class.ts`, `abv.ts`,
  `anomaly.ts`, `fill-pdf.ts` + real fieldmap JSON. Guard `verify:ttb`.
- **F 5000.24 Wine Excise Tax Return** (`EXCISE_FORM`): `excise.ts` (`computeExcise` 96),
  `generate-excise.ts`, `removals.ts`, fills real `TTB-5000.24-fillable.pdf` (wine-only lines). Guard
  `verify:excise`.
- **Tax-class derivation** — pure point-in-time `deriveTaxClass()` (`tax-class.ts:51-99`), six classes
  `A_LE16/B_16_21/C_21_24/D_CARBONATED/E_SPARKLING/F_HARD_CIDER`; missing ABV → class A + `needsAbvReview`.
- **CBMA credit ladder** — full stepped ladder 30k/100k/750k (`cbma.ts:78`), **stateless YTD** recomputed
  as a wider window each generation (no persisted ladder).
- **`REMOVE_TAXPAID`** — reversible ledger op (wine born in-bond; taxable event = removal), bulk §A only.
- **Cadence / amend / carry-forward** — `MONTHLY/QUARTERLY/ANNUAL` (ops) + `SEMIMONTHLY` (excise);
  `ORIGINAL/AMENDED` version; 5120.17 begin-balances carry from prior FILED `onHandEnd`; excise is
  stateless. Filing-deadline reminders shipped (Phase 027).

**[PLANNED] / v1 boundaries (in code):** sparkling in-process §B removals (`removal-core.ts:17-19`);
controlled-group tier apportionment (parameterized, "v2", `excise.ts:66-74`); Part IV/VII crush/saignée
lines stubbed to `null` (`form-map.ts:93-96`); September accelerated excise due dates
(`return-cadence.ts:12-13`). State/DTC compliance (Phase 14 remaining).

**[ABSENT]:**
- **Transfer-in-bond / bonded-winery transfer flows** — §A lines 7/15 and §B lines 3/4/9 exist only as
  static labels; **no operation posts to them** (`form-map.ts` has no case; `form-labels.ts:23,29,47-51`).
  No bond instrument/amount/penal-sum/premises entity anywhere in schema or `src/lib/compliance/`.
- **International compliance** — **no** Australian WET, **no** NZ excise/GST, no non-US form/engine/
  schema. Engine is **US-federal-TTB-only**. (`NZD`/`AUD` appear only as currency display symbols.)
- **Formula wine / TTB formula approval** (F 5100.51, natural vs. special-natural) — absent.

---

## 5. Lot / blend naming & ID generation (quoted code paths) — the priority focus

**Internal identity vs. code — the current split:**
- `Lot.id` is a **cuid surrogate** (`schema:1139`); lineage (`LotLineage`), all operation lines, cost,
  and every FK reference the **id**, not the code.
- `Lot.code` is a **human label**, unique per tenant (`@@unique([tenantId, code])`, `schema:1206`).
- **Design intent is stated in code:** *"The code is a LABEL, not identity (D3); it is generated once at
  creation and immutable after (INVARIANTS) — the only exception is the one-time legacy recode."*
  (`src/lib/lot/code.ts:3-5`). INVARIANTS.md §Identity: *"code, origin, vintageYear immutable after the
  first operation."*

**Code construction [IMPLEMENTED] — hardcoded scheme, not a winery template:**
- Lot code = `YEAR-VINEYARD-BLOCK[-SUBBLOCK]-VARIETY[-TAG]`, composed by the **pure** `buildLotCode`
  (`src/lib/lot/code.ts:45-64`): vintage + vineyard-abbr + optional block/subblock tokens + variety-abbr
  + optional free `tag`; empty optional slots dropped; vintage/vineyard/variety **required**.
  `normalizeAbbr` forces 2–4 alphanumerics (`code.ts:16-22`).
- Blend code = `[vintage]-BL-<TOKEN>` or `NV-BL-<TOKEN>` (`buildBlendLotCode`, `code.ts:92-97`) —
  **deliberately no vineyard/variety segment** ("a multi-source blend must not masquerade as
  single-origin"); `<TOKEN>` is a winemaker-set 2–4 **letter** free tag (`normalizeBlendToken`,
  `code.ts:73-82`).
- Uniqueness/collision: `disambiguate(base, existing)` appends `-2`, `-3`, … (`code.ts:103-110`).
- Assignment: `nextLotCode` / `nextBlendLotCode` (`src/lib/lot/generate.ts:23-46`) compose the base then
  disambiguate against `lot.code startsWith base` inside the caller's tx; P2002 → `isUniqueViolation`.
- **The token order and segment vocabulary are hardcoded in `buildLotCode`.** There is **no
  winery-defined naming template, no configurable token set, no per-tenant scheme, no UI to edit the
  pattern.** ROADMAP calls the whole lot-code feature an *"Unplanned bonus; lives in
  `src/lib/lot/{code,generate}.ts`"* (`ROADMAP.md:206`).

**What happens to codes/names through the flows:**
- **Blend** — `NEW_LOT` mode mints a new blend code; `GROW_EXISTING` **keeps the resident lot's immutable
  code** (`code.ts:88-90`; `blend/blend-core.ts`).
- **Split (press/saignée)** — each child gets its **own** generated code, tag derived from the fraction
  label (FR/light/hard/rosé) (`transform/press-core.ts:212-239`).
- **Rename** — **[ABSENT].** No application path updates `Lot.code` after creation. The **sole** exception
  is the one-time CLI `scripts/recode-legacy-lots.ts` (a self-declared DECLARED EXCEPTION to the
  immutability invariant), which also rewrites the durable `lotCode` snapshots on `lotOperationLine`
  rows. There is **no** user-facing rename, and there is **no separate `displayName` field** — `code`
  doubles as the unique key and the label, so a free rename would collide with `@@unique([tenantId,code])`
  and with the immutable line-level snapshots.
- **Ownership change** — **[ABSENT]** as an operation (see §6); does not touch code either way.

**Gap vs. the target architecture** (immutable surrogate id carries lineage — *already true*; user-facing
code is a renameable, winery-templated presentation layer — *not true*): today the code is immutable,
scheme-hardcoded, and doubles as the unique key. There is **no invariant separating internal identity
from a mutable naming layer** — D3/INVARIANTS instead *pin the code as immutable*, which is the opposite
of "renameable anytime."

---

## 6. Ownership (custom crush / AP)

- `LotOwnership = ESTATE | CUSTOM_CRUSH_CLIENT` (`schema:1069-1072`). Drives **only the cost roll-up**:
  ESTATE capitalizes to winery inventory; CUSTOM_CRUSH_CLIENT suppresses fruit/wine cost from the estate
  roll-up and routes supply draw-downs to a billable-expense CostLine (read only in `cost/data.ts`,
  `cost/cache.ts`). [IMPLEMENTED, cost-only]
- **No "change ownership" operation** — `ownership` is never written by any app path (only the schema
  default at create; a non-default value is set only in a test helper `scripts/verify-cost.ts:49-50`). No
  UI/action/core mutates it; retro-changing it would need a cost recompute that isn't implemented. [ABSENT]
- Custom-crush client **portal**, alternating-proprietorship separate filing, billing (services × rates →
  invoices), and shared-premises/vessels across proprietor tenants are **[PLANNED]** (VISION D21; ROADMAP
  Phases 23–24, unbuilt). Granular RBAC is Phase 23 [PLANNED]; today = admin/user stub.

---

## 7. Migration / import tooling

- **Day-Zero legacy migration [IMPLEMENTED, internal-only].** `scripts/migrate-legacy-lots.ts` wraps each
  existing **`vessel_component`** row as an `isLegacy` Lot at current volume via a `SEED` op
  (`captureMethod:"IMPORT"`), idempotent by machine code `LEGACY-<componentId>` (line 26), fabricates NO
  lineage, doesn't touch `vessel_component`/`BottlingSource.lotId`, aborts on >0.01 L per-vessel drift.
  **It reads the app's own prior table, not any external file, and discards any existing code** (D11).
  Then `scripts/recode-legacy-lots.ts` optionally rewrites `LEGACY-*` codes to `YEAR-VINEYARD-VARIETY`.
- `Lot.isLegacy`/`legacySnapshot` (`schema:1156,1170`) are **migration-only plumbing** — read/written only
  by those two scripts; the running app never branches on them.
- **Packaged-goods CSV import [IMPLEMENTED, narrow].** `src/lib/inventory/csv.ts` (`parseInventoryCsv`) +
  server action `importInventory` (`inventory/actions.ts:291-341`) + `ImportCsvModal.tsx`: columns
  `Item,Vintage,Category,Location,Quantity`, RECEIVEs into the **finished-goods** stock ledger only. Max
  2000 rows.
- **[ABSENT] today:** any import of **bulk wine lots, vessel/tank contents, cost basis, chemistry/
  analyses, work-order history, tax events, ownership, or lineage**; any opening-balance/starting-
  inventory onboarding flow (onboarding seeds only an *empty* material **catalog**,
  `src/lib/onboarding/seed-starter-materials.ts`, `openingQty:null`); any bulk-entry HTTP API. A brand-new
  tenant with no `vessel_component` rows has **no tool to establish opening tank/barrel volumes**.
- **[PLANNED] Phase 13 — "Migration & onboarding (import from Vintrace / InnoVint)"** (`ROADMAP:745-770`,
  **unbuilt, gated on a real design partner's export**): AI-assisted import of the winery's *own exports*
  (never scraping); **reuse the D11 legacy-lot pattern as the import spine**; **`sourceSystem` +
  `sourceId`/`legacyCode` external identifiers** on key entities (so the winery recognizes their data and
  re-imports are idempotent); US-unit import (gallons/lbs·tons/°Brix → canonical liters, D8); explicit
  coverage gaps (import what the model covers, snapshot the rest). **None of this exists yet.**

---

## 8. Where implementation diverges from DESIGN.md / ROADMAP.md / VISION

- **DESIGN.md is a *visual* system doc** (tokens, type, color) — it carries **no domain/naming/compliance
  model**, so "divergence from DESIGN.md" is not applicable to the domain topics; the domain contract
  lives in VISION.md (D1–D26) + INVARIANTS.md + ROADMAP.md.
- **Naming is an "unplanned bonus"** (`ROADMAP:206`) — the readable lot-code system was built ahead of any
  roadmap item, and there is **no roadmap entry** for winery-defined naming templates, rename, or a
  display-name layer. The code's own comment asserts immutability (`lot/code.ts:3-5`), consistent with D3
  but **diverging from the "renameable presentation layer" target** the teardown is asked to evaluate.
- **`Lot.status`** declares `DEPLETED` and `ARCHIVED` but **neither has any writer** — a fully drawn-down
  lot stays `ACTIVE` (VesselLot row deleted); only `CORRECTED` is ever written. No close/archive lifecycle.
  [partial vs. the implied lifecycle]
- **`LotLineage kind:"TRANSFORM"`** is documented in the schema but **never produced** by any code path.
- **Ownership** is a first-class *vision* dimension (D21) but today is a cost-only static attribute with no
  change operation (§6).
- **Referenced strategy docs are missing** (`docs/competitive-analysis-*`, `docs/STRATEGY.md`) — VISION
  points at analysis that doesn't exist in-repo.

---

## 9. Phase status snapshot (`ROADMAP.md`)

**Shipped ✅:** 0 (guardrails), 1 (lot+ledger spine), 2 (timeline), 3 (cellar ops), 4 (chem/tasting),
5 (blends+lineage+RBAC-redesign), 6 (state transforms+ferment), 7 (sparkling/continuable-bottle),
8 (supplies+cost roll-up incl. barrel amortization + custom-crush routing), 12 (multi-tenancy, in prod),
15 (QuickBooks two-way).
**Partial 🟨/🟦:** 9 (work orders — core+templates+crush/press shipped; NL/voice authoring + vineyard
reuse remain), 14 (compliance — 5120.17 + 5000.24 + reminders shipped; state/DTC remain), 16 (DTC/
Commerce7 — built, pending live verification), 10 (assistant coverage — substantial per project history,
marked ⬜ in ROADMAP).
**Unbuilt ⬜ [PLANNED]:** 11 (labor/payroll), **13 (migration — the GTM wedge)**, 17 (Stripe billing),
18 (visual cellar floor plan), 19 (AI dashboards), 20 (vineyard ops), 21 (god-mode/sandbox/onboarding),
22 (self-healing bug loop), 23 (granular RBAC), 24 (custom crush + client portal), 25 (ambient OCR
capture), 26 (scenario sandbox + blend solver), 27 (institutional memory), 28 (offline-first + sync),
29 (sensor/telemetry), 30 (harvest depth).

---

## 10. How to use this brief (for teardown agents)

- Tag every Cellarhand comparison **[IMPLEMENTED] / [PLANNED] / [ABSENT]** using §§1–9 above.
- The **durable moat** to test the incumbents against is the append-only ledger + append-only corrections
  (§3) and the surrogate-id/label split (§5). The **table stakes** are compliance (§4) and offline/mobile.
- Priority tension for the identity/naming agent: **surrogate id carries lineage today (good), but the
  code is immutable + scheme-hardcoded + doubles as unique key, with no template and no rename** (§5).
- Migration reality: **Phase 13 is unbuilt**; the only real ingest is the internal legacy-lot script +
  a finished-goods CSV; **incumbent codes are currently discarded** (§7).
