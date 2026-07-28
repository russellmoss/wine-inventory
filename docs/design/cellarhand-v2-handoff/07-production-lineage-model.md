# 07 · Production and Lineage Model

## 1. Four distinct concepts — never collapsed into one

The audit's warning applies here: do not turn audit history, lot identity and vessel location into one ambiguous idea. The approved UX keeps four things separate, each with its own component and its own place on screen.

| # | Concept | Question it answers | Data spine today | UI component |
|---|---|---|---|---|
| 1 | **Current material state** | How much is there, of what, where, in what condition? | `VesselLot` (projection), `Lot`, `AnalysisPanel`/`AnalysisReading` | `VesselIdentityBlock`, `FillIndicator`, facts row |
| 2 | **Production stage** | Where is this in the process, and what happens next? | Derived from `Lot.form`, `afState`/`mlfState`, and the presence of stage operations | `StageIndicator` |
| 3 | **Provenance / lineage** | Where did it come from, and what did it feed? | `LotLineage` (`parentLotId`, `childLotId`, `fraction`, `kind` ∈ SPLIT / BLEND / TOPPING), `LotHarvestSource` | `LineageNode` / `LineageEdge`, phone event stream |
| 4 | **Chronological event history** | What happened, when, by whom, through which work order? | `LotOperation` + `LotOperationLine`, `VesselActivityEvent`, `LotStateEvent`, `LotTreatment`, `AnalysisPanel`, `LotTastingNote`, `AuditLog` | `EventHistoryItem` |

Two further distinctions run through all four:

- **Planned vs. recorded.** Planned work lives on `WorkOrder`/`WorkOrderTask.plannedPayload`. Recorded work lives in the ledger. In every visual they are separated by *fill*: solid = recorded, hollow/dashed = planned. Never by colour alone, never merged into one timeline without a marker.
- **Measured vs. estimated.** See RFC-003. Every derived quantity carries a `ProvenanceBadge`.

## 2. Where each appears

| Screen | 1 State | 2 Stage | 3 Lineage | 4 History |
|---|---|---|---|---|
| Tank tile | code + lot + volume + state glyph | — | — | — |
| Tank detail | facts row + fill | tab context | link to lot lineage | History tab |
| Barrel detail | definition list | — | link | inline history list |
| Work-order brief | Moving / From / Into rows | 6-segment bar | "Where it came from" panel, 3 entries | link to the lot |
| Lot page | header facts | 6-segment bar | Lineage tab | Timeline tab |

**Progressive disclosure rule:** no screen shows all four at full depth. The brief shows state in full, stage as a bar, lineage as three entries with "see full lineage", and history only as a link.

## 3. The lineage graph must survive real winemaking

The model must express, without pretending the process is linear:

| Event | Lineage representation | Ledger representation today |
|---|---|---|
| Harvest → must lot | origin node | `CRUSH` op consuming picks, `LotHarvestSource` |
| Ferment | continuation, no new lot | `LotStateEvent` |
| Press | **split**: 1 parent → 2+ children (free run, press fraction) | `PRESS` op; `LotLineage.kind = SPLIT` with `fraction` |
| Saignée | split before ferment | `SAIGNEE` |
| Rack / transfer | continuation; vessel changes, lot identity does not | `RACK` op + `VesselTransfer` read-model |
| Addition | continuation with an event marker | `ADDITION` / `FINING` op |
| **Topping** | continuation, plus a lineage edge from the topping wine's lot when it is a different lot | `TOPPING` op; `LotLineage.kind = TOPPING` already exists |
| Blend | **merge**: N parents → 1 child, each with a `fraction` | `BLEND` op; `LotLineage.kind = BLEND` |
| Split for a trial or a partial sale | split | `PRESS`-style split or `ADJUST` |
| Bottling | terminal for the bulk lot, origin for the bottled lot | `BOTTLE` op, `BOTTLE_STORAGE` ledger bucket, `BottlingRun` |
| Finished goods | downstream of the bottled lot | `BottledInventory`, `FinishedGood*` |
| Disgorgement / dosage (sparkling) | continuation with volume change; partial disgorgement is a split | `DISGORGEMENT`, `DOSAGE` |
| Change of ownership (custom crush) | no lineage change; a proprietor change | `CHANGE_OWNERSHIP` |
| Bond transfer | no lineage change | `TRANSFER_IN_BOND` |

**Consequence:** the lineage view is a **DAG, not a tree and not a timeline**. A node may have multiple parents (blend) and multiple children (split). The rendering must not assume one of each.

## 4. Field-by-field provenance for the approved screens

For every piece of information shown in the approved design: where it comes from, whether it exists, and what happens when it is missing. Classes A–E are defined in `08-data-dependency-matrix.md`.

### Work-order brief

| Shown | Source | Exists? | Derived? | Missing behaviour | Class |
|---|---|---|---|---|---|
| WO number, title, status, due, assignee | `WorkOrder` | yes | no | n/a | A |
| Progress "2 of 9 recorded" | count of `WorkOrderTask` by status | yes | yes, new aggregate | omit the bar, keep the row | B |
| Moving (lot code + wine + block) | `Lot`, `LotVineyard` | yes | no | "Wine not set on this task" | A |
| From (group, vessel count, volume) | `VesselGroup` + `VesselLot` sum | partial — group has no lot binding | yes | list vessels individually | B / RFC-001 |
| Into (vessel, state, cleaned-at) | `Vessel`, `VesselLot`, `VesselActivityEvent` (CLEAN) | yes | yes | omit the cleaned-at clause | B |
| Equipment | `WorkOrderTaskEquipment` → `EquipmentAsset` | yes | no | omit the row | A |
| Measure | `WorkOrderTaskType` / vocabulary | yes | no | omit | A |
| **Take care** | `WorkOrder.instructions` + task hints | yes (text) | no | omit the row entirely — never render an empty warning | A |
| Stage bar | derived from `Lot.form`, states, and op history | yes | yes, new derivation | render only the segments that can be determined | B |
| Lineage 3 entries | `LotLineage` + `LotHarvestSource` + `LotOperation` | yes | yes | "No earlier history recorded for this lot" | B |

### Topping runner

| Shown | Source | Exists? | Missing behaviour | Class |
|---|---|---|---|---|
| Group name, member list, order | `VesselGroup`, `VesselGroupMember` | yes | — | A |
| Barrel cooperage / oak / year / toast | `Vessel.cooperage`, `.oakOrigin`, `.cooperageYear`, `.toastLevel` | yes | "Not recorded", with an admin Add link | A |
| Last topped date per barrel | latest `TOPPING` `LotOperationLine` for that vessel | yes | `—` + footnote; ticking still works | B |
| Flagged-low marker | a prior topping note on that barrel | yes (notes) | omit | B |
| Keg identity, volume, fill number | **does not exist** | no | — | **D — RFC-002** |
| Barrels served by this keg fill | **does not exist** | no | — | **D — RFC-002** |
| Estimated per-barrel volume | derived from the above | no | — | **D — RFC-002/003** |
| Topping source tank + remaining volume | `Vessel` + `VesselLot` | yes | show the tank without a remaining figure | A |
| Group settings (interval, source, keg, SO₂ target, sampling, crew) | **do not exist** | no | — | **D — RFC-001** |

### Tank detail

| Shown | Source | Exists? | Missing behaviour | Class |
|---|---|---|---|---|
| Lot code and wine name on the tile | `VesselLot` → `Lot` | yes | "Empty" or "Wine unknown — retry" | A |
| Volume, capacity, % full | `VesselLot.volumeL`, `Vessel.capacityL` | yes | — | A |
| Composition | `VesselComposition` / `CompositionComponent` | yes | omit the row | A |
| Stage, day count | `Lot` state + first ferment op | yes | derive from `createdAt` | B |
| Brix / temp series | `AnalysisPanel` + `AnalysisReading` | yes | empty-state copy | B |
| Yeast temperature floor | **not modelled** | no | omit the threshold line and its legend entry | **D — small** |
| pH / TA / SO₂ / malic | `AnalysisReading` | yes | omit individual rows | A |
| Tasting notes | `LotTastingNote` | yes | empty state | A |
| History | union of ops, activities, panels, notes | yes — the lot timeline already unions these | — | B |

## 5. Rules for the lineage UI

1. **Never invent an edge.** If two lots are related only by inference, do not draw a line. Missing lineage is shown as "No recorded link", not as a guess.
2. **Fractions are shown when stored, omitted when not.** `LotLineage.fraction` is nullable.
3. **A deleted or merged parent** renders as a grey node reading "a lot that is no longer tracked separately", linking to the merge event.
4. **Planned nodes are dashed and never counted** in volume totals.
5. **Every node opens the work order and ledger lines behind it.** Nothing in the graph is unsourced.
6. **The accessible table is authoritative.** The graph is a visualisation of it, not a separate truth. See `10-accessibility-spec.md` §9.

## 6. What this model deliberately does not do

- It does not create a `ProductionStage` column on `Lot`. Stage is derived, exactly as `STUCK` is deliberately derived from the Brix trend rather than stored.
- It does not merge `AuditLog` into the lot timeline. Audit is a security and change record; the timeline is a production record. They answer different questions for different people, and the dashboard's current habit of rendering raw audit prose to users is a defect, not a pattern to extend.
- It does not give a barrel group a lot identity. See RFC-001.
- It does not model evaporation as an operation. Barrel volume is *derived* from fills, racks and topping estimates; the difference is ullage, not a ledger event.
