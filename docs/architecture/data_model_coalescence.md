# Data-model coalescence — Cellarhand vs Vintrace + InnoVint

> **Canonical reference for going to market at data-model parity with the incumbents.**
> When you build a new feature, check it here first: align to where the two battle-tested
> incumbents **coalesce**, keep our deliberate divergences (the moat), and don't re-derive
> a shape they already solved. Referenced from `CLAUDE.md`.
>
> **Method:** where Vintrace AND InnoVint agree on a data-model shape, that convergence is
> load-bearing — align. Where they diverge, it's a *choice*, not a mandate. Where WE diverge
> on purpose (append-only correctness, lineage, DB-RLS), keep it and market it.
>
> Produced by a full 8-domain audit, 2026-07-23 (ownership/AP audited separately in
> `docs/plans/092-incumbent-parity-ap-custom-crush.md`). Verdicts verified against
> `prisma/schema.prisma` at audit time.

## How to read a verdict

| Verdict | Meaning | Action |
|---|---|---|
| `aligned` | We already match (often exceed) where both coalesce | None |
| `keep` (deliberate-divergence) | We diverge on purpose; it's a moat or an intentional posture | Keep, and market it |
| `align-retroactively` | Built but diverges/incomplete vs where both coalesce | Fix in the owning phase |
| `build-new` | Both coalesce on something we lack | Sequence into the pipeline / roadmap |

## ⚠️ Doc-freshness correction (read first)

The `analysis/incumbent-teardown/*` docs and `docs/analysis/vintrace-vs-innovint-crosswalk.md`
are a **point-in-time snapshot and are now STALE** on many `[ABSENT]` tags. The audit confirmed
these are **BUILT**: first-class `Bond` (`schema.prisma:2487`), `TRANSFER_IN_BOND` +
`RETURN_TO_BOND`, `ChangeOfTaxClassEvent`, lifecycle writers (DEPLETED/ARCHIVED), `NamingTemplate`
+ `Lot.displayName` + `LotCodeEvent`, per-bond report scoping. Two crosswalk tags are simply
**wrong** and should be corrected: **BOL is not "both weak — moat"** — InnoVint ships a full
Bill of Lading (table-stakes); and **transfer-in-bond is not `[ABSENT]`** — it shipped. (Fix-forward
item in the pipeline: refresh the teardown/crosswalk.)

---

## The moat — where WE lead (keep and market, do NOT align away)

These are deliberate divergences where our model is *better* than both incumbents. They are the
migration-pitch and the differentiation. Never "align" them down.

| Moat | Why it beats both | Evidence |
|---|---|---|
| **Append-only correction-as-event ledger** | Both incumbents DESTROY or MUTATE history — Vintrace rollback-and-replay (escalates to a support ticket at scale), InnoVint edit/delete-cascade (capped at 50, case-goods barred, unrecoverable). Ours never mutates: a compensating `CORRECTION` + LIFO unwind + auto-Amended TTB. | `LEDGER-10/11`, `cellar/correct.ts`, `reverse.ts` |
| **Immutable, bidirectional lineage DAG** | Both only *imply* lineage from mutable op logs; neither exposes a parentage graph. Ours is a first-class `LotLineage` edge table with fractions. | `schema.prisma:1879`, `lineage.ts` |
| **Append-only rename** | Rename via `LotCodeEvent` without rewriting line snapshots. Both incumbents rewrite ALL history on a code change. | `rename.ts`, `LotCodeEvent` |
| **One-lot-per-vessel is PARITY, not divergence** | Both incumbents forbid two lots in one vessel (InnoVint's phantom-vessel split *proves* it). Our `UNIQUE(tenantId, vesselId)` + monotone chokepoint is the cleanest implementation — kills the "which lot?" prompt that has no physical answer. | `LEDGER-12`, plan 088 |
| **Auto-symmetric cross-tax-class posting** | Both require an error-prone phantom/dummy-vessel workflow; ours auto-posts §A5/§A20 atomically from the blend event. | `TAXCLASS-1`, `verify:taxclass` |
| **Auto barrel depreciation** | Both track barrel depreciation MANUALLY (schedule kept outside the tool). Ours is fill-based SYD, materialized as a CostLine at fill close. | `BarrelAsset`/`BarrelFill`, `schema.prisma:2995` |
| **TTB 5000.24 excise return + CBMA ladder** | NEITHER incumbent has a 5000.24 engine or CBMA credit ladder. Ours is complete. | `excise.ts`, `cbma.ts`, `verify:excise` |
| **WO: immediate immutable op-write + review gate** | We write the ledger op at task completion (InnoVint-style) AND add an approve/reject gate (Vintrace-style) on an append-only idempotent attempt neither has. | `execute.ts`, `WorkOrderTaskAttempt` |
| **Bond as ledger-derived, not a stored column** | Both derive bond but from a mutable attribute; ours derives from the immutable ledger (`deriveBond`). | `bond.ts:83` |
| **Tax-class derived-default + append-only dated override** | InnoVint edits tax class in place / deletes; ours never mutates. | `ChangeOfTaxClassEvent`, `tax-class.ts` |
| **Self-serve Vendor + materials catalog** | InnoVint requires a support ticket to add a vendor and locks units; ours is self-serve. | `Vendor`, `CellarMaterial` |

**Confirmed differentiators still UNBUILT (build them, they're ahead of both):**
- **`CostLine.visibility` split** (client-billable vs facility-overhead) — neither incumbent has
  line-level facility-cost redaction. Verified absent in schema. Built by plan 092 (Council C2).
- **Purpose-built client "Your wine" home** — neither has a branded portal (both = owner-scoped
  logins in the same app). Built by plan 092 (design review).
- **DB-enforced RLS owner scope** — both scope in the app layer. Built by plan 092.

---

## Deliberate divergences to KEEP (not moat, but intentional — don't "fix")

- **Fruit as `HarvestPick`, not an InnoVint "Fruit Lot"** — matches Vintrace's fruit-intake shape;
  avoids InnoVint's frozen-composition "delete and start over" awkwardness. (Cleanup: the unused
  `LotForm.FRUIT` enum value is vestigial — annotate or remove.)
- **Three-vector production state** (`form` + `afState` + `mlfState`) instead of InnoVint's linear
  `Stage` enum — real ferment isn't linear.
- **Scalar ownership, no fractional — KEPT for now, but this is the #1 partner-validation question**
  (council, 2026-07-23). Matches InnoVint's tag/scalar model; Vintrace pairs fractional
  `ownership[]={owner,percentage}` with the same `CHANGE_OWNER` event we're adding, so the *event* is
  load-bearing, not the fraction. Gemini flagged scalar as "a fatal error for custom crush / AP" —
  real APs do 50/50 JVs and a facility takes a fractional cut of bulk wine as a processing fee.
  **Decision (Russell, 2026-07-23): keep scalar now** (RLS stays a sargable column compare, not a
  join; plan 092 isn't blocked; the "10% facility cut" is a CostLine/billing concern, not
  wine-ownership), **but design the Owner entity so fractional is an ADDITIVE extension, not a
  rewrite, and CONFIRM whether the target design partner does JV/fractional deals before finalizing.**
  ⭐ This is the single highest-value discovery question for the first partner.
- **No unified Party table** — the incumbents SPLIT here (Vintrace = one Party with roles; InnoVint =
  separate Grower/Owner-tag/Vendor). Parity does NOT force unification. Build the missing party
  *entities* standalone (Grower, Owner); treat "one Party with roles" as an optional later consolidation.
- **Customer deliberately absent** (D19 DTC PII-minimization) — Commerce7 customers stay opaque.
- **Typed operation set** (vs incumbents folding treatments/adjustments) — cleaner compliance mapping.
- **DSP / formula wine out of scope** — reject >24% ABV (matches InnoVint's posture; Vintrace has a
  paid DSP add-on). Document the boundary so a formula producer isn't silently mis-filing.

---

## Assistant coverage is part of the definition of done (not optional)

This app is AI-native: `verify:ai-native` FAILS if a domain core has no assistant tool, and every
new tool needs a golden eval (D26/H8). So **every cellar-floor `build-new` below carries an
`+ assistant` tag** — it isn't done until it has a tool + eval + registry/prompt wiring. The rule
(council, 2026-07-23):

- **Wet-hands → the assistant needs a tool. Desk-with-coffee → the GUI is enough.** A winemaker
  logs intake and completes work with sticky hands; they configure cost buckets and RBAC at a desk.
- **Domain-composite, not one tool per micro-core.** We're at ~86 tools against a ~40-tool
  selection-accuracy cliff — group by aggregate (`vessel`, `harvest`, `cost`, `compliance`), extend
  an existing tool where possible, don't proliferate.
- **Read tool** for projections/reports/queries; **write tool** (D10 propose→confirm) for mutable
  paths. Config/back-office cores can be `INTERNAL` (exempt from `verify:ai-native`) — GUI only.

## The pipeline — GTM-ordered (custom-crush onboarding critical path)

Re-sequenced by **what a custom-crush design partner needs to onboard** (council, 2026-07-23), not by
build-risk. Runway: the roadmap concedes harvest 2026 and targets **harvest 2027** (sign-by-fall →
validate Jan–Jun), so this is a priority order, not a fire drill. Each item is a **plan → work →
verify** cycle. `S/M/L` = effort; **⚠️** = touches the live lot/ledger/RLS spine → **backfill-then-
enforce on the live tenant, never a bare additive migration**. `+asst` = needs assistant tool + eval.

### P0 — Custom-crush core (the deal-makers)
The three things custom crush lives on are ownership, intake, and billing visibility. Ownership +
billing land here; intake is P0-Intake below.

> ⚠️ **DEPENDS ON THE FOUNDATION (re-sequenced 2026-07-23, Russell).** P0 splits in two: build the
> ownership **data model** (Owner entity, `ownerId` + directional attribution, `CHANGE_OWNERSHIP`,
> bond precedence) + the intake spine **first, with NO RLS**, and VERIFY it against real custom-crush
> scenarios; **then** layer the RBAC **enforcement** (capability matrix + RESTRICTIVE RLS quad) on the
> verified model. This splits what plan 092's old "Branch A1" bundled. Build **scalar ownership,
> structured for additive fractional** (facility cut = CostLine/billing, not wine-ownership; confirm
> JV/fractional with the design partner). Rationale: scalar-vs-fractional = column-vs-join, the one
> choice that would force a full RLS re-migration on the live tenant. Plan 092 is the enforcement half.

| Item | Verdict | Effort | Assistant | Note |
|---|---|---|---|---|
| **Owner** entity (replace the `LotOwnership` enum with a real record; wire `Bond.ownerId`) | build-new | L ⚠️ | +asst read ("show me Client X's lots") | Standalone entity, not a forced Party table. ⭐ Design for ADDITIVE fractional extension (see the ownership-decision note above — confirm JV/fractional with the partner). |
| **`CHANGE_OWNERSHIP`** operation | build-new | M ⚠️ | +asst write (D10) | Both incumbents have it; we defer. Cross-owner blend = transfer-first. |
| Bond derivation: **AP-owner precedence** (+ optional location-default) | build-new | M ⚠️ | — (GUI) | The `Bond` ENTITY is already built (`schema.prisma:2487`); `deriveBond` stays ledger-derived and now *consults* owner. Re-scoped plan 092 Unit 3c. |
| **`CostLine.visibility`** split (client_billable / internal_overhead) | build-new | M ⚠️ | — (GUI config) | THE custom-crush differentiator (neither incumbent redacts facility cost from a client). Backfill default `internal_overhead` → derive from ownership → enforce. |
| Owner-scoped materials (owner tag + RLS on dry goods) | build-new | M ⚠️ | — | Gated behind the Owner entity. |

### P0 — Intake / crush-pad survival
Can't legally receive a custom-crush partner's fruit without this.

| Item | Verdict | Effort | Assistant | Note |
|---|---|---|---|---|
| First-class **Grower** entity + grower FK on Vineyard/Block | build-new | M ⚠️ | +asst read | **Strongest both-incumbent gap in the audit.** Replaces free-text `VineyardDetail.manager`. Needed for intake TTB attribution. |
| **Weigh-tag/weighmaster** certificate (monotonic, void-not-delete) + tare/bin weigh-groups | build-new | M/L ⚠️ | +asst write ("took in 4 tons of Cab from Smith Ranch, bin weights…") | Both ship sequential weigh-tags + gross/tare/net; we have `HarvestPick` weight only. |
| Owner/grower/sold refs on `HarvestPick` (→ TTB Part IV fruit removal) | align-retro | M ⚠️ | — | Depends on Grower + Owner (both P0). |

### P1 — Cellar execution + billing capture (during harvest)
| Item | Verdict | Effort | Assistant | Note |
|---|---|---|---|---|
| WO task-completion **effective-time "as-of"** | build-new | M ⚠️ | +asst write ("mark pumpover on T4 done, effective 10 min ago") | We hard-stamp server-now; both let the operator set it. Touches `observedAt` → ⚠️. |
| Blend-trial **predicted-analysis** (weighted lab estimate) | build-new | S | +asst read ("predicted TA if I blend A and B?") | Pure fn over existing `AnalysisReading`. Genuinely cheap. |
| First-class **Tag** model + blend-inheritance-by-weighting | build-new | M ⚠️ | +asst read | Heavily used to sort client lots. Backfill-then-enforce (new join). |
| Guarded lightweight in-place edit — **NON-LEDGER metadata ONLY** | build-new | S | — | ⚠️ Codex: this is NOT a cheap win if it touches ledger ops; scope it HARD to non-ledger fields (notes/dates on non-posted records) or it violates correction-as-event. Re-labeled from "trivial ops." |

### P1 — Outbound & compliance docs (as harvest wine moves/ships)
| Item | Verdict | Effort | Assistant | Note |
|---|---|---|---|---|
| **Bill of Lading** generator off `TRANSFER_IN_BOND` | build-new | M | +asst read | InnoVint table-stakes (correct the crosswalk mis-tag). We own every input. On-demand PDF. |
| `deriveTaxState` projection (BONDED/TAXPAID/NON_DECLARED) | build-new | S | — | The missing peer of `deriveBond`/`deriveTaxClass`. Cheap projection; the reporting UI can wait. |
| Wire PACKAGING depletion into `BottlingCostSnapshot` (`packagingCost=0` today) | align-retro | M | — | No schema change; captures direct packaging cost for billing. |

### P2 — Reference / quality (non-blocking; do as capacity allows)
| Item | Verdict | Effort | Assistant | Note |
|---|---|---|---|---|
| Vessel types **KEG, BIN** + capacity display-unit | align-retro | S | +asst read ("where are the empty kegs?") | Bin unblocks tare/weigh; keg is packaging table-stakes. Additive enum. |
| **AVA/appellation** field on Vineyard (+ composition tuple) | build-new | S→M ⚠️ | — | Never flows to the bottle today. Backfill on the composition tuple → ⚠️. |
| Break-barrel op + barrel-group metadata | align-retro | S/M | — | `VesselGroup` is thin. **Nuance (Gemini):** one-lot-per-vessel is right for the atomic tank/barrel, but a macro-bin/cage/pallet in custom crush holds MIXED lots — the group must allow a mixed-lot *association* even though the atomic vessel stays 1:1. |
| Vessel **archive-not-delete** guard | align-retro | S | — | Stop cascade-delete of used vessels. |
| Cost enum add-values `STORAGE` / `FREIGHT` / `OTHER` | build-new | S | — | Isolated additive enums mirroring Vintrace's `CostBreakdown`. Genuinely cheap. |
| §A **line-25** (declared→undeclared) posting + explicit undeclared class | align-retro | S/M ⚠️ | — | Fold logic; get the data in the ledger now, the report can wait. |

### P3 — Deferred / killed (post-harvest, Q4+)
Both reviewers: don't build these for the partner MVP.

| Item | Disposition | Why |
|---|---|---|
| Graphical **tank map** renderer | **KILL for MVP** | Winemakers use whiteboards at harvest; a text location list is enough. (Phase 18 later.) |
| **Drag-drop scheduling calendar** UI | **KILL for MVP** | A chronological WO list suffices; complex frontend we don't need now. |
| **Indirect-overhead allocation** writer | **DEFER to Q4** | Managers do indirect-cost math in Excel for the first billing cycle; capture DIRECT cost + `CostLine.visibility` only. (Phase 11.) |
| Cost-period **backdating lock**; per-op **labor auto-cost** | **DEFER** | Not needed to onboard; labor auto-cost is a later moat play. (Phase 11.) |
| **State Alcohol Category** / dual tax class; **TTB audit CSV** | **DEFER to Dec** | Get raw data in the ledger now; generate these when audits/reports actually run. (Phase 14.) |
| Vessel **physical-location** sub-model; **dip charts** | **DEFER** | Additive later; not on the onboarding path. (Phase 18.) |

### Always-on — Fix-forward the stale docs (S)
Refresh `analysis/incumbent-teardown/*` + the crosswalk: un-tag the built items (transfer-in-bond,
`Bond`, lifecycle writers, `NamingTemplate`, tax-class events) and correct the BOL "both weak — moat"
mis-tag to "InnoVint table-stakes."

---

## Roadmap mapping

`build-new` items map to existing phases (see `ROADMAP.md` §"Data-model coalescence backlog"). Note
the **GTM priority (P0–P3) cuts ACROSS phase numbers** — P0 is Phase 23 (ownership) + Phase 20/30
slices (Grower, weigh-tags) pulled forward, because those are the custom-crush onboarding path:
- **P0 → Phase 23** (Owner, CHANGE_OWNERSHIP, bond precedence, CostLine.visibility) + **Phase 20/30
  pull-forward** (Grower, weigh-tags — the intake path a partner needs first).
- **P1 → Phase 14** (BOL, deriveTaxState) + WO/blend/Tag slices.
- **P2 → Phase 20** (AVA) + vessel/cost quality items.
- **P3 → Phases 11 / 14 / 18** (overhead allocation, state tax, tank map — all deferred).
