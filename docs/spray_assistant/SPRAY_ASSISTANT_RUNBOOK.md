# Spray Intelligence — Build Runbook

**Status:** master runbook (stable). **Council-reconciled 2026-07-26** — see
[RUNBOOK-council-feedback.md](./RUNBOOK-council-feedback.md) for the review and the adjudication of
every finding. Phase plans are generated fresh per phase and live in `docs/spray_assistant/phases/`.
**Owner:** Russell Moss
**Started:** 2026-07-26
**Contract document:** [spray-decision-discovery-brief.md](./spray-decision-discovery-brief.md)
(the "brief" — decision model, honesty contracts, the clocks, residual math, pathogen models,
interlock matrix, data model, output shape).
**Data-source research:** [spray-data-sources-design.md](./spray-data-sources-design.md)
(what is verified live, what is paid, what does not exist).
**Standing QA protocol:** [qa/QA-PROTOCOL.md](./qa/QA-PROTOCOL.md) — the in-browser pass Claude runs
after **every** phase, no exceptions.

The product job:

> Let a grower talk to Cellarhand about a spray decision and get back an inspectable decision
> record — what the risk is, whether the block is still protected, what is legally and physically
> possible in the next window, and what we do *not* know — grounded in that block's own weather,
> phenology, and spray history.

## 1. How to use this runbook

Same hybrid model as the Vineyard Intelligence program:

1. **This runbook stays stable.** It owns phase order, parallel lanes, standing rules, acceptance
   gates, and the status ledger. The brief owns the domain/math/honesty contracts.
2. **At the start of each phase**, run `/plan` against the repo *as it exists then* → a plan doc in
   `docs/spray_assistant/phases/`, then `/council` it (Gemini + Codex), then reconcile.
3. **Execute only that phase** with `/work`, then the **standing QA protocol** (§6), then `/ship`.
   Never ask an agent to build the program from the brief in one pass.
4. **End every phase** with: gates verified, a **QA report** in `qa/`, a **phase report** in
   `phases/`, the status ledger (§8) updated, and `NOW.md` updated.
5. If the codebase contradicts the brief, **preserve the product/safety rule and adapt the
   implementation.**

## 2. Relationship to existing plans (read before planning anything)

This program **absorbs three pieces of already-done thinking**. Do not re-derive them, and do not
let a second program build the same thing.

| Existing artifact | Disposition |
|---|---|
| [plan 086 — US pesticide registration](../plans/2026-07-20-086-feat-us-pesticide-registration-plan.md) (`status: draft`, 11 units, live-probed endpoints, measured de-risk) | **Absorbed.** Units 1–3, 5–7, 9, 11 become **S2**. Unit 10 (the spray record) becomes the seed of **S3a**. Unit 8 (assistant tool) is deferred into **S11** so the program ships one composite tool, not two. Its Key Decisions and Risks tables carry over verbatim. |
| VI runbook **P9 — Weather disease intelligence** ([../GIS/VINEYARD_INTELLIGENCE_RUNBOOK.md](../GIS/VINEYARD_INTELLIGENCE_RUNBOOK.md) §5) | **Superseded by S1 + S5a/S5b.** P9's own plan carried a decision gate: *"if reconstructed-diurnal proves too coarse for botrytis/downy, spike an hourly source."* **S0 resolves that gate before we build on the coarse path.** Mark P9 in the VI ledger as superseded-by-Spray-Intelligence when S5b ships. |
| ROADMAP **Phase 20 — Vineyard ops, equipment & farming cost** | **Adjacent, not absorbed — and the seam runs straight through `docs/spray orders/Spray work order template.xlsx`.** Phase 20 owns cost and equipment (rig, tractor, machine-hours, fuel, tanks/gal → consumable draw-down, labor, per-block cost, PUR export). This program owns the spray *decision*, the *record*, and the *plan*. **S3a's record is the row Phase 20's WO will later write** — Phase 20 becomes an authoring surface over it, never a parallel table. Field-by-field split in §9 S3a. |

## 3. Standing rules (non-negotiable, every phase)

1. **The label is the law, and we are not it.** No output may present a synthesized number as
   authoritative. Every legal fact carries its source and an as-of date. The system recommends and
   explains; a human authorizes. There is no auto-approve path, ever.
2. **Two engines, never mixed** (brief §2). Deterministic facts — registration, state legality,
   PHI/REI, resistance groups, phytotoxicity interlocks — are **relational joins, never
   LLM-inferred and never retrieved from the embedding corpus**. Probabilistic outputs — infection
   risk, residual estimate, protection confidence — are indices that prompt scouting.
   **The model may never produce a hard stop.** A hard stop is a join result; the model may only
   explain one, and it must do so by rendering the canonical `blockReason` string **verbatim**
   (§5, council D2).
3. **"Cannot determine safely — human review required" is a first-class output**, not an error
   path. It must be reachable, renderable, and tested. With grid-estimated leaf wetness it will
   fire often and legitimately.
4. **Risk and confidence are two separate numbers on every output.** "Downy risk: high · Data
   confidence: low (nearest station 6 km, 110 m below site, leaf wetness estimated)" is the
   minimum shape. Never one without the other.
5. **Estimated is labeled estimated, with the estimator named.** Leaf wetness, diurnal
   reconstruction, and growth interpolation are all inferred. A grower must be able to tell
   measured from modeled at a glance.
6. **A coverage gap must never render as "no restriction."** This is the single most dangerous
   failure mode in the program (plan 086 Risks). An uncoded active ingredient, an unmatched
   product, or a missing spray record renders as *unknown*, visually distinct from *clear*.
7. **A model may not depend on data the system does not collect.** *(New — council C10.)* If a phase
   proposes an index whose inputs have no structured source, either the phase adds the collection
   surface or the index is cut to Later. Sour rot triggered this rule; it will not be the last.
8. **Decisions replay under facts-as-of-then, not facts-as-of-now.** *(New — council C4.)* Every
   spray record carries a **facts snapshot** (resolved AIs, resistance groups, PHI/REI, rainfast,
   mobility class, facts revision + as-of date). A monthly reference refresh must never silently
   change what a past decision meant; where current facts differ, surface it as a flag.
9. **Non-US tenants are first-class.** *(New — council C6; Bhutan is a LIVE tenant.)* The regulatory
   layer is US-only, so a non-US tenant defines product facts manually (tenant-scoped, attributed,
   marked "grower-supplied, not registry-verified"). The agronomic engines are jurisdiction-neutral
   and must work unchanged. **The app must never brick outside the US.**
10. **Entitlement lives in the shared service layer, not the tool.** *(Revised — council C7.)*
    Registration reference data is tenant-global with no RLS, but S9/S10 are server components and
    actions, not tools, and would bypass a tool-level check. Gate it in the domain service both
    tools and UI consume, with page-level *and* assistant-level tests.
11. **Tenant isolation is absolute** for domain data (spray records, programs, risk state,
    phenology): full `AGENTS.md` Phase-12 checklist. The tenant-global reference exemption goes on
    the RLS-coverage guard's explicit skip list so it is deliberate. On the live tenant, anything
    with FK/RLS/uniqueness/event-writes is **backfill-then-enforce**.
12. **Demo Winery only** for dev/QA/fixtures (`org_demo_winery`), `QA-*` prefixes, cleaned up after.
    Never Bhutan. `verify:naming` green before AND after.
13. **Pure modules + goldens for all math.** Infection indices, LWD estimation, residual decay,
    growth dilution, Delta T, rotation budgets — pure, unit-tested, no Prisma/React imports, no live
    providers in tests. Same discipline as `src/lib/weather/*` and `src/lib/gis/*`.
14. **Spray history is append-only and correctable-as-event.** A mis-entered spray is corrected by
    a reversing event, never an in-place edit — it is a regulatory record and it is the input to a
    residual clock. **A correction must propagate to residual, PHI, rotation, AND the lot-residue
    flag** (council S9) — that propagation crosses four phases and is gated in S9.
15. **ONE composite read tool + ONE write tool for the whole program.** `ALL_TOOLS` is at 95 and
    `docs/architecture/assistant-coverage.md` puts the selection-accuracy cliff at ~30–40 with the
    fleet eval as the canary. See §5.
16. **In-browser QA after every phase** ([qa/QA-PROTOCOL.md](./qa/QA-PROTOCOL.md)). Not optional,
    not waivable by parallelism, not replaced by unit tests. Every phase produces
    `qa/S<n>-qa-report.md` with evidence.
17. **No FRAC / HRAC / IRAC compilation is parsed or redistributed** (plan 086 Key Decisions,
    binding user decision). Codes are derived from Tier-1 extension sources already in the corpus,
    every row cited. **Accepted risk (council P1): the derived table has no vendor update SLA.**
    Mitigations are mandatory, not optional — the coverage report, gap-renders-as-unknown (§3.6),
    the monthly re-derivation in S2's refresh, and the tenant manual-override path (§3.9).
18. **Design/UX:** DESIGN.md tokens + `docs/architecture/ux-principles.md`. Risk states need a
    governed visual vocabulary (clear / watch / act / unknown / blocked) defined **once**, in S9.
    **If S9 cannot write a one-sentence operational instruction for a state, that state does not
    exist** (council D3).

## 4. Phase map and parallel lanes

> **Re-shaped after council review (Russell's decision, 2026-07-26): front-load the deterministic
> engine.** A grower needs *"can I legally put this in the tank, and does it rotate?"* long before a
> 6 km-grid leaf-wetness estimate. Splitting S7 also removed a hidden dependency the original graph
> hid. Rationale in [RUNBOOK-council-feedback.md](./RUNBOOK-council-feedback.md) C5.

```text
Wave 1   S0  Spike: hourly path, LWD estimator, retention   ⚡  S2  Registration & resistance
             (gates ONLY the weather lane)                          → S2b Product facts master
         ⚡  S3a Spray RECORD + planned harvest              ⚡  S4  Phenology + growth model
             → S3b Spray PROGRAM / season plan

Wave 2   S7a Legality + rotation engine  ← DETERMINISTIC VALUE SHIPS HERE
         ⚡  S8  Lot-level residue crossover  ← the moat
         ⚡  S5a Powdery-mildew index (daily data) + latent-infection ledger
         ⚡  S1  Hourly weather + humidity + LWD

Wave 3   S5b Hourly pathogens (downy, black rot, phomopsis, botrytis)
         ⚡  S6  Protection budget (residual decay)
         ⚡  S7b Weather-conditioned interlocks + application window

Wave 4   S9   Decision record composition + risk visual vocabulary        (solo, convergence)

Wave 5   S10 Spray planner surface             ⚡  S11 Assistant spray tools + goldens

Anytime  SKB  Knowledge-base IPM source expansion   (background lane)

Later    Export-market MRL checks (council D1 — documented, not built) · on-site weather sensor
         ingest · label rate/PHI extraction from PDFs · NY/OR/WA state layers · CA PUR export ·
         NEWA integration · drift / DriftWatch neighbor registry · sprayer calibration + coverage
         audit (folds into ROADMAP Phase 20)
         [sour rot MOVED OUT of Later → S5b on 2026-07-26; S4 adds the scouting observation, §12 q3]
```

**Dependency edges (council-corrected):**
`S0←∅` · `S2←∅` · `S2b←S2` · `S3a←∅` · `S3b←S3a` · `S4←∅`
`S7a←S2,S2b,S3a` · `S8←S2,S2b,S3a` · `S5a←∅` (existing daily weather) · `S1←S0`
`S5b←S1,S4` · `S6←S1,S2b,S3a,S4` · `S7b←S1,S2b,S3a,S4`
`S9←S5a,S5b,S6,S7a,S7b` · `S10←S9,S3b` · `S11←S9` · `SKB←∅`

⚠️ **Three edges the first draft got wrong**, both reviewers caught them, and they are the reason
S5 and S7 split: S7's sulfur×temperature and copper×slow-drying interlocks need **hourly weather
(S1)**; S7's fruit-present conditions need **phenology (S4)**; and the 3-10 downy rule needs
*"shoots ≥10 cm"* from **S4**. The original claim that each Wave-2 lane hung off a *different*
Wave-1 lane was false.

### Why this shape

**Wave 2 is a shippable product on its own.** Legality + rotation + the lot-residue moat + a working
powdery-mildew index, with **no dependency on any hourly-weather work**. Those answers are exact,
defensible, and the ones a grower asks first. The speculative modeling — everything that rests on an
estimated leaf wetness from a grid cell miles away — lands in Wave 3, after the foundation earns
trust.

**S8 remains the schedule win.** Spray history following the fruit into the tank as a lot-level
residue flag needs only `S2, S2b, S3a` — no model stack. It is the highest-differentiation feature
in the program and it ships in Wave 2.

**S0 no longer blocks the program**, only the weather lane. The deterministic lanes start
immediately alongside it.

**S3a is the single most depended-upon phase** — S7a, S8, S6, S7b, and half of S9 all read the spray
record. It splits so the record lands as its own PR and opens Wave 2; the season program follows in
the same lane and blocks nothing.

### Parallel-build mechanics

- Lanes marked ⚡ run as simultaneous branches/PRs in separate sessions/worktrees. **Verify
  disjointness at `/plan` time** against the shared-file map below.
- **Shared-file map** *(council S8 — the blanket "file-disjoint by construction" claim was false)*.
  These are touched by more than one lane and must be serialized, not merged in parallel:

  | File | Touched by | Handling |
  |---|---|---|
  | `prisma/schema.prisma` + migrations | every lane | small **schema-first slice PR** per lane, serialized across lanes; isolated `ALTER TYPE` before any dependent default (Windows enum rule) |
  | `src/lib/spray/contributors.ts` (barrel) | every model lane | one-line append per lane; treat like schema |
  | `scripts/ai-native-allowlist.mjs` | every lane adding a core | one entry per lane, additive |
  | `docs/architecture/assistant-coverage.md` | any lane changing a core export | **generated** — run `verify:ai-native -- --write` before push, or CI reds |
  | `test/evals/assistant-*.golden.ts` + `assistant-tools.eval.test.ts` | S5a, S11 | serialize |
  | `src/lib/assistant/registry.ts`, `prompt.ts` | S5a (thin tool), S11 | serialize |
  | `src/lib/weather/*` | S1, S4 (GDD interpolator), S7b | S1 lands first within its wave. **S4 shipped without touching it** — it reuses `gdd-core`/`season-core`/`obs-time-core` read-only and anchors on a biofix instead. |
  | `src/lib/phenology/units.ts` | S4 (shipped), S1 | ⚠️ **S4 deviation, agreed at plan time.** `units-core.ts` owns all unit conversion but has no LENGTH formatter, and S4 may not modify `src/lib/weather/`. `formatShootLength` / `formatShootLengthRange` / `cmToInches` therefore live in `src/lib/phenology/units.ts`. **S1 folds them into `units-core.ts`** when that lane owns the file, and deletes them here. |
  | `docs/spray_assistant/SPRAY_ASSISTANT_RUNBOOK.md` | every lane | ⚠️ **Now tracked in git, and it HAS already been clobbered once** — S3a PR3 (`11bcbf20`) reverted S4's ledger + §4 + §9 edits by committing an older copy. Re-read the file immediately before editing, edit only your own rows, and never commit a wholesale copy from a stale worktree. |
  | `src/lib/fieldnotes/*`, `src/lib/harvest/*` | S3a (back-compat + planned harvest), S4 | serialize |
  | cron / config | S1, S2 refresh | additive |

- **S3a does not FK to S2.** The spray record stores the EPA registration number as a string — the
  durable natural key plan 086 already upserts on — **plus the facts snapshot required by rule §3.8**.
  That is what makes lanes B and C genuinely parallel, and it is also correct on the merits: a spray
  record must survive a product being de-registered.
  ✅ **The snapshot shape is now FROZEN and shipped**:
  [S2-S3a-factsAsOf-contract.md](phases/S2-S3a-factsAsOf-contract.md) — the composite
  `{ publishedRevisionId, apprilAsOf, cdprAsOf, resistanceArtifactSha256 }` returned by every
  `lookupRegistration` read. **S3a consumes it; it does not re-derive it.** Adding a field is safe;
  removing or renaming one is a two-lane breaking change.
- **Two gate tiers** *(council S10)* — branch acceptance cannot be parallel even when branch work is.
  **Branch-local** (parallelizable): `tsc`, pure unit tests, goldens. **Serialized from the MAIN
  checkout**: DB-backed `verify:*`, browser QA, anything needing the generated Prisma client.
- Worktrees share ONE `.git` index — stage with `git commit --only <paths>`; run `gh pr list`
  before starting.
- **`prisma generate` immediately before `tsc`/`verify`/`dev`** in any worktree — parallel lanes
  clobber the shared generated client (learned in VI P4/P8). ⚠️ **Sharpened by S4:** the client lives
  in the **shared** `node_modules`, so a sibling lane clobbers it *mid-session*, not only at start —
  it happened **four times** during S4's build, each time surfacing as phantom "column does not
  exist" type errors in already-correct code. Chain the generate into the **SAME command** as the
  run (`npx prisma generate && npx tsc --noEmit`); running it as an earlier separate step is not
  enough.
- A lane is not shipped until its gate **and its QA report** are green. Parallelism never waives a
  gate.

## 5. Assistant coverage without tool sprawl

Every `*-core.ts` must be import-reachable from a tool or `verify:ai-native` fails. This program
creates a lot of cores and must not create a lot of tools (rule §3.15).

- **Land `query_spray_decision` thin in S5a** — the first Wave-2 lane — and **enrich it each phase**.
  ⚠️ **Council C3: the thin version MUST hard-refuse any "can I spray?" decision question until
  S7a and S9 exist**, and answer only what it can currently ground. Shipping a spray *decision*
  surface before the legal gate exists is a safety problem, not a merge problem. It ships with its
  fleet discrimination cases in the same PR.
- The composition core imports a **barrel** (`src/lib/spray/contributors.ts`). Each lane appends
  **one line** for its own contributor module.
- Cores that are genuinely mechanism, not capability — hourly ingest, sweep, alert emit — go on
  `INTERNAL` in `scripts/ai-native-allowlist.mjs` with `coveredBy`, exactly as
  `weather/ingest-core.ts` and `weather/alert-core.ts` already do. **Do not park a
  soon-to-be-covered core in `GAP_ALLOWLIST`** — that list is capped at 2 and may only shrink.
- **`blockReason` is rendered verbatim** *(council D2)*. S7a's output carries an opaque
  `blockReasonCode` plus a canonical human string; the tool contract requires the model to render
  that string as-is. A golden asserts a copper-slow-drying block is never explained as a PHI
  violation.
- The write tool (`record_spray_application`) lands in **S11** on the existing signed-proposal /
  confirmation-card path. It ships with a golden case; `save_field_report` currently sits in
  `UNCOVERED_OK` and the new tool must not inherit that exemption.
- **Fleet evals are mandatory**: discrimination against the confusables (`query_spray_decision` vs
  `query_climate` vs `search_knowledge_base`) and a read/write-discipline case ("can I spray sulfur
  tomorrow?" must never fire a write).

## 6. The standing QA gate (after every phase)

Full protocol in [qa/QA-PROTOCOL.md](./qa/QA-PROTOCOL.md). The short form:

1. Start `npm run dev` from the **MAIN checkout** (worktrees have no `.env`); open it with
   `preview_start` / `navigate` in the in-app Claude browser.
2. **The USER logs in once** with the Demo Winery credentials. Claude never types a password.
3. Drive the surface with `get_page_text` / `read_page` (reliable) — **not** screenshots, which can
   hang in the pane. `computer` click+type for controlled React inputs; `form_input` only for
   native `<select>`.
4. **Prove writes in the DB**, not just the UI: a short `runAsTenant("org_demo_winery", …)` tsx
   script that reads the rows back.
5. Run the **program-wide safety cases** (QA-PROTOCOL §4) every phase, not just the phase's own
   cases. They are cheap and they are the ones that matter.
6. Write `qa/S<n>-qa-report.md`: what was exercised, evidence, what failed, what was deferred.

## 7. Definition of success (program level)

A grower opens Cellarhand three days before a forecast rain and asks *"do I need to spray Block 4
before Thursday?"* — and gets back a decision record naming the risk, the block's current
protection state, the hard stops from its own spray history, the legal windows for eligible
products, the physical application window, and an explicit statement of what the system does not
know. Every number is traceable to a source, and nothing was authorized without a human.

**The Wave-2 milestone is its own success**, and it comes much earlier: a grower asks *"can I spray
Pristine on Block 4 today?"* and gets an exact, cited, legally defensible answer — registered,
rotates, PHI clear, REI scheduled — with no weather modeling involved at all.

The program's third, quietest success: at harvest, a lot carries its blocks' spray history into the
cellar as a residue flag — a thing no incumbent can do, because no incumbent owns both halves.

## 8. Status ledger

| Phase | Wave/Lane | Status | Plan | Council | PRs | QA | Report |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Runbook** | — | 🟩 council-reconciled | — | [RUNBOOK-council-feedback](RUNBOOK-council-feedback.md) | — | — | — |
| S0 spike (hourly / LWD / retention) | 1A | ⬜ not started | — | — | — | — | — |
| S2 registration & resistance | 1B | 🟩 shipped (MERGED + **live in prod** 2026-07-26, deploy `147b75c3`; 2,420 grape registrations · 361 AIs **zero unclassified** · `verify:pesticide` 31/31. Ships **DARK** — `epa-pesticide` defaultEnabled:false. **S7a unblocked.** One QA row deferred: settings-card click-through) | [S2 plan](phases/S2-registration-resistance-master-plan.md) | [S2 council](phases/S2-council-feedback.md) | [#522](https://github.com/russellmoss/wine-inventory/pull/522) · [#525](https://github.com/russellmoss/wine-inventory/pull/525) | [S2-qa-report](qa/S2-qa-report.md) | [S2-report](phases/S2-report.md) |
| S2b product facts master | 1B | ⬜ not started | — | — | — | — | — |
| S3a spray record + planned harvest | 1C | 🟩 shipped (PR1+PR2 MERGED 2026-07-26 — **Wave 2 unblocked**; PR3 QA'd in-browser same day, 2 findings found+fixed) | [S3a-spray-record-plan](phases/S3a-spray-record-plan.md) | [S3a-council-feedback](phases/S3a-council-feedback.md) | [#523](https://github.com/russellmoss/wine-inventory/pull/523) · [#524](https://github.com/russellmoss/wine-inventory/pull/524) · [#527](https://github.com/russellmoss/wine-inventory/pull/527) | [S3a-qa-report](qa/S3a-qa-report.md) | [S3a-report](phases/S3a-report.md) |
| S3b spray program / season plan | 1C | ⬜ not started | — | — | — | — | — |
| S4 phenology + growth | 1D | 🟩 shipped | [S4 plan v2](phases/S4-phenology-growth-model-plan.md) | [S4 council](phases/S4-council-feedback.md) | [#521](https://github.com/russellmoss/wine-inventory/pull/521) · [#526](https://github.com/russellmoss/wine-inventory/pull/526) · [#529](https://github.com/russellmoss/wine-inventory/pull/529) | [S4 QA](qa/S4-qa-report.md) ✅ | [S4 report](phases/S4-report.md) |
| S7a legality + rotation | 2A | ⬜ not started | — | — | — | — | — |
| S8 lot residue crossover | 2B | ⬜ not started | — | — | — | — | — |
| S5a powdery index + latent ledger | 2C | ⬜ not started | — | — | — | — | — |
| S1 hourly weather + LWD | 2D | ⬜ not started | — | — | — | — | — |
| S5b hourly pathogens | 3A | ⬜ not started | — | — | — | — | — |
| S6 protection budget | 3B | ⬜ not started | — | — | — | — | — |
| S7b weather interlocks + app window | 3C | ⬜ not started | — | — | — | — | — |
| S9 decision record | 4 | ⬜ not started | — | — | — | — | — |
| S10 planner surface | 5A | ⬜ not started | — | — | — | — | — |
| S11 assistant tools | 5B | ⬜ not started | — | — | — | — | — |
| SKB knowledge sources | anytime | ⬜ not started | — | — | — | — | — |

Statuses: ⬜ not started → 🟦 planning → 🟨 building → 🟪 QA → 🟩 shipped.
Update at every transition; link the plan, council feedback, PR(s), QA report, and phase report.

## 9. Phase scope and acceptance gates

> Scope lines below are the **contract**, not the implementation. Each phase's `/plan` run produces
> the units. Where a phase inherits from plan 086, the plan run must read that document first.

### S0 — Spike: hourly data path, LWD estimator, retention economics (Wave 1, lane A)

**The weather-lane go/no-go.** It gates S1 only — every deterministic lane starts alongside it.

1. **Can we get hourly humidity, and at what cost?** The NWS raw gridpoint endpoint
   (`/gridpoints/{office}/{x},{y}`) — which `forecast-nws.ts` **already calls** for
   `quantitativePrecipitation` — also returns hourly `relativeHumidity`, `dewpoint`, `temperature`,
   `windSpeed`, and `skyCover` as ISO8601-interval series. Verify the full field set live, then the
   same for Open-Meteo `hourly=` (global / Bhutan) and the ERA5-Land archive for history.
   **Record which of these are FORECAST vs REANALYSIS vs OBSERVED** — that distinction is now a
   schema requirement (council C3).
2. **What does hourly storage cost, and how long must it survive?** ~8,760 rows/vineyard/year
   minimum. Measure row volume, index size, and query latency for the read paths S5b and S6 need.
   ⚠️ **Council S2: size retention by REPLAY HORIZON, not storage cost.** Pruning hourly data
   destroys the ability to explain a past decision through harvest and after a correction event.
   Either retain to the longest replay horizon, **or** require immutable decision-input snapshots so
   decisions stay reproducible after raw hourly is pruned. Decide which, in writing.
3. **How good is estimated leaf wetness, and where does it stop being usable?** Implement CART
   (RH + dew-point depression + wind) and the RH≥90% threshold as a labeled-inferior fallback;
   measure their disagreement across a real season on a real site; **fix the confidence bands and
   the "we cannot know" threshold before any pathogen model consumes LWD.** There is no ground
   truth without a sensor — say so, and design the honesty output around that fact rather than
   pretending to a validation we cannot run. **Also scope the canopy-architecture modifier**
   (council S6): wetness in a leaf-pulled VSP canopy behaves nothing like an unmanaged sprawl.

Also in scope: sketch the **decision-record output shape** (brief §9) so every downstream model
knows what it must emit.

**Gate:** live field inventory per provider **with series-kind classification**; row-volume +
latency measurements; a written **retention decision sized by replay horizon** and a written **LWD
estimator decision with confidence bands and refusal threshold**, both in the phase report and an
ADR. No production code required.

### S2 — Registration and resistance master (Wave 1, lane B — first PR) — 🟩 **SHIPPED 2026-07-26**

> **Gate outcome — read before building on it.** Shipped in [#522](https://github.com/russellmoss/wine-inventory/pull/522)
> + [#525](https://github.com/russellmoss/wine-inventory/pull/525) (`147b75c3`, live in prod, dark).
> Every criterion below **met except one**, and the exception is deliberate:
> **❌ `Zampro → 45, 40` was NOT met — it resolves `GAP`.** The free extension sources do not code
> dimethomorph or ametoctradin; this is exactly the miss plan 086's own de-risk measured. It is
> **visible in the coverage report, not silently wrong**, which is the behaviour the gate actually
> protects. Closing it needs the Cornell guide (a purchase) — decide against
> `biologicalsShareOfGap: 59`. Also note the scale moved: **2,420** active grape registrations and
> **361** AIs (not 2,509 / 338) between the 07-15 and 07-21 dumps — churn, not a shape change.
> Full record: [S2-report](phases/S2-report.md) · [S2 QA](qa/S2-qa-report.md).

**Read [plan 086](../plans/2026-07-20-086-feat-us-pesticide-registration-plan.md) before planning.**
Scope: its Units 1–3 (APPRIL parse → schema → idempotent ingest), 5 (CA DPR state layer), 6
(county/SLN restriction flags), 7 (`epa-pesticide` KnowledgeSource row for the toggle + citation
plumbing only, `defaultEnabled: false`), 9 (monthly refresh wiring), 11 (`verify:pesticide`), and
**4** (AI→resistance-code derivation with the coverage report).

Carry plan 086's three measured Unit-4 constraints verbatim: `siteType` (single/multi) modeled
**separately from the code**; never derive a product code from an AI-keyed source's trade-name
parentheses (*Switch* is 9/12, not 9); biologicals need their own sourcing decision.

**Gate:** plan 086's Success Criteria, unchanged — all 338 grape AIs resolve to
coded / no-code-exists / **gap** with zero unclassified; Gavel 75DF and Fusilade DX both report
registered-on-grapes-in-CA; Zampro → 45,40 and Pristine → 7,11; Luna Experience yields a
Nassau/Suffolk restriction **with** the 24(c) exception, not a ban; source defaults OFF; no
FRAC/HRAC/IRAC compilation anywhere in the diff. Plus: **a malformed EPA reg number never
fuzzy-matches to a product** (council S9); **QA report**.

### S2b — Product facts master (Wave 1, lane B — second PR) — *new, council C1*

**The hole the council found.** S6's gate requires rainfast period and chemistry mobility class;
S7a's and S7b's gates require PHI, REI, minimum repeat interval, seasonal maxima, and separation
rules. **No phase produced any of them** — label extraction was deferred (correctly) and then two
downstream gates were written that need it.

Scope: a **curated, versioned, per-product, human-reviewed, cited facts table** — *not* label-PDF
extraction. Per product (keyed by EPA registration number + label date): rainfast/absorption period ·
mobility class (contact/protectant · translaminar · locally systemic · mobile systemic) · PHI · REI ·
minimum repeat interval · maximum applications and seasonal AI limits · separation rules (oil ↔
sulfur ↔ captan, **direction-specific**) · adjuvant restrictions · temperature/stress/wet-foliage
limits.

**Scoping principle:** plan 086 measured that the **top 60 active ingredients cover 86.5% of all
product-AI occurrences.** Curate that set first. Everything outside it resolves to
*cannot-determine* per rule §3.6 — which is the designed behavior, not a failure.

**Also here:** the **non-US manual-entry path** (rule §3.9), because it is the same mechanism —
a tenant-scoped, attributed, "grower-supplied, not registry-verified" facts row. Built once, it
serves Bhutan **and** the US tenant-override case council P1 asked for.

**Also owned here (recorded by S3a, council GQ1):** the **coded pest vocabulary** that populates
`spray_application.targetPestCode` — S3a stores free-text `targetPest` plus the nullable code slot
so no migration is needed later; an unmapped pest resolves to *cannot-determine* at PUR-export
time (rule §3.6). **S2b must also implement the S3a `ProductFactsResolver` port**
(`src/lib/spray/product-facts-port.ts`, `resolveMany`) — registering the real resolver replaces
the null resolver and back-fills nothing (facts-as-of is per-entry, rule §3.8).

**Gate:** every curated row carries source + as-of date + reviewer; a product with no facts row
resolves to *cannot-determine*, never *permitted*; the non-US path proven end-to-end on a
Bhutan-shaped fixture (no EPA lookup, engines still run); coverage report shows curated vs
uncovered share; **QA report**.

### S3a — Spray record + planned harvest (Wave 1, lane C — first PR)

The record is the spine. Every clock in brief §6, the residual model (S6), legality and rotation
(S7a), and the lot residue flag (S8) all read this table.

**Structure is header + lines, taken from the real template**
(`docs/spray orders/Spray work order template.xlsx`; full field inventory in brief §17.3):

- **Application header** — one pass: vineyard, operator/applicator (+ **license**, which the
  template omits), application method, start/finish datetime, spray vol/acre, gear setting, ground
  speed, tank size, target pest. **Wind speed, wind direction, and temperature are distinct
  columns, not a weather blob** (council S5 — CA PUR and drift rules require them).
- **Material lines** — product (**EPA registration number** + name snapshot + **facts snapshot per
  rule §3.8**), active ingredient, REI, PHI, quantity, **`adjuvantClass`** (council C9 — captan plus
  an organosilicone penetrant is a known injury combination the interlock engine is otherwise blind
  to) — plus the template's separate **mixing-order** table with amount per tank.
- **Block lines** — one per block: blocks, acres, start/stop time, **computed rate/acre**, tank-batch
  reference, est. tanks, tanks used, gal used, and **deposition/coverage evidence** (council S4 —
  S6's confidence claims to fall when no deposition check exists; something must record one).

**`driedBeforeRain` is DERIVED, not self-reported** (council S3) — computed from application
timestamps + hourly precipitation, with an attributed operator override. It materially changes the
residual estimate and must not rest on a free-text truth source.

**The header/line split is load-bearing, not schema taste.** ROADMAP Phase 20 requires "enter once,
attribute to each block"; the residual model requires per-block application facts; compliance
reporting keys off the pass. **The block line is what S6 reads.**

Also in scope: correction-as-event, never in-place edit (rule §3.14); and **planned harvest date**
per block per vintage — **as an audited event stream, not mutable intent** (council D4), because
PHI decisions read it and an in-place edit would silently change what a past decision meant.

**The Phase 20 seam — draw it explicitly in the plan.** S3a owns the **decision and compliance**
fields above. **ROADMAP Phase 20 owns cost and equipment**: tractor, spray rig, gear setting →
machine-hours and fuel; tanks/gal used → consumable draw-down and cost; labor and pay basis;
per-block cost roll-up; PUR export. **S3a's record is the row Phase 20 will later write.** Store the
equipment/tank fields as plain columns now so Phase 20 has somewhere to hang its joins.

⚠️ **ROADMAP Phase 20's note that the template "omits REI and applicator license" is half wrong** —
the template carries **REI (F7) and PHI (G7)**. Only **applicator license** is genuinely missing
(along with target pest and weather-at-application). Correct that line when Phase 20 is planned.

Migration note: `FieldNote.spraysApplied` keeps working. The **read seam** surfaces an old name-only
spray as a **low-confidence record, not an absence** — it is evidence something was applied, and
treating it as nothing would make S6 report full protection. ⚠️ **Council S11:** a legacy "Pristine"
that never maps to FRAC 7/11 would let S7a clear a consecutive-use violation. The system therefore
**suggests** a name→product mapping and a **human confirms** it (never LLM-auto-applied — that would
violate rule §3.2); unconfirmed legacy records count as *unknown* in the rotation budget, which
blocks a "rotation OK" claim rather than granting one.

**Gate:** RLS/tenant-isolation case; correction-as-event contract test (an in-place edit is
refused); header/line round-trip — one pass across ten blocks entered once, read back as ten block
lines with per-block acres, times, and rates; `driedBeforeRain` derived correctly incl. the override
path; the field-note back-compat read proven low-confidence and proven to block a rotation-OK claim;
a spray whose product is unknown to S2/S2b resolves to *unknown*, never *clear* (rule §3.6);
planned-harvest edits are audited; `verify:spray-record` e2e on Demo Winery; **QA report**.

### S3b — Spray program / season plan (Wave 1, lane C — second PR, blocks nothing)

Scope: the season spray program as a first-class object — planned applications a grower loads at the
start of the year (target, intended product or FRAC group, phenology anchor or date window, blocks)
— plus **plan-vs-actual**, which is what actually catches a missed spray.

**The invariant: a plan is intent, never evidence.** A planned application must never deplete a
protection budget, satisfy a rotation requirement, start a PHI clock, or appear in a compliance
record. Wire this as a **type-level separation, not a boolean flag on one table** — a flag will
eventually be read wrong by something in S6 or S7, and the failure would be silent and dangerous.

**Gate:** a planned application is proven *not* to affect residual, rotation, PHI, or compliance
output (four separate contract tests — this is the phase's whole risk); plan-vs-actual drift renders
for a skipped application; RLS case; **QA report**.

### S4 — Phenology precision and the growth model (Wave 1, lane D)

Scope: raise phenology from weekly categorical to something the growth-dilution model can consume.
Today `FieldNote.blockLevelStatuses` gives 8 stages + a 5/25/50/75/100% reading on bud break,
flowering, and veraison — no shoot length, no rate. Add **measured shoot extension** (and/or
leaf-layer count) as an optional per-block observation, a **GDD-driven phenology interpolator** so a
stage estimate exists on days without a field note, and a **growth-rate core** emitting cm/week +
estimated unprotected new leaf area since a given date. Every interpolated value is labeled estimated
(rule §3.5).

Also here, because rule §3.7 requires it before the models that need them: **canopy-management state**
(unmanaged / hedged / leaf-pulled — the LWD modifier council S6 asked for) and **fruit-present /
growth-stage** flags that S7b's interlocks are conditioned on.

Design constraint: the 3-10 downy rule needs "shoots ≥10 cm," so shoot length is not optional
decoration — it is a model input with a named consumer.

> **Sour rot — DECIDED 2026-07-26 (§12 q3): S4 ADDS the scouting observation, so sour rot returns
> to S5b.** `clusterDamage` (gated at `FRUIT_SET`, because botrytis exploits early wounds — S4
> council S6) and `vinegarFlyPressure` (gated at `VERAISON`), both carrying **`NOT_ASSESSED` as a
> value distinct from `NONE` and from `null`** so a gap can never read as a clean bill of health
> (rule §3.6). **S5b's gate:** build sour rot only if scouting coverage clears 60 % in a rolling
> 4-week window before the target date — `verify:phenology` measures and reports it. Rule §3.7 is
> about the data, not the column.

**Gate:** growth-rate goldens; interpolator goldens incl. the "no field note for 3 weeks" degrade;
measured-vs-estimated distinguishable in the read DTO and in the UI; canopy state and fruit-present
readable by S6/S7b; back-compat with existing field notes (no migration of historical rows);
**QA report**.

### S7a — Legality and rotation engine (Wave 2, lane A) — *deterministic value ships here*

Scope: the deterministic gate that needs **no weather at all**. Registration + state legality (from
S2) · PHI against S3a's planned harvest date · REI against the labor/work-order calendar · minimum
repeat interval · maximum applications and seasonal AI limits (from S2b) · elapsed-days separation
rules · **rotation**: FRAC/IRAC/HRAC budget per block per season with consecutive-use limits,
share-of-season limits, and **premixes counted against every group they contain**.

⚠️ **Council C8 — the shifting-harvest-date trap, and the best catch in the review.** PHI cannot be
a one-time gate at spray time. A grower plans an Oct 10 pick, sprays a 14-day-PHI product on Sept 20
(legal), then pulls the pick to Sept 30 for weather — **the fruit is now unsellable and nothing tells
them.** Therefore: **any mutation of a block's planned harvest date re-evaluates every application in
the trailing PHI window and raises a hard warning at the moment of the change.**

Output contract: an opaque `blockReasonCode` + a canonical human string (§5) so the assistant can
never mis-attribute a block.

**Constraints inherited from S3a's build (2026-07-26):**
- **(a)** PHI evaluates against the **EARLIEST open planned harvest date** for a block-vintage —
  split picks mean `currentPlannedHarvestDatesCore` returns SEVERAL open passes (council G4); the
  early pick is the binding constraint.
- **(b)** The harvest-date reverse-check consumes **`plannedHarvestChangesSinceCore(cursor)` as a
  WATERMARK read** over the append-only event stream (council C4) — never an in-process callback.
  The derived `direction` (`PULLED_FORWARD` is the dangerous one) is computed for you.
- **(c)** A `spray_block_line` with a null `finishedAt` yields REI **UNKNOWN** (`reiWindow` in
  `src/lib/spray/read-core.ts`) and must never borrow the header timestamp (council G2/C14).

**Gate:** rotation goldens incl. the premix double-count; the seasonal-maximum budget **refuses
rather than warns**; an unknown product produces *cannot-determine*, never *permitted*; **the
harvest-date reverse-check fires** (pull a pick date forward into a PHI window → hard warning);
REI collides correctly with a scheduled hand-labor work order; unconfirmed legacy sprays block a
"rotation OK" claim; DST/operating-timezone boundary cases for PHI (council S9); **QA report**.

### S8 — Lot-level residue crossover (Wave 2, lane B) — *the moat*

Scope: at harvest, roll each block's spray history (S3a) through product identity (S2/S2b) into a
**lot-level residue flag** that follows the fruit into the cellar via the existing harvest → lot
lineage. Sulfur inside ~30 days of pick flags reduction risk; copper flags thiol stripping on
aromatic whites; high late-season fungicide load flags sluggish-fermentation risk. Surfaced on the
lot, in the assistant, and at the moment a winemaker is deciding nutrient additions and aeration.

This is a **wine-quality rule, tighter than any legal PHI** — advisory winery protocol, not
compliance, threshold tenant-configurable.

**Gate:** lineage proven — a spray on a block appears on the lot made from that block's fruit,
**including through a blend**; the flag is advisory and visibly distinct from a PHI violation; a
block with no spray records produces *unknown*, never *clean*; **a reversing correction on a spray
removes the flag** (rule §3.14 propagation); tenant-configurable thresholds; **QA report**.

### S5a — Powdery-mildew index and the latent-infection ledger (Wave 2, lane C)

Scope: **Gubler-Thomas is temperature-only and buildable on today's daily data via diurnal
reconstruction** — ship it first as the program's modeling proof, with no dependency on S1. Plus the
**append-only latent-infection ledger**: an infection event recorded with its pathogen-specific
incubation window, so a clean scouting pass does not clear a black rot event from fourteen days ago.
The ledger is built here as the foundation every S5b pathogen plugs into.

Also: land `query_spray_decision` **thin**, per §5 — and it **must hard-refuse decision questions
until S7a and S9 exist.**

**Gate:** Gubler-Thomas goldens on a committed fixture series; the incubation ledger keeps an event
open across a clean scout; "scout not diagnose" enforced by copy tests; **the index degrades to
*unknown* (never *low*) when inputs are missing — a dry forecast must never produce "low powdery
risk"**; the thin tool proven to refuse a "should I spray" question; NEWA comparison recorded as a
validation oracle where a NEWA station is near a Demo block; **QA report**.

### S1 — Hourly weather, humidity, and leaf wetness (Wave 2, lane D)

Scope: a third provider contract — `HourlyProvider`, **parallel to** rather than an extension of
`ClimateProvider`/`ForecastProvider`; NWS gridpoint hourly + Open-Meteo hourly + ERA5-Land archive
adapters; a tenant-scoped `VineyardWeatherHourly` per the Phase-12 checklist with S0's retention
policy enforced from day one; obs-time/timezone bucketing reusing `obs-time-core` + `site-time-core`;
the **LWD estimator** as a pure core with confidence bands **and the canopy-state modifier from S4**;
**Delta T**; a **data-confidence score** per vineyard; the **on-site sensor ingest seam** designed
(not built).

⚠️ **Council C3 — the table must distinguish `seriesKind` (OBSERVED | FORECAST | REANALYSIS) with
`issuedAt` and `validTime`.** S5b/S6 read past observed; S7b reads future forecast. Nothing may let
a forecast row satisfy a historical-decision read — that is how you score a residual against rain
that never fell.

Also: a **"calibrate wetness" grower override** (council S6) so someone standing in a dry vineyard
can correct the grid estimate and reset the clocks. The override is itself an observation, recorded
with attribution.

**Gate:** `verify:weather-hourly` e2e on a committed fixture series (no live provider in tests);
**a FORECAST row can never satisfy a historical-decision read (contract test)**; LWD goldens incl.
the refusal case and the canopy modifier; Delta T goldens; timezone-correct hourly bucketing;
no-fabricated-hour contract test; retention job proven to actually prune **without breaking replay**;
RLS/isolation; quota counters extended; `verify:ai-native` green; **QA report**.

### S5b — Hourly pathogen models (Wave 3, lane A) — *supersedes VI P9*

Scope: on S1's hourly series and S4's phenology — black rot (temperature × leaf-wetness table);
downy mildew (3-10 primary rule + secondary sporulation on night temperature/RH); phomopsis and
anthracnose; botrytis (bloom-latency and pre-harvest windows). Each a pure core, each labeled
**"scout, not diagnose"**, each cross-linked to the IPM knowledge base, each plugging into S5a's
latent-infection ledger.

**Plus sour rot** *(returned from Later on 2026-07-26 — S4 added the scouting observation; §12 q3)*.

> **S4 SHIPPED THE FIELDS AND MEASURED THE GATE. The gate is not yet passable — and not because it
> failed.** `verify:phenology` on 2026-07-26 reported **0/0 (0 %)** over the trailing 28 days: no
> live block reached `FRUIT_SET` inside the window, so the controls never rendered and the
> denominator is EMPTY. ⚠️ **An empty denominator is `unknown`, NOT a failed gate and NOT 0 %
> coverage** — reading a zero denominator as zero coverage is the same gap-read-as-a-result failure
> rule §3.6 exists to prevent, pointed at ourselves. **Re-run `npm run verify:phenology` when S5b is
> planned and use that number.** The denominator counts only block-weeks where the control would
> actually have rendered (a grower cannot be faulted for not scouting at bud break).
Brief §7.6 is the contract: Brix ≳ 15 (`BrixLog`) × cluster compactness × berry wounds
(`clusterDamage`) × vinegar-fly pressure × warm wet forecast. ⚠️ **Two conditions.** (1) **Coverage
gate:** build it only if scouting coverage clears **60 % in a rolling 4-week window** before the
target date, as measured by `verify:phenology`; below the bar the index degrades to *unknown* and
does not fire. A column that is 5 % populated is a system that does not collect it (rule §3.7).
(2) **`NOT_ASSESSED` ≠ `NONE`** — a gap must never enter the index as "no damage" (rule §3.6).
Recommendation shape is distinctive and must be preserved: fungicides do not touch sour rot, so the
answer is insecticide + antimicrobial **or fruit-zone leaf removal**, never "spray a fungicide."

**Gate:** index goldens on committed fixture series; every index degrades to *unknown* when inputs
are missing; downy's 7–12 day latency and black rot's 8–21 day incubation both proven to hold an
event open in the ledger; **sour rot proven to refuse below the coverage bar, and proven never to
read `NOT_ASSESSED` as `NONE`**; "scout not diagnose" copy tests; **QA report**.

### S6 — Protection budget: residual decay (Wave 3, lane B)

Scope: replace "spray interval" with a residual estimate decaying on **four independent channels** —
wash-off, growth dilution, degradation, redistribution (brief §5). Inputs: chemistry class and
rainfast period from **S2b**; application datetime, rate, coverage mode from S3a; rain amount **and
intensity** plus UV/temperature proxies from S1; new leaf area from S4.

⚠️ **Growth dilution does NOT stop when the shoot tip stops** *(S4 council C6, 2026-07-26 — S4's
plan had this wrong and was corrected before build)*. `FieldNote.shootTip: STAGNANT` records that
**internode elongation** has ceased; **leaf-area expansion continues for roughly 14–21 days
afterwards**, and laterals keep growing after the primary tip stops. Expanding leaf surface keeps
diluting deposited residue. Treating `STAGNANT` as zero dilution reports a canopy fully protected
while it is materially diluted — **it fails toward "protected," the one direction that costs a
grower a crop.** S4's `growth-core` emits a decaying leaf-expansion tail for this reason; S6 must
consume it and must not re-derive dilution from shoot length alone.

⚠️ **Council S1 — output is CATEGORICAL, not a percentage.** `Protected / Vulnerable / Depleted`
plus the **decay drivers** ("depleted — 6″ shoot growth since application, 1.2″ rain on a 9-day-old
protectant"). A raw "42%" implies a mathematical certainty that does not exist. Keep the number
internal for goldens; never surface it.

Non-negotiable: **rain total alone never triggers a respray recommendation.**

**Inherited from S3a (council G3):** `materialRatePerHa` (`src/lib/spray/read-core.ts`) returns
**`null` for an unconvertible `quantityBasis`** (e.g. `PER_CARRIER_VOLUME` with no carrier volume
recorded) — a legitimately-entered material line can have NO computable rate, and the residual
model must handle that as *unknown*, never as zero dose.

**Gate:** residual goldens across the documented cases (0.5″ on a 9-day-old protectant vs 1.2″ on a
2-day-old systemic vs 0″ with 6″ of shoot growth); a spray that did not dry before rain is scored
materially less effective; missing spray history produces *unknown protection*, never *full
protection*; confidence falls when no deposition evidence exists; **no percentage reaches the UI**
(contract test); **QA report**.

### S7b — Weather-conditioned interlocks and application window (Wave 3, lane C)

Scope: the weather-dependent half of the deterministic gate. **Sulfur × hourly post-application
temperature × variety sensitivity** (`Variety.species` already distinguishes `HYBRID`) — evaluated
on the forecast *after* application, never the temperature at tractor entry. **Copper under
slow-drying conditions.** **Adjuvant-stacked phytotoxicity** (council C9 — captan + organosilicone
penetrant). **Cumulative copper loading** per block per season for organic programs. Plus the
**application-window model**: wind band, inversion risk, Delta T, rainfast window.

Modeling rule: a compatibility answer is a function of *product A label + product B label + crop +
fruit present + direction + elapsed days*, and the **most restrictive rule wins**. Never inherit one
oil's rules onto the category "oil."

**Gate:** interlock goldens for every documented pair **in both directions**; a hybrid variety at
86 °F forecast blocks sulfur while vinifera warns; the sulfur check proven to use post-application
hourly forecast, not entry temperature; adjuvant-stacked case fires; an unknown product produces
*cannot-determine*, never *permitted*; **QA report**.

### S9 — Decision-record composition and the risk visual vocabulary (Wave 4, solo — convergence)

Scope: the single composition core assembling S5a/S5b + S6 + S7a/S7b into the inspectable decision
record (brief §9). Plus the **governed risk visual vocabulary** — clear / watch / act / unknown /
blocked — defined once here, in DESIGN.md tokens (rule §3.18). This is where the `contributors.ts`
barrel consolidates, the Wave-2/3 INTERNAL allowlist entries are retired, and
`query_spray_decision`'s hard-refusal from S5a is finally lifted.

⚠️ **Council rule §3.14 lands here: correction propagation.** A reversing spray correction must
demonstrably remove its residual, PHI, rotation, **and** lot-residue effects. That propagation
crosses S3a/S6/S7a/S8 and nothing tests it until this phase.

**Gate:** composition goldens for the documented worked example; *every* record renders a
"what we don't know" section, never empty by construction; **each of the five states has a
one-sentence operational instruction, or the state is cut** (council D3); the five states are
distinguishable in light and dark and pass a color-vision check; `cannot-determine` renders as its
own state, not a degraded *act*; **correction-propagation e2e across all four consumers**; stale
reference data or stale weather forces *unknown/refuse* (council S9); DESIGN.md review;
**QA report**.

### S10 — Spray planner surface (Wave 5, lane A)

Scope: the grower-facing surface — block risk board, the clocks per block (earliest legal repeat,
residual, growth, infection, phenology, resistance, PHI, REI), program plan-vs-actual, and the
application-window view. Extends the existing `/vineyards/weather` patterns and the Map Explorer
layer-stack contract rather than forking a new map. Summary-first, progressive disclosure, one nav
entry — no sprawl (the P8 lesson).

**Gate:** the brief's E2E scenario list; **mobile-viewport pass** (this gets used standing in a
vineyard); risk vocabulary consumed from S9, not re-invented; the "calibrate wetness" override
reachable in the field; export carries provenance and as-of dates; **QA report**.

### S11 — Assistant spray tools and goldens (Wave 5, lane B)

Scope: `query_spray_decision` finalized + `record_spray_application` as the program's **one** write
tool on the signed-proposal/confirmation-card path. Golden cases for both; **fleet** discrimination
cases against `query_climate` and `search_knowledge_base`; a read/write-discipline case; and the
refusal cases — the assistant must decline to recommend from an active ingredient or trade name
alone, and must decline when the source toggle is off rather than answering from memory.

**Gate:** goldens + fleet cases green; **the `blockReason` verbatim golden** — a copper-slow-drying
block is never explained as a PHI violation (council D2); `verify:ai-native` green with the earlier
INTERNAL entries retired — **including the FIVE S3a entries** (`spray/record-core`,
`spray/correction-core`, `spray/drying-override-core`, `harvest/planned-harvest-core`,
`spray/legacy-mapping-core` in `scripts/ai-native-allowlist.mjs` + the mirrored test-local map in
`test/verify-ai-native.test.ts`), whose reason strings name this phase as their retirement
condition (S3a open decision D2); the over-claim guard exercised; tool-count and fleet accuracy
recorded in `assistant-coverage.md`; **QA report**.

### SKB — Knowledge-base IPM source expansion (background lane, any wave)

Scope: close the Northeast gap in the corpus. Candidates: **Penn State Extension** grape disease/IPM
(absent, and the East's other primary authority), **NEWA model documentation**, **Virginia Tech's
pest guide** (distinct from the enology notes already crawled), and a decision on **MSU Extension** —
registered but dormant, blocked by Imperva from both residential and CI IPs.

Two hard constraints: **capture the `verify:kb-register` displacement baseline BEFORE adding any
source**, and **nothing safety-critical goes in the corpus** — FRAC codes, label rules, thresholds,
and interlocks are S2/S2b/S7 relational data. RAG answers *"why is powdery pressure high this
week"*; it must never answer *"can I legally apply this."*

**Gate:** baseline captured before and re-captured after; each new source's license posture recorded
in `KnowledgeSource.license`; staged rollout (`defaultEnabled:false` → crawl → enable for Demo →
measure → flip); `verify:knowledge-base`, `verify:kb-register`, `verify:kb-subscriptions` green;
**QA report**.

## 10. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| **Derived resistance table has no vendor update SLA** (council P1) | HIGH | Coverage report + gap-renders-as-unknown (§3.6) + monthly re-derivation in S2's refresh + tenant manual override (§3.9). Revisit buying structured label data if the cannot-determine rate measured after S2b is high. |
| **Coverage gap read as "no restriction"** | HIGH | Rule §3.6; distinct *gap* vs *no-code-exists* vs *clear* rendering; QA SAFE-3/SAFE-4 every phase. |
| **A forecast row used as an observation** (council C3) | HIGH | `seriesKind` + contract test in S1. |
| **Past decisions drift after a reference refresh** (council C4) | HIGH | Facts-as-of snapshot, rule §3.8. |
| **Shifting harvest date creates a silent PHI violation** (council C8) | HIGH | Reverse-check on harvest-date mutation, gated in S7a. |
| **A non-bearing-only product applied to bearing vines** (S2 council G1) | HIGH | Hundreds of herbicides/fumigants are registered only on "Grapes (Non-bearing)". Applying one to bearing vines makes the **harvested crop unsellable**. Brief §3 names it a hard stop. S2 carries `siteModifier` (BEARING / NON_BEARING / **UNSPECIFIED**, never defaulted to bearing) from ingest through the lookup payload; **S3a and S7a must validate it against the block's planting date.** |
| **Federal registration read as a clearance outside CA** (S2 council G2) | HIGH | FIFRA lets a state restrict a federally registered product, and S2 ships only the CA state layer. **Jurisdiction is a required argument on every legality read and federal registration alone is never a clearance** — outside CA the result is `state-registration-unknown`, outside the US `jurisdiction-unsupported`. This is §3.6 applied to jurisdiction; S7a inherits it. |
| **App bricks for the non-US tenant** (council C6) | HIGH | Rule §3.9 + the S2b manual path, proven on a Bhutan-shaped fixture. |
| Correction event fails to propagate to all four consumers | MED | Rule §3.14, e2e gated in S9. |
| Hourly retention destroys decision replay | MED | S0 sizes retention by replay horizon, or snapshots decision inputs. |
| Users read screening indices as diagnoses | MED | "Scout not diagnose" copy tests; risk + confidence always paired. |
| Export-market MRL violation on a blended wine | MED | **Documented as Later** (council D1, Russell's decision 2026-07-26) — not built; S8's lineage makes it cheap to add when a customer needs it. |

## 11. Phase reports and decisions

- **QA reports:** `docs/spray_assistant/qa/S<n>-qa-report.md` — required every phase.
- **Phase reports:** `docs/spray_assistant/phases/S<n>-report.md` after each ship — what shipped,
  gate evidence, deviations, measurements, and lessons that change later phases (**edit this
  runbook when they do**).
- **Plans:** `docs/spray_assistant/phases/S<n>-<slug>-plan.md`; council feedback alongside as
  `S<n>-council-feedback.md`.
- **Big decisions** (hourly retention + replay horizon, LWD estimator + refusal threshold, the
  deterministic/probabilistic boundary, facts-as-of replay semantics, the residue-flag thresholds)
  → ADR under `docs/architecture/decisions/` + a context-ledger entry, plus scale/security register
  entries per the brain rules.
- **Anything that becomes a hard rule** gets an invariant note in `docs/architecture/invariants/`
  and a `verify:` guard. First three candidates: *a coverage gap never renders as no-restriction*;
  *a plan is never evidence*; *a forecast row never satisfies a historical read*.

## 12. Open questions for the first `/plan` runs

1. **Hourly retention** — rolling window, or hourly-for-N-days plus a daily rollup plus immutable
   decision-input snapshots? S0 decides with measurements, sized by replay horizon.
2. **Where does the planner live** — inside `/vineyards/weather`, a sibling route, or a tab on the
   Map Explorer? S9/S10 decide; the P8 lesson says resist a new nav entry.
3. ~~**Does S4 add cluster-damage + pest-pressure scouting?**~~ **ANSWERED 2026-07-26 — YES.**
   [S4's plan §2](phases/S4-phenology-growth-model-plan.md) adds `clusterDamage` (gated at
   `FRUIT_SET` — council S6: botrytis exploits early wounds) and `vinegarFlyPressure` (gated at
   `VERAISON`), both with **`NOT_ASSESSED` as an explicit value distinct from `NONE` and from
   `null`**. Rationale: S4 is the program's only collection-surface phase, so this was "now or
   never"; the marginal cost is two Segmented controls, and every Segmented control measures 100 %
   filled. **Sour rot returns to S5b, gated:** S5b may build it only if scouting coverage clears
   60 % in a **rolling 4-week window** before the target date (`verify:phenology` measures it) —
   because a column that is 5 % populated is a system that does not collect it, and rule §3.7 is
   about the data, not the column. Below the bar, sour rot degrades to *unknown* and does not fire.
4. **Organic / copper loading** — is cumulative elemental copper per block a v1 requirement in S7b
   or a fast-follow?
5. **Cornell guide purchase** — plan 086 measured that its value concentrates in **biologicals**.
   Still an upgrade path, still the user's call, still not a blocker. Re-evaluate against S2b's
   measured cannot-determine rate.
6. **How far does S3a go toward Phase 20's spray work order** before it becomes Phase 20's job?
