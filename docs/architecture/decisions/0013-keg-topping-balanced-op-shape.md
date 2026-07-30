# ADR 0013 — Keg topping is two balanced transfers, not a withdrawal plus N additions

- **Date:** 2026-07-29
- **Status:** proposed
- **Invariant:** [[LEDGER-6-balanced-operations]] · [[TOPPING-1-closeout-shares-sum-exactly]] · [[PROV-1-derived-ops-explain-themselves]]
- **RFC:** `docs/design/cellarhand-v2-handoff/rfc/RFC-002-topping-keg-measurement.md` §3.4
- **Supersedes:** RFC-002 §3.4 as originally written

> **Status is `proposed`, deliberately.** RFC-002 is itself `proposed` and awaits owner
> ratification. This ADR records a **structural reversal made during the amendment pass** so the
> reasoning is not lost between now and ratification. It becomes `accepted` when RFC-002 does.

## Context

RFC-002 proposed that closing out a keg writes:

1. **One** `LotOperation` taking `−volume` from the source tank, badged **measured**; and
2. **N** `LotOperation`s each adding `+per_barrel` to a barrel, badged **estimated**.

That shape reads naturally — it mirrors how a person describes the act ("30 litres left the tank;
it ended up spread across 21 barrels"). **It cannot be written by this ledger.**

**`LEDGER-6` — balanced operations** (severity `critical`, pure-code):
*"for every operation `sum(deltaL) == 0` across all lines (in-vessel + external)"*
([`LEDGER-6-balanced-operations.md:19`](docs/architecture/invariants/LEDGER-6-balanced-operations.md:19)).
It is enforced by `assertBalanced` ([`math.ts:53-58`](src/lib/ledger/math.ts:53)), called at the
single write chokepoint ([`write.ts:119`](src/lib/ledger/write.ts:119)) through which **every**
operation passes. Step 1 above sums to −30, not 0, and throws before reaching Postgres.

The only way to write a lone withdrawal is an `EXTERNAL` counter-leg (`vesselId: null`). **That is
worse, and it fails silently.** The TTB F 5120.17 fold branches on `bucket === "EXTERNAL"` and maps
a **closed allowlist** of reasons — `bottle`, `tax_removal`, `loss`/`dump`/`filtration`/
`evaporation` — with **no final `else`** ([`generate.ts:391-402`](src/lib/compliance/generate.ts:391)).
Even if a new reason reached the form mapper it would land on `return none()`
([`form-map.ts:156-158`](src/lib/compliance/form-map.ts:156)). Two independent paths to silence.

Consequence of taking that route: **~30 L per fill would leave the reported bulk position with
nothing accounting for it**, then reappear via N additions that also post nothing. §A would not
foot, every period containing a keg fill, with **no error and no anomaly flag** — against a
5120.17 engine that is shipped and load-bearing, and a 5000.24 excise return that shares the same
`compliance_report` table.

**Meanwhile, most of the correct shape was already built and the RFC did not know.**
`src/lib/cellar/topping.ts` is a complete, shipped, `LEDGER-12`-aware topping core that already
treats a keg as a `Vessel` in the source position
([`topping.ts:29`](src/lib/cellar/topping.ts:29)), draws proportionally
([`:77`](src/lib/cellar/topping.ts:77)), routes identity through `decideCombineRoute` so the keg
wine absorbs into the barrel's resident lot ([`:95`](src/lib/cellar/topping.ts:95)), writes the
`TOPPING` lineage edge ([`:143-147`](src/lib/cellar/topping.ts:143)), and accepts a `batchId`
([`:135`](src/lib/cellar/topping.ts:135)). **Only the tick, the fill record and the divisor are
missing.**

## Decision

**Model keg topping as two kinds of ordinary balanced transfer, and write nothing else.**

**① Fill the keg — ONE balanced transfer, tank → keg.** This *is* the measured withdrawal.

| Line | `vesselId` | `deltaL` | `bucket` |
|---|---|---|---|
| 1 | source tank | **−30.00** | `VESSEL` |
| 2 | keg (`VesselType.KEG`) | **+30.00** | `VESSEL` |
| | | **Σ = 0.00** ✅ | |

**② Close out — N balanced transfers, keg → barrel, sharing one `batchId`.**

| Line | `vesselId` | `deltaL` | `bucket` |
|---|---|---|---|
| 1 | keg | **−1.43** | `VESSEL` |
| 2 | barrel *i* (lot per `decideCombineRoute`) | **+1.43** | `VESSEL` |
| | | **Σ = 0.00** ✅ | |

`captureMethod = DERIVED` for the whole close-out operation — correct, because the operation is
*wholly* derived: the divisor set its magnitude. Derivation detail in `LotOperation.metadata`
([`schema.prisma:2661`](prisma/schema.prisma:2661)).

**③ Residual is the keg's own balance.** "Wasn't quite empty" needs no `remaining` field.

Shares are allocated by the existing integer-centilitre largest-remainder helper
`computeProportionalDraw` ([`draw.ts:33`](src/lib/bottling/draw.ts:33)), **not** by even division —
`deltaL` is `Decimal(10,2)` ([`schema.prisma:2694`](prisma/schema.prisma:2694)) and 21 × 1.43 =
30.03 ≠ 30, leaving 0.03 L of dust above `FUNCTIONAL_ZERO_L` that `LEDGER-8` forbids.

## Consequences

**Good:**

- **Satisfies `LEDGER-6` with zero `EXTERNAL` legs.** Nothing to balance around.
- **Compliant by construction, not by remembering.** Internal `VESSEL` topping legs net to zero
  within the section and are correctly skipped ([`generate.ts:441`](src/lib/compliance/generate.ts:441)).
  No reason mapping to add, so no reason mapping to forget.
- **Gives `PROV-1` a clean op-grain classification.** Every operation in the flow is
  provenance-homogeneous, so the per-record `captureMethod` scalar classifies all of them exactly —
  **no per-line provenance column is needed** (RFC-003 §3.7).
- **Satisfies RFC-002 AC-6 exactly**, because Σ per-barrel = fill − remaining by construction.
- **~80% already implemented.** This is mostly wiring, not new ledger primitives.

**Costs, stated plainly:**

- **RFC-002 AC-4 as literally worded is dead.** There is no "one measured withdrawal and N
  estimated additions sharing one `batchId`" — the measured withdrawal is a **separate, earlier**
  operation with its own `batchId`. AC-4 was rewritten.
- **Requires `VesselType.KEG`.** The enum is `BARREL | TANK` today
  ([`schema.prisma:155-158`](prisma/schema.prisma:155)). This forces a **second enum-only
  migration** that no handoff document named, and it must be merged **and deployed** before any
  code writes it.
- **The tank is debited at fill time, not at close-out.** A period-boundary fill puts the
  withdrawal in one period and the per-barrel derivation in the next. This is *more* honest than
  the alternative — the wine really did leave the tank when it was filled — but it is a real
  behavioural difference from what RFC-002 described, and reports must not assume the two coincide.
- **The keg becomes a real, persistent ledger position** that can be non-empty between rounds.
  That is the point (③), but it means keg balances need somewhere to be visible, or wine will
  quietly accumulate in a vessel nobody looks at.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Original shape + an `EXTERNAL` counter-leg with a new `keg_withdrawal` reason | Writable, but **silently breaks the 5120.17 fold** unless a reason mapping is added to `generate.ts:391` *and* maintained forever. Trades a structural guarantee for a remembered one, in the highest-consequence subsystem. |
| Original shape + map `keg_withdrawal` to an existing allowlisted reason (e.g. `loss`) | Actively false: the wine is not lost, it is in a keg. Would misreport bulk losses to TTB. |
| One giant balanced op: tank `−30` plus 21 barrel `+` legs in a single operation | Balances, and is tempting. But it is **provenance-mixed** — one measured leg and 21 derived ones under a single op-grain `captureMethod` — so it cannot be classified at all, and it would force the per-line column RFC-003 §3.7 costs out. It also fights the per-member group fan-out and the 20 s `SERIALIZABLE` ceiling ([`write.ts:62-63`](src/lib/ledger/write.ts:62)). |
| Model the keg as a non-vessel entity with its own volume field | Contradicts the coalescence register, which puts `VesselType.KEG` as **align-retro** — both incumbents model kegs as vessels ([`data_model_coalescence.md:175`](docs/architecture/data_model_coalescence.md:175)) — and throws away tenancy, RLS, tagging and cleaning history that `Vessel` gives free. |

## Confidence

**High** that the original shape cannot be written: `assertBalanced` is called at the chokepoint,
which is unambiguous and was read directly.

**High** that the `EXTERNAL` route breaks 5120.17 silently: verified two independent ways — the
`if`/`else if` chain in `generate.ts:391-402` has no final `else`, and `form-map.ts:156-158`
defaults to `none()`. The gate brief flagged this as the one claim most deserving adversarial
review *because* the failure is silent; it survived that review.

**Medium-high** on the period-boundary consequence being acceptable. It is more honest, but I have
not traced every 5120.17 §A line to confirm a fill and its close-out landing in different periods
produces a footing report in **both**. **That is the one thing to verify with a test before this
ships**, and it belongs in `verify:excise`.
