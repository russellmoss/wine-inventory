# S5a — phase report

**Powdery-mildew index and the latent-infection ledger** (Wave 2, lane C)
**Built:** 2026-07-26 · **Branch:** `claude/powdery-index-latent-ledger-38428b`
**Plan:** [S5a-powdery-index-latent-ledger-plan.md](S5a-powdery-index-latent-ledger-plan.md) ·
**Council:** [S5a-council-feedback.md](S5a-council-feedback.md) ·
**Probe:** [S5a-diurnal-fidelity-probe.md](S5a-diurnal-fidelity-probe.md)

---

## The one thing to know

**The phase shipped half of what it planned, on purpose.** Unit 0 was a pre-committed measurement
gate, it fired, and the powdery-mildew index is a **NO-GO**. What shipped is the append-only
latent-infection ledger, which never depended on the index and is the more durable half.

That is the plan working, not the plan failing. The alternative was building a risk engine on a
premise nobody had measured, and then either retracting it or leaving it quietly wrong in front of
growers.

---

## What the measurement found

The runbook scoped S5a as *"Gubler-Thomas is temperature-only and buildable on today's daily data
via diurnal reconstruction."* The second half is now measured false.

The probe reconstructed hourly temperature from stored daily Tmin/Tmax using **Felber, Stoeckli &
Calanca 2018** (Eq. 1a–1c, generic parameters, taken from the open-access primary rather than a
secondary source — the plan warned about transcription errors in those, and it was right to) and
scored the resulting Gubler-Thomas point deltas against **genuine station hourly METAR** from the
Iowa Environmental Mesonet ASOS archive. Six seasons, eight sites, Wilson confidence intervals on
every rate, evaluated per site and never averaged.

**All eight sites failed.** The failure is structural, on four independent lines:

| Evidence | What it rules out |
|---|---|
| A Sanders sawtooth control scores as well as the calibrated model | A better estimator |
| Our sites violate the model's shape assumptions **far less** than the sites it was calibrated on (0.2–1.4% vs Felber's own 27%) | "Bad days" as the cause |
| Consecutive-hours-in-band MAE is **2.2–3.4 h** against a rule thresholded at **6 h** | The derived quantity being resolvable at all |
| Savalkar's monthly-station-statistics mitigation lifted no station-oracle site and made the best one *worse* | Calibration as a fix |

That last row is the plan's own §1.2 thesis confirmed by measurement: Savalkar's >75% error reduction
was for **chill accumulation**, a smooth accumulator. Gubler-Thomas is a narrow-window **threshold
counter** — structurally the sunburn / Chill-Portions case. The repo's existing weather math
(`gdd-core`, `normals-core`, `stage-core`) lives in the forgiving class. This index does not.

**The error runs toward crop loss, not over-spraying.** A high-running index would have been
survivable. The binding G1 gate measures the opposite direction — days the station calls
epidemic-threshold and the model calls quieter — and six of eight sites breach the 2% bar, worst
**13.6% at Madera**, the site S0 already flagged for reporting its highest confidence on its worst
inputs.

**Unlike ADR 0012, there is no regime split to narrow to.** S1 could be narrowed to eastern sites
because its failure divided cleanly and physically. This one does not: the best oracle in the fleet
(Russian River, **3.7 km**) scored *worse* than a 9.8 km one.

### Escalated out of the phase — Bhutan may be 8–9 °C wrong

No station oracle exists for either Bhutan site; the nearest ASOS to Bajo sits **1,005 m above** the
vineyard. NASA POWER and ERA5, sampled at the same coordinates, disagree by **9.26 °C (Bajo)** and
**8.16 °C (Gortshalu)** against 0.31–1.44 °C at the US sites — lapse-rate-consistent with a grid cell
mean elevation ~1.3 km off a Himalayan valley.

Beware the shape of this number: a bias-corrected comparison of the two grids looks like a **96%
"pass"**. That jump *is* the finding, not a result — it is two coarse grids agreeing on shape once
you subtract their disagreement on level, which is council C2's model-validated-against-model
artifact in its purest form. This is a live-tenant data-quality question for every
temperature-derived number already shown to that grower (Winkler class and the frost/heat alert
ladder most of all, both having hard boundaries). Raised as its own investigation.

---

## What shipped

| Unit | Status |
|---|---|
| 0 — fidelity probe + gate | ✅ NO-GO returned; 8 committed paired fixture seasons |
| 1 — latent-infection enums | ✅ |
| 2 — `latent_infection_event` + RLS | ✅ |
| 3 — `diurnal-core.ts` | ⛔ **cancelled by the gate** |
| 4 — `powdery-core.ts` | ⛔ **cancelled by the gate** |
| 5 — ledger core + resolution rules | ✅ 14 unit tests |
| 6 — read seam + DTO | ✅ ledger-only (the index half no longer exists) |
| 7 — `query_spray_decision` thin + hard-refusing | ✅ contributor barrel gets its first line |
| 8 — goldens, fleet discrimination, payload test | ✅ 12 tests |
| 9 — `verify:latent-infection` | ✅ **43 assertions green against the live DB** (renamed from `verify:powdery` — there is no index to verify) |
| 10 — invariant, registers, runbook correction | ✅ SPRAY-7 (shipped as SPRAY-6, renumbered — see below); runbook §9 corrected |
| 11 — phase report | ✅ this file |

### The safety properties, and where each is actually enforced

- **KD-4 — the two transitions take OPPOSITE bounds.** `infectiousExpectedAt` projects from the
  **shortest** plausible latent period (~5 d), the event expiry from the **longest** (~14 d).
  Council caught this inverted in the plan's first draft, where the longer bound was called
  "conservative" for both. It is not: telling a grower an infection will not be infectious for
  fourteen days makes them wait while it sporulates on day five. Enforced in
  `infection-resolution.ts`, constrained in the database (`lie_latent_bounds_ordered`), and proven as
  literal dates by `verify:latent-infection` group 4.
- **KD-5 / SPRAY-7 — a clean scouting pass never closes an event.** `evaluateResolution` accepts
  `scoutedCleanOn` and deliberately ignores it; `closeInfectionEvent` exposes no parameter that
  would let a caller close on absence of symptoms. Grounded in Fedele et al. 2020.
- **C7 — no epistemic state in a null.** Every projected transition carries a projection *kind*, with
  a DB CHECK asserting the date is present exactly when the kind says `PROJECTED`.
- **Tri-state honesty at the API boundary.** `infectious` is `true` / `false` / `null`; `false`
  reads as "this block is safe" and `null` does not. A test asserts `null` survives JSON
  serialization, because that is exactly where a tri-state quietly becomes a boolean.

---

## Deviations from the plan

1. **Units 3 and 4 were not built.** The gate cancelled them. The index moves to S5b behind S1,
   which makes **S1 load-bearing for powdery mildew**, not just for leaf wetness — a dependency edge
   the original plan did not have.
2. **`verify:powdery` → `verify:latent-infection`.** Naming the script after a thing that does not
   exist would have been the NAMING-2 problem.
3. **The Unit 10 invariant was replaced.** The plan specified
   `PEST-2-index-unknown-never-low.md`. That could not ship for three independent reasons: `PEST-2`
   is **already taken** by a shipped critical invariant (creating that file would have overwritten
   it), the rule already exists as `SPRAY-3`, and its subject no longer ships. Replaced with
   **SPRAY-7**. The plan's Unit 10 is corrected in place so the next reader does not repeat it.

   ⚠️ **And then I made the very mistake I had just documented.** The note shipped as `SPRAY-6`,
   because SPRAY-5 was the high-water mark when I checked. S2b merged its own `SPRAY-6` in #535
   hours before S5a merged in #537; the register is keyed by filename, so **both landed on `main`
   with the same id** and `verify:invariants` counted them as two happy rows. Fixed by renumbering
   mine to SPRAY-7 (S2b landed first, so it keeps the number) and by teaching
   `verify:invariants` to FAIL on a duplicate id — the mechanical guard I had flagged as
   worth adding and did not add at the time. Checking a shared counter once, before a rebase,
   is not checking it.
4. **`GRANT SELECT, INSERT` was not enough to make the table append-only** — see below.
5. **Scale/security register rows and the `ux-principles.md` risk rule are NOT done.** Deferred
   deliberately: the register row the plan specified was for a per-vineyard-per-day *index* table
   that is not being built, and the ux rule was justified by S5a being the first phase to render a
   risk state, which it no longer is. Both want rewriting against the ledger rather than
   transcribing against a cancelled index.

---

## The defect worth carrying forward

**The ledger was not actually append-only on the first attempt, and the triggers hid it.**

`ALTER DEFAULT PRIVILEGES` (from the `..._app_rls_role` migration) grants `app_rls` full DML on every
table subsequently created in `public`. A new table therefore arrives with **UPDATE and DELETE
already granted**, and layering `GRANT SELECT, INSERT` on top changes nothing. The table would have
shipped looking append-only — triggers in place, tests passing, comments confident — while the app
role quietly held the privileges to defeat it. That is precisely what council C5 meant by "the
trigger is not enough; the grant is the real enforcement."

It was caught only by **test-applying the migration to a disposable Neon branch**. `prisma validate`
checks the Prisma schema and says nothing about whether the SQL runs. Since
[[prisma-neon-migrations-windows]] forbids `migrate diff` in this repo, every migration here is
hand-authored and otherwise unexercised until it reaches a real database.

**Rule for the next append-only table: `REVOKE UPDATE, DELETE, TRUNCATE ... FROM app_rls`, and assert
the grant posture in the migration's self-verify block.** Ours does, and it is what refused to let
the bad version through.

---

## Gates

| Gate | Result |
|---|---|
| `npm run verify:latent-infection` | ✅ 43 assertions, live DB, re-runnable |
| `npm run verify:tenant-isolation` | ✅ incl. 6 new `latent_infection_event` cases |
| `npm run verify:invariants` | ✅ 49/49 guarded (100%) |
| `npm run verify:ai-native` | ✅ `infection-read-core.ts` reachable via `query-spray-decision` |
| `npx tsc --noEmit` | ✅ |
| `npm run lint` | ✅ 0 errors |
| Unit tests | ✅ 26 new; 4,702 passing suite-wide |

**One honest caveat on the full suite:** two test files intermittently fail *when the whole suite
runs*, and both pass in isolation. Neither is touched by this branch
(`test/process-scene.test.ts`, `test/assistant-commit-tenant-context.test.ts`); the failures are
`PrismaClient` construction and a 42-second timeout, consistent with sibling agent sessions
regenerating the shared client mid-run — the §8 hazard the plan names. Flaky under parallel load,
not a regression, but recorded rather than rounded to green.

---

## Not done, and deliberately

- **Browser QA.** The ledger has no UI yet — S9 owns presentation, and there is no surface to click.
  QA-PROTOCOL §4's 23 safety cases are mostly about a rendered risk state, which does not exist.
- **The scale + security register rows and the ux-principles risk rule** (deviation 5 above).
- **An assistant WRITE path for infection events.** `query_spray_decision` is read-only and
  hard-refusing. A write tool for a disease record wants its own coverage interview.
- **The FRAC kickback lookup.** `ERADICATED` ships as a state and a transition; deciding *which*
  chemistry carries eradicant action belongs with S2's resistance data and S7a. Until then the arm
  is reachable only by an attributed human override, which is the safe default.
