# 08 · Data Dependency Matrix

**Classification**

| Class | Meaning | Ships when |
|---|---|---|
| **A** | Existing data, presentational change only | Immediately |
| **B** | Existing data, new query or aggregation | Immediately, after a read-path change |
| **C** | Existing domain behaviour, new API or command surface | Immediately, after a server-action change |
| **D** | New domain behaviour or schema change | Only after an approved RFC + migration |
| **E** | Future concept, not approved for implementation | Never in this release |

Freshness key: `live` (must reflect the last write) · `session` (cache for the page session) · `hourly` · `static`.

---

## 1. Shell and navigation

| # | UI element | Required information | Source | Derived | Missing capability | Freshness | Permission | Mutation | Audit | Offline | Class |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DM-01 | Nav badge: open work orders | count of `WorkOrder` in ISSUED/IN_PROGRESS for the user's scope | `WorkOrder` | count | — | session | role-scoped | — | — | — | B |
| DM-02 | Nav badge: compliance deadlines | existing `complianceDeadlines` prop | existing | — | — | session | admin | — | — | — | A |
| DM-03 | Global search | typed match across barrels, groups, tanks, kegs, lots, WOs, blocks, materials, destinations | multiple | new indexed query | **Search endpoint does not exist.** Must be server-side; 8,142 barrels cannot be client-filtered | live | tenant + role | — | — | — | **C** |
| DM-04 | Recent objects in the empty palette | last 5 objects this user opened | — | — | No "recently viewed" store. Use client `localStorage` keyed per tenant+user; do not create a table | session | self | — | — | — | B |
| DM-05 | Connection indicator | `navigator.onLine` + last successful request | client | — | — | live | — | — | — | n/a | A |
| DM-06 | Held-entry count | outbox depth | — | — | **No outbox exists** | live | self | — | — | required | **D — Phase 28 / D25** |

## 2. Work-order queue

| # | UI element | Source | Derived | Missing | Freshness | Perm | Mutation | Class |
|---|---|---|---|---|---|---|---|---|
| DM-07 | Day headline + state sentence | counts of overdue / open / by-hall | new aggregate over `WorkOrder` + `WorkOrderTask` | — | live | role | — | B |
| DM-08 | Row: where ("7 groups · 420 barrels") | `WorkOrderTask` → group + member counts | aggregate | **Tasks reference vessels, not groups.** Needs the group link from RFC-001 | live | role | — | **D** (falls back to a vessel count = B) |
| DM-09 | Row: progress "129/420" | `WorkOrderTask.status` counts | aggregate | — | live | role | — | B |
| DM-10 | Saved views (Mine / All open / Hall C / Awaiting review) | filters over existing columns | — | Hall filter needs `Location` on the task or group | live | role | — | B |
| DM-11 | Narrowing chips, live | server-side filter + count | — | Existing filters are URL-based already; must drop the Apply step and add type-ahead resolution of terms → entities | live | role | — | B |
| DM-12 | Group expansion → member groups | `VesselGroup` + members | — | see DM-08 | session | role | — | D |

## 3. Work-order brief

| # | UI element | Source | Missing | Class |
|---|---|---|---|---|
| DM-13 | Definition list (Moving / From / Into / Equipment / Measure) | `WorkOrder`, `WorkOrderTask`, `Lot`, `Vessel`, `WorkOrderTaskEquipment`, task vocabulary | — | A |
| DM-14 | "Into" vessel state incl. "cleaned 06:20 today" | `VesselLot` + latest `VesselActivityEvent` kind CLEAN | — | B |
| DM-15 | **Take care** row | `WorkOrder.instructions`, task hints | — | A |
| DM-16 | Stage bar (6 segments, solid/hollow) | `Lot.form`, `afState`, `mlfState`, presence of CRUSH/PRESS/BOTTLE ops | New derivation function. Do **not** store a stage column | B |
| DM-17 | "Where it came from" (3 entries) | `LotHarvestSource`, `LotLineage`, `LotOperation` | New read query unioning three sources | B |
| DM-18 | "Next after this" | scheduled future `WorkOrder` touching this lot | Query exists in principle; needs a lot→WO index | B |
| DM-19 | Blocker text beside a disabled Issue | `WorkOrderReadinessPanel` logic | Move from `title` tooltip to visible text — presentational | A |

## 4. Topping runner — the keg model

| # | UI element | Source | Missing | Class |
|---|---|---|---|---|
| DM-20 | Group members in rack order | `VesselGroupMember` | **No ordering column.** Members are an unordered set; the runner needs a stable walk order | **D — RFC-001** |
| DM-21 | Barrel identity (cooperage, oak, year, toast) | `Vessel.*` | — | A |
| DM-22 | Topping is never blocked by nominal capacity | any capacity validation on `TOPPING` for `VesselType.BARREL` | **Behavioural change.** Downgrade a hard capacity rejection to a soft warning at >15% of nominal, with an override reason | **C** |
| DM-23 | Last-topped date per barrel | latest `TOPPING` line for that vessel | New per-vessel aggregate; index on `(tenantId, vesselId, operation.type, observedAt)` | B |
| DM-24 | Tick a barrel (no volume) | — | **A tick is not a ledger event.** It is an intent captured before the keg closes out. Needs a staging record | **D — RFC-002** |
| DM-25 | Per-barrel note | — | Notes today attach to a task or an operation, not to a pre-ledger tick | **D — RFC-002** |
| DM-26 | Keg identity, capacity, current fill, state | — | No keg entity | **D — RFC-002** |
| DM-27 | Keg fill: source tank, volume, timestamp | — | — | **D — RFC-002** |
| DM-28 | Keg close-out → 1 measured withdrawal + N estimated additions | `LotOperation` with `batchId` (the existing group fan-out mechanism), `TOPPING` op type, `LotLineage.kind = TOPPING` | The op types and the fan-out mechanism **already exist**. What is new is the keg record and the divisor metadata | **D — RFC-002**, but low-risk |
| DM-29 | "≈ estimated" badge and its divisor | `LotOperation.metadata` Json or a new `CaptureMethod` value | `CaptureMethod` is `MANUAL / VOICE / SENSOR / IMPORT` — none means "derived" | **D — RFC-003** |
| DM-30 | Running "wine used" total | sum of the keg's fills minus remaining | derived | **D — RFC-002** |
| DM-31 | Bulk "tick the rest of the group" | N ticks in one command | Same staging record; one command, member-level records | **D — RFC-002** |
| DM-32 | Correction of a closed-out keg | `CORRECTION` op via `correctsOperationId` | Exists for a single op. Re-fanning N estimates on a divisor change is new orchestration | **D — RFC-002** |

## 5. Barrel groups

| # | UI element | Source | Missing | Class |
|---|---|---|---|---|
| DM-33 | Group index (name, lot, count, location, next due) | `VesselGroup` + members | Lot is not bound to a group; location is not on a group; "next due" needs an interval | **D — RFC-001** |
| DM-34 | Group settings: topping interval, source tank, keg preset, SO₂ target, sampling rule, default crew | — | None of these exist. `VesselGroup` has `name`, `note`, `isActive` only | **D — RFC-001** |
| DM-35 | Membership editing | `VesselGroupMember` CRUD | Exists structurally; needs effective dating for historical accuracy | **D — RFC-001** |
| DM-36 | "This group holds two wines" warning | member `VesselLot` lots, distinct | derived | B (once members are queried) |
| DM-37 | Group volume rollup | sum of member `VesselLot.volumeL` | derived; must state that it is a sum of derived barrel volumes | B |

## 6. Tanks

| # | UI element | Source | Missing | Class |
|---|---|---|---|---|
| DM-38 | Tile: tank code + **lot code** + volume + state | `Vessel`, `VesselLot`, `Lot` | — | A |
| DM-39 | Tile fill height | `VesselLot.volumeL / Vessel.capacityL` | — | A |
| DM-40 | Tile state glyph (fermenting / aging / empty / needs attention) | `Lot.afState`, cap-work recency, `VesselActivityEvent` | New derivation | B |
| DM-41 | Board filters (Fermenting / Empty / Needs work) | above | — | B |
| DM-42 | Tank detail facts + composition | `Vessel`, `VesselLot`, `VesselComponent` | — | A |
| DM-43 | Brix + temperature series | `AnalysisPanel` + `AnalysisReading` | New time-series read per vessel/lot | B |
| DM-44 | Yeast temperature floor line | — | Yeast strain and its temperature range are not modelled | **D — small**; omit the line until then |
| DM-45 | Latest analysis panel | `AnalysisPanel` newest non-voided | — | B |
| DM-46 | Tasting notes | `LotTastingNote` | — | A |
| DM-47 | History tab | union of `LotOperation`, `VesselActivityEvent`, `AnalysisPanel`, `LotTastingNote`, `LotStateEvent` | The lot timeline already unions these; needs a vessel-scoped variant | B |
| DM-48 | Actions (Record a reading / Add / Rack / Cap work) | existing cellar actions | — | A |

## 7. Recording, receipts, correction

| # | UI element | Source | Missing | Class |
|---|---|---|---|---|
| DM-49 | Idempotent record | `WorkOrderTaskAttempt.commandId` (unique), `LotOperation.commandId` (unique) | Already exists — reuse, don't rebuild | A |
| DM-50 | Receipt: value, destination, actor, time, ledger line id | `LotOperation` + lines | Exposing a human-readable ledger line reference is new | B |
| DM-51 | "Correct this entry" | `CORRECTION` op via `correctsOperationId` | Exists | A/C |
| DM-52 | Blocked-correction message naming the later op | LEDGER-11 logic | The rule exists; surfacing *which* operation blocks it, in prose, is new | C |
| DM-53 | Corrected marker in history | presence of a correcting op | derived | B |

## 8. AI and assistant

| # | UI element | Source | Missing | Class |
|---|---|---|---|---|
| DM-54 | Draft card in the dock | existing assistant draft-card guarantee (plan 081) | — | A |
| DM-55 | **"Review & create" navigates to the created object** | assistant tool result → route | **This claim was wrong on both halves (plan 105).** The tool did not merely create — it created and then immediately ISSUED (`propose-work-order.ts:544`), contradicting `03-interaction-spec.md:179`. And a `navigate` payload already reached the client (`commit.ts:19` → `confirm/route.ts:30`), rendered as a "View X →" link. SHIPPED: draft by default, an explicit "issue it" still issues, and the client navigates unless the source or target is `/assistant` (where the session would end). | **C** |
| DM-56 | Dock continues on the same object after navigation | conversation persistence (exists) + page context | Needs the page to pass its object context to the dock | C |
| DM-57 | Provenance chips on an AI statement | the records the tool actually read | **DEFERRED out of Phase 9 (plan 105, council).** `ProvenancePanel` (B33) ships with its first real producer, not before: an invisible component with a null-return contract is prop surface and test churn for zero user value. When it lands, note the rule is "the provenance PANEL is not shown" — gating the assistant's ANSWER on an unwired predicate would mute correct replies and read as a broken assistant. | C |
| DM-58 | "Ranking is off right now" degraded state | AI availability | **Rescoped, plan 105 U5.** The approved copy describes the ranked "Now" queue — a Phase 5+ surface that does not exist (no `/now` route; `SavedViews`/`Narrow` unbuilt), so there is no working state to degrade from. BUILT instead: SC-12's row — the dock says the assistant is unavailable, from one server-owned gate shared with `/api/assistant`, and search/records/recording are provably unaffected. The ranked-queue copy lands with the ranked queue. | A |

## 9. Scan

| # | UI element | Source | Missing | Class |
|---|---|---|---|---|
| DM-59 | Scan a barrel / tank / group / keg tag | — | No `BarcodeDetector`, no Web NFC, no tag identifier on `Vessel` | **D — RFC-004** |
| DM-60 | "Tag read" confirmation and position set | — | — | **D — RFC-004** |
| DM-61 | Print a tag | — | No label/print pipeline | **E — future** |

## 10. Lineage

| # | UI element | Source | Missing | Class |
|---|---|---|---|---|
| DM-62 | Lineage DAG nodes and edges | `LotLineage` (`kind` SPLIT/BLEND/TOPPING, `fraction`), `LotHarvestSource`, `LotOperation` | New graph read; must handle multi-parent and multi-child | B |
| DM-63 | Solid = recorded, hollow = planned | ledger vs. `WorkOrder` | New join | B |
| DM-64 | "Contributed 340 L to the 2024 Estate Red" | `LotLineage` + the blend op's lines | derived | B |
| DM-65 | Phone event stream | same data, different projection | — | B |
| DM-66 | Accessible lineage table | same data | — | B |

## 11. Summary by class

| Class | Count | Meaning for planning |
|---|---|---|
| **A** | 17 | Ship in phase 1–3 with no backend work |
| **B** | 26 | Read-path work only: new queries, aggregates, indexes |
| **C** | 7 | New server actions / API surface over existing domain behaviour |
| **D** | 15 | **Blocked on an approved RFC and migration** — barrel-group config (RFC-001), keg + tick + estimate (RFC-002), provenance flag (RFC-003), tags (RFC-004), outbox (Phase 28), yeast temperature range |
| **E** | 1 | Tag printing — out of scope |

**Planning consequence:** the entire shell, the queue, the brief, the tank board and the tank detail are A/B/C and can ship without a single migration. Only the topping runner, barrel-group settings and scan require D work. That is the natural phase boundary and it is the basis of `11-implementation-sequence.md`.
