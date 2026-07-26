---
title: "S3a — Spray application record + planned harvest date"
program: Spray Intelligence
phase: S3a
wave: 1
lane: C
type: feat
status: council-reconciled
date: 2026-07-26
council_feedback: ./S3a-council-feedback.md
branch: claude/s3a-spray-application-record-2572f2
depth: deep
units: 15
prs: 3
runbook: ../SPRAY_ASSISTANT_RUNBOOK.md
brief: ../spray-decision-discovery-brief.md
council: ../RUNBOOK-council-feedback.md
blocks: [S7a, S8, S6, S7b, S9, S3b]
depends_on: []
---

> **Council-reconciled 2026-07-26.** Reviewed by Codex (types, data layer, concurrency) and Gemini
> (domain, liability, UX); every finding adjudicated in
> [S3a-council-feedback.md](./S3a-council-feedback.md). Two findings changed the design:
> **a correction no longer re-resolves the facts snapshot** (Gemini G1 — the original decision
> violated rule §3.8 and is reversed), and **the `String[]` snapshot columns no longer overload
> "unknown" onto `[]`** (Codex C7 — rule §3.6's worst failure mode was built into the schema and is
> now blocked by a database CHECK). Four of the six open questions are closed; three new ones are
> open. Changed sections are marked **⟳ council**.

## Overview

Build the **spray application record** — the table every other phase in this program reads — and the
**planned harvest date** as an audited event stream. Structure is one **header** (the pass) plus
**three line tables** (materials, mixing order, blocks), lifted cell-for-cell from the real work
order at `docs/spray orders/Spray work order template.xlsx`.

Nothing here models disease, weather, or legality. This phase produces **facts a human asserted
about an application that happened**, stored so that (a) they can never silently change, (b) a
mistake is corrected by appending a new revision rather than editing the old one, and (c) a decision
made in September still means in November exactly what it meant in September.

This is the critical path. `S7a` (legality + rotation), `S8` (lot residue), `S6` (residual decay),
`S7b` (weather interlocks), and half of `S9` all read these tables. It blocks Wave 2.

## Problem Frame

**The user.** A vineyard manager who today records a spray as a name in a checkbox list on a weekly
field note — `FieldNote.spraysApplied` is `[{ name, scope, blockIds }]` with no date, no rate, no
product identity, no applicator (`prisma/schema.prisma:1115`). That record cannot answer *"when did
Block 4 last get a Group 11 material, and is it still protected?"* It cannot answer *"is this fruit
past PHI?"* And a regulator asking for a pesticide-use report gets nothing.

**The job.** Not "log a spray." The job is: **make the pass replayable.** Every downstream engine in
this program is a clock or a join over this table, and each of them will be asked, months later, to
explain a past decision. That is the whole design constraint.

**Cost of doing nothing.** Wave 2 cannot start. S7a has nothing to check PHI against, S8 has nothing
to roll into a lot, S6 has no application timestamp to decay from.

**Pressure test — is this the right problem?** Two framings were considered and rejected:

- *"Just enrich `FieldNote.spraysApplied` with a product id and a date."* Rejected. `FieldNote` is a
  **mutable, upsert-in-place** row keyed `(tenantId, vineyardId, weekOf)`
  (`src/lib/fieldnotes/actions.ts:116`). A regulatory record and a residual-clock input cannot live
  on a row that gets overwritten every time someone reopens the week's note. The whole value of this
  phase is the immutability the field note deliberately does not have.
- *"Wait for ROADMAP Phase 20 and let the vineyard work-order engine own it."* Rejected, and this is
  the load-bearing scheduling call: Phase 20 is a **cost and equipment** program, it is unscheduled,
  and Wave 2 needs the record now. S3a builds the row; Phase 20 later becomes an **authoring surface
  over it**, never a parallel table. The seam is drawn explicitly in §"The Phase 20 seam" below.

**What this phase deliberately does NOT decide:** whether a spray was legal, whether it rotated,
whether protection still holds, or whether it dried before the rain. It stores what is needed to
answer those, and it stores *"we do not know"* as a first-class value everywhere it applies.

## The real template — verified field inventory

Opened `docs/spray orders/Spray work order template.xlsx` with `openpyxl` (one sheet, 41 rows × 8
cols, blank form). Confirms brief §17.3 exactly. Every populated label cell:

| Region | Cells | Labels |
|---|---|---|
| **Header** | A1:H5 | `A1 Vineyard name` · `A2 Operator` · `A3 Application method` · `A4 Spray rig` · `A5 Tractor` · `D1 Start date` · `D2 Finish date` · `D3 Tank` · `F1 Spray Vol/Acre` · `F2 Gear setting` · `F3 Ground speed` |
| **Material lines** | header row 7, data rows 8–15 | `A7 Materials` · `C7 Active ingredient` · `F7 REI` · `G7 PHI` · `H7 Quantity` |
| **Mixing-order lines** | header row 17, data rows 18–24 | `A17 Material to apply (mixing order)` · `E17 Amount per tank` |
| **Block lines** | banner `A25`, header row 26, data rows 27–38, `A39 Totals` | `A26 Vineyard name` · `B26 Blocks` · `C26 acres` · `D26 est. # of tanks` · `E26 Start time` · `F26 Stop time` · `G26 Tanks used` · `H26 Gal used` |

**Correction to ROADMAP Phase 20 (`ROADMAP.md:1240-1241`).** That line says the template *"omits REI
and applicator license."* It is half wrong. **The template carries REI at F7 and PHI at G7.** Only
**applicator license** is genuinely absent — along with **target pest** and **weather at
application**. Fixing that line is a deliverable of this plan (Unit 15).

**Fields the decision layer needs that the template lacks:** applicator license · target pest ·
wind speed, wind direction, and temperature as **distinct columns** (council S5 — CA PUR and
drift-mitigation rules require speed *and* direction) · `adjuvantClass` per material line (council
C9) · whether the spray dried before rain (brief §4.2) · every-row vs alternate-row · dilute vs
concentrate · per-block **computed rate/acre**, tank-batch reference, and **deposition evidence**
(council S4).

## Requirements

**MUST**

1. Header + three line tables, tenant-scoped, full `AGENTS.md` Phase-12 checklist (RLS `ENABLE` +
   `FORCE` + `tenant_isolation` with `USING` **and** `WITH CHECK`, composite FKs, app_rls grants).
2. **Append-only, correction-as-event** (rule §3.14). An in-place content edit is refused by the
   database, not only by application code.
3. Every material line carries a **facts-as-of snapshot** (rule §3.8 / council C4): resolved active
   ingredients, resistance groups, PHI, REI, rainfast period, mobility class, plus a facts revision
   and as-of date. Decisions replay under **facts-as-of-then**.
4. **No foreign key to S2's tables.** The EPA registration number is stored as a string — the
   durable natural key. A spray record must survive a product being de-registered, and this is what
   keeps lane C parallel to lane B.
5. `driedBeforeRain` is **derived**, never self-reported (council S3), with an **attributed operator
   override** that is itself an append-only observation.
6. **Planned harvest date** per block per vintage is an **audited event stream**, point-in-time
   readable (council D4), and its mutation emits a typed payload S7a can hang a reverse-check on
   (council C8).
7. Wind speed, **wind direction**, and temperature are **distinct columns**, not a weather blob
   (council S5).
8. A product unknown to S2/S2b resolves to **unknown**, never *clear* (rule §3.6). This must be
   provable **today**, before S2 exists.
9. Legacy `FieldNote.spraysApplied` surfaces as a **low-confidence record, not an absence** (council
   S11). The system **suggests** a name→product mapping; a **human confirms** it; never
   LLM-auto-applied (rule §3.2). Unconfirmed legacy records count as **unknown** in the rotation
   budget.
10. **Never bricks outside the US** (rule §3.9). Bhutan has no EPA registration number; the record
    must still be enterable, and the facts snapshot resolves to `UNKNOWN`, not to an error.
11. `verify:spray-record` e2e on Demo Winery; QA report per `qa/QA-PROTOCOL.md`.

**SHOULD**

12. Per-block **computed rate/acre** with an explicit basis (measured vs assumed) — council S4.
13. **Deposition/coverage evidence** per block line, so S6's confidence can legitimately fall when
    none exists (council S4 + brief §12).
14. Equipment/tank columns stored as plain columns now so Phase 20 has somewhere to hang its joins.
15. A minimal authoring + read surface, so the standing QA gate has something to drive.

**NICE**

16. A tank-batch reference per block line (multiple blocks off one mixed tank).

## Scope Boundaries

**In scope:** the five new tables + enums + migration; `src/lib/spray/` cores; the additive read
seams in `src/lib/fieldnotes/` and `src/lib/harvest/`; `verify:spray-record`; unit tests; invariant
notes; a minimal surface; the QA pass.

**Out of scope, and why:**

| Excluded | Why |
|---|---|
| **S3b — the season program / spray plan** | This lane's SECOND PR. Blocks nothing. Its whole risk (a plan is never evidence) deserves its own gate. |
| **Any legality, rotation, PHI, or residual evaluation** | S7a / S6. S3a stores inputs and emits hooks; it decides nothing. |
| **`src/lib/pesticide/` — anything at all** | Lane B (S2). Hard boundary. S3a reaches product facts only through an injected port. |
| **`src/lib/weather/` — anything at all** | Lanes A/D (S0/S1). `driedBeforeRain` derivation ships with a stubbed precipitation port. |
| **The assistant tools** | Rule §3.15 — one read tool (S5a→S9) and one write tool (S11) for the whole program. S3a's cores go on `INTERNAL` with a named retirement condition. |
| **Cost, equipment registry, fuel, labor, PUR export** | ROADMAP Phase 20. See the seam below. |
| **Label-PDF extraction, product master curation** | S2b. |

**Lane boundary (files this lane owns):** `prisma/schema.prisma` + its one migration ·
`src/lib/spray/**` · **new files only** in `src/lib/fieldnotes/` and `src/lib/harvest/` ·
`scripts/verify-spray-record.ts` · `scripts/verify-tenant-isolation.ts` (append one case) ·
`scripts/ai-native-allowlist.mjs` (append entries) · `test/spray-*.test.ts` ·
`test/tenant-isolation.test.ts` (append one case) · `docs/spray_assistant/**` · one route group under
`src/app/(app)/vineyards/`.

⚠️ **S4 also touches `src/lib/fieldnotes/`.** S3a's field-note work is **purely additive** — a new
`legacy-spray-core.ts` file, no edit to `types.ts` or `actions.ts`. See KD-9.

## The Phase 20 seam — drawn explicitly

**S3a's row is the row Phase 20's work order will later write.** Phase 20 becomes an authoring
surface over these tables. It must never create a parallel spray table.

| Template field | Owner | Where it lands in S3a |
|---|---|---|
| Vineyard, operator, **applicator license** | **S3a** (decision + compliance) | `spray_application.vineyardId`, `.applicatorName`, `.applicatorLicense` |
| Application method, start/finish datetime | **S3a** | `.applicationMethod`, `.startedAt`, `.finishedAt` |
| Spray vol/acre, ground speed, tank size | **S3a** (coverage inputs, brief §12) | `.sprayVolumePerHaL`, `.groundSpeedKph`, `.tankVolumeL` |
| Target pest, wind speed/direction, temperature | **S3a** (template lacks all three) | `.targetPest`, `.windSpeedKph`, `.windDirectionDeg`, `.airTempC` |
| Materials, AI, REI, PHI, quantity, adjuvant class | **S3a** | `spray_material_line.*` |
| Mixing order + amount per tank | **S3a** (compatibility rule, brief §8.5) | `spray_mix_order_line.*` |
| Blocks, acres, start/stop time, computed rate, deposition | **S3a** | `spray_block_line.*` |
| **Spray rig, tractor, gear setting** | **Phase 20** (machine-hours, fuel) | Stored by S3a as plain `String?` columns — `.sprayRigName`, `.tractorName`, `.gearSetting`. Phase 20 adds `sprayRigEquipmentId` / `tractorEquipmentId` beside them and backfills. |
| **Est. tanks / tanks used / gal used** | **Phase 20** (consumable draw-down + cost) | Stored by S3a as plain columns on the block line — `.estTanks`, `.tanksUsed`, `.volumeUsedL`. S3a reads them only to compute a rate basis. |
| Labor, pay basis, per-block cost roll-up, PUR export | **Phase 20** | Not stored. Phase 20 joins on `spray_application.id` / `spray_block_line.id`. |

**The rule for Phase 20's planner:** additive columns and joins onto these tables. If Phase 20 finds
itself wanting a second spray table, the seam has been crossed.

**One constraint carried forward for Phase 20** (council GQ2): S3a has no approval object — rule
§3.1 puts authorization on the human at decision time, and the approve/finalize lifecycle arrives
with Phase 20's vineyard work orders. When it does, Phase 20 must define whether a **whole-pass
correction invalidates block-level approvals on blocks the correction did not touch**. Recorded here
so it is not rediscovered mid-build.

## Research Summary

Patterns found in the codebase that this plan reuses rather than reinvents. Every one verified.

**Append-only shapes already in the repo (four, and they are not interchangeable):**

| Shape | Example | Mechanism |
|---|---|---|
| A — signed-delta ledger | `LotOperation` (`schema.prisma:2546`) | `correctsOperationId Int? @unique` — *"any op can be corrected at most once (kills the double-correction race)"*; lines are signed deltas; reads fold the stream. |
| B — void-not-delete | `LotTreatment.voidedByOperationId` (`:2905`), `WeighTag.voidedAt` (`:1252`) | Row stays visible, marked void. |
| C — monotonic delta + posting key | `SalesExportEvent` (`:4646`) | `deltaSeq` on the projection row + `postingKey` unique = exactly-once; `reversalOf…Id` links a reversal. |
| D — closed-interval versioning | `VineyardGeometryVersion` (`:498`) | One open row per subject (`effectiveTo IS NULL`, partial unique); *"the moat is that the OLD geometry stays retrievable."* |
| E — amendment chain | `ComplianceReport.amendsReportId` (`:3227`) | *"FILED rows are IMMUTABLE: regeneration/amendment always writes a NEW row."* |

**Facts-as-of precedent — `COST-3-immutable-cogs-snapshot`.** `BottlingCostSnapshot`
(`schema.prisma:3738`) is the exact template: discrete typed columns for anything queried,
`componentBreakdown Json` for the human-readable decomposition, `costBasisAsOfOperationId Int?` as
the **watermark** naming which events the snapshot folded, `policyVersion Int` for the recipe
version, and `basisCompleteness CostBasisCompleteness` as a **three-state honesty enum** rather than
a silent zero (`COST-2-completeness-contagion`). The house rule extracted: *queried or compared →
discrete column; read by a human → Json; identifies which version of the facts → an Int watermark,
never a timestamp.*

**Tenant-scoped table template.** `prisma/migrations/20260726170000_forecast_schema/migration.sql`
is the cleanest recent example — table, `@@unique([tenantId, id])` composite-FK target, composite FK
`(tenantId, vineyardId) → vineyard(tenantId, id)`, NULL-tolerant numeric `CHECK`s, `ENABLE` +
`FORCE ROW LEVEL SECURITY`, the `tenant_isolation` policy, `GRANT … TO app_rls`, and a self-verifying
`DO $$ … RAISE EXCEPTION …$$` block asserting RLS and the policy actually landed. Copy it verbatim.

**K11 — cross-tenant FKs are raw SQL, not Prisma relations.** Composite `(tenantId, refId) →
(tenantId, id)` FKs are declared in the migration with a plain `String` column and **no Prisma
`@relation`**, because composite relations blow TypeScript type depth (`schema.prisma:2611`).

**Vineyard block acreage is NOT stored.** `VineyardBlock` (`:544`) holds `rowSpacingM`,
`vineSpacingM`, `vineCount`; area is derived by `blockAcres()` / `blockHectares()` in
`src/lib/vineyard/units.ts:57-75`, and that file says it plainly: *"the standard grower estimate
`rowSpacing * vineSpacing * vineCount`, NOT surveyed acreage."* Canonical storage is metric.

**No planned/estimated harvest date exists anywhere.** A repo-wide grep for
`plannedHarvest|estimatedHarvest|targetHarvest|harvestDate` returns zero. The only forward-looking
harvest field is `HarvestRecord.yieldEstimateKg`, written by `recordYieldEstimate`
(`src/lib/harvest/actions.ts:151`) as an **in-place upsert** — a live example of exactly the mutable
intent council D4 says not to repeat.

**No spray model exists.** `grep -i spray prisma/schema.prisma` hits only `FieldNote.spraysApplied`
and `FieldInput`. Greenfield.

**The field-note read seam is one function.** All three read paths funnel through
`parseFieldNoteRow` (`src/lib/fieldnotes/types.ts:277`), parsing
`InputApplication { name, scope, blockIds }` (`:69`). Normalization helpers already exist:
`cleanInputName` / `normalizeInputKey` (`src/lib/fieldnotes/sanitize.ts:13,30`).

**Core conventions.** Pure math cores import nothing outside their family and declare their own DTOs
with Decimals pre-coerced, so they never import `@prisma/client` (`src/lib/weather/read-core.ts:21`).
DB-touching cores that scripts must call use `import "server-only"` and avoid `"use server"` /
`next/cache` (`src/lib/ledger/reverse.ts:23`). `verify:ai-native` keys off the **`*Core` export-name
suffix**. `INTERNAL` in `scripts/ai-native-allowlist.mjs` takes `{ owner, reason, coveredBy }`;
`GAP_ALLOWLIST` is ratcheted at `MAX_ALLOWED = 2` and may only shrink.

**verify:* convention.** `scripts/verify-weather.ts` is the shape to copy: a `check(name, cond)`
harness, everything inside one `runAsTenant("org_demo_winery", …)`, `QA-`-prefixed fixtures seeded
with `Date.now()`, and a `try { …asserts… } finally { …cleanup child→parent… }`.

**Tests.** Vitest, flat `test/*.test.ts`, `environment: "node"`, `@/` alias, `server-only` stubbed
by `test/stub-server-only.ts`. Pure cores only — DB proof lives in `verify:*`.

## Key Decisions

### KD-1 — Correction is an **amendment chain** enforced by a Postgres trigger ⟳ council

A spray record is a document, not a quantity. Shape A's signed deltas do not apply; Shape B (void
only) cannot express *"the rate was wrong"*. Use **Shape E**, borrowing Shape A's uniqueness trick:

- The new revision carries `supersedesApplicationId String?` with a **`@@unique([tenantId,
  supersedesApplicationId])`** — a given revision can be corrected **at most once**, which kills the
  double-correction race exactly as `LotOperation.correctsOperationId @unique` does.
- The superseded row is marked with `supersededByApplicationId` + `status = SUPERSEDED` in the same
  transaction. This is **bookkeeping, not content**.
- Both links are real composite self-FKs in raw SQL, and the trigger permits `NULL → value` **once**
  and never `value → anything` (council C9 — the plan originally named the pointers without
  constraining them, which allowed a dangling or repointed chain).
- A `BEFORE UPDATE` trigger on **all six** tables — the four spray content tables plus
  `planned_harvest_date_event` and `spray_drying_override`, both of which are append-only and were
  omitted from the original scope (council C5) — **raises unless every changed column is on an
  explicit per-table allowlist** (the bookkeeping columns of KD-2). `planned_harvest_date_event`
  allowlists only `effectiveTo` and `status`; `spray_drying_override` allowlists nothing. This is
  what makes "an in-place edit is refused" a database guarantee rather than a code convention.
- A `BEFORE DELETE` trigger raises unless `current_setting('app.allow_spray_purge', true) = 'on'`
  **and** the connected role is not `app_rls` (council C15 — the flag alone is settable by the app
  role, so only an owner-context teardown can purge). A deliberate, named escape hatch used only by
  the QA/verify teardown, in the same spirit as `runAsSystem`.

**A void is a successor row, not the absence of one** (council C2). `correctionKind = VOID`,
`supersedesApplicationId` set, `status = VOIDED`, zero line children. The original design — "a void
writes no successor" — left the double-correction race wide open on the void path, because the
unique constraint only binds rows that *have* a predecessor: two concurrent voids, or a void racing
an amendment, would both commit. One mechanism, one constraint, no race.

### KD-2 — Content columns are immutable; **derived** columns are recomputable

A naive reading of rule §3.14 forbids ever writing `driedBeforeRainDerived` after insert, which
would make the derived-not-self-reported requirement impossible. Draw the line explicitly:

| Class | Rule | Examples |
|---|---|---|
| **Content** — what a human asserted | Immutable. Wrong ⇒ append a new revision. | product, quantity, blocks, acres, times, weather, applicator, the facts snapshot |
| **Bookkeeping** — supersession linkage | Writable once, allowlisted in the trigger. | `status`, `supersededByApplicationId` |
| **Derived** — what the system computed | Recomputable at will; carries its own `…DerivedAt` + basis. | `driedBeforeRainDerived`, `driedBeforeRainBasis` |
| **Override** — a human correcting a computation | Never a mutable column. Its **own append-only table**. | `spray_drying_override` |

This distinction becomes invariant `SPRAY-1` and the trigger's allowlist is its enforcement.

### KD-3 — Product facts arrive through an **injected port**; S3a ships the null implementation

`src/lib/spray/product-facts-port.ts` declares an interface S2b will later implement:

```
ProductFactsResolver.resolve(key: { epaRegistrationNumber?, tenantProductId?, productName })
  → ProductFactsSnapshot   // always returns; completeness is the honest answer
```

S3a ships `NullProductFactsResolver`, which always returns
`{ completeness: "UNKNOWN", source: "NONE", … all nulls }`.

This is the move that keeps lane C parallel to lane B **and** makes requirement 8 provable today:
with the null resolver wired, *every* record written in S3a resolves to `UNKNOWN`, and the gate
"a spray whose product is unknown resolves to unknown, never clear" is not a promise about future
code — it is the current, tested behavior. When S2b lands, it registers a real resolver and the
same test still passes for genuinely unresolvable products.

### KD-4 — Snapshot shape: discrete columns + `String[]` sets + one Json + a revision watermark ⟳ council

Direct lift from `BottlingCostSnapshot`.

- **Queried by engines → discrete typed columns:** `snapshotPhiDays`, `snapshotReiHours`,
  `snapshotRainfastHours`, `snapshotMobilityClass`.
- **Set-membership queries → Postgres `String[]`:** `snapshotResistanceGroups String[]` holding
  scheme-prefixed codes (`["FRAC:7","FRAC:11"]` for Pristine) and `snapshotActiveIngredientKeys
  String[]` holding normalized AI keys (`["SULFUR"]`), each with a **GIN index** (council C12 — these
  are the rotation-budget and residue read paths and the plan had no index for them). Both are
  directly queryable with Prisma's `has` / `hasSome` — which is what S7a's rotation budget and S8's
  *"any sulfur within 30 days of pick"* need. A premix therefore counts against **every** group it
  contains, by construction.
- **Human-readable decomposition → one Json:** `snapshotActiveIngredients` —
  `[{ name, percentByWeight, casNumber }]`.
- **Which facts → an Int watermark, never a timestamp:** `factsRevision Int?` plus `factsAsOf
  DateTime?` for display and `factsSource` for provenance.
- **The honesty flag → a three-state enum:** `factsCompleteness KNOWN | PARTIAL | UNKNOWN`. This is
  the `COST-2` mechanism and it is the single column that makes rule §3.6 mechanical.

⚠️ **Absence is a distinct state, enforced at the database — not a convention in one function**
(council C7, the most important finding in the review). Prisma scalar lists are non-nullable and
default to `[]`, so under the null resolver every row would carry `snapshotResistanceGroups = []` —
and any query path that does not go through `rotationContribution()` reads that as *"this spray used
no resistance groups."* That is rule §3.6's worst failure mode compiled into a column. The original
plan defended it only in the read core, which is not a defense.

Therefore: **`resistanceGroupsKnown Boolean` and `activeIngredientsKnown Boolean`**, with CHECKs —
`NOT resistanceGroupsKnown OR cardinality(snapshotResistanceGroups) > 0` and
`factsCompleteness <> 'KNOWN' OR (resistanceGroupsKnown AND activeIngredientsKnown)`. An empty array
with `known = false` means *we do not know*; an empty array with `known = true` is now impossible.
This pair is what invariant `SPRAY-3` guards.

### KD-5 — Canonical metric storage; the label's units preserved on the material line ⟳ council

The repo's canonical storage is metric (`src/lib/vineyard/units.ts:3`, weather in °C/mm/kph, vessels
in litres). Physical-science quantities are stored canonically so S7b can compare a stored
application temperature against an hourly forecast without a conversion: `airTempC`, `windSpeedKph`,
`groundSpeedKph`, `tankVolumeL`, `sprayVolumePerHaL`, `treatedAreaHa`.

**Exception — the material-line quantity is the legally-filed number.** Store it **as entered**
(`quantityEntered Decimal` + `quantityUnit` enum covering `GAL|QT|PT|FLOZ|LB|OZ|L|ML|KG|G`) **and**
canonically (`quantityCanonical Decimal` + `quantityDimension VOLUME|MASS`). The PUR export reprints
what the applicator wrote; the engines join on the canonical. Conversion lives in a pure
`src/lib/spray/units-core.ts`. Every `Decimal` carries an explicit `@db.Decimal(p, s)` (council C13)
and `units-core.ts` owns the rounding.

⚠️ **A quantity without a denominator is not a dose** (council G3 — the sharpest domain catch in the
review). `quantityEntered = 5 LB` can mean 5 lb **per acre**, 5 lb **per 100 gallons of carrier**, or
5 lb **total in the tank**, and the template corroborates the ambiguity: material lines are headed
"Quantity" (H7) while the mixing table is headed "Amount per tank" (E17) — two different bases,
neither labelled. Guessing hands the residual model an order-of-magnitude dose error.

Therefore **`quantityBasis SprayQuantityBasis { TOTAL_IN_TANK | PER_AREA | PER_CARRIER_VOLUME }`,
required.** `materialRatePerHa()` branches on it and returns `null` for a basis it cannot convert
(`PER_CARRIER_VOLUME` with no carrier volume recorded). Never a guess, never a default.

### KD-6 — Per-block **treated area is a snapshot**, never re-derived

`VineyardBlock` does not store acreage — it is derived from spacing × vine count and changes on
every replant or vine-count correction. If S6 re-derived area at read time, a past rate/acre would
silently change. `spray_block_line.treatedAreaHa` is written at entry (defaulted from
`blockHectares()`, operator-overridable **at entry**) and is immutable content thereafter. Same
reasoning, same class of bug, as `COST-3`.

### KD-7 — No per-(block × material) rate table

Council S4 asks for a per-block computed rate/acre; the naive shape is a block × material
cross-product table. Rejected: it doubles the correction surface (a corrected material line would
have to fan out to N block rows) for a value that is fully derivable.

Instead: `spray_block_line.computedVolumePerHaL` + `rateBasis MEASURED | HEADER_VOLUME | UNKNOWN`
stores the **carrier** rate with its provenance, and a pure core
`materialRatePerHa(application, blockLine, materialLine)` derives the **material** rate on demand,
returning `null` (never 0) when the inputs are absent. S6 calls the core.

### KD-8 — Planned harvest uses **Shape D**, not the amendment chain ⟳ council

The read S7a needs is *"what did we believe the harvest date was on 3 July?"* — point-in-time.
`VineyardGeometryVersion`'s closed-interval shape answers that in one indexed predicate:
`effectiveFrom <= T AND (effectiveTo IS NULL OR effectiveTo > T)`. Using a different shape from the
spray record is deliberate: different read, different mechanism.

**Split picks are ordinary viticulture** (council G4) — an August pick off a block for sparkling and
a late-September pick off the same block for a still red. A partial unique on `(tenantId, blockId,
vintageYear)` would silently overwrite the first and leave one pick with no PHI coverage at all. The
key therefore carries **`harvestPassLabel String @default("main")`**, and the partial unique is
`(tenantId, blockId, vintageYear, harvestPassLabel) WHERE "effectiveTo" IS NULL`.
**Carried to S7a:** the PHI check evaluates against the **earliest** open planned date for a
block-vintage — the early pick is the binding constraint.

**Retraction closes the open row and appends no successor** (council C3). *No open row* is how "no
planned date" is represented; a partial unique index permits zero matching rows. There is no such
thing as a `RETRACTED` open row, which is what the original wording left ambiguous.

**The event stream is its own outbox — there is no listener registry** (council C4, which replaced
the original design). An in-process callback is neither durable nor transactional, and losing a
harvest-date change on a crash or a second app instance would silently drop the C8 reverse-check —
a HIGH-severity safety signal. Instead the write core exposes
**`plannedHarvestChangesSince(cursor)`**, a **watermark read** over the append-only stream, deriving
`PlannedHarvestChange { blockId, vintageYear, harvestPassLabel, previousDate, newDate, direction:
PULLED_FORWARD | PUSHED_BACK | SET | RETRACTED }` by comparing consecutive versions. Same shape as
`LotCostState.computedThroughOpId` and the Commerce7 ingest cursor. S7a becomes a consumer with a
cursor, not a subscriber to a callback. A test asserts the derived `direction` is correct — that is
how "your data model must support that" is discharged concretely.

### KD-9 — The legacy field-note seam is **new files only**

S4 also works in `src/lib/fieldnotes/`. S3a adds `src/lib/fieldnotes/legacy-spray-core.ts` and
touches nothing existing — no edit to `parseFieldNoteRow`, `types.ts`, or `actions.ts`. The core
takes already-parsed `InputApplication[]` (S4-agnostic) plus the mapping rows and returns
`LegacySprayRecord[]`. Merge surface with S4: zero.

**Even a CONFIRMED mapping yields `confidence: LOW`.** A field note is week-bucketed with no
timestamp and no rate. A confirmed mapping can seed the **rotation** budget with a product identity;
it can never feed the **residual** model, which needs an application instant. The DTO carries
`usableFor: { rotation: boolean, residual: false, compliance: false }` so a downstream engine cannot
misread it. Unconfirmed ⇒ `rotationContribution: "UNKNOWN"`, which **blocks** a rotation-OK claim
rather than granting one.

Suggestion is a **deterministic normalized-name match** against the confirmed-mapping table and
`FieldInput` — never an LLM, never a fuzzy score (rule §3.2, council S11 as adjudicated).

### KD-10 — `epaRegistrationNumber` is nullable, because Bhutan is a live tenant

Rule §3.9. Product identity is a three-state `productIdentitySource EPA_REGISTRY | TENANT_DEFINED |
LEGACY_NAME_ONLY | UNKNOWN`. A null registration number is never an error and never blocks entry; it
resolves the facts snapshot to `UNKNOWN`, which is the designed behavior. `productName` is always
required — it is the one thing an applicator always knows.

### KD-11 — Entitlement posture

Rule §3.10 puts entitlement in the shared service layer. For S3a the correct posture is: **recording
and reading a spray record is never entitlement-gated.** Bhutan must be able to record a spray. Only
**facts resolution** is gated, and an unentitled or non-US tenant simply gets the null resolver. The
gate therefore lives on the port implementation (S2b), not on the record cores. Stated here so a
later phase does not bolt a toggle onto the wrong layer.

### KD-12 — Cross-site passes are allowed; PUR grouping resolves at read ⟳ council (rewritten)

The original decision rejected a write whose block lines span vineyards. **Council G6 overturned it,
and the argument is right:** contiguous plantings are routinely split into separate "vineyards" in
software for ownership or costing reasons and sprayed in one physical pass. Rejecting the write does
not prevent the operation — it pushes the crew to mis-attribute blocks, which corrupts the exact
compliance record this phase exists to produce.

The property the original decision was protecting is preserved by moving it one layer:
`spray_application.vineyardId` stays **required as the primary site** (defaulted from the first block
line), block lines may reference blocks in any vineyard in the tenant, and **PUR grouping is derived
at read time from each block line's own vineyard**, not from the header. The read DTO exposes
`isCrossSite` so the surface can flag it. Compliance is still filed per site; it is just resolved
where the site actually lives.

**A block may legitimately appear twice in one pass** (council G7): a tractor breaks down mid-block,
the crew flushes, repairs, and finishes later — possibly off a different tank batch. So the block
line carries `segmentNo Int @default(1)` and the unique is `(tenantId, applicationId, blockId,
segmentNo)`. The "enter once across ten blocks → ten block lines" round-trip is unaffected. When two
segments of the same block are more than **24 hours** apart the write core **warns** and suggests a
separate record — two dates mean two residual clocks — but does not block. (Threshold is open
question D3.)

### KD-13 — Timestamps are instants; site-local resolution happens at read

`startedAt` / `finishedAt` are UTC `DateTime`. PHI and REI day boundaries are computed in the
**winery operating timezone**, resolved via the existing `resolveSiteTimeZone`
(`src/lib/weather/site-time-core.ts:16`), never the viewer's. S3a stores the instant; S7a owns the
DST/boundary math (council S9). Storing a wall-clock string here would make that math impossible.

**But `plannedDate` is a date, not an instant** (council C6), and the repo already solved this once:
`FieldNote.weekOf @db.Date` is documented as *"written via the canonical UTC helper"* and
`src/lib/fieldnotes/week.ts` exports `toISODateUTC` / `parseISODateUTC`. A date-only value carried
through a JS `Date` shifts by a day for a non-UTC caller. So `plannedDate` crosses **every** boundary
— DTO, server action, core — as an ISO `YYYY-MM-DD` **string**, converted only at the DB edge with
those helpers. A test asserts a Pacific-timezone caller stores the date they typed.

### KD-14 — A correction **copies** the facts snapshot; it does not re-resolve it ⟳ council (reverses the original)

The original plan had the correction re-resolve product facts and stamp a new `factsAsOf`,
rationalized as *"a correction is a new assertion made now"*, and then listed the resulting drift as
an accepted risk. **Council G1 is right that this is a defect, not a risk.** An applicator fixing a
ground-speed typo in November would pull November's registration data onto a July application; if the
label changed in October, the legal meaning of the July spray silently changed. That is precisely
what rule §3.8 and council C4 exist to prevent — the plan reintroduced the bug it was written to fix.

**A correction copies the predecessor's snapshot verbatim**, `factsRevision` and `factsAsOf`
included. A material line re-resolves **only** when its own product identity changed
(`epaRegistrationNumber`, `tenantProductRef`, or `productName`) — that is a genuinely new assertion
about a different product, and only that line gets a fresh `factsAsOf`. Per-line, not per-document.

A useful consequence: with the snapshot copied, whole-document correction becomes semantically free,
which removes the main argument for the finer-grained per-line correction alternative. Open question
2 is closed by this decision.

## Data model

Seven new tables, all tenant-scoped, all on the Phase-12 checklist. All enums are **created with the
initial migration** — no `ALTER TYPE` on an existing enum, so the Windows enum rule does not bite.

**Every table** — not just the header — carries `tenantId String @default("")`, its own
`id String @id @default(cuid())`, `@@unique([tenantId, id])`, and `@@index([tenantId])` (council C1;
the original spelled these out only on the header, leaving two child FKs without a composite target).
**Every `Decimal` carries an explicit `@db.Decimal(p, s)`** (council C13) — 18,8 for volumes and
areas, 10,2 for speeds and temperatures, 4,2 for pH.

### `spray_application` — the pass header

| Group | Columns |
|---|---|
| Site | `vineyardId String` (composite FK → `vineyard(tenantId,id)`, `ON DELETE RESTRICT`) |
| Applicator | `applicatorUserId String?` · `applicatorName String` (durable snapshot, the `FieldNote.userEmail` pattern) · `applicatorLicense String?` · **`operatorIdNumber String?`** · **`countyPermitNumber String?`** (council G8 — CA PUR needs the Operator ID and the site's county permit, not just the applicator's licence) |
| Pass | `applicationMethod SprayApplicationMethod` · `startedAt DateTime` · `finishedAt DateTime?` · `targetPest String?` (entered) · **`targetPestCode String?`** (council GQ1 — a nullable slot so a coded DPR/EPA pest can land later without a migration; the code table is S2b's, PUR export is Phase 20's) · `rowPattern SprayRowPattern?` · `dilutionMode SprayDilutionMode?` |
| Coverage (brief §12) | `sprayVolumePerHaL Decimal?` · `groundSpeedKph Decimal?` · `tankVolumeL Decimal?` (tank **size**) · **`carrierWaterVolumeL Decimal?`** and **`sprayWaterPh Decimal?`** (council GQ3 — tank size is not the carrier volume used, and brief §8.5 makes water pH a first-class compatibility input: alkaline water hydrolyzes organophosphates and carbamates) |
| Weather at application (council S5) | `airTempC Decimal?` · `windSpeedKph Decimal?` · **`windDirection SprayWindDirection?`** (16-point + `CALM` + `VARIABLE` — the entered truth, KD-15) · `windDirectionDeg Int?` (CHECK 0–359; **measured/sensor only, never operator-typed**) · `relHumidityPct Decimal?` · `weatherObservedAt DateTime?` · `weatherSource SprayWeatherSource?` (`OPERATOR_OBSERVED \| STATION \| GRID_ESTIMATE` — rule §3.5: estimated stays labelled estimated) |
| Phase 20 columns | `sprayRigName String?` · `tractorName String?` · `gearSetting String?` |
| Correction (KD-1) | `status SprayRecordStatus` · `revision Int @default(1)` · `supersedesApplicationId String?` · `supersededByApplicationId String?` · `correctionKind SprayCorrectionKind?` · `correctionReason String?` |
| Provenance | `enteredById String?` · `enteredByEmail String` · `enteredAt DateTime @default(now())` · `captureMethod CaptureMethod @default(MANUAL)` (reuse the existing enum, `schema.prisma:2062`) · `commandId String?` · **`requestHash String?`** (council C8 — uniqueness is not idempotency) |
| Free text | `notes String?` |

Uniques/indexes: `@@unique([tenantId, supersedesApplicationId])` (at-most-once correction, now
covering voids too) · `@@unique([tenantId, commandId])` · `@@index([tenantId, vineyardId,
startedAt])` (the season read) · `@@index([tenantId, status])`.
Raw-SQL composite **self-FKs** on `(tenantId, supersedesApplicationId)` and
`(tenantId, supersededByApplicationId)` → `spray_application(tenantId, id)` (council C9).
CHECKs: `finishedAt IS NULL OR finishedAt >= startedAt` · non-negative on every measure ·
`windDirectionDeg BETWEEN 0 AND 359` · `relHumidityPct BETWEEN 0 AND 100` ·
`sprayWaterPh BETWEEN 0 AND 14` · `correctionKind = 'VOID'` implies no line children (enforced in the
core, asserted in verify).

### KD-15 — Wind direction is a compass enum, with degrees reserved for instruments ⟳ council

Council G5's failure mode is real: an exhausted operator at 7pm does not know "315", and a required
integer field gets a `0` typed into it — silently recording every spray as a north wind and
corrupting the drift record that CA PUR exists to check. The reviewer's own argument extends
further: **`CALM` and `VARIABLE` cannot be expressed in degrees at all**, and both are common,
legitimate answers. So the enum is the primary, entered truth and the degree column survives only for
a future measured value.

### `spray_material_line`

`applicationId String` (composite FK → `spray_application(tenantId,id)`, `ON DELETE CASCADE`),
`lineNo Int`, `@@unique([tenantId, applicationId, lineNo])`.

| Group | Columns |
|---|---|
| Product identity (KD-10) | `productName String` · `epaRegistrationNumber String?` · `tenantProductRef String?` · `productIdentitySource SprayProductIdentitySource` |
| Role (council C9) | `materialRole SprayMaterialRole` (`PESTICIDE \| ADJUVANT \| FERTILIZER \| OTHER`) · `adjuvantClass SprayAdjuvantClass?` (set iff role = ADJUVANT) |
| Quantity (KD-5) | `quantityEntered Decimal` · `quantityUnit SprayQuantityUnit` · **`quantityBasis SprayQuantityBasis`** (`TOTAL_IN_TANK \| PER_AREA \| PER_CARRIER_VOLUME` — council G3) · `quantityCanonical Decimal` · `quantityDimension SprayQuantityDimension` |
| As written on the form | `enteredReiHours Int?` (template F7) · `enteredPhiDays Int?` (template G7) · `enteredActiveIngredient String?` (template C7) |
| **Facts-as-of snapshot** (KD-4) | `snapshotPhiDays Int?` · `snapshotReiHours Int?` · `snapshotRainfastHours Decimal?` · `snapshotMobilityClass SprayMobilityClass?` · `snapshotResistanceGroups String[]` + **`resistanceGroupsKnown Boolean`** · `snapshotActiveIngredientKeys String[]` + **`activeIngredientsKnown Boolean`** · `snapshotActiveIngredients Json?` · `factsRevision Int?` · `factsAsOf DateTime?` · `factsSource SprayFactsSource` · `factsCompleteness SprayFactsCompleteness` |

Uniques/indexes: `@@unique([tenantId, applicationId, lineNo])` ·
**`@@unique([tenantId, applicationId, id])`** (council C10 — the mix-order FK must be
application-scoped, not merely tenant-scoped, or it could point at another pass's line) ·
`@@index([tenantId, applicationId])` · `@@index([tenantId, epaRegistrationNumber])` ·
`@@index([tenantId, factsCompleteness])` (the coverage report) · **raw-SQL GIN indexes** on
`snapshotResistanceGroups` and `snapshotActiveIngredientKeys` (council C12).
CHECKs: `adjuvantClass IS NULL OR materialRole = 'ADJUVANT'` ·
`NOT resistanceGroupsKnown OR cardinality(snapshotResistanceGroups) > 0` ·
`NOT activeIngredientsKnown OR cardinality(snapshotActiveIngredientKeys) > 0` ·
`factsCompleteness <> 'KNOWN' OR (resistanceGroupsKnown AND activeIngredientsKnown)`.

> **The entered-vs-snapshot pair is deliberate.** The template's REI/PHI are what a human copied off
> a label. The snapshot is what the registry said. A divergence is a data-quality signal S9 can
> surface; collapsing them into one column would destroy it.

### `spray_mix_order_line`

Separate from material lines because **mixing order is a compatibility rule** (brief §8.5:
water → compatibility agent → WDG → WP → SC → EC → surfactant/oil last), and the order a material is
poured in is not the order it was listed.

`applicationId`, `sequence Int`, `materialDescription String`, `amountPerTankEntered Decimal?`,
`amountPerTankUnit SprayQuantityUnit?`, `materialLineId String?` — the FK is composite on
**`(tenantId, applicationId, materialLineId)` → `spray_material_line(tenantId, applicationId, id)`**
(council C10), `ON DELETE SET NULL`. Nullable because **water and compatibility agents are mix-order
lines but not material lines** — which is also where the carrier water appears in the pour sequence.
`@@unique([tenantId, applicationId, sequence])`.

### `spray_block_line` — **the table S6 reads**

`applicationId`, `blockId String` (composite FK → `vineyard_block(tenantId,id)`, `ON DELETE
RESTRICT` — a block with spray history cannot be deleted, matching `BrixLog`), **`segmentNo Int
@default(1)`**.
`@@unique([tenantId, applicationId, blockId, segmentNo])` — council G7; the original
`(applicationId, blockId)` unique made an interrupted-and-resumed block unrecordable.

| Group | Columns |
|---|---|
| Snapshots | `blockLabelSnapshot String` · **`treatedAreaHa Decimal`** (KD-6) · **`treatedAreaSource SprayAreaSource`** (`DERIVED_FROM_SPACING \| OPERATOR_ENTERED \| SURVEYED`) · `treatedAreaNote String?` — council CQ2: an operator override was allowed but its provenance was not recorded, and a rate dispute turns on exactly that |
| Per-block timing (council S4) | `startedAt DateTime?` · `finishedAt DateTime?` — blocks in one pass are sprayed hours apart; **these, not the header's, are what the residual and REI clocks read.** ⚠️ Nullable on purpose: forcing NOT NULL makes an operator type a fake time. A null `finishedAt` resolves REI and residual to **UNKNOWN** in Unit 8 and **never falls back to the header** (council G2/C14 — a fallback would start the clock early for the blocks sprayed last and clear a block still under restricted entry) |
| Tanks (Phase 20 columns) | `tankBatchRef String?` · `estTanks Decimal?` · `tanksUsed Decimal?` · `volumeUsedL Decimal?` |
| Computed rate (KD-7) | `computedVolumePerHaL Decimal?` · `rateBasis SprayRateBasis` (`MEASURED \| HEADER_VOLUME \| UNKNOWN`) |
| Deposition evidence (council S4) | `depositionMethod SprayDepositionMethod?` (`WATER_SENSITIVE_CARD \| DYE \| VISUAL \| OTHER`) · `depositionAdequate Boolean?` · `depositionCheckedAt DateTime?` · `depositionNote String?` |
| **Derived** (KD-2, recomputable) | `driedBeforeRainDerived Boolean?` · `driedBeforeRainBasis SprayDriedBasis?` (`NO_RAIN_IN_WINDOW \| HOURLY_PRECIP \| INSUFFICIENT_DATA`) · `driedBeforeRainDerivedAt DateTime?` |

Indexes: `@@index([tenantId, blockId, startedAt])` — **the S6/S7a/S8 read path** ·
`@@index([tenantId, applicationId])`.
CHECKs: `treatedAreaHa > 0` · `finishedAt IS NULL OR finishedAt >= startedAt` · non-negative measures.

### `spray_drying_override` — the attributed operator override (KD-2)

Append-only. `blockLineId String` (composite FK), `value Boolean`, `reason String`,
`observedAt DateTime`, `enteredById String?`, `enteredByEmail String`, `enteredAt DateTime`.
`@@index([tenantId, blockLineId, enteredAt])`. Latest by `(enteredAt, id)` wins; the whole history is
retained because an override changes a residual estimate and must replay. Covered by the immutability
trigger with **nothing allowlisted** — no column on this table is ever updated (council C5).

### `planned_harvest_date_event` (KD-8)

`blockId String` (composite FK, `ON DELETE RESTRICT`), `vintageYear Int`,
**`harvestPassLabel String @default("main")`** (council G4 — split picks),
`plannedDate DateTime @db.Date`, `version Int`, `effectiveFrom DateTime @default(now())`,
`effectiveTo DateTime?`, `status PlannedHarvestStatus` (`ACTIVE | SUPERSEDED | RETRACTED`),
`reason String?`, `enteredById String?`, `enteredByEmail String`, `enteredAt DateTime`.

- `@@unique([tenantId, blockId, vintageYear, harvestPassLabel, version])`
- **Partial unique in raw SQL:** `CREATE UNIQUE INDEX … ON planned_harvest_date_event ("tenantId",
  "blockId", "vintageYear", "harvestPassLabel") WHERE "effectiveTo" IS NULL;` — at most one open row
  per block-vintage-pass. **Zero open rows is legal and is how "no planned date" is represented**
  (KD-8): retraction closes without a successor.
- `@@index([tenantId, blockId, vintageYear, effectiveFrom])` — the point-in-time read.
- `@@index([tenantId, enteredAt])` — the watermark read `plannedHarvestChangesSince(cursor)`.
- Covered by the immutability trigger, allowlisting only `effectiveTo` and `status` (council C5).

### `legacy_spray_mapping` (KD-9, council S11)

`normalizedName String` (via the existing `normalizeInputKey`), `displayName String`,
`epaRegistrationNumber String?`, `productName String?`,
`status LegacySprayMappingStatus` (`SUGGESTED | CONFIRMED | REJECTED`),
`suggestionBasis String` (deterministic rule name — never an LLM),
`confirmedById String?`, `confirmedByEmail String?`, `confirmedAt DateTime?`, `note String?`.
`@@unique([tenantId, normalizedName])`.

### Enums

Real enums (engines branch on them): `SprayApplicationMethod` (`AIRBLAST | BOOM | HANDGUN | BACKPACK
| CHEMIGATION | AERIAL | OTHER`) · `SprayRecordStatus` · `SprayCorrectionKind` (`AMENDMENT | VOID`) ·
`SprayMaterialRole` · `SprayAdjuvantClass` · `SprayQuantityUnit` · `SprayQuantityDimension` ·
**`SprayQuantityBasis`** · `SprayMobilityClass` · `SprayFactsCompleteness` · `SprayFactsSource` ·
`SprayProductIdentitySource` · `SprayRateBasis` · **`SprayAreaSource`** · `SprayDepositionMethod` ·
`SprayRowPattern` · `SprayDilutionMode` · `SprayWeatherSource` · **`SprayWindDirection`** (16-point +
`CALM` + `VARIABLE`) · `SprayDriedBasis` · `PlannedHarvestStatus` · `LegacySprayMappingStatus`.

Display-only values stay `String` (`gearSetting`, `targetPest`, `tankBatchRef`), following the
`providerKey String // "nws" | "open_meteo"` precedent.

`SprayAdjuvantClass` values (council C9 needs the penetrant distinguishable):
`NONIONIC_SURFACTANT | ORGANOSILICONE_PENETRANT | CROP_OIL_CONCENTRATE | METHYLATED_SEED_OIL |
STICKER_SPREADER | BUFFER_ACIDIFIER | WATER_CONDITIONER | DEFOAMER | OTHER`.

## Implementation Units

### PR 1 — schema slice (serialized against sibling lanes; land first)

#### Unit 1: Prisma models and enums

**Goal:** The five tables and nineteen enums exist in `prisma/schema.prisma`.
**Files:** `prisma/schema.prisma`
**Approach:** Follow the §"Data model" tables verbatim. Every model gets `tenantId String
@default("")`, `@@index([tenantId])`, `@@unique([tenantId, id])`, and `@@map` to the snake_case name.
Cross-tenant FKs are **plain `String` columns with no Prisma `@relation`** (K11); only the
self-relations within `spray_application` and the parent→line relations inside one table family use
Prisma relations, and only where the type-depth cost is nil. Comment each model header the way
`LotOperation:2543` and `SalesExportEvent:4643` do — say what the table is and what makes it safe.
**Tests:** none (schema only).
**Depends on:** none.
**Verification:** `npx prisma generate` then `npx prisma validate`; `npx tsc --noEmit`.

#### Unit 2: The migration

**Goal:** DDL that is correct, self-verifying, and enforces immutability at the database.
**Files:** `prisma/migrations/<ts>_spray_record/migration.sql`
**Approach:** Generate with `prisma migrate diff`, then hand-finish, copying
`20260726170000_forecast_schema/migration.sql` section for section:
1. `CREATE TYPE` for all enums (born here — no `ALTER TYPE`).
2. `CREATE TABLE` ×7 + indexes + the `@@unique([tenantId, id])` promoted to a named constraint on
   **every** table, plus `@@unique([tenantId, applicationId, id])` on `spray_material_line`.
3. Composite FKs in raw SQL: `(tenantId, vineyardId) → vineyard(tenantId,id)` RESTRICT ·
   `(tenantId, blockId) → vineyard_block(tenantId,id)` RESTRICT · `(tenantId, applicationId) →
   spray_application(tenantId,id)` CASCADE · `(tenantId, blockLineId) → spray_block_line(tenantId,id)`
   CASCADE · `(tenantId, applicationId, materialLineId) → spray_material_line(tenantId, applicationId,
   id)` SET NULL · the two **self-FKs** on `supersedesApplicationId` / `supersededByApplicationId` ·
   every `tenantId → organization(id)` RESTRICT.
4. The partial unique index for `planned_harvest_date_event` on `(tenantId, blockId, vintageYear,
   harvestPassLabel) WHERE "effectiveTo" IS NULL`.
5. NULL-tolerant `CHECK`s per §"Data model" — including the two knownness CHECKs and the
   `factsCompleteness = 'KNOWN'` implication, which are the database's enforcement of rule §3.6.
6. **GIN indexes** on `snapshotResistanceGroups` and `snapshotActiveIngredientKeys`.
7. RLS: `ENABLE` + `FORCE` + `tenant_isolation` (`USING` **and** `WITH CHECK`) + `GRANT SELECT,
   INSERT, UPDATE, DELETE … TO app_rls` on all seven tables.
8. **The immutability triggers** (KD-1): one `plpgsql` function `spray_reject_content_mutation()`
   used by a `BEFORE UPDATE` trigger on **all six append-only tables** — the four spray content
   tables, `planned_harvest_date_event` (allowlisting `effectiveTo`, `status`), and
   `spray_drying_override` (allowlisting nothing) — raising unless every changed column is within the
   per-table allowlist, and additionally rejecting any `value → value` transition on the supersession
   pointers (only `NULL → value`, once). Plus `spray_reject_delete()` on `BEFORE DELETE`, raising
   unless `current_setting('app.allow_spray_purge', true) = 'on'` **and** `current_user <> 'app_rls'`.
9. The self-verifying `DO $$ … RAISE EXCEPTION … $$` block asserting, per table, that RLS is
   `ENABLE`d **and** `FORCE`d, the policy exists, and both triggers exist.
**Tests:** the DO block is the test.
**Depends on:** 1.
**Execution note:** run from the MAIN checkout (worktrees have no `.env`). `npx prisma generate`
immediately before anything that type-checks.
**Verification:** migration applies cleanly; `npm run verify:invariants`; `npm run verify:naming`.

#### Unit 3: Tenant-isolation cases

**Goal:** Checklist step 9 discharged.
**Files:** `scripts/verify-tenant-isolation.ts`, `test/tenant-isolation.test.ts`
**Approach:** Append one case covering `spray_application` and `spray_block_line` — write as tenant
A, read as tenant B, expect zero rows; attempt a cross-tenant write, expect the `WITH CHECK` to
reject. Additive edits only; both files are shared with sibling lanes.
**Tests:** the cases themselves.
**Depends on:** 2.
**Verification:** `npm run verify:tenant-isolation` from the main checkout.

> **PR 1 gate:** migration applies · `verify:tenant-isolation` green · `verify:naming` green before
> and after · `tsc` clean. Merge this before sibling lanes' schema slices queue behind it.

---

### PR 2 — the domain (unblocks Wave 2)

#### Unit 4: Types and pure units

**Goal:** The DTO vocabulary and every conversion, pure and tested.
**Files:** `src/lib/spray/types.ts`, `src/lib/spray/units-core.ts`, `src/lib/spray/contributors.ts`,
`test/spray-units.test.ts`
**Approach:** DTOs declare their own shapes with Decimals pre-coerced to `number | null`, so no core
imports `@prisma/client` (`src/lib/weather/read-core.ts:21` is the model). `units-core.ts` holds
`toCanonicalQuantity(value, unit)`, `galPerAcreToLPerHa`, `mphToKph`, `fahrenheitToCelsius`,
`compassLabel(deg)` (16-point), and their inverses — reusing `src/lib/vineyard/units.ts` constants
rather than redefining them. Deliberately **no `Core` export suffix** on these helpers so they do not
enter the `verify:ai-native` matrix. Also create `contributors.ts` — the barrel every model lane
appends one line to (runbook §5) — with the `SprayContributor` interface and an empty array, so
sibling lanes have a landing place.
**Tests:** round-trip conversions; `compassLabel` boundaries (0° → N, 348.75° → N, 11.25° → NNE);
an unknown unit returns `null`, never `0`.
**Depends on:** 1.
**Verification:** `npx vitest run test/spray-units.test.ts`.

#### Unit 5: The product-facts port and snapshot builder

**Goal:** The seam that keeps this lane parallel to S2, and makes *unknown-never-clear* true today.
**Files:** `src/lib/spray/product-facts-port.ts`, `src/lib/spray/facts-snapshot-core.ts`,
`test/spray-facts-snapshot.test.ts`
**Approach:** Declare `ProductFactsResolver` and `ProductFactsSnapshot` per KD-3/KD-4. The port's
primary method is **`resolveMany(keys)`**, not `resolve(key)` (council C11 — a per-material-line
`resolve` is an N+1 that the null resolver would hide entirely, so the bad shape would ship untested
and S2b would inherit it); the write core dedupes keys per application before calling it.
Ship `NullProductFactsResolver`. `buildFactsSnapshot(resolved)` is pure: it maps a resolver result
onto the discrete columns, normalizes resistance codes to scheme-prefixed strings, normalizes AI
keys, sets `resistanceGroupsKnown` / `activeIngredientsKnown`, and **derives `factsCompleteness`** —
`KNOWN` only when PHI, REI, rainfast, mobility class, and at least one resistance determination are
all present; `PARTIAL` when some are; `UNKNOWN` when the resolver returned nothing. Never invents a
default.
**Tests:** the null resolver yields `UNKNOWN`, every discrete column null, both arrays empty, and
**both knownness flags `false`** · a partial result yields `PARTIAL`, never `KNOWN` · a premix with
two codes yields both entries in `snapshotResistanceGroups` · `factsCompleteness` is never `KNOWN`
when any input is null · **an empty array can never be emitted with `known = true`** (the mirror of
the DB CHECK, so the violation is caught in a fast test as well as at the database).
**Depends on:** 4.
**Verification:** `npx vitest run test/spray-facts-snapshot.test.ts`.

#### Unit 6: The write core

**Goal:** `recordSprayApplicationCore` — one pass, header + all three line tables, one transaction.
**Files:** `src/lib/spray/record-core.ts`, `test/spray-record-core.test.ts`
**Approach:** `import "server-only"`, no `"use server"`, no `next/cache` (so verify scripts and the
future assistant tool both call it — `src/lib/ledger/reverse.ts:23`). Signature takes an actor, the
input, and the `ProductFactsResolver` as an **injected dependency** (defaulting to the null
resolver). Inside `runInTenantTx`: validate (at least one material line; `finishedAt >= startedAt`;
a `VOID` carries no lines), snapshot the block label, `treatedAreaHa` and `treatedAreaSource`
(defaulting from `blockHectares()`, KD-6), resolve and freeze the facts snapshot per material line
via `resolveMany`, compute `computedVolumePerHaL` + `rateBasis`, write all rows, then `writeAudit`.
**Idempotency is a re-read, not a constraint violation** (council C8): compute `requestHash` over the
payload, catch the `commandId` unique conflict, re-read by `commandId`, return the winner when the
hash matches and reject with a clear error when it does not — the shape `src/lib/commerce/ingest.ts`
already uses.
**Cross-site is allowed** (KD-12, rewritten): blocks may span vineyards; `vineyardId` defaults to the
first block line's vineyard and the DTO reports `isCrossSite`. **Warnings, not blocks**, for the two
soft cases: two segments of one block more than 24 h apart, and a carrier volume absent when a
material line uses `PER_CARRIER_VOLUME` basis.
Split the pure parts out — `validateSprayInput`, `computeRateBasis`, `snapshotBlockLine` — into a
sibling pure module so they are unit-testable without a DB.
**Tests:** rate basis is `MEASURED` when `volumeUsedL` is present, `HEADER_VOLUME` when only the
header volume is, `UNKNOWN` when neither (and the rate is `null`, never `0`) · a zero/negative area
is refused · a cross-vineyard block line is **accepted** and flagged · the same block twice in one
pass with distinct `segmentNo` is accepted, and >24 h apart warns · a replayed `commandId` with an
identical payload returns the original record, and with a different payload is rejected · every
material line comes back `factsCompleteness = UNKNOWN` under the null resolver.
**Depends on:** 5.
**Verification:** `npx vitest run test/spray-record-core.test.ts`.

#### Unit 7: The correction core

**Goal:** `correctSprayApplicationCore` and `voidSprayApplicationCore` — and the proof that an
in-place edit is impossible.
**Files:** `src/lib/spray/correction-core.ts`, `test/spray-correction.test.ts`
**Approach:** Mirror `src/lib/ledger/reverse.ts`'s architecture: a **pure**
`correctabilityOf(application) → { correctable: true } | { correctable: false; code:
"already-superseded" | "voided" | "not-current"; reason: string }`, called by both the read DTO and
the mutation so *the UI and the mutation can never disagree about what is correctable*. The mutation
writes a full new revision (header + all lines), then marks the predecessor `SUPERSEDED` with
`supersededByApplicationId`. Cross-tenant belt-and-braces check (`reverse.ts:336`).
**The facts snapshot is COPIED verbatim from the predecessor** — `factsRevision` and `factsAsOf`
included — and re-resolved **only** for a line whose product identity changed (KD-14, reversing this
unit's original design per council G1: re-resolving would repaint a July application with November's
registration data and break rule §3.8).
**A void is a successor row**, not the absence of one (KD-1 / council C2): `correctionKind = VOID`,
`status = VOIDED`, `supersedesApplicationId` set, zero line children — so the at-most-once unique
covers the void path too.
**Tests:** correcting twice is refused by `correctabilityOf` **and**, at the DB level, by the
`@@unique([tenantId, supersedesApplicationId])` · **two concurrent voids: exactly one commits** ·
a void racing an amendment: exactly one commits · a corrected record's content columns are
byte-identical before and after · **a correction that changes only ground speed leaves every
material line's `factsAsOf` and `factsRevision` untouched** · a correction that changes a line's EPA
registration number re-resolves **that line only** · the current-view read returns exactly one row
per chain.
**Depends on:** 6.
**Verification:** `npx vitest run test/spray-correction.test.ts`.

#### Unit 8: The read core — what S6, S7a, and S8 consume

**Goal:** One pure fold from rows to the per-block application facts every Wave-2 lane reads.
**Files:** `src/lib/spray/read-core.ts`, `test/spray-read-core.test.ts`
**Approach:** Pure — rows in, DTO out, no Prisma. Exports:
`foldCurrentApplications(rows)` (drop `SUPERSEDED`/`VOIDED`, keep the chain head) ·
`blockApplicationFacts(app, blockLine, materialLines)` → the S6 contract: per-block start/finish,
treated area + source, carrier rate + basis, deposition evidence presence, and per-material
`{ productName, resistanceGroups, aiKeys, phiDays, reiHours, rainfastHours, mobilityClass,
factsCompleteness }` · `materialRatePerHa(...)` (KD-7), branching on `quantityBasis` and returning
`null` for any basis it cannot convert · `rotationContribution(...)` returning
`{ groups: string[] } | { unknown: true, reason }` — **never an empty group list**, because an empty
list reads as "no groups used" and would grant a rotation-OK claim (rule §3.6); it keys off
`resistanceGroupsKnown`, not off array length · `reiWindow(blockLine, materialLines)` and
`residualAnchor(blockLine)`, both of which **return `UNKNOWN` when the block line's own `finishedAt`
is null and never fall back to the header timestamp** (council G2/C14 — a fallback starts the clock
early for the blocks sprayed last and clears a block still under restricted entry).
**Tests:** a superseded or voided record never appears in the current view · a material line with
`factsCompleteness = UNKNOWN` yields `rotationContribution = { unknown: true }`, not `{ groups: [] }`
· `materialRatePerHa` returns `null` (not `0`) with a missing area, quantity, or an unconvertible
basis · **a twelve-hour pass where block 10 has no `finishedAt` yields REI `UNKNOWN` for block 10
while block 1 resolves normally — and never borrows the header time** · a premix contributes both
groups.
**Depends on:** 6.
**Verification:** `npx vitest run test/spray-read-core.test.ts`.

#### Unit 9: `driedBeforeRain` — derived, with an attributed override

**Goal:** Council S3, discharged: the value is computed, or it is unknown; it is never typed in as
truth.
**Files:** `src/lib/spray/drying-core.ts`, `src/lib/spray/drying-override.ts`,
`test/spray-drying.test.ts`
**Approach:** `deriveDriedBeforeRain({ finishedAt, requiredDryingMinutes, hourlyPrecip })` is pure
and takes precipitation through a **`PrecipitationSeriesPort`** — an injected interface S1 will later
implement (same pattern as KD-3, and the reason this lane never touches `src/lib/weather/`). It
returns `{ value: boolean | null, basis: NO_RAIN_IN_WINDOW | HOURLY_PRECIP | INSUFFICIENT_DATA }`.
With no series available it returns `{ value: null, basis: INSUFFICIENT_DATA }` — the honest answer,
and the S3a default.
`resolveDriedBeforeRain(blockLine, overrides)` is pure and folds override-over-derived-over-unknown,
returning the **attribution** alongside the value so S6 and S9 can say who said so.
`recordDryingOverride` appends a `spray_drying_override` row (never mutates the block line) and
writes an audit entry.
Default `requiredDryingMinutes` is a documented agronomic heuristic (brief §4.2: most materials want
1–2 hours), surfaced as such and overridable per material once S2b supplies a real rainfast period.
**Tests:** no precip series ⇒ `null` + `INSUFFICIENT_DATA`, never `true` · rain 20 minutes after
finish ⇒ `false` · rain 6 hours after ⇒ `true` · an override beats the derived value and carries its
attribution · the latest of two overrides wins and both are retained.
**Depends on:** 4.
**Verification:** `npx vitest run test/spray-drying.test.ts`.

#### Unit 10: Planned harvest date as an audited event stream

**Goal:** Council D4, with the C8 hook seam built.
**Files:** `src/lib/harvest/planned-harvest-core.ts`, `src/lib/harvest/planned-harvest-events.ts`,
`test/planned-harvest.test.ts`
**Approach:** New files only (no edit to `src/lib/harvest/actions.ts`).
`setPlannedHarvestDateCore(actor, { blockId, vintageYear, harvestPassLabel, plannedDate, reason })`
closes the open row (`effectiveTo = now()`, `status = SUPERSEDED`) and appends the next `version`
**in one transaction**; the partial unique index is the concurrency backstop.
`retractPlannedHarvestDateCore` closes **without a successor** — no open row is how "no planned date"
is represented (KD-8).
`plannedDate` crosses every boundary as an ISO `YYYY-MM-DD` **string** via the existing
`toISODateUTC` / `parseISODateUTC` (KD-13 / council C6), never a JS `Date`.
Reads: `currentPlannedHarvestDates(blockId, vintageYear)` — **plural**, because split picks mean a
block-vintage can have several open passes (council G4) — and the one S7a needs,
`plannedHarvestDateAsOf(blockId, vintageYear, harvestPassLabel, at)`.
**The durable seam is a watermark read, not a listener registry** (KD-8 / council C4):
`plannedHarvestChangesSince(cursor)` derives `PlannedHarvestChange { …, direction }` by comparing
consecutive versions over the append-only stream. S7a consumes it with a cursor. There is no
in-process callback to lose on a crash.
**Tests:** version increments and at most one row stays open per pass label ·
`plannedHarvestDateAsOf` returns the value current at that instant, not the latest · pulling a date
earlier yields `direction: PULLED_FORWARD`, pushing later `PUSHED_BACK`, retraction `RETRACTED` ·
two pass labels on one block-vintage coexist and neither overwrites the other · a Pacific-timezone
caller stores the date they typed (no off-by-one) · `plannedHarvestChangesSince` replays every change
after a cursor exactly once and is idempotent when re-run from the same cursor.
**Depends on:** 1.
**Verification:** `npx vitest run test/planned-harvest.test.ts`.

#### Unit 11: The legacy field-note read seam

**Goal:** Council S11 — an old name-only spray is a **low-confidence record, not an absence**, and it
**blocks** a rotation-OK claim.
**Files:** `src/lib/fieldnotes/legacy-spray-core.ts`, `src/lib/spray/legacy-mapping.ts`,
`test/spray-legacy.test.ts`
**Approach:** New files only (KD-9). `legacySprayRecords(notes, mappings)` is pure: for each
`InputApplication` of type SPRAY it normalizes the name with the existing `normalizeInputKey`
(`src/lib/fieldnotes/sanitize.ts:30`), looks up a `CONFIRMED` mapping, and returns
`LegacySprayRecord { displayName, weekOf, blockIds, confidence: "LOW", productIdentity: … | null,
rotationContribution, usableFor: { rotation, residual: false, compliance: false } }`.
`suggestLegacyMappings(names, catalog)` is a **deterministic** exact-normalized-key match — never an
LLM, never a fuzzy score (rule §3.2). `confirmLegacyMapping(actor, …)` is the human gate: it records
who confirmed and when.
**Tests:** an unmapped legacy spray yields `rotationContribution = { unknown: true }` and
`usableFor.rotation = false` · a **confirmed** mapping yields groups but still `confidence: "LOW"`
and `usableFor.residual = false` · a `SUGGESTED`-but-unconfirmed mapping is treated exactly like no
mapping · the suggester never returns a partial-string match.
**Depends on:** 8.
**Verification:** `npx vitest run test/spray-legacy.test.ts`.

#### Unit 12: `verify:spray-record`, allowlists, invariants

**Goal:** The DB-level proof of the runbook's gate, and the brain artifacts.
**Files:** `scripts/verify-spray-record.ts`, `package.json`, `scripts/ai-native-allowlist.mjs`,
`docs/architecture/invariants/SPRAY-{1..5}-*.md`, `INVARIANTS.md`,
`docs/architecture/assistant-coverage.md` (regenerated)
**Approach:** Copy `scripts/verify-weather.ts` — the `check()` harness, one `runAsTenant(DEMO, …)`,
`QA-Spray-${Date.now()}` fixtures, `try { … } finally { cleanup child→parent }` with the
`app.allow_spray_purge` escape hatch set for teardown only. **Fourteen** assertions (nine originally;
council C16 added five):
1. **RLS** — a second tenant reads zero rows.
2. **In-place edit refused** — a raw `UPDATE` of a content column raises from the trigger, on
   `spray_application`, `spray_block_line`, **`planned_harvest_date_event`, and
   `spray_drying_override`** (the last two added per council C5).
3. **Header/line round-trip** — one pass across **ten** blocks entered once, read back as ten block
   lines with per-block acres, times, and computed rates.
4. **Correction-as-event** — correcting produces a new revision, the original is byte-identical and
   `SUPERSEDED`, the current view returns one row, and a **second** correction of the same revision
   is rejected by the unique constraint.
5. **The void race** — two concurrent voids of the same revision: exactly one commits (council C2).
6. **Facts-as-of-then** — a correction that changes only a header field leaves every material line's
   `factsAsOf` and `factsRevision` untouched; changing a line's EPA reg number re-resolves that line
   alone (council G1 / KD-14).
7. **`driedBeforeRain`** — `null`/`INSUFFICIENT_DATA` with no series; an override flips it and
   carries attribution.
8. **Unknown product ⇒ unknown** — a record written with the null resolver reports
   `factsCompleteness = UNKNOWN`, `resistanceGroupsKnown = false`, and
   `rotationContribution.unknown = true`. Never *clear*.
9. **The knownness CHECK bites** — a direct insert with an empty `snapshotResistanceGroups` and
   `resistanceGroupsKnown = true` is rejected by the database (council C7).
10. **REI never borrows the header time** — a block line with a null `finishedAt` resolves REI to
    `UNKNOWN` while its siblings resolve normally (council G2/C14).
11. **Legacy back-compat** — a seeded field note surfaces as a LOW-confidence record and blocks a
    rotation-OK claim.
12. **Planned harvest** — versions audited; point-in-time read correct; two split-pick labels coexist;
    `plannedHarvestChangesSince(cursor)` replays each change once with the right `direction`.
13. **`commandId` retry semantics** — the same id with the same payload returns the original record;
    with a different payload it is rejected, not silently accepted (council C8).
14. **Non-US path** — a record with a null `epaRegistrationNumber` writes cleanly and resolves to
    `UNKNOWN` (rule §3.9; proven on a Bhutan-shaped fixture **inside Demo Winery**, never in the real
    Bhutan tenant).
Register `record-core.ts`, `correction-core.ts`, `drying-override.ts`, `planned-harvest-core.ts`, and
`legacy-mapping.ts` on `INTERNAL` in `scripts/ai-native-allowlist.mjs` with `coveredBy:
"record_spray_application (S11) + query_spray_decision (S5a→S9)"` and a reason that names the
retirement condition. **Not `GAP_ALLOWLIST`** — that list is capped at 2 and may only shrink
(runbook §5). Add the retirement obligation to S11's gate in the runbook.
Write five invariant notes with `severity`/`enforcedBy`/`verify`/`appliesTo` frontmatter:
`SPRAY-1-append-only-correction-as-event` · `SPRAY-2-facts-as-of-snapshot` ·
`SPRAY-3-gap-renders-unknown` (this is the first of the three the runbook §11 named) ·
`SPRAY-4-planned-harvest-audited` · `SPRAY-5-dried-before-rain-derived`.
**Tests:** the script is the test.
**Depends on:** 7, 9, 10, 11.
**Execution note:** run from the MAIN checkout. Regenerate the coverage doc with
`npm run verify:ai-native -- --write` **before pushing** — it is generated, and CI reds on a stale
copy after any core-export change.
**Verification:** `npm run verify:spray-record` · `npm run verify:ai-native` ·
`npm run verify:invariants` · `npm run verify:naming` before and after.

> **PR 2 gate:** all unit tests · `verify:spray-record` · `verify:ai-native` · `verify:invariants` ·
> `verify:tenant-isolation` · `tsc`. **Wave 2 is unblocked when this merges** — sibling lanes should
> start against it without waiting for PR 3.

---

### PR 3 — minimal surface and the standing QA gate

#### Unit 13: Read surface

**Goal:** Somewhere to see a spray record, so the QA gate has something to drive and a grower can
verify what was logged.
**Files:** one route group under `src/app/(app)/vineyards/sprays/`, server components + DTO mappers
in `src/lib/spray/actions.ts`
**Approach:** Summary-first, progressive disclosure, **one nav entry** (the P8 lesson — resist
sprawl). A season list per vineyard, and a detail view rendering header → materials → mixing order →
blocks. DESIGN.md tokens only; no hardcoded colors, fonts, or spacing.
**Honesty rendering is the point of this unit, not decoration:** `factsCompleteness = UNKNOWN` renders
as a distinct *unknown* state, visibly different from a clear/known state (rule §3.6). A
`driedBeforeRain` of `null` renders "not determined", never "no". A derived value is labelled derived
and an override is labelled with who overrode it (rule §3.5). A superseded revision is reachable and
labelled, with its successor linked — the audit trail has to be visible to be worth anything.
**Tests:** manual, in the QA pass (the repo has no jsdom/RTL — assistant/UI is manual-QA-only).
**Depends on:** 8.
**Verification:** in-browser via the QA protocol.

#### Unit 14: Minimal authoring, correction, and planned-harvest editing

**Goal:** A human can create a record, correct one, and set a planned harvest date.
**Files:** the same route group; server actions in `src/lib/spray/actions.ts` and
`src/lib/harvest/planned-harvest-actions.ts`
**Approach:** One form matching the template's shape — header, then repeatable material lines, mixing
order, and block lines with a block multi-select that pre-fills `treatedAreaHa` from
`blockHectares()` and leaves it editable. Correction reopens the form pre-filled and submits through
`correctSprayApplicationCore`; there is **no edit path** to the original, by construction. Server
actions **return `{ ok: false, error }` rather than throwing** — production redacts thrown
`ActionError`s. Every `"use server"` action wraps its body in the tenant context.
**Tests:** manual, in the QA pass.
**Depends on:** 13.
**Verification:** in-browser; every write confirmed in the DB with a `runAsTenant("org_demo_winery",
…)` read-back script.

#### Unit 15: QA pass, report, and doc reconciliation

**Goal:** The standing gate discharged and the program's docs left true.
**Files:** `docs/spray_assistant/qa/S3a-qa-report.md`,
`docs/spray_assistant/phases/S3a-report.md`, `docs/spray_assistant/SPRAY_ASSISTANT_RUNBOOK.md`
(status ledger), `ROADMAP.md`, `NOW.md`
**Approach:** Run `qa/QA-PROTOCOL.md` in full from the MAIN checkout with this branch checked out:
`npx prisma generate`, `npm run dev`, **the user logs in once** with the Demo Winery credentials
(Claude never types a password), drive with `get_page_text` / `read_page`, `computer` click+type for
controlled React inputs, `form_input` only for native `<select>`. Prove every write in the DB with a
`runAsTenant` script. Mobile viewport pass.
Run **all sixteen program-wide safety cases**, and for each one whose surface does not exist yet
(SAFE-1, 3–9, 11–16) write the row as explicitly skipped with the reason — never blank. The ones that
must genuinely pass here: **SAFE-2** (a block with no spray records reads *unknown*, never "fully
protected") and **SAFE-10** (*cannot determine safely* renders as its own state).
`verify:naming` green before **and** after; QA fixtures cleaned up.
Then reconcile the docs: flip S3a to 🟩 in the runbook status ledger with links; **correct
`ROADMAP.md:1240-1241`** — the template carries REI (F7) and PHI (G7); only applicator license (plus
target pest and weather-at-application) is missing; add the Phase 20 seam table as the authoritative
field split; update `NOW.md`.
Log an ADR under `docs/architecture/decisions/` for the facts-as-of replay semantics (KD-3/KD-4) and
a context-ledger entry, per the brain rules.
**Depends on:** 14.
**Verification:** the QA report exists with evidence; the runbook ledger is current.

## PR sequence

| PR | Units | Unblocks | Gate |
|---|---|---|---|
| **1 — schema slice** | 1–3 | sibling lanes' schema slices queue behind it | migration applies · `verify:tenant-isolation` · `verify:naming` · `tsc` |
| **2 — domain cores** | 4–12 | **Wave 2 (S7a, S8, S6, S7b)** | all unit tests · `verify:spray-record` · `verify:ai-native` · `verify:invariants` · `tsc` |
| **3 — surface + QA** | 13–15 | S3b, S10 | in-browser QA report · SAFE-2 and SAFE-10 pass · docs reconciled |

**Scheduling note that matters:** the UI is **not** on the critical path. PR 1 and PR 2 unblock Wave
2; sibling lanes should start against merged cores while PR 3 lands. S3a is not declared shipped
until PR 3's QA report is green.

## Test Strategy

**Unit (Vitest, `test/*.test.ts`, `environment: "node"`, no DB, no network).** Every pure core:
units, facts snapshot, rate basis, current-view fold, rotation contribution, drying resolution,
planned-harvest point-in-time, legacy mapping. Following the house style, `describe` strings name the
council finding they discharge (`"council S3 — driedBeforeRain is derived, never self-reported"`),
and each safety-critical case carries a **negative assertion pinning the plausible-but-wrong
implementation** — e.g. `expect(contribution).not.toEqual({ groups: [] })`, because an empty group
list is exactly how a coverage gap turns into a rotation-OK claim.

**Integration (`npm run verify:spray-record`, Demo Winery).** The nine assertions in Unit 12. This is
where the trigger, the unique constraints, RLS, and the ten-block round-trip are proven.

**Contract tests (the ones that are the point of the phase):** an in-place content edit raises · a
double correction is rejected · an unknown product never reads as clear · an unconfirmed legacy spray
blocks a rotation-OK claim · a planned-harvest change emits the correct direction.

**Manual (in-browser, QA protocol).** Unit 15. The repo has no jsdom/RTL, so UI is manual-QA-only —
that is a known constraint, not a gap this phase closes.

## Acceptance gate — runbook §9 S3a, clause by clause

| Gate clause | Discharged by |
|---|---|
| RLS / tenant-isolation case | Unit 3; `verify:spray-record` assertion 1 |
| Correction-as-event contract test (in-place edit refused) | Unit 2 trigger + Unit 7; assertions 2 and 4 |
| Header/line round-trip, ten blocks, per-block acres/times/rates | Unit 6; assertion 3 |
| `driedBeforeRain` derived correctly incl. the override path | Unit 9; assertion 5 |
| Field-note back-compat: low-confidence, blocks a rotation-OK claim | Unit 11; assertion 7 |
| Unknown product resolves to *unknown*, never *clear* | Units 5 + 8 (null resolver); assertion 6 |
| Planned-harvest edits are audited | Unit 10; assertion 8 |
| `verify:spray-record` e2e on Demo Winery | Unit 12 |
| QA report | Unit 15 |

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **The immutability trigger fights the verify/QA teardown**, or misbehaves on Neon | MED | The named `app.allow_spray_purge` escape hatch, set only in teardown. Fallback if the trigger proves brittle: app-level guard in the cores + the DB-level unique on `supersedesApplicationId` (which is the part that actually prevents the dangerous race), with the residual risk recorded in the phase report. |
| **The facts snapshot's column set is wrong**, and S2b produces facts that do not fit | MED | The port is an interface, not a table join — S2b can extend `ProductFactsSnapshot` and add columns additively. `factsRevision` + `factsCompleteness` mean a later widening does not invalidate existing rows; they simply stay at their revision. This is the whole point of the watermark. |
| **`driedBeforeRain` sits `null` for the entire phase** because S1 does not exist, so nothing exercises the derivation | MED | The port is tested against a **committed fixture precipitation series**, not a live provider — the derivation is fully proven before S1 lands. What stays untested is only the adapter, which is S1's gate. |
| ~~Correcting a record re-resolves facts to a different snapshot~~ | — | **Removed by council G1.** This was listed as an accepted risk; it was a defect. KD-14 now copies the snapshot verbatim, so the drift cannot occur. |
| **The `PER_CARRIER_VOLUME` quantity basis is unconvertible** whenever the operator did not record a carrier volume, so a legitimately-entered material line still yields a `null` rate | MED | Correct behavior (rule §3.6), but it will be common. The write core **warns at entry** rather than discovering it at read time in S6, and the form prompts for carrier volume the moment that basis is chosen. |
| **Split-pick PHI reads the wrong date** — S7a checks the latest open planned date rather than the earliest | MED | Not S3a's to enforce, but S3a's read exposes `currentPlannedHarvestDates` (plural) precisely so the mistake is hard to make, and the constraint is written into the S7a gate. |
| Sibling-lane merge collision in `prisma/schema.prisma` | MED | PR 1 is a small schema-only slice, landed first and serialized against the other lanes' slices per runbook §4. `npx prisma generate` immediately before any `tsc`/`verify`/`dev` in a worktree. |
| Sibling-lane collision with **S4** in `src/lib/fieldnotes/` | LOW | KD-9 — new files only, zero edits to existing ones. |
| **A grower enters a record with no facts and reads the *unknown* state as "fine"** | HIGH | Not a schema problem, a rendering problem — Unit 13 makes *unknown* visually distinct, and SAFE-2/SAFE-10 test it every phase from here on. This is rule §3.6's most dangerous failure mode and it never stops being a risk. |
| Metric-canonical storage introduces conversion drift into a legally-filed number | LOW | `Decimal(18,8)` canonical, plus the material-line quantity is stored **as entered** with its unit (KD-5). The PUR export reprints what the applicator wrote. |

## Open questions ⟳ council

**Closed by the review** — full reasoning in
[S3a-council-feedback.md](./S3a-council-feedback.md):

| Was | Outcome |
|---|---|
| OQ-1 trigger vs app guard | **Trigger, and widened to six tables.** Both reviewers treated DB-level enforcement as correct; Codex's only complaint was that it did not go far enough (C5). |
| OQ-2 correction granularity | **Closed — whole-document.** With KD-14 copying the snapshot, the per-line alternative loses its main argument. |
| OQ-3 one pass, one vineyard | **Closed — cross-site allowed**, grouped per site at read (G6). |
| OQ-5 coded target pest | **Closed — free text now, with a nullable `targetPestCode` slot beside it** so there is no migration later (GQ1). |

**Still open for Russell:**

1. **D1 — KD-5, canonical metric for a US regulatory record.** Neither reviewer challenged it, which
   is weak evidence rather than agreement. Today the material-line quantity is stored exactly as
   entered and everything else converts at the PUR edge. Accept, or store every filed measure as
   filed?
2. **D2 — the assistant allowlist tier.** `record-core.ts` is a genuine capability whose tool lands
   four phases out, so `INTERNAL` is a slight lie told for four phases; runbook §5 forbids
   `GAP_ALLOWLIST` here. Add a `SCHEDULED { coveredBy, landingPhase }` tier, or accept an honest
   `reason` string with the retirement condition named?
3. **D3 — the segment-gap threshold.** The write core warns when two segments of one block are more
   than 24 hours apart. Is 24 h right, or should a gap that large hard-split into two applications
   with two residual clocks?

## Confidence

| Section | Confidence | Notes |
|---|---|---|
| Problem Frame | HIGH | Runbook §9, brief §17.3, and council C4/C9/S3/S4/S5/S11/D4 all agree on the shape; the template was opened and verified cell-by-cell. |
| Scope Boundaries | HIGH | The lane map (runbook §4) and the Phase 20 seam are both explicit in the source docs; the S2 non-FK boundary is a stated program rule. |
| Data model | HIGH *(was MEDIUM-HIGH)* | Every pattern is lifted from a verified in-repo precedent, and the council pass closed the two real holes — the `String[]` unknown-collapse (C7) and the missing child-table identity (C1). Residual uncertainty is the facts-snapshot **column set** (KD-4), a bet on what S2b will produce, mitigated by the port and the revision watermark. |
| Implementation Units | HIGH | Cores, tests, and verify scripts all follow existing house patterns with named exemplar files. |
| Test Strategy | HIGH | The gate maps clause-to-unit; the null resolver makes the hardest clause (unknown-never-clear) provable today rather than deferred, and the verify script grew from nine assertions to fourteen. |
| Risk Assessment | MEDIUM-HIGH *(was MEDIUM)* | The two places a reviewer could reasonably have sent this back — the trigger and the correction semantics — were both reviewed. The trigger was endorsed and widened; the correction semantics were **reversed** (KD-14). What remains genuinely unproven is the `driedBeforeRain` adapter, which is S1's gate, not this one's. |

## Doc changes this plan obligates

- `ROADMAP.md:1240-1241` — correct the "template omits REI and applicator license" line; add the
  Phase 20 seam table.
- `SPRAY_ASSISTANT_RUNBOOK.md` §8 — S3a status ledger row through 🟦 → 🟨 → 🟪 → 🟩 with links.
- `SPRAY_ASSISTANT_RUNBOOK.md` §9 S11 — add "retire the S3a `INTERNAL` allowlist entries" to the gate.
- `SPRAY_ASSISTANT_RUNBOOK.md` §9 S7a — add three constraints surfaced by this review: **(a)** PHI
  evaluates against the **earliest** open planned harvest date for a block-vintage, because split
  picks mean there can be several (council G4); **(b)** the reverse-check consumes
  `plannedHarvestChangesSince(cursor)` as a **watermark**, not an in-process callback (council C4);
  **(c)** a block line with a null `finishedAt` yields REI `UNKNOWN` and must never borrow the header
  timestamp (council G2/C14).
- `SPRAY_ASSISTANT_RUNBOOK.md` §9 S2b — record ownership of the **pest-code table** that populates
  `targetPestCode` (council GQ1).
- `SPRAY_ASSISTANT_RUNBOOK.md` §9 S6 — note that `materialRatePerHa` returns `null` for an
  unconvertible `quantityBasis`, so the residual model must handle a legitimately-entered line with
  no computable rate (council G3).
- `docs/architecture/invariants/SPRAY-{1..5}-*.md` + `INVARIANTS.md`.
- An ADR for facts-as-of replay semantics + a context-ledger entry.
- `NOW.md` at every boundary.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Council — Codex (gpt-5.4) | `/council` | Types, data layer, concurrency | 1 | ✅ reconciled | 7 CRITICAL, 9 SHOULD FIX, 3 DESIGN Q — all folded or adjudicated |
| Council — Gemini (3.1 Pro) | `/council` | Domain, liability, UX | 1 | ✅ reconciled | 4 CRITICAL, 4 SHOULD FIX, 3 DESIGN Q — all folded or adjudicated |
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | -- | -- |
| Eng Review | `/plan-eng-review` | Architecture & tests | 0 | -- | -- |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | -- | not run — PR 3's surface is deliberately minimal |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | -- | -- |

**VERDICT: READY FOR `/work`.** Both council reviews are reconciled into the plan; the adjudication
is in [S3a-council-feedback.md](./S3a-council-feedback.md). Two design changes and one reversal
(KD-14) landed. Three open questions (D1–D3) remain for Russell but none of them block PR 1 — D1 and
D3 are decisions the build can carry, and D2 is an allowlist-tier question that only bites in Unit 12.
