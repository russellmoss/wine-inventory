---
title: S0 — phase report
type: phase-report
phase: S0
wave: 1
lane: A
date: 2026-07-26
status: complete — gate answered, S1 narrowed
---

# S0 — phase report

**The weather-lane go/no-go.** It gates S1 only; S2, S2b, S3a, S3b and S4 were unaffected throughout.

Plan: [S0-spike-hourly-lwd-retention-plan.md](./S0-spike-hourly-lwd-retention-plan.md) ·
Council: [S0-council-feedback.md](./S0-council-feedback.md) ·
QA: [../qa/S0-qa-report.md](../qa/S0-qa-report.md) ·
ADRs: [0011](../../architecture/decisions/0011-hourly-weather-retention-and-replay.md),
[0012](../../architecture/decisions/0012-leaf-wetness-estimator-bands-and-refusal.md)

---

## 1. The verdict

**The two-arm gate did not pass, and the pre-committed no-go condition triggered. The correct
consequence is a NARROWED S1, not a cancelled one — and the narrowing is the deliverable.**

> **Reanalysis inputs are adequate to run a leaf-wetness estimator at humid-continental and
> humid-subtropical sites, and are NOT adequate at coastal-fog or hot-arid-interior sites.**

That sentence is worth more than a pass would have been. A pass would have licensed shipping the
weather lane to every vineyard; what S0 actually established is that two of the five real sites — both
of them live Demo-tenant sites in California — cannot be served on reanalysis inputs at all, and that
a rollout starting with the eastern sites would have looked fine while measuring nothing about them.

### Adjudicating the no-go honestly

The no-go fired on two triggers. They do not deserve equal weight, and saying so is not softening the
result:

**NG-1 (Arm B failed on dew-point depression) — upheld, and it is the real finding.** But it is a
*regime* failure, not a global one. Stoney Hill 1.22 °C and Monticello 1.72 °C sit inside the 1.85 °C
tolerance; Russian River 3.18 °C and Madera 5.07 °C do not. Both failures are regimes whose
microclimate is sub-grid at ~25 km — a marine-layer boundary and an irrigated valley floor. The
worst-cell rule made this read as a global failure, which is correct as a gate and useless as
guidance, so the report stratifies it.

**NG-3 (C1 and C3 both failed) — fires as specified, but its stated premise is wrong for C1, and S0
discovered that.** NG-3 was written as *"both the estimator choice and the provider choice move the
advice — that is not a confidence band, it is a coin flip wearing one."* Writing Unit 4's goldens
established that CART and the fallback are **not independent**: the fallback's wet set is a strict
subset of CART's on physically consistent inputs, so the disagreement is one-signed. C1's failure
therefore means *"the naive threshold misses two thirds of the events"*, which is what "40 % more
error" in the literature predicts and precisely why the fallback is labeled inferior. It is not a
coin flip.

**C3's failure, on the other hand, is entirely real and was under-weighted by the plan.** Decomposed
per model pair: `era5` vs Open-Meteo's `default` blend moves **50.6 %** of infection-event
classifications on average and `era5` vs `era5_seamless` **27.1 %**, both far above the 15 % ceiling.
Archive-model identity cannot be abstracted away, and "best match" cannot be used for anything that
will be replayed.

**The rule is left as written.** It was pre-committed before any result existed, and quietly
reinterpreting it after the numbers arrived is the exact failure the pre-commitment exists to
prevent. What is recorded instead is that NG-3's *reasoning* needs amending for a structure S0 found,
and that amendment is now evidence rather than opinion.

---

## 2. Gate evidence

| Runbook gate requirement | Evidence |
|---|---|
| Live field inventory per provider **with series-kind classification** | [s0-hourly-field-inventory.md](./s0-hourly-field-inventory.md) — 7 provider/endpoint combinations × 5 sites, every field classified, three timestamps per field, zero `unknown` |
| Row-volume + latency measurements | [s0-retention-economics.md](./s0-retention-economics.md) — 3 scales, 3 lifecycles, 6 read shapes, 2 physical designs, on an isolated Neon branch as `app_rls` |
| Written **retention decision sized by replay horizon** | [s0-retention-decision.md](./s0-retention-decision.md) + **ADR 0011** |
| Written **LWD estimator decision with confidence bands and refusal threshold** | [s0-lwd-estimator-decision.md](./s0-lwd-estimator-decision.md) + **ADR 0012** |
| Decision-record output shape sketched | [s0-decision-record-shape.md](./s0-decision-record-shape.md) — **non-gating, non-binding** per council C11 |
| No production code required | ✅ none written. Proven in the QA report §3 |

Supporting: [s0-observed-backfill.md](./s0-observed-backfill.md) (Unit 0),
[s0-fixture-manifest.md](./s0-fixture-manifest.md) (Unit 3, 100 fixtures / 566,400 site-hours),
[s0-lwd-disagreement.md](./s0-lwd-disagreement.md) (Unit 5),
[s0-nws-cadence-and-widths.md](./s0-nws-cadence-and-widths.md) (Unit 2 addendum).
[s0-invariants-for-s1.md](./s0-invariants-for-s1.md) (WEATHER-1 + WEATHER-2, register-ready).

---

## 3. Lessons that change later phases

**A lesson that changes a later phase means editing the runbook, not just the report.** Each row below
has been folded into the runbook or the relevant source document.

| # | Lesson | Changes | Folded into |
|---|---|---|---|
| 1 | **The irreversibility sits with FORECAST, not OBSERVED** — the opposite of the plan's premise. Observed data is re-fetchable from two archives; a past forecast issuance is not | S1 schema, Unit 8's whole argument | ADR 0011, runbook §9 S1 |
| 2 | **Reanalysis is REVISABLE**, so a stored copy can drift from the live archive and a recomputation months later can legitimately differ from identical code. A replay-integrity hazard in the kind that looks safest. **Nobody had named this** | S1, S5b | ADR 0011 |
| 3 | **Brief §7's pathogen table is wrong**: Botrytis (Broome 1995) IS an LWD × temperature model, not "cool damp conditions". Phomopsis (Erincik 2003) has exact thresholds. **S5b's scope grows** | S5b | brief §7 correction, runbook §9 S5b |
| 4 | **Two of the four consumers cannot be encoded from public sources** — Broome's and Erincik's coefficients are paywalled. They carried no gate weight. **S5b must obtain both papers** | S5b | ADR 0012 tripwire |
| 5 | **Wind is a legal gate, not just a model input.** A null-wind provider cannot support an application-window answer at all; rendering it otherwise advises a label violation | **S7b** | Unit 9's shape (structural), runbook §9 S7b |
| 6 | **The three-timestamp correction to council C3.** `seriesKind` + `issuedAt` + `validTime` is insufficient; system time (`ingestedAt`) is the replay key, and `providerIssuedAt` is *unknowable* for Open-Meteo | S1 schema | ADR 0011, runbook §9 S1 |
| 7 | **ERA5-Land carries no wind** at any of 5 sites over a full week. The data-sources design §2.3 prefers it on resolution; it cannot run the estimator | S1 | data-sources design §2.3 correction |
| 8 | **Archive model choice moves 50.6 % of classifications.** "Best match" is unusable for anything replayed; the model variant must be recorded | S1, S9 | ADR 0012 |
| 9 | **The two-zone canopy collection requirement** — a per-block `canopyManagement` **observation with a timestamp**, not a static attribute | **S4** | Unit 6 §4 (liftable paragraph) |
| 10 | **NWS interval widths differ per property and grow with lead time** — RH arrives in bins up to 10 h wide. A 10-h RH plateau fed to a threshold model manufactures or erases a ten-hour wetness run | S1 parser, S7b | Unit 2 addendum |
| 11 | **The intra-cron window fails CLOSED**, with the asymmetric-harm reasoning | S1, S5b, S9 | ADR 0012 |
| 12 | **Confidence must carry provider-vs-station AGREEMENT, not just completeness** — the Madera inversion | S9, S1 | ADR 0012, Unit 9's shape |
| 13 | **Missing shared-file entries** — `package.json` scripts, runbook §8 ledger, `NOW.md`, ADR numbering, root `council-feedback.md` | every lane | runbook §4 |
| 14 | **The program's parent documents were uncommitted**, so no lane's plan resolved its own links | every lane | ✅ fixed — committed at `b63ec3f1` |

---

## 4. What was measured, in numbers

| | |
|---|---|
| Fixtures | 100 files, **566,400 site-hours**, 5 sites × 5 seasons × 4 archive models, 3.2 MB |
| Shape assertions | **800**, zero failures |
| Estimator goldens | **28**, including a dominance sweep over 5,000+ points |
| Providers probed live | **7** endpoint/product combinations across 5 sites |
| Arm B comparison | **~5,120 matched hours per site-season**, 4 sites × 2 seasons |
| Storage | **5.51 MB/vineyard-year** (OBSERVED, 5-year projection, 659 B/row) |
| Forecast churn | **4.63×** steady state after 12 replace cycles |
| Worst read | **266 ms p95** → **152 ms** with partial indexes |
| Neon branches left behind | **0** (verified) |

---

## 5. Open questions for Russell

The plan asked six. Four are now answered by measurement; two remain.

| # | Question | Status |
|---|---|---|
| 1 | Was brief §7's pathogen table meant to be exhaustive? | **Answered by evidence** — it is materially incomplete. Correction drafted; S5b's scope grows. Needs your sign-off on the brief edit |
| 2 | Is the two-zone canopy model accepted, given it expands what S4 collects? | **Still yours.** S0 recommends yes: it is cheap now and expensive to retrofit, and the one-zone version is anatomically wrong |
| 3 | Does wind-is-a-legal-gate change S7b's scope? | **Answered** — yes, and it is written into Unit 9's shape structurally so S7b cannot miss it. Should go into the runbook risk register now |
| 4 | Confirm the 2–3 year regulatory retention floor, and how long the lot residue flag must stay explicable | **Half answered.** The 2–3 year floor is cited (EPA WPS + state). **The residue-flag horizon is the one input to ADR 0011 that is inferred rather than stated** — S0 assumed "as long as the wine exists" |
| 5 | If observed data is unbackfillable, does a minimal capture job jump the queue? | **Answered — moot.** It IS backfillable, from two archives, back past 2005. No queue change |
| 6 | Is Arm B acceptable with only one station-adjacent site? | **Answered — moot.** All five sites have a usable station. But with a caveat that matters more: **no station in the set measures RH**, so Arm B's independent quantities are temperature, dew point, wind and precipitation |

**The one decision that would change S1's shape**: whether to build the weather lane for eastern sites
only in the first pass, or to build the station-blending path up front so the California sites are
served from day one. S0 recommends the former — the eastern path is proven and the blending path is
unproven work that would gate everything behind it.

---

## 6. Deviations from the plan

| Deviation | Why |
|---|---|
| Goldens live in `test/` rather than beside the script | The plan allowed either. `vitest.config.ts` only picks up `test/**`, so this is the choice where "S1 inherits them" is true |
| Season characterization used a 20-season **archive** baseline rather than `vineyard_climate_daily` | The DB path covers three of five sites — Paro's rows are Bhutan's and this lane may not read them, Monticello has none — and would compute differently per site. The archive baseline is uniform across all five |
| The Neon branch deletion is **not** in a `finally` | There is no `NEON_API_KEY` in `.env`, so the process cannot delete a branch. Mitigated with `expiresAt`, and the deletion performed and verified explicitly |
| Arm B covers 2 seasons per site rather than 5 | ~5,120 matched hours per site-season across 4 sites × 2 seasons is already 41,000 comparisons, and the per-site verdicts are unambiguous. More seasons would not change a 5.07-vs-1.85 result |
| Added `scripts/s0-units.ts` and `scripts/s0-pathogens.ts`, not named in the plan | Both within the `scripts/s0-*.ts` lane boundary. The units module exists because of defect #1 in the QA report |

---

## 7. Recommendation

**Build S1, narrowed.**

1. Eastern sites (humid continental, humid subtropical) on fixed-model reanalysis + NWS. Not
   coastal-fog or arid-interior sites until station blending exists.
2. Fix the archive model and record it. Never "best match".
3. Exclude ERA5-Land.
4. Retention per ADR 0011; replay keys on `ingestedAt`.
5. Partial indexes per series kind **plus** a cross-kind replay index.
6. `NULLS NOT DISTINCT` on the replace identity.
7. Wire every retained provider through the SSRF-guarded fetch edge and its allowlist — S0's probes
   deliberately bypassed it as throwaway code.
8. Obtain the CART primary paper before the estimator moves into `src/`.
9. Alerting on the ingest cron. A missed capture is recoverable now, but it is still silent.
