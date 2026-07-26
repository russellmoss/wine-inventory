---
title: S0 — QA report
type: qa-report
phase: S0
date: 2026-07-26
protocol: ../qa/QA-PROTOCOL.md
---

# S0 — QA report

Runbook rule §3.16 makes the QA report **non-waivable**, and S0 ships no surface. The honest report is
therefore not "N/A": it is the baseline table every later phase fills in, plus the proofs that apply
to a phase which persists nothing.

---

## 1. Scope of testing

S0 ships **no production code**: no `src/` changes, no Prisma models, no migrations, no adapters, no
UI. What it ships is measurement scripts under `scripts/s0-*.ts`, committed fixtures under
`scripts/fixtures/s0/`, unit goldens in `test/s0-lwd.test.ts`, and decision documents.

| Layer | Run? | Result |
|---|---|---|
| **Unit goldens** (`test/s0-lwd.test.ts`) | ✅ | **28/28 pass** — the estimators, on hand-built series. S1 inherits them |
| **Fixture shape assertions** (Unit 3) | ✅ | **800 assertions across 100 fixtures, 0 failures** |
| **Criteria assertions** (Units 5, 7) | ✅ | computed, not narrated; both scripts exit non-zero on breach and Unit 5 and Unit 7 **both did** |
| **Probe self-checks** (Units 0, 2) | ✅ | every data-sources-design claim re-verified live; the check **caught a real key mismatch** on its first run |
| **Isolation guard** (Unit 7) | ✅ | **negative cases exercised** — see §4 |
| `verify:naming` | ✅ | **25/25 assertions passed**, before and after |
| `verify:invariants` | ✅ | **39/39, 100 % coverage** — see defect 8 in §5 for why the two new invariants are staged outside the register |
| `verify:ai-native` | ⏭ not applicable | no new core is exported. S0 adds no `*-core.ts` |
| `verify:tenant-isolation` | ⏭ not applicable | no new table. The only table created lived on a throwaway Neon branch and was dropped |
| Browser QA | ⏭ not applicable | no surface. First applicable at S9/S10 |

---

## 2. The 23 SAFE cases — the baseline table

QA-PROTOCOL §4's 23 safety cases, each marked with **the specific reason** it is not yet testable and
**the phase that first makes it testable**. The protocol is explicit that a blank row reads as a pass,
so nothing is left blank.

| # | Case | S0 status | Why, and when it becomes testable |
|---|---|---|---|
| SAFE-1 | AI/trade-name-only recommendation declined | ⏭ not-yet-applicable | no assistant tool exists. **S11** |
| SAFE-2 | Block with no spray records → protection *unknown* | ⏭ not-yet-applicable | no protection model. **S6** |
| SAFE-3 | Resistance code *gap* renders unknown | ⏭ not-yet-applicable | no resistance derivation. **S2** |
| SAFE-4 | *No-code-exists* renders distinctly from a gap | ⏭ not-yet-applicable | **S2**. ⚠️ S0 **did** design for this: `LegalWindow` has distinct `CLEAR` / `COVERAGE_GAP` / `NO_CODE_EXISTS` members and no nullable boolean (Unit 9 §3) |
| SAFE-5 | Sulfur × HYBRID × post-application >85 °F hourly | ⏭ not-yet-applicable | needs hourly weather (S1) + interlocks. **S7b** |
| SAFE-6 | Oil→sulfur direction-specific separation | ⏭ not-yet-applicable | no interlock engine. **S7a** |
| SAFE-7 | Distant/high-delta station → risk **and** separate lower confidence | ⏭ not-yet-applicable | **S9** renders it. ⚠️ S0 **measured the inputs** for it: station distance 3.3–17.4 km and elevation delta per site (Unit 2 §6), and established that the band must carry provider-vs-station **agreement**, not just distance (Unit 6 §2) |
| SAFE-8 | Leaf-wetness output labeled *estimated*, estimator named | ⏭ not-yet-applicable | no surface. **S9**. ⚠️ S0 made it **structurally enforceable**: `qualityClass` rides on every verdict and there is no bare boolean in the estimator's output (`scripts/s0-lwd.ts`), goldens `test/s0-lwd.test.ts` |
| SAFE-9 | Dry forecast must not lower powdery risk | ⏭ not-yet-applicable | no powdery model. **S5a** |
| SAFE-10 | Missing required input → *cannot determine safely* as its own state | ⏭ not-yet-applicable | no decision surface. **S9**. ⚠️ S0 **specified** it: refusal cause classes with distinct rendering (Unit 6 §3) and a discriminated `Decision` union (Unit 9) |
| SAFE-11 | `what we don't know` present and non-empty | ⏭ not-yet-applicable | no decision record. **S9**. ⚠️ S0 proposed `NonEmpty<Unknown>` making empty **inexpressible** |
| SAFE-12 | Read question fires a read tool only | ⏭ not-yet-applicable | no assistant tool. **S11** |
| SAFE-13 | Assistant spray write → confirmation card, no over-claim | ⏭ not-yet-applicable | **S11** |
| SAFE-14 | Disabled knowledge source → not-enabled path | ⏭ not-yet-applicable | **SKB / S11** |
| SAFE-15 | Bulletins Live! Two → human must clear | ⏭ not-yet-applicable | **S7a** |
| SAFE-16 | Planned application must not deplete/satisfy/start/appear | ⏭ not-yet-applicable | **S3b** (plan) × **S6/S7a/S8** (the four consumers) |
| SAFE-17 | Legacy name-only FieldNote spray → low-confidence, blocks "rotation OK" | ⏭ not-yet-applicable | **S3a** owns the record; **S7a** the rotation claim |
| SAFE-18 | Harvest date pulled into a PHI window → hard warning at the moment it changes | ⏭ not-yet-applicable | **S3a/S7a** |
| SAFE-19 | Non-US tenant does not brick | ⏭ not-yet-applicable | needs the registry. **S2/S7a**. ⚠️ S0 exercised the **weather half** on Paro's real geography: it is a first-class fixture site and the NWS 404s are handled as coverage signals, never retried, never errors |
| SAFE-20 | Correction event propagates to all four consumers | ⏭ not-yet-applicable | **S3a** emits it; **S6/S7a/S8** consume it |
| SAFE-21 | Forecast row never satisfies a historical read | ⏭ not-yet-applicable | needs the hourly table. **S1**. ⚠️ S0 **measured** the contract read (31.6 ms p95) and wrote the invariant **WEATHER-1** with its guard, including the requirement that the guard watch the *relative* cost so the safe query can never become the slow one |
| SAFE-22 | Protection is categorical; **no raw percentage reaches the UI** | ⏭ not-yet-applicable | **S6/S9**. ⚠️ S0's proposed shape has **no numeric protection field at all** — absent, not merely hidden |
| SAFE-23 | Block reason rendered verbatim | ⏭ not-yet-applicable | **S7a/S11**. ⚠️ S0's `HardRestriction` requires **both** an opaque code and a canonical human string, neither derivable from the other |

**Summary: 0 run, 23 not-yet-applicable, 0 failed.** Eight of the 23 (SAFE-4, 7, 8, 10, 11, 19, 21,
22, 23) already have a *structural* provision made in S0's decisions or proposed shape, noted above so
the later phase inherits the mechanism rather than re-deriving it.

---

## 3. Persistence proof — a phase that persists nothing, proving it

Read back from **production** after all S0 work completed:

```
s0_* tables in production:                    NONE
vineyard:                                     20 rows
vineyard_climate_daily:                       70,389 rows
vineyard_forecast_hourly:                     2,112 rows
Bhutan vineyard rows (read-only, unchanged):  9
```

**No `s0_*` table exists in production.** The measurement tables were created on a throwaway Neon
branch and dropped in a `finally`.

### ⚠️ A row-count claim that would have been false, stated correctly instead

A naive "no rows were written in any tenant" would be **wrong**. The same read-back shows:

```
vineyard_climate_daily rows created in the last 8 h:
  org_bhutan_wine_co   3,633
  org_demo_winery     13,270
```

Those are **the scheduled daily weather cron's**, not S0's. The claim S0 is entitled to make is
narrower and checkable:

> **No S0 script has a write path to any tenant table.** Exactly one of the eleven `scripts/s0-*.ts`
> files constructs a database client at all — `s0-measure-retention.ts` — and its only connection
> target is the Neon branch host, behind a guard that was **proven to refuse production** (§4).
> Verified by grep across all eleven scripts.

Reporting the cron's rows as if they were ours, or omitting them and claiming zero, would both have
been wrong. This is the accurate version.

### Bhutan discipline

`org_bhutan_wine_co` was **never written to and never read from** by any S0 script. Paro appears in
the fixture set as **coordinates, elevation and a timezone only**, hard-coded in `scripts/s0-sites.ts`
from values already recorded. The fixtures are flat files. Unit 3's season characterization
deliberately deviated from the plan — which called for reading `vineyard_climate_daily` — precisely
to avoid reading Bhutan's rows, and used a uniform archive baseline for all five sites instead.

---

## 4. The one piece of state S0 did touch: the Neon measurement branch

| | |
|---|---|
| Branch | `s0-retention-measure`, id `br-fragrant-unit-at08020n` |
| Project | `muddy-shape-80817041` (wine-inventory) |
| Parent | `br-polished-dream-at0eytfg` (default/main) |
| Created | 2026-07-26, with `expiresAt: 2026-07-27T06:00:00Z` as a safety net |
| Deleted | 2026-07-26, **explicitly and with the user's confirmation** |
| Verified | ✅ project branch listing re-read after deletion: **no `s0-*` branch remains** |

### The isolation guard was PROVEN to fire, not merely present

Council C9: *"a comment saying 'never the default branch' is not a control."* So both negative cases
were exercised **before** the real run:

| Test | Result |
|---|---|
| Pointed at the production host from `.env` | ❌ **refused** — *"the target host … is a PRODUCTION host from .env. This is the default branch."* |
| Run without `--branch-id` | ❌ **refused** — *"the branch must be named explicitly; nothing is inferred."* |
| Pointed at the branch, with an explicit branch id | ✅ proceeded |

The guard normalizes Neon's pooled/unpooled host forms so neither can slip past, and refuses any host
that is not a `.neon.tech` endpoint.

### Connected as `app_rls`, not as the owner

Every timed read and write ran as **`app_rls`** — the NOBYPASSRLS role production actually uses — so
the RLS policy predicate is in every latency figure. DDL ran as the owner, exactly as production
splits it. The first attempt tried to do everything as `app_rls` and got
`ERROR: permission denied for schema public`, which is the Phase-12 security model working as
designed and is recorded as such rather than worked around.

---

## 5. Defects found by QA during S0

Every one of these was found by a check failing, not by review. Listed because a QA report that finds
nothing usually means the checks were not sharp enough.

| # | Found by | Defect | Severity | Status |
|---|---|---|---|---|
| 1 | Unit 3 sizing probe | **Open-Meteo returns wind in km/h**; CART's node is 2.5 **m/s**. Would have made a dead calm look windy, collapsing CART's level 2 and routing whole seasons through the RH node — while still producing plausible wet-hour counts | **HIGH** — silent | ✅ fixed: `wind_speed_unit=ms` forced **and** the returned unit asserted; `scripts/s0-units.ts` centralises it |
| 2 | Unit 7 script failing | **`NULLS NOT DISTINCT` missing** on the replace-identity index. A nullable `providerIssuedAt` makes a plain UNIQUE enforce nothing for those rows, and an `ON CONFLICT` upsert silently INSERTs duplicates | **HIGH** — silent, in the table the whole lane reads | ✅ fixed in the measured schema; **S1 requirement** recorded in ADR 0011 |
| 3 | Unit 7 review of its own output | **The bloat metric measured the wrong thing** and reported "−0 % bloat". It compared size before VACUUM to after — but plain VACUUM marks pages reusable rather than returning them, so that difference is ~0 *by construction*. It would have concluded forecast churn is free | **MED** — would have produced a confidently wrong retention decision | ✅ fixed: measured against steady state; real answer **4.63×** |
| 4 | Unit 0 re-run | **A 429 recorded as an absence.** The first run reported "no data before 2015" from a rate limit, understating the archive's depth by a decade in the direction that flattered the argument | **MED** | ✅ fixed: 429/5xx retried with backoff; only 404 is a coverage signal |
| 5 | Unit 5 first run | **Import side effect** — `s0-fetch-fixtures.ts` called `main()` at module load, so importing `readFixture` re-ran the entire 100-fixture harvest | LOW (harvest is idempotent) | ✅ fixed: entry-point guard |
| 6 | Unit 2 assertion harness | Design-doc claim key mismatch (`open_meteo:forecast` vs `open_meteo:forecast-default`) — the harness working as intended | LOW | ✅ fixed |
| 7 | Unit 7 first run | Synthetic ids collided across series kinds on the primary key | LOW (test-only) | ✅ fixed: kind-distinct id space |
| 8 | `verify:invariants` post-commit hook | Registering WEATHER-1/WEATHER-2 as invariant notes turned the repo-wide guard checker red (2/41 MISSING), because S0 ships no production code so neither guard can exist yet | LOW, but **repo-wide** | ✅ resolved by moving the notes to `phases/s0-invariant-WEATHER-*.md` until S1 lands the guards. **Deliberately NOT resolved by teaching the checker a `planned` status** — weakening a safety checker from inside a spike, to green the spike's own notes, is the wrong trade. Coverage back to **39/39, 100 %** |
| 9 | Fixture verifier re-run | Underscore-prefixed sidecars matched the `.json.gz` fixture glob, so the Arm B station cache was parsed as a fixture and crashed the verifier | LOW (tooling) | ✅ fixed: `!f.startsWith("_")` |

---

## 6. Criterion breaches — the verdicts, computed

Both measurement scripts exit non-zero on breach. **Both did.**

| Criterion | Observed | Threshold | Verdict |
|---|---|---|---|
| C1 estimator effect | 1.00 (worst cell) | ≤ 0.20 | ❌ FAIL — **predicted in Unit 1b before the measurement ran**; the fallback's wet set is a strict subset of CART's so flips are one-signed |
| C2.dpd Arm B dew-point depression | 5.07 °C | ≤ 1.85 °C | ❌ FAIL — **and it splits by regime**: 1.22/1.72 °C in the East, 3.18/5.07 °C in California |
| C2.temp | 3.58 °C | ≤ 1.11 °C | ❌ FAIL |
| C2.wind | 1.36 m/s | ≤ 1.25 m/s | ❌ FAIL (marginal, uniform across sites) |
| C2.precip | 1.18 mm/h | ≤ 0.2 mm/h | ❌ FAIL |
| C2.rh (secondary, transitive) | 13.56 pp | ≤ 5 pp | ❌ FAIL |
| C3 provider spread | 1.00 | ≤ 0.15 | ❌ FAIL — real, not an artifact: `era5` vs `default` moves **50.6 %** on average |
| C4 wind sensitivity | 0.164 | ≤ 0.50 | ✅ PASS |
| C5 refusal band | 0.187 (worst), 0.006 (best) | 0.005 … 0.33 | ✅ PASS at **both** ends |
| C6 storage | 5.51 MB/vineyard-year | ≤ 25 MB | ✅ PASS |
| C7 read latency | 266 ms p95 | ≤ 250 ms | ❌ FAIL — fixable, and fixed in the recommendation (152 ms with partial indexes) |

**No-go: TRIGGERED** (NG-1 and NG-3). The adjudication is in the phase report — in short, the no-go
did its job by preventing a *global* claim, and the correct consequence is a narrowed S1 rather than
a cancelled one.

---

## 7. Sign-off

- `verify:naming` green before and after: ✅ **25/25**
- Unit goldens: ✅ **28/28**
- Fixture assertions: ✅ **800/800**
- No production schema change, no production row written by S0: ✅ proven in §3
- Measurement branch created and deleted, deletion verified: ✅ §4
- All 23 SAFE cases enumerated with reasons and owning phases: ✅ §2
- Defects found and fixed: **9**, listed in §5
