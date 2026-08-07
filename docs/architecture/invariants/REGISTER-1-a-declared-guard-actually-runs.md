---
id: REGISTER-1
group: governance
severity: high
enforcedBy: app-code
verify: "npm run verify:invariant-coverage"
decision: "Guard-coverage sweep 2026-08-07, after LEDGER-9 and COST-1"
status: guarded
appliesTo:
  - docs/architecture/invariants/
  - .github/workflows/ci.yml
tags:
  - invariant
---

# REGISTER-1 — a declared guard actually runs, or says why it doesn't

> [!warning] Invariant (high, app-code)
> Every `status: guarded` invariant's declared `verify:` must be REACHED by a CI job on a pull request, or appear on `manual-proof-baseline.json` with a written reason. The register may not claim enforcement it does not have.

**Guarded by:** `npm run verify:invariant-coverage`
**Decision:** Guard-coverage sweep 2026-08-07 — see [[INVARIANTS]].
**Applies to:** `docs/architecture/invariants/`, `.github/workflows/ci.yml`

## Why this exists

`npm run verify:invariants` asserts that each invariant's `verify:` script **exists**. The register's own
README calls that *"detection only"*, and it is — a script can exist, pass, and never be executed by CI,
or be executed and test something else. Two real cases, found a day apart:

| | what the register said | what was true |
| --- | --- | --- |
| **LEDGER-9** | `verify: npm run verify:reverse` | A 264-line **reversal-semantics** proof with no reference to rounding, decimals or balance. Its only fractional literals in the whole file are `0.5` and `13.5`. It could not have failed for the invariant it was named against. |
| **COST-1** (critical) | `verify: npm run verify:cost` | Needs `--env-file=.env`, so **no CI job ran it**. Its one pure check, `transferImbalance`, was a **tautology** returning 0 for any input — including transfers taking 120% of a parent. |

Both were invisible for the same reason: **a guard that cannot fail is indistinguishable from a passing
one.** A *missing* guard is visible. This class is not.

## The four ways a guard fails to guard

| mode | example | why it hides |
| --- | --- | --- |
| **Tautological** — true by construction | `transferImbalance` added `moved` to both sides | The test passes, and it is *named* for the invariant |
| **Wrong subject** — tests something else | LEDGER-9 → `verify:reverse` | The script exists and passes |
| **Unreachable** — cannot run where it matters | COST-1's DB-only guard | Nothing reports "this never ran" |
| **Blind spot** — real guard, wrong predicate | GLOBAL-1's read-name heuristic once skipped `getOrCreateX` | Green the whole time |

**This guard catches only the third.** The other three need a human asking *"can this assertion ever be
false?"* — in practice an **ablation**: break the code on purpose and confirm the guard screams. Every
invariant added since this was written has been ablated (MONEY-1 three ways, LEDGER-9 three ways, COST-1
three ways, and this note's own guard three ways). Make that the expectation for the next one.

## What "reached" means

A guard counts as reached when **(1)** `npm run <script>` appears in a `ci.yml` job, **(2)** it resolves to
a `vitest` invocation — the `check` job ends with a bare `npx vitest run` that executes the whole suite —
or **(3)** its script path is invoked by a CI job some other way.

⚠️ Rule 2 has one carve-out, and it matters: `test/tenant-isolation.test.ts` and
`test/developer-feedback-db.test.ts` **self-skip** unless their env var is set. The plain run *executes*
them and proves nothing. Crediting those would be exactly the over-claim this guard exists to stop, so an
env-gated suite counts only when a CI job names the file — which the `tenant-isolation` job does.

## The baseline is architecture, not backlog

**48 of 60** guarded invariants sit on `manual-proof-baseline.json`, and that is mostly *correct*: they are
DB proofs, and CI's required `check` job is deliberately pure. They run against the Demo Winery tenant;
two (`verify:fk-registry-db`, `verify:vineyard-scope-db`) run in the `db-proofs` job; `verify:work-orders`
and `verify:chemistry` also run in the label-gated `feedback-domain-verify` job.

Each entry carries a **written reason**, per proof rather than per invariant, so the text says what the
proof does and where it runs. A generated one-liner would recreate the "detection only" problem in
a new field.

> [!tip] The ratchet's first catch, before this even merged
> The baseline was generated against `main`, where COST-1 and LEDGER-9 still pointed at DB-only guards.
> Combining this change with the two that repointed them at pure, CI-runnable guards
> (`verify:cost-conservation`, `verify:ledger-grain`) made both entries **stale**, and the guard failed
> until they were removed — 50 → 48. Neither branch could have seen that alone. That is the shrink-only
> direction doing its job: the register cannot quietly keep claiming a manual proof it no longer needs.

One entry is a genuine finding rather than an architecture note — **TENANT-1**. Its declared
`verify:tenant-isolation` is a manual DB script that no CI job runs, yet the invariant *is* proven on every
PR by the `tenant-isolation` job, as `app_rls` through PgBouncer. The register names the wrong artifact.
The baseline reason records that rather than papering over it.

## Where a guard is most likely to be a poor fit

The check prints, without failing, any guard standing in for four or more invariants — the shape LEDGER-9
hid in:

```
verify:reverse        9: LEDGER-1, -2, -3, -4, -5, -6, -8, -9, -10
verify:spray-record   5: SPRAY-1, -2, -3, -4, -5
verify:work-orders    4: WORKORDER-1, -2, -5, -6
```

One script asserting nine invariants is not wrong on its face, but LEDGER-9 was one of those nine and the
script tested none of it. Treat the list as an ablation queue.

## Related

[[LEDGER-9-decimal-safe-math]] and [[COST-1-cost-conservation]] are the two cases that produced this note.
