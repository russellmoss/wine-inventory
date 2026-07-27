# S5a — build status

**Branch:** `claude/powdery-index-latent-ledger-38428b`
**As of:** 2026-07-26
**Plan:** [S5a-powdery-index-latent-ledger-plan.md](S5a-powdery-index-latent-ledger-plan.md) (v2, council-reconciled)

---

## The headline: the Unit 0 gate fired, and the phase is now half the size it was

The plan made Units 3–4 explicitly contingent on a pre-committed measurement.
[The measurement ran](S5a-diurnal-fidelity-probe.md) and **every site failed**, so the powdery
index does not ship here. What remains — and what is now the whole phase — is the append-only
latent-infection ledger, which never depended on the index.

**Do not re-open the index question without new inputs.** The gate was fixed before the run,
evaluated per site, and it is not close: the best-instrumented site in the fleet misses the
agreement bar by 26 points. The path forward is S1 (real hourly weather), not a better estimator.

---

## Unit status

| Unit | What | Status |
|---|---|---|
| 0 | Diurnal fidelity probe + gate | ✅ **done** — gate answered NO-GO, 8 sites, 6 seasons, fixtures committed |
| 1 | Latent-infection enums migration | ✅ **done** — applies clean on a disposable Neon branch |
| 2 | `latent_infection_event` + RLS | ✅ **done** — full posture verified on-branch (see below) |
| 3 | `diurnal-core.ts` | ⛔ **cancelled by the Unit 0 gate** |
| 4 | `powdery-core.ts` (Gubler-Thomas) | ⛔ **cancelled by the Unit 0 gate** |
| 5 | Ledger core + resolution evaluator | 🔴 **blocked** — see the toolchain blocker below |
| 6 | Read seam + DTO | 🟡 reduced to ledger-only (the index half no longer exists) |
| 7 | `query_spray_decision`, thin + hard-refusing | ⬜ not started — unchanged by the gate, it simply refuses more |
| 8 | Goldens, fleet discrimination, payload test | ⬜ not started |
| 9 | `verify:powdery` | 🟡 **rename to `verify:latent-infection`** — there is no index to verify |
| 10 | Invariant, registers, runbook correction | 🟡 **partly done** — the runbook correction (KD-10) has landed; the PEST-2 invariant and the register entries have not |
| 11 | QA pass + phase report | ⬜ not started |

---

## What landed

1. **`spike(S5a)` — Unit 0.** `scripts/probe-diurnal-fidelity.ts` + `scripts/probe-diurnal/{solar,diurnal,gubler,iem}.ts`,
   the [probe report](S5a-diurnal-fidelity-probe.md), and eight committed paired
   daily+observed-hourly fixture seasons in `test/fixtures/s5a/`.
2. **`docs(S5a)` — the runbook correction (KD-10)** and the NOW.md spine entry.
3. **`feat(spray)` — Units 1–2**, the two migrations and the Prisma model.
4. **`fix(spray)` — the append-only REVOKE.** See "the defect the branch caught" below.

## What is verified, and how

`prisma validate` passes, and both migrations were **test-applied to a disposable Neon branch**
(`s5a-migration-check`, auto-expiring) — which matters, because `prisma validate` checks the Prisma
schema and says nothing about whether the SQL runs. Proven on-branch after apply:

- RLS **enabled and forced**; `tenant_isolation` carries **both** USING and WITH CHECK
- `app_rls` holds **INSERT, SELECT only** — no UPDATE, no DELETE
- both append-only triggers present; an in-place UPDATE is refused
- all seven CHECK constraints bite, individually probed: the C7 projection-honesty pair, the KD-4
  bounds ordering, and the UNKNOWN arm being unable to project a resolution
- a duplicate `commandId` is refused (C5 idempotency)
- a valid event lands with `infectiousExpectedAt` at the **short** bound (+5 d) and `expiresOn` at
  the **long** one (+14 d) — KD-4's asymmetry enforced by the database rather than by convention

**Not yet verified:** tenant isolation *through the pooled app_rls endpoint*
(`npm run verify:tenant-isolation`), which is the real RLS proof — the on-branch checks ran as the
owner, which carries `BYPASSRLS`. That is the first thing to run once the blocker below clears.

## The defect the branch catch found — worth reading before adding another append-only table

The first version of the migration granted `SELECT, INSERT` and considered the job done. It was not.
The `..._app_rls_role` migration set `ALTER DEFAULT PRIVILEGES` granting `app_rls` full DML on every
table subsequently created in `public`, so **a new table arrives with UPDATE and DELETE already
granted** and an additive `GRANT SELECT, INSERT` changes nothing. The table would have shipped
looking append-only — triggers in place, comments confident — while the app role quietly held the
privileges to defeat it.

This is precisely what council C5 meant by "the trigger is not enough". The fix is an explicit
`REVOKE UPDATE, DELETE, TRUNCATE ... FROM app_rls`, and the migration's self-verify `DO` block now
fails loudly if that posture ever drifts. **Any future append-only table in this repo needs the
REVOKE, not just the GRANT.**

---

## Blockers

**🔴 Unit 5 is blocked on the Prisma client, not on design.** `npx prisma generate` fails with
`EPERM` renaming `query_engine-windows.dll.node` in the **shared** `node_modules` — the worktree's
`node_modules` resolves to the main checkout's, and ~40 node processes from sibling agent sessions
were holding it. This is the "a sibling lane clobbers the shared client mid-session" hazard the plan
names in §8 (it bit S4 four times). It was **not** forced: killing another session's processes to
unblock a build is not a trade worth making.

*To clear:* re-run `npx prisma generate` when sibling sessions are idle, confirm with
`grep -c LatentInfectionEvent node_modules/.prisma/client/index.d.ts`, then write
`src/lib/spray/infection-ledger-core.ts`.

**🟡 PR 1 must land behind S2b.** S2b's schema slice is committed on
`claude/s2b-product-facts-schema-slice` but **not merged and has no open PR**. `prisma/schema.prisma`
is a single-lane asset (plan §8, Codex confirming). Expect a text conflict in `schema.prisma` at
rebase — S5a's block is purely additive at the end of the file, so it should resolve cleanly.

**⚠️ The migration has NOT been applied to production.** It ran only on the disposable branch.
Applying it is a deliberate, authorized step, and it must happen after the S2b rebase.

---

## Escalated out of the phase

**Bhutan's daily weather series may be 8–9 °C wrong.** No station oracle exists for either Bhutan
site, and NASA POWER vs ERA5 at the same coordinates differ by **9.26 °C (Bajo)** and **8.16 °C
(Gortshalu)**, against 0.31–1.44 °C at the six US sites. That gap is lapse-rate-consistent with a
grid-cell mean elevation sitting ~1.3 km off a Himalayan valley vineyard.

This is not a spray problem. It is a live-tenant data-quality question for **every**
temperature-derived number already shown to that grower — Winkler classification and the frost/heat
alert ladder most of all, since both have hard boundaries. A task chip has been raised for it. The
powdery index is explicitly disabled for that tenant regardless of how that investigation lands.

---

## Next session, in order

1. `npx prisma generate` (needs a quiet moment on the shared `node_modules`), then Unit 5.
2. `npm run verify:tenant-isolation` from the MAIN checkout — the real RLS proof.
3. Add the isolation cases (`iso_*` in the script, `isov_*` in the vitest suite), including the
   **DELETE-refused** and **retry-inserts-once** cases the plan calls out as new.
4. Unit 7's thin `query_spray_decision` + Unit 8's refusal goldens.
5. Rename Unit 9 to `verify:latent-infection` and write it.
6. Unit 10's PEST-2 invariant note — **but restate it**: "an index with missing inputs is UNKNOWN,
   never LOW" was written for an index that is no longer shipping. The surviving safety property is
   the ledger's: *a clean scouting pass never closes a modelled infection event* (KD-5).
