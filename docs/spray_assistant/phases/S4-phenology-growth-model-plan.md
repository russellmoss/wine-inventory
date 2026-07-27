# S4 — Phenology precision and the growth model (implementation plan)

**Phase:** S4 · Wave 1, lane D · **Status:** 🟦 planning — **v2, council-reconciled**
**Runbook contract:** [SPRAY_ASSISTANT_RUNBOOK.md §9 "S4"](../SPRAY_ASSISTANT_RUNBOOK.md)
**Council:** [S4-council-feedback.md](./S4-council-feedback.md) — 23 findings, 20 folded, 2 partially
refuted, 0 rejected. **v1 was wrong about two things that mattered;** both are called out in place.
**Branch:** `claude/s4-spray-phenology-precision-78661e`
**Plan depth:** Deep — 10 units across 2 PRs (schema slice, then feature)
**Author:** `/plan` → `/council` → reconcile, 2026-07-26

**Read before this plan:** runbook §3 (standing rules, esp. §3.5 and §3.7), §9 S4, §12 q3 ·
brief §5.1, §6.1, §7.2, §7.5, §7.6, §15, §17.2, §17.5 ·
[RUNBOOK-council-feedback](../RUNBOOK-council-feedback.md) C10 and S6 · `src/lib/fieldnotes/types.ts` ·
[QA-PROTOCOL](../qa/QA-PROTOCOL.md) §4 · **and [S4-council-feedback.md](./S4-council-feedback.md)**,
because two gates below exist only because a reviewer caught a defect.

---

## 1. Problem frame

Four Wave-2/3 models are blocked on data nobody collects.

`FieldNote.blockLevelStatuses` today carries 8 coarse phenology stages and a 5/25/50/75/100 %
reading on bud break, flowering, and veraison, captured weekly per block. That is a good weekly
narrative. It is not a model input, for three reasons:

1. **No shoot length.** The downy-mildew 3-10 rule (brief §7.2) needs *"shoots ≥ 10 cm"*. S5b
   cannot fire without it.
2. **No rate.** Growth dilution is the residual-decay channel that dominates May–June — brief §5.1
   puts 30–40 % of leaf area unprotected by Friday after a perfect Monday spray, *with zero rain*.
   S6 cannot model it from a stage label.
3. **No value on the days that matter.** A field note lands roughly weekly. A spray decision is
   made on a Tuesday. Between notes there is no stage at all, so every downstream model either
   guesses or refuses.

S4's job is to close those three gaps without breaking a single existing row, and to do it on the
one surface a grower already touches every week.

**Two things pull the design harder than the runbook scope line does.**

**(a) The fill-rate evidence.** I measured the live `FieldNote` corpus before designing anything
(read-only `runAsSystem` sweep, both tenants): **2 field notes, 10 block-week observations**, all
`org_bhutan_wine_co`, 2026-06-12 → 2026-06-19.

| Field | Control type | Filled |
|---|---|---|
| `phenoStage` | native `<select>` | **100 %** |
| `shootTip` · `canopyDensity` · `waterStress` · `weedPressure` | `Segmented` | **100 %** each |
| `phenoStagePct` | second `<select>`, stage-gated | 60 % |
| `leafConditions[]` | multi-select grid | 40 % |
| `photoUrls[]` | camera + upload | **0 %** |

Ten block-week observations from one tenant in one month. Thin, and treated as thin. But the
ordering is unambiguous and it matches how the form is built: **every one-tap control is answered;
the fields that cost real effort are not.** Photos cost a camera and an upload, and they are at 0 %.

A measured shoot length costs more than a photo. It costs walking the block with a tape. If S4 makes
the growth model depend on a numeric field, the model will be `unknown` almost always — which is
*honest*, per rule §3.6, and also useless. Hence D4.

**(b) There is a second consumer outside this program.** `src/lib/weather/frost-core.ts:5` states
*"Real phenology-gated frost is Release 4B,"* and `vulnerableWindowFor()` currently hard-codes
NH Apr 1 – Jun 15 as a phenology stand-in. That is a named future consumer of exactly the stage
estimate S4 produces. The cores therefore live in a program-neutral `src/lib/phenology/`.

---

## 2. ⚠️ The decision this phase owns — sour rot

> **Runbook §12 q3 / council C10 / standing rule §3.7.** Sour rot was cut from S5 because berry-wound
> status and vinegar-fly pressure exist nowhere in the schema. If S4 adds a *"cluster damage + pest
> pressure"* scouting observation, sour rot becomes buildable and returns to S5b. If not, it stays
> in Later. **The decision is recorded either way.**

### DECISION: **YES — S4 adds the scouting observation.** Sour rot returns to the S5b lane, gated.

**1. S4 is the program's only collection-surface phase.** Waves 2–5 add engines, a decision record,
a planner, and assistant tools. Not one of them adds a field observation. So the real question is
not *"now or later"* — it is **"now or never."** Deferring is a decision to never build sour rot,
made without saying so.

**2. The marginal cost is two Segmented controls, and Segmented controls are at 100 %.** Not a new
surface, page, or cadence — two more taps on a card the manager already fills weekly, next to
`waterStress` and `weedPressure`.

**3. Sour rot's recommendation is structurally different from every other model in the program.**
Brief §7.6: *fungicides alone do not touch it.* Management is an insecticide plus an antimicrobial,
and Cornell found fruit-zone leaf removal reduces damage. Every other model in S5a/S5b answers
"spray or don't." Sour rot is the one that can answer **"this is not a fungicide problem"** — work
no calendar-driven competitor does. On tight-clustered varieties in a wet run-up to harvest it is
also the threat most likely to cost a grower a whole block.

**4. The honest objection — "a scouting field nobody fills in is worse than no field" — is real,
and it is defeated by mechanism, not optimism.** A half-filled scouting field is worse than an
empty one because the weeks somebody bothers to look correlate with the weeks something looked bad.
That is a biased sample, and a naive reader turns "nobody looked" into "no damage." Three
mechanisms, all mandatory:

- **`NOT_ASSESSED` is an explicit value, distinct from `NONE`.** "I looked and saw none" and "no one
  looked" are different facts and must be different values. A null must never reach a model as a
  clean bill of health. Rule §3.6 applied to a scouting field — a contract test, not a convention.
- **The controls are phenology-gated in the UI**, so they are absent most of the year and their
  presence is itself a signal. Precedent: `phenoStagePct` already renders conditionally at
  `BlockCard.tsx:189-207`.
- **S5b's gate reads a measured fill rate, not the existence of a column.** Rule §3.7 says a model
  may not depend on data the system does not collect — and *a column that is 5 % populated is a
  system that does not collect it.* `verify:phenology` measures it; **S5b may build sour rot only
  if coverage clears 60 % in a rolling 4-week window before the target date** (council DQ2 — a
  season-wide share would let a grower who skipped all of August still pass). Below it, sour rot
  degrades to `unknown` and does not fire. That is not a hedge on this decision — the decision is
  yes. It is what enforcing §3.7 honestly looks like.

**What gets collected** (two Segmented controls):

| Field | Values | Gated at | Consumer |
|---|---|---|---|
| `clusterDamage` | `NOT_ASSESSED` · `NONE` · `TRACE` · `MODERATE` · `SEVERE` | **`FRUIT_SET`** | S5b sour rot **and S5b botrytis** |
| `vinegarFlyPressure` | `NOT_ASSESSED` · `NONE` · `LOW` · `MODERATE` · `HIGH` | `VERAISON` | S5b sour rot |

> **Council S6 changed this.** v1 gated both at veraison. Botrytis exploits **early** wounds —
> powdery scarring, hail, bird damage at pea-size — and those infections stay latent until veraison
> (brief §7.5's latent-bloom pattern). Gating cluster damage at veraison would blind the botrytis
> model to the damage that matters most. `clusterDamage` therefore opens at `FRUIT_SET`.
> `vinegarFlyPressure` stays at veraison: vinegar flies are a ripening-sugar phenomenon and an
> earlier control would be noise.

**Runbook edits this decision requires** (at ship): move sour rot out of the §4 Later bucket into
S5b's scope line with the rolling-window fill-rate gate attached; update §9 S5b's gate; strike the
"needs S4 damage/pest scouting first" qualifier.

---

## 3. Key decisions

| # | Decision | Why | Alternative rejected |
|---|---|---|---|
| **D1** | Weekly observations live in the existing `BlockStatus` **JSON**, not a new table. | Zero migration; `parseBlockStatus` already tolerates `undefined → null`, so back-compat is free. More importantly it rides the surface growers already fill weekly — the whole §3.7 lesson. ~52 notes/vineyard/year; a scan is nothing. | A `BlockPhenologyObservation` table. A second surface to fill is a surface that does not get filled. |
| **D2** | **Durable** attributes get real columns: `VineyardBlock.trellisSystem`, `VineyardBlock.clusterCompactness`, `Variety.clusterCompactness`. This is the schema-slice PR. | Council S6 names *both* halves — *"a leaf-pulled VSP canopy"*. Leaf-pulled is a seasonal observation; **VSP is durable** and no weekly note should re-answer it. | Trellis in the weekly JSON — asking someone to re-state the trellis system 52×/year is how you get a 0 %-filled field. |
| **D4** *(narrowed by council C8)* | Shoot extension collected **two ways**: exact `shootLengthCm` *and* a one-tap `shootLengthBand`. **A band answers the ≥ 10 cm threshold exactly and NEVER produces a point rate.** | The 3-10 rule's real question is a threshold, which a band answers. Growth dilution wants the number. Fill-rate evidence says the number will often be absent and the band will not. **But band midpoints fabricate precision** — `CM_10_30 → CM_30_60` via midpoints reads 55 % unprotected when the truth may be 6 %. So a band-only span yields a `{min,max}` range or `unknown`, never a single figure. | Numeric only (makes S5b's consumer unsatisfiable in practice). Midpoint point-estimates (fiction with a decimal point). |
| **D5** *(revised by council C7)* | Canopy management is **two independent fields**: **`hedgedThisWeek`** (a point-in-time **event**, not carried forward) and `fruitZoneLeafRemoval`. | Deliberate divergence from the runbook's single *"unmanaged / hedged / leaf-pulled"* enum, and both reviewers endorsed the split: independent operations, both can be true, feeding **different** models. **v1 got the second half wrong** — it carried hedging forward as a *state*, which would pin the growth model at `unknown` for the rest of the season. Hedging breaks apical dominance and triggers a *flush* of lateral growth; it is an event followed by more growth, not a standing condition. | One enum (forces a wrong answer when both happened). A carried boolean (never clears; permanently `unknown`). |
| **D6** | Three-way provenance `OBSERVED \| INTERPOLATED \| MODELED`, plus refusal to `null`. | Rule §3.5. Two states is not enough: *interpolated between two real anchors* is materially stronger than *extrapolated past the last one*, and a grower is entitled to know which. | A boolean `isEstimated` — hides the difference that matters. |
| **D7** | Provenance is a **TS String union**; the durable DB columns are **Prisma enums**. | House split. Weather uses String unions for DTO discriminators (`dataStatus`); JSON contents have no DB type to constrain anyway. A durable registry column with a closed set gets a DB enum (`Variety.BerryColor` is the precedent) — a typo'd trellis string would silently break the S1 LWD modifier. | Either extreme; the two cases have different failure modes. |
| **D8** | Cores live in `src/lib/phenology/`, program-neutral. | `frost-core.ts:5` names phenology-gated frost as VI Release 4B — a consumer outside this program. | `src/lib/spray/*` — also forbidden by the lane boundary. |
| **D9** | `SCHEMA_VERSION` stays at **1**, *and `parseDraft` normalizes*. | Additive-optional; bumping would discard in-flight manager drafts (visible data loss). **Council C1 found the catch:** `useDraft.ts:53-72` restores drafts with a bare cast and no `parseBlockStatuses()`, so an old draft would come back with the new keys `undefined`, not `null`. Normalizing on restore is strictly better than discarding the grower's work. | Bump to 2 (throws away in-progress reports). Keep 1 without normalizing (v1's mistake). |
| **D10** | **Drop `leafLayerCount`.** | Scope says "and/or". `canopyDensity` already collects the coarse version at 100 % fill, and leaf-layer count's only consumer is S1's LWD estimator, which does not exist. A numeric field with no live consumer is the §3.7 mistake pointed the other way. | Ship it now — form bloat with no consumer. |
| **D11** *(new — council C9)* | **GDD accumulation is anchored to the `BUD_BREAK` biofix**, not to the calendar season window. | `season-core` hard-codes NH = Apr 1 … Oct 31, and **Bhutan is a live tenant** at ~27 °N in a monsoon climate where an off-cycle or double-pruning regime is plausible. An Oct 31 cutoff would silently truncate their GDD curve and trap the model pre-veraison. Biofix anchoring fixes it **without touching `src/lib/weather/`**, removes the hemisphere assumption from the interpolator, and is standard practice for degree-day models anyway. The calendar window survives only as the completeness denominator. | Calendar-window accumulation — breaks a live tenant. |
| **D12** *(new — council DQ1 + D2)* | `clusterCompactness` **derives from `Variety`** with a per-block override. Resolution order: block override → variety default → `unknown`. | Gemini: Pinot Noir is tight, Cabernet Sauvignon is loose — do not make growers configure static viticultural facts we already know, especially since compactness drives the botrytis microclimate. Codex: not implementable, no such field exists. Both right, so do both — the slice adds `Variety.clusterCompactness` as the default. | A bare per-block column (sparse in practice). Silent derivation with no override (blocks genuinely differ by clone and site). |

---

## 4. Scope

**In:** the schema slice (§6.1) · six new optional `BlockStatus` fields (§6.2) ·
`src/lib/phenology/{stage-core,growth-core,dto,labels,units}.ts` and a server `read.ts` ·
UI authoring + read-back + estimated labeling · assistant reachability via the **existing**
`query_field_reports` tool · `verify:phenology` + the S4 QA report.

**Out:** any modification to `src/lib/weather/**` · `src/lib/pesticide/**`, `src/lib/spray/**` ·
any pathogen, residual, or interlock model (S4 produces inputs and consumes none) ·
**per-variety phenology banding** (council S1 — no schema field exists to drive it; §3.7 forbids
it) · leaf-layer count (D10) · backfilling historical field notes (runbook-forbidden) ·
forecast-driven future phenology (council S5 — refuses until a forecast-aware phase exists).

---

## 5. Lane coordination and shared files

`gh pr list` at plan time: **one open PR, #488** (`bot/brain-refresh`, docs only). The three sibling
spray branches (`s0-spike`, `s2-pesticide`, `s3a-application-record`) exist with **zero commits
ahead of `origin/main`** — all still planning. No file contended on disk yet.

| File | Contended with | Handling |
|---|---|---|
| `prisma/schema.prisma` | every lane | S4's slice touches **only** `VineyardBlock`, `Variety`, and two new enums. Disjoint from S3a (new spray tables) and S2 (registration tables). Land the slice PR first and independently. |
| `src/lib/fieldnotes/types.ts` | **S3a** (legacy spray read seam) | ⚠️ The real collision. S3a edits `spraysApplied` / `InputApplication`; S4 edits `BlockStatus`. **Mitigation: S4 defines all new unions, defaults, and parsers in `src/lib/phenology/observation-types.ts`,** so the diff inside the contended file is ~7 lines (one import, six field declarations, six parser calls). Whichever lane lands second rebases; an additive diff that size rebases trivially. |
| `docs/architecture/assistant-coverage.md` | every lane adding a core | Generated. Run `npm run verify:ai-native -- --write` and commit before push, or CI reds. |
| `src/lib/weather/**` | S1, S7b | **Read-only for S4.** `test/weather-climate-math.test.ts` and `test/weather-normals.test.ts` are hard regression gates that must pass byte-unmodified; new tests go in new files. |

**One documented deviation.** `units-core.ts` owns all unit conversion (*"No other file may hold an
inline × 1.8, / 25.4, or × 9/5"*) but has **no length formatter** — cm→in does not exist, and S4 may
not modify `src/lib/weather/`. Resolution: land `formatShootLength` in `src/lib/phenology/units.ts`
and add a line to the runbook §4 shared-file map so **S1 folds it into `units-core.ts`** when that
lane owns the file. Recorded so it is a decision, not a duplication someone finds later.

---

## 6. Data model

### 6.1 Schema slice (PR 1)

```prisma
enum TrellisSystem { VSP HIGH_WIRE_CORDON SPRAWL GDC SCOTT_HENRY LYRE OTHER }
enum ClusterCompactness { LOOSE MODERATE TIGHT }

model Variety {
  clusterCompactness ClusterCompactness?  // S4/D12: the DEFAULT — variety-driven (Pinot tight, Cab loose)
}

model VineyardBlock {
  trellisSystem      TrellisSystem?       // S4: durable half of the S1 LWD canopy modifier (council S6)
  clusterCompactness ClusterCompactness?  // S4/D12: per-block OVERRIDE of the variety default
}
```

Three nullable columns, no backfill, no RLS change — both models are already tenant-scoped with RLS
and `@@unique([tenantId, id])`. Null means *not recorded*; every consumer treats it as
`cannot-determine`, never a default. No new table, so the Phase-12 checklist adds nothing beyond the
existing models' guarantees. Enums land in their own migration first (the Windows enum rule),
columns second — the `ndvi_display_enums` → `ndvi_display_schema` precedent.

### 6.2 The `BlockStatus` additions (PR 2, JSON — no migration)

```
shootLengthCm        number | null          // exact, mean of ~10 representative shoots
shootLengthBand      "LT_10" | "CM_10_30" | "CM_30_60" | "GT_60" | null
hedgedThisWeek       boolean | null         // EVENT, not a state (D5). null = not assessed
fruitZoneLeafRemoval "NONE" | "PARTIAL" | "FULL" | null
clusterDamage        "NOT_ASSESSED" | "NONE" | "TRACE" | "MODERATE" | "SEVERE" | null
vinegarFlyPressure   "NOT_ASSESSED" | "NONE" | "LOW" | "MODERATE" | "HIGH" | null
```

Every field optional; `parseBlockStatus` maps absent → `null`. The two existing 10-field rows parse
byte-identically. Note the deliberate redundancy on the scouting pair: `null` (control never
rendered, block pre-`FRUIT_SET`) and `"NOT_ASSESSED"` (control rendered, grower did not answer) are
**different facts** and both are distinct from `"NONE"`.

**Carry-forward policy** (`prepopulate.ts:carryForward`):

| Field | Carries? | Why |
|---|---|---|
| `shootLengthCm`, `shootLengthBand` | **No** | A stale length fabricates zero growth — the dangerous direction. |
| `hedgedThisWeek` | **No** | It is an event (D5/C7). Carrying it would pin the growth model at `unknown` all season. |
| `fruitZoneLeafRemoval` | **Yes** | A genuine standing condition until reversed. |
| `clusterDamage`, `vinegarFlyPressure` | **No** | Point-in-time scouting — same rule as `diseasePestSpotted` today. |

### 6.3 What already exists and gets reused for free

- **`shootTip: ACTIVE | STAGNANT`** — already 100 % filled. Signals that *internode elongation* has
  stopped. ⚠️ **It does not mean growth dilution is zero** — see §7.2 and council C6.
- **`canopyDensity`** — already the coarse canopy input (D10).
- **`phenoStage` + `phenoStagePct`** — the interpolator's anchors, and the `BUD_BREAK` note is the
  biofix D11 anchors on.
- **`BrixLog`** (`schema.prisma:1187-1204`, indexed `[blockId, recordedAt]`) — the Brix ≳ 15 gate
  for sour rot already exists per block. S5b reads it; S4 touches it not at all.

---

## 7. The cores

### 7.1 `src/lib/phenology/stage-core.ts` — the interpolator

**Anchors first, model second.** Observed stages from field notes are the truth. Between two anchors,
interpolate on **accumulated GDD**, not elapsed days — GDD self-calibrates to the site and the
season, which is the entire reason to reuse the weather tree instead of a calendar.

Reuse, do not reimplement: `dailyGdd` / `accumulateGdd` (base 10 °C, gaps skipped with a
`daysCounted` honesty counter), `seasonCompleteness`, `addDaysIso`. Nothing in the weather tree
inverts a cumulative curve (`normals-core.cumulativeCurve` is closest and it skips gap days, so
`dayIndex` is non-contiguous) — **the inversion is new code and belongs here.**

**Accumulation starts at the `BUD_BREAK` biofix (D11), not the calendar season window.** With no
bud-break anchor for the block this season, the interpolator refuses rather than falling back to
Apr 1 — which would be silently wrong for Bhutan.

**A monotone phenology coordinate, then quantize back** (council C3). `phenoStagePct` is legal only
as `5|25|50|75|100` and only on `BUD_BREAK`/`FLOWERING`/`VERAISON` (`parsePhenoPct`,
`types.ts:188`). So the core maps stage × pct onto **one scalar**, interpolates on that, and
quantizes on output — and **emits `stagePct: null` for any stage that does not take one.** Without
this, interpolating `FLOWERING 75%` → `FRUIT_SET` can emit illegal values.

Provenance ladder:

| Situation | `source` |
|---|---|
| A field note on the requested date | `OBSERVED` |
| Requested date **between** two anchors | `INTERPOLATED` (GDD-proportional) |
| Requested date **after** the last anchor | `MODELED` (forward projection, **one generic ladder**) |
| No bud-break biofix · no anchor this season · last anchor beyond the phase-scaled horizon · completeness below the 95 % bar · **target date after the last observed weather day** | `null` stage + a reason — **cannot determine** |

Three refusal details the council fixed:

- **Completeness is capped at the end of the anchor span used**, falling back to
  `min(targetDate, siteTodayIso())` — *not* at today (council C4). Otherwise a June question refuses
  because July weather is missing, which is a refusal on irrelevant data.
- **The horizon scales with phenological phase** (council DQ3): tighter through bud break → fruit
  set, where phenology moves in days; looser post-veraison, where veraison→harvest can span 45 days
  with almost no observable transition. Named as S4 constants, tested at both edges.
- **A target date past the last observed `VineyardClimateDaily.localDate` returns `unknown`**
  (council S5). Nothing reads forecast GDD yet; S4 will not be the first to guess.

The MODELED ladder is a **single generic GDD-from-biofix constant** in the core, cited in the file
header. **No variety banding** — council S1 caught that v1 invented a `varietyBand` with no schema
field behind it, which is a §3.7 violation *in the phase that owns §3.7*. Per-variety calibration
returns when a field exists to drive it.

### 7.2 `src/lib/phenology/growth-core.ts` — the growth model

Emits, for a block over a window: `cmPerWeek` (or a range, or `unknown`),
`unprotectedNewLeafFraction` since a given date, `shootsAtLeast10cm`, a provenance stamp, and a
confidence.

Base model during linear extension: `newFraction = clamp((L_now − L_then) / L_now, 0, 1)`. Four
things break it. All four are handled, and **the first is the correction the council forced.**

- ⚠️ **Growth dilution does NOT stop when the shoot tip stops** *(council C6 — v1 was wrong)*.
  Shoot length measures **internode elongation**; **leaf-area expansion continues for roughly
  14–21 days afterwards**, and laterals keep going after the primary tip stops. Expanding leaf
  surface dilutes deposited residue. v1's rule (`STAGNANT ⇒ cmPerWeek ≈ 0 ⇒ no dilution`) would
  report a canopy fully protected when it is materially diluted — **failing toward "protected,"
  which is precisely the direction the program's honesty rules exist to prevent, and the direction
  that costs a grower a crop.** So: on `STAGNANT`, model a **decaying leaf-expansion tail** for
  ~14 days (~200 GDD) before settling to zero. Golden: `STAGNANT` at day 0 still yields a non-zero
  unprotected fraction at day 7.
- **Hedging removes tissue.** `L_now < L_then` after a hedge and the naive formula goes negative.
  A span containing `hedgedThisWeek` **resets the length baseline**; with no post-hedge measurement
  the core returns `unknown`, never a negative and never a zero. Because hedging is an event and is
  not carried (D5), only the span containing it refuses — the following week starts a fresh
  baseline for the lateral-growth phase.
- **Only bands recorded.** Band edges yield a `{min, max}` **range** or `unknown` — **never a point
  rate** (council C8). `shootsAtLeast10cm` stays exact from the band regardless, which was D4's
  actual purpose.
- **Degenerate length.** `L_now <= 0` returns `unknown`, never `0` and never `1` (council C5).
  Clamping does not rescue a `NaN`.

Output is a number (or a range) because S6 consumes it internally. **Council S1 on S6's output
applies to S6, not S4** — but the read DTO must never surface a figure without its provenance,
which is U7's job.

---

## 8. Implementation units

### PR 1 — schema slice (land first, independently)

#### Unit 1: Phenology enums migration
**Goal:** `TrellisSystem` and `ClusterCompactness` exist in Postgres, alone, before anything depends on them.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_phenology_block_enums/migration.sql`
**Approach:** Two `CREATE TYPE`s and nothing else, mirroring `20260725130000_ndvi_display_enums`.
**Tests:** none (DDL only). **Depends on:** none.
**Verification:** `npx prisma migrate status` clean; `npx prisma generate` then `npx tsc --noEmit`.

#### Unit 2: Canopy-profile columns
**Goal:** `VineyardBlock.trellisSystem`, `VineyardBlock.clusterCompactness`, and
`Variety.clusterCompactness` are readable and writable, nullable, with no backfill.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_block_canopy_profile/migration.sql`
**Approach:** Three `ADD COLUMN … NULL`. No index (low-cardinality attributes read alongside a row
already fetched by PK). No RLS change — both models are already tenant-scoped and forced; add them
to the Phase-12 U7 checklist note as *covered by the existing policies*, so the next auditor does
not re-derive it. Ship the D12 resolution helper (`block override → variety default → unknown`) as
a pure function here so U7 consumes it rather than re-implementing precedence.
**Tests:** extend `scripts/verify-tenant-isolation.ts`'s existing `VineyardBlock` case; unit-test
the resolution helper including the all-null → `unknown` case.
**Depends on:** Unit 1.
**Verification:** `npm run verify:tenant-isolation` from the **main checkout**; existing rows read
back with the new columns `null`.

### PR 2 — the feature

#### Unit 3: Observation types and parsers
**Goal:** The new vocabulary exists in one place, with `NOT_ASSESSED` as a first-class value.
**Files:** `src/lib/phenology/observation-types.ts` (new)
**Approach:** Export the option arrays and String unions from §6.2 plus `parse*` helpers matching
the hand-rolled house style (`types.ts:139-161`, no zod). **No `-core` suffix** — this file must not
enter the `verify:ai-native` graph as a core. Living here rather than in `types.ts` is the S3a
collision mitigation (§5).
**Tests:** `test/phenology-observation-types.test.ts` — each parser accepts valid values, rejects
garbage with `FieldNoteParseError`, maps `undefined → null`. Explicit: `NOT_ASSESSED`, `NONE`, and
`null` are three distinct outcomes.
**Depends on:** none. **Verification:** `npx vitest run test/phenology-observation-types.test.ts`.

#### Unit 4: Extend `BlockStatus` through every projection
**Goal:** The new fields survive a full write → store → read → display → assistant round trip.
**This unit is the one that silently half-lands if rushed.**
**Files:** `src/lib/fieldnotes/types.ts` · `prepopulate.ts` · `prompt.ts` · `actions.ts` ·
`src/lib/assistant/tools/query-field-reports.ts` · `save-field-report.ts` ·
`.../manager/useDraft.ts` · `.../manager/FieldNoteForm.tsx`
**Approach:** Research found **five independent hardcoded projections**, each of which silently
drops an unlisted field: `types.ts` (type + both baseline constants + `parseBlockStatus`),
`prepopulate.ts:carryForward` (per §6.2's table), `prompt.ts:describeBlock` (the AI briefing),
`query-field-reports.ts:summarizeBlock` (which already omits `shootTip` — fix that too while here),
and `save-field-report.ts:summarizeBlockEdits` (the write confirmation card).

Four defects the council found, all fixed here:

1. **Truthiness gating** (council C2, verified at `save-field-report.ts:49-55`). The projections use
   `if (partial.canopyDensity)`, so **boolean `false` and numeric `0` are dropped**. Concretely:
   a grower clears `hedgedThisWeek` to `false` and the confirmation card says *"no field changes"*
   while a write is pending. String enums like `"NONE"` are truthy and survive, so the hazard is
   exactly those two shapes. **This also fixes a pre-existing bug: `diseasePestSpotted: false` is
   dropped by the same line today.** Every projection must distinguish `undefined` from `false`/`0`.
2. **Draft normalization** (council C1, verified at `useDraft.ts:53-72`). `parseDraft` returns
   `form as unknown as DraftFormState` — a bare cast with no `parseBlockStatuses()`. A draft saved
   before deploy restores with the new keys `undefined`, not `null`. Run the parser on restore.
   This is what makes D9 (keep `SCHEMA_VERSION` at 1) safe rather than merely convenient.
3. **The untouched-status equality.** `FieldNoteForm.tsx:291`'s `markRemainingHealthy` decides
   "untouched" via `JSON.stringify(s) !== JSON.stringify(EMPTY_BLOCK_STATUS)`. Adding keys changes
   that string, so an untouched block silently misses the healthy stamp. Replace with a key-wise
   `isUntouchedBlockStatus()` that ignores unknown keys.
4. **The swallowed parse error** (council S4). `actions.ts:73` catches and rethrows a generic
   *"Report data is malformed. Please retry."* Rolling out six validated fields behind one opaque
   message makes every bad payload identical in QA. Preserve the `FieldNoteParseError` message, or
   at minimum the failing field name.

**Tests:** extend `test/fieldnotes-sanitize.test.ts` (it asserts `parseBlockStatus`'s exact shape)
and `test/fieldnotes-prepopulate.test.ts`. New `test/fieldnotes-projections.test.ts`: a status with
every new field produces a non-empty edit summary, briefing line, and tool payload — **plus explicit
cases for `hedgedThisWeek: false` and `shootLengthCm: 0` surviving all five projections**, and a
regression case for `diseasePestSpotted: false`. New `test/fieldnotes-draft-upgrade.test.ts`: a
v1-shaped draft string restores with all six fields `null`. **Legacy-row test**: the exact 10-field
JSON shape from the two live Bhutan rows parses with the new fields `null` and no throw.
**Depends on:** Unit 3. **Verification:** `npx vitest run test/fieldnotes-*.test.ts test/assistant-report-merge.test.ts`.

#### Unit 5: `stage-core.ts` — the GDD phenology interpolator
**Goal:** A stage estimate exists on any date, or an explicit refusal — never a silent guess.
**Files:** `src/lib/phenology/stage-core.ts` (new)
**Approach:** §7.1. Pure, no Prisma/React, type-only imports from
`@/lib/weather/{gdd-core,season-core,obs-time-core}`. Signature takes
`{ anchors, dailyRecords, latitude, targetDate }` — **no `varietyBand`** (council S1) — and returns
`{ stage, stagePct, source, anchorDate, anchorAgeDays, gddSinceBiofix, confidence, reason }`.
The action layer resolves latitude via `resolveVineyardCentroid` and passes a plain number, as
`weather/actions.ts:132-169` does; the core never imports `location.ts` (it is `server-only`).
**Tests:** `test/phenology-stage-core.test.ts`, copying the constant-temperature season generator
from `test/weather-normals.test.ts:6-15` so goldens are arithmetic (a constant 10 GDD/day season
makes "day N reaches X GDD" exactly `N = X/10`). Cases: `OBSERVED` on an anchor date ·
`INTERPOLATED` between two anchors, **with a negative assertion that the GDD-weighted midpoint
differs from the calendar midpoint** in an uneven-temperature season (that difference is the whole
reason for GDD) · `MODELED` past the last anchor · **the runbook's named degrade: no field note for
3 weeks** · **cross-boundary interpolation never emits an illegal `stagePct`, and emits `null` for a
stage that takes none** (C3) · **a historical target with a later weather gap does NOT refuse**
(C4) · a target inside a genuinely incomplete window does refuse · **no bud-break biofix ⇒ refuse,
never fall back to Apr 1** (D11/C9) · **a future target date ⇒ `unknown`** (S5) · the phase-scaled
horizon at both edges (DQ3/D3) · a gap day never counted as 0 GDD.
**Depends on:** none (pure). **Verification:** `npx vitest run test/phenology-stage-core.test.ts`.

#### Unit 6: `growth-core.ts` — rate and unprotected new leaf area
**Goal:** The number S6's growth-dilution channel consumes, with all four failure modes closed.
**Files:** `src/lib/phenology/growth-core.ts` (new), `src/lib/phenology/units.ts` (new, §5 deviation)
**Approach:** §7.2.
**Tests:** `test/phenology-growth-core.test.ts` — goldens for the brief §5.1 shape (1–3 in/week
pre-bloom leaves 30–40 % unprotected in 4 days) · **`STAGNANT` still yields a non-zero unprotected
fraction at day 7 and decays to zero by ~day 14–21** (C6 — the single most important test in this
phase) · **a span containing a hedge returns `unknown`, never a negative or a zero** · **the week
after a hedge starts a fresh baseline rather than staying `unknown`** (C7) · **band-only input
returns a range or `unknown`, never a point rate, and a `CM_10_30 → CM_30_60` transition never
reports a single 55 % figure** (C8) · `shootsAtLeast10cm` exact from a band alone · a single
observation yields `unknown` rate but still answers the threshold · **`L_now <= 0` ⇒ `unknown`,
never `NaN`/0/1** (C5) · `unprotectedNewLeafFraction` clamps to [0,1].
**Depends on:** Unit 3. **Verification:** `npx vitest run test/phenology-growth-core.test.ts`.

#### Unit 7: The read seam, DTO, and pure labels
**Goal:** One shape S5b/S6/S7b read, with measured and estimated distinguishable — rule §3.5 —
and the honesty strings testable in CI.
**Files:** `src/lib/phenology/read.ts` (new, server) · `dto.ts` (new, pure) · **`labels.ts` (new,
pure — council S3)**
**Approach:** Load the block's anchors and the vineyard's `VineyardClimateDaily` rows (the
date-ranged query form at `weather/actions.ts:382-402` is the model); resolve tz via
`resolveSiteTimeZone` / `siteTodayIso` — never `new Date().toISOString().slice(0,10)`. Compose
stage + growth + `fruitPresent` + `clusterCompactness` via U2's resolver. `fruitPresent` is
**derived** from stage (`FRUIT_SET`…`HARVEST`) and **inherits the stage's `source`**; when the stage
is `INTERPOLATED`/`MODELED` and the target sits within a band of a transition, set
`boundaryRisk: true` so S7b can refuse rather than gamble a phytotoxicity interlock on an estimate.
Carry an `honesty` block mirroring `read-core.ts:95-100`.

`labels.ts` holds the source→badge-text mapping as **pure functions**, because with no jsdom/RTL the
honesty requirements would otherwise be unverifiable by CI. **The badge carries anchor age**
(council S8): `Estimated — last observed 12 days ago`, not a bare `ESTIMATED`. That turns a label
into a nudge to go measure.
**Tests:** `test/phenology-dto.test.ts` — `fruitPresent` inherits provenance · `boundaryRisk` fires
near a transition on an estimate and **never** on `OBSERVED` · the DTO exposes no field conflating
measured with estimated (negative assertion, `test/weather-contract.test.ts` style).
`test/phenology-labels.test.ts` — the string for each source **contains the word "estimated"** for
both derived tiers, names the estimator, includes the anchor age, and a `null` stage renders as a
distinct *unknown* string that **never** contains "clear"/"none"/"no restriction" (rule §3.6, as a
copy test).
**Depends on:** Units 2, 5, 6. **Verification:** `npx vitest run test/phenology-{dto,labels}.test.ts`.

#### Unit 8: UI — authoring and read-back
**Goal:** A grower can record the observations in a handful of taps and can tell measured from
estimated at a glance.
**Files:** `.../manager/BlockCard.tsx` · `.../NoteDetail.tsx` · `.../manager/FieldNoteForm.tsx`
**Approach:** `BlockCard` is a flat stack of ~8 sections per block and a 6-block vineyard already
renders ~48 control groups, so **do not just append**. Add growth as one section (band `Segmented` +
an optional numeric input behind a small "measured" affordance), canopy management as one section,
and the scouting pair stage-gated (`clusterDamage` at `FRUIT_SET`, `vinegarFlyPressure` at
`VERAISON`) using the existing conditional pattern at `BlockCard.tsx:189-207`.

**Extend bulk-apply** (council S7): `markRemainingHealthy` (`FieldNoteForm.tsx:286-304`) is already
the "stamp this across untouched blocks" pattern. Extend it to the new low-variance fields —
phenology stage and fly pressure rarely differ between adjacent blocks scouted the same morning —
rather than inventing a second mechanism. This is the concession to form growth, and it is the
reason adding six fields does not mean six × N more taps.

`BlockCard` has no numeric-input helper (`FieldNoteForm.numField` is local and unexported) — extract
a shared one rather than duplicating. `NoteDetail.tsx:BlockRow` builds a `chips[]` array; add chips
there, sourced from `labels.ts`, or nothing shows on read-back. DESIGN.md tokens only; the word
**"estimated"** appears in text, never color alone.
**Tests:** no jsdom/RTL — the *strings* are tested in U7's `labels.ts`; placement is QA (§9).
**Depends on:** Units 3, 4, 7.
**Verification:** browser QA per QA-PROTOCOL, incl. **mobile viewport** and light/dark.

#### Unit 9: Assistant reachability and payload
**Goal:** `verify:ai-native` stays green with **no new tool and no allowlist entry** — and the
payload actually carries what the check cannot prove.
**Files:** `src/lib/assistant/tools/query-field-reports.ts` · `docs/architecture/assistant-coverage.md`
**Approach:** `verify-ai-native.mjs` builds a TS import graph rooted at
`src/lib/assistant/tools/**` + `registry.ts`; a `*-core.ts` exporting a `*Core` symbol must be in
the transitive closure. `query_field_reports` already reads field notes and already surfaces
`phenoStage`, so importing the read seam there is honest coverage, not gaming the check. It avoids
an `INTERNAL` entry and keeps `GAP_ALLOWLIST` at its capped 2. Runbook §3.15's one-composite-tool
rule is untouched: no new tool.

⚠️ **The check proves reachability, not serialization** (council S2) — a tool can import the seam
and serialize none of it. So the payload must carry `source`, `anchorAgeDays`, `fruitPresent`, and
`boundaryRisk`, **and a test must assert it**, so the assistant can never present an estimate as an
observation.
**Tests:** a pure serializer test over the `query_field_reports` payload asserting each field with
its provenance stamp, and a `save_field_report` preview test (which doubles as the U4 truthiness
regression). `save_field_report` keeps its `UNCOVERED_OK` exemption — extending an existing write
tool's payload needs no new golden, and its schema is already `additionalProperties: true`.
**Depends on:** Unit 7.
**Verification:** `npm run verify:ai-native` green; regenerate with `-- --write` and commit the doc
**before push** or CI reds.

#### Unit 10: `verify:phenology` and the QA report
**Goal:** End-to-end proof on Demo Winery, plus the fill-rate measurement S5b's sour-rot gate reads.
**Files:** `scripts/verify-phenology.ts` (new), `package.json`, `docs/spray_assistant/qa/S4-qa-report.md`
**Approach:** `tsx --conditions=react-server --env-file=.env`, wrapped in
`runAsTenant("org_demo_winery", …)`, modeled on `verify:weather`. Seeds `QA-`-prefixed blocks and
field notes across several weeks, then asserts: an off-day stage is `INTERPOLATED` and labeled with
its anchor age · a 3-week gap degrades as specified · **a block with no bud-break note refuses
rather than assuming Apr 1** · a legacy 10-field note parses and yields `null` for every new field ·
growth rate matches the golden · a hedge span refuses and the following week recovers.

Then it **reports coverage of the scouting pair in a rolling 4-week window** — the number S5b's gate
consumes (council DQ2). `verify:naming` green before and after; clean up all `QA-*` fixtures.
**Depends on:** Units 4, 7.
**Verification:** run from the **main checkout** (`C:\Users\russe\Documents\Wine-inventory`) —
worktrees have no `.env`. `npx prisma generate` immediately before.

---

## 9. Acceptance gate

Runbook §9 S4 gate, mapped to evidence:

| Gate line | Unit | Evidence |
|---|---|---|
| Growth-rate goldens | U6 | incl. the hedge refusal **and the C6 leaf-expansion tail** |
| Interpolator goldens incl. the "no field note for 3 weeks" degrade | U5 | `test/phenology-stage-core.test.ts`, named case |
| Measured vs estimated distinguishable in the read DTO **and** the UI | U7, U8 | DTO negative assertion + **`labels.ts` copy tests** + QA evidence |
| Canopy state and fruit-present readable by S6/S7b | U7 | `dto.ts` exports; `boundaryRisk` case |
| Back-compat with existing field notes, no historical migration | U4, U10 | legacy-row parse test on the live 10-field shape; draft-upgrade test; `verify:phenology` |
| QA report | U10 | `qa/S4-qa-report.md` |

Added by this plan and by the council:

- **QA-PROTOCOL §4 safety cases, all 23, every phase.** Most will be *"surface does not exist yet —
  skipped, stated explicitly"* per the protocol's own instruction. The ones S4 genuinely owns:
  **SAFE-10** (remove phenology ⇒ *"cannot determine safely"* as its own state, not a degraded
  answer and not an error page) and **SAFE-8**-by-analogy (an estimated stage is labeled estimated
  with the estimator named).
- **Two council-mandated gates that would otherwise not exist:** the `STAGNANT`-still-dilutes golden
  (C6) and the falsy-value projection tests (C2). Both guard failures that point toward
  *"more protected than reality."*
- `npm run verify:tenant-isolation`, `verify:naming` (before and after), `verify:ai-native`,
  `npx tsc --noEmit`, full `npx vitest run` — and `test/weather-climate-math.test.ts` /
  `test/weather-normals.test.ts` passing **byte-unmodified**, the mechanical proof the lane did not
  touch `src/lib/weather/`.
- **The rolling-window scouting coverage number recorded in the phase report**, whatever it is. It
  is S5b's gate input and it is worthless if we only write it down when it flatters us.

---

## 10. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Growth dilution under-reported** — the model says protected when the canopy is diluted | **HIGH** | Council C6. The leaf-expansion tail replaces v1's `STAGNANT ⇒ 0` rule; golden-tested. This is the failure that costs a crop, and v1 had it wrong. |
| **A `null` scouting value read as "no damage"** by S5b | HIGH | `NOT_ASSESSED` distinct from `NONE` and from `null`; contract test; the rolling-window fill gate means S5b cannot build on a sparse column at all. |
| **The projections half-land** — the field saves but the confirmation card says "no field changes" | HIGH | U4 treats all five as one unit, with explicit falsy-value tests. Still the most likely way this phase ships broken. |
| **A hedge produces zero or negative growth** — reads as "no new tissue since the spray", i.e. *more* protection than reality | MED | D5's event model + U6's refusal-then-recover tests. |
| **Band midpoints fabricate a dilution figure** | MED | D4 narrowed: ranges or `unknown`, never a point rate; the threshold answer stays exact. |
| **Bhutan silently truncated by the NH calendar window** | MED | D11 biofix anchoring; U5 refuses without a bud-break note rather than assuming Apr 1. |
| **The interpolator trusted like a measurement** | MED | Three-way provenance, anchor age in the badge, `boundaryRisk`, phase-scaled refusal, "estimated" in text not color. |
| **`src/lib/fieldnotes/types.ts` collides with S3a** | MED | New vocabulary in `observation-types.ts`; the contended diff is ~7 additive lines. |
| **The MODELED ladder is a curated constant with no validation oracle** | MED | It is the weakest tier by design and only fires when no anchor exists; variety banding was cut for lacking a schema source (§3.7). NEWA comparison is available as an oracle once S5a builds one. Accepted and stated. |
| Form bloat on mobile | LOW | Stage-gating, the numeric input behind an affordance, D10's cut, and extended bulk-apply. Mobile viewport is a gate line. |

---

## 11. Confidence

| Section | Confidence | Notes |
|---|---|---|
| Problem frame | HIGH | Grounded in the runbook contract, the brief, a direct read of `types.ts`, and a live fill-rate measurement. |
| Sour-rot decision | HIGH | Unambiguous yes; the rolling-window gate is the mechanism that makes it honest. Evidence base thin and said so. |
| Scope boundaries | HIGH | `gh pr list` verified; sibling branches at zero commits; `src/lib/{spray,pesticide}` do not exist. |
| Implementation units | HIGH | Every path and line number came from reading the code. Four defects found by council review are fixed in place with verified file:line citations. |
| Test strategy | HIGH | Mirrors existing weather/fieldnotes conventions; the constant-GDD generator makes goldens arithmetic; `labels.ts` makes the honesty copy CI-testable despite no jsdom. |
| Growth → leaf-area model | **MEDIUM** | Better than v1 (the leaf-expansion tail is real physiology, not a guess) but the ~14-day / ~200-GDD decay constant is a literature-shaped estimate with no local validation. First-order, and the plan says so. |
| The MODELED ladder | **MEDIUM** | One generic ladder, no variety calibration, no local oracle. Weakest tier by design; fires only with no anchor. |
| UI adoption | **MEDIUM** | The 100 %-on-Segmented evidence is 10 block-weeks, one tenant, one month. Directionally strong, statistically thin. U10 re-measures. |

---

## 12. Post-council open items

Everything in v1's open-questions list was adjudicated ([S4-council-feedback.md](./S4-council-feedback.md)).
What remains genuinely open, for the build:

1. **The leaf-expansion decay constant** (~14 days / ~200 GDD). Directionally right per C6; the exact
   shape is a judgment call. Pick one, name it as an S4 constant, golden-test both ends, and revisit
   when S5a has a NEWA oracle.
2. **The phase-scaled refusal horizons.** DQ3 established that a single 28-day number is wrong in
   both directions; the per-phase values are still to be chosen.
3. **Bulk-apply scope.** Which of the new fields are safe to stamp across untouched blocks?
   Phenology stage and fly pressure look safe; cluster damage probably is not, since damage is
   exactly the thing that varies block to block.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Council (Codex + Gemini) | `/council` | Cross-LLM adversarial review | 1 | ✅ reconciled | 23 findings — 20 folded, 2 partial, 0 rejected → [S4-council-feedback.md](./S4-council-feedback.md) |
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | -- | -- |
| Eng Review | `/plan-eng-review` | Architecture & tests | 0 | -- | -- |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | -- | -- |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | -- | -- |

**VERDICT:** COUNCIL-RECONCILED — v2 is the artifact to build from. Next step per the runbook phase
lifecycle: `/work`.
