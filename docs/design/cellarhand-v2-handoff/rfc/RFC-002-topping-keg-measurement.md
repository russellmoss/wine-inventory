# RFC-002 · Topping measurement by keg

**Status:** proposed · **Owner decisions:** OD-4 ✅ RESOLVED 2026-07-29 (nominal allowed, badged *nominal*) · OD-5 ✅ ready to ratify · **Depends on:** RFC-001 (member order), RFC-003 (provenance) · **Blocks:** the topping runner

> [!note] Changelog
> **2026-07-29 — RFC amendment pass, against `main` @ `91cd1dcd`.** Amended to be implementable
> against the code that exists. This RFC remains **`proposed`**; the amendment does not approve it.
> - **§3.4 rewritten toward the existing code — the structural reversal in this pass.** The
>   prescribed shape ("one measured withdrawal + N estimated additions") **cannot be written**:
>   `assertBalanced` ([`math.ts:53-58`](src/lib/ledger/math.ts:53)) rejects any operation whose
>   lines do not sum to 0 L (`LEDGER-6`, `critical`). §3.4 now states a balanced op shape line by
>   line, with the sign of every leg, built on `src/lib/cellar/topping.ts` — which already treats a
>   keg as `fromVesselId`, already routes through `decideCombineRoute` for `LEDGER-12`, and already
>   writes the lineage edge. See **ADR 0013**.
> - **§2's "there is no keg entity" corrected.** Two of its three claims were false.
> - **§3.4 gains a COMPLIANCE DEFECT section.** The counter-leg the original shape requires would
>   leave ~30 L of bulk position per fill **silently unreported** on TTB F 5120.17. Verified.
> - **§3.2's keg question answered: `VesselType.KEG`.** The enum is `BARREL | TANK` today
>   ([`schema.prisma:155-158`](prisma/schema.prisma:155)) — **a second enum-only migration nobody
>   had written down**, and per the gate brief the most likely way Phase 8 stalls mid-phase.
> - **§3.3's "write the unrounded value" replaced** with the existing exact largest-remainder
>   helper; `deltaL` is `Decimal(10,2)` and the original produces LEDGER-8 dust.
> - **§3.6 re-specified as a PARTIAL re-fan** (`LEDGER-3` + `LEDGER-11`), with the exact user copy.
> - **§3.4's atomicity claim and AC-3/AC-4 amended** to match the per-member group model.

---

## 1. User problem

Nobody measures how much wine goes into an individual barrel. Asking for a per-barrel volume produces either invented numbers or an abandoned round — which is why topping is the least reliably recorded routine act in the cellar, and why barrel volumes drift from reality over a season.

What crews *do* know precisely is **how much wine left the keg**, and which barrels that keg served. From those two facts a per-barrel figure can be derived honestly.

## 2. Current behaviour

- `OperationType.TOPPING` exists.
- `LotLineage.kind` already includes `TOPPING`.
- `LotOperation.batchId` already groups the per-vessel operations of one fan-out.
- `LotOperation.commandId` is unique — idempotency is solved.
- ~~There is **no keg entity**, no concept of a fill, no link from a fill to the barrels it served, and no way to mark a quantity as derived.~~ **See the correction below.**
- A topping task today asks for a volume per vessel, or is recorded as a group maintenance activity with no volume at all.

> [!warning] Corrected 2026-07-29 — the topping domain is already half-built.
> The struck bullet made three claims. **Two were false**, and the RFC's proposed design diverges
> from working code because of them. Verified against `91cd1dcd`:
>
> | Claim | Verdict | Evidence |
> |---|---|---|
> | "There is no keg entity" | ❌ **False** | A keg is already modelled as a `Vessel` in the source position of a topping transfer: `fromVesselId: string; // the source keg vessel (holds the keg lot)` ([`topping.ts:29`](src/lib/cellar/topping.ts:29)). `src/lib/cellar/topping.ts` is a complete, shipped, `LEDGER-12`-aware topping core. |
> | "…no link from a fill to the barrels it served" | ⚠️ **Half true** | There is no *fill record*, but the fan-out link exists: `topping.ts` accepts a `batchId` ([`topping.ts:135`](src/lib/cellar/topping.ts:135)) and `group-apply.ts` already fans a cellar op across a group's members ([`group-apply.ts:233`](src/lib/cellar/group-apply.ts:233)). |
> | "…no way to mark a quantity as derived" | ✅ **True** | `CaptureMethod` is `MANUAL \| VOICE \| SENSOR \| IMPORT` ([`schema.prisma:2148-2153`](prisma/schema.prisma:2148)). This is RFC-003's job. |
>
> **What is genuinely missing is narrower than this RFC assumes: the tick, the fill record, and the
> divisor.** Everything volumetric already works — proportional draw from the keg
> ([`topping.ts:77`](src/lib/cellar/topping.ts:77)), identity routing so the keg wine absorbs into
> the barrel's resident lot ([`topping.ts:95`](src/lib/cellar/topping.ts:95)), and the `TOPPING`
> lineage edge ([`topping.ts:143-147`](src/lib/cellar/topping.ts:143)).
>
> This is why §3.4 is rewritten **toward** the existing core rather than the reverse.

## 3. Proposed behaviour

### 3.1 The model in one paragraph

A **keg** is a small, portable, reusable vessel (`VesselType.KEG`) used to carry topping wine. A **keg fill** moves wine from a source tank into the keg — one ordinary balanced transfer, recorded at the keg's stamped size unless somebody measured it. During a round, each barrel the crew tops is **ticked** — no volume, no numeric entry. When the keg runs out, the crew closes it out: the volume actually drawn is divided across the barrels that fill served, and Cellarhand writes **one balanced keg → barrel transfer per barrel**, all sharing one `batchId`, each wholly derived and each carrying the divisor. Whatever is left sits in the keg, because the keg is a real container.

> [!note] Rewritten 2026-07-29 — this paragraph described a shape that could not be written.
> It previously said close-out writes *"one measured withdrawal from the source tank and N estimated
> topping additions"*. The tank is debited **at fill time**, not at close-out, and there is no lone
> withdrawal — every operation is a balanced two-legged transfer (§3.4, ADR 0013). It also said the
> fill *"draws a measured volume"*; per OD-4 the normal case is **nominal**, not measured (§3.2).
> And "divided evenly" is now "divided" — the split is exact-to-the-centilitre by largest remainder,
> so shares differ by up to 0.01 L (§3.3).

### 3.2 Entities

**Keg** — a reusable, tenant-scoped, tagged vessel.

| Property | Notes |
|---|---|
| code | e.g. `K-3`, unique per tenant |
| nominal volume | e.g. 30 L |
| state | `EMPTY_CLEAN`, `IN_USE`, `NEEDS_CLEANING`, `RETIRED` |
| tag id | for QR/NFC (RFC-004) |
| current fill | nullable link to the open fill |

**Open question OD-4:** is a keg's volume nominal (stamped) or measured per fill? ~~Recommend **nominal by default, overridable per fill**, with the override badged as measured and the default badged as nominal.~~

> [!success] ✅ OD-4 RESOLVED 2026-07-29 by the owner — **nominal is allowed, and it is badged as nominal.**
> Asked whether the crew can actually measure a keg fill, the owner answered: *"if we fill it up it
> holds what it holds and it's what is stamped on it — that's what we know."*
>
> **The decision:** a keg fill defaults to the keg's stamped size, is stored as the new
> `CaptureMethod.NOMINAL`, and is badged **nominal · 30 L stamped** — **never "measured"**. A crew
> that does weigh a fill overrides the number and it stores as `MANUAL`, badged **measured**. The
> per-barrel shares stay `DERIVED`, badged **≈ estimated**. Provenance is now a **trinary**;
> full reasoning in **RFC-003 §3.6** and §3.1.
>
> **This ratifies OD-4 as AMENDED, not as originally written.** The original recommendation badged
> the nominal default as *measured*, which is the dishonesty RFC-003 exists to prevent — and worse
> than a display bug, because every per-barrel figure downstream inherits its credibility from the
> fill number. **`NOMINAL` now ships in the M1 enum migration alongside `DERIVED`** (both are
> one-way doors — Postgres cannot drop an enum value). No enum value is added by this docs pass.
>
> Note what OD-4 is *not*: it is not a schema question about keg volume. A keg's nominal volume is
> `Vessel.capacityL` ([`schema.prisma:1382`](prisma/schema.prisma:1382)), which already exists, and
> the ledger **requires** a positive number either way —
> `if (!(volumeL > 0)) throw new ActionError("Enter a topping volume greater than 0.")`
> ([`topping.ts:51`](src/lib/cellar/topping.ts:51)). There is no representation for "an unstated
> amount". OD-4 is therefore only: *what do we prefill, and what do we call the result.*

**Implementation note — RESOLVED 2026-07-29: a keg IS a `Vessel` with `type = KEG`.** This RFC
previously deferred the question ("Claude Code should decide against the real schema; the RFC does
not mandate either"). It was **already decided** by the coalescence register, which the RFC did not
consult: *"Vessel types **KEG, BIN** + capacity display-unit — align-retro — S — additive enum"*
([`data_model_coalescence.md:175`](docs/architecture/data_model_coalescence.md:175)). Both incumbents
model kegs as vessels; that convergence is load-bearing. The codebase already assumes it
([`topping.ts:29`](src/lib/cellar/topping.ts:29)). The stated risk — a keg appearing in vessel
pickers and capacity logic — is real and is handled by filtering pickers on `type`, which the app
must do anyway once `BIN` lands for weigh-tag tare.

> [!danger] ⚠️ This requires a SECOND enum-only migration that no handoff document mentions.
> `enum VesselType` is **`BARREL | TANK`** — that is the whole enum
> ([`schema.prisma:155-158`](prisma/schema.prisma:155)), verified on `91cd1dcd`. There is no `KEG`.
>
> Postgres **will not let code write a new enum value in the migration that adds it**
> (`ERROR: unsafe use of new value`), so `ALTER TYPE "VesselType" ADD VALUE 'KEG'` must be its own
> commit, **merged and deployed** before anything references it. This schema documents the same
> gotcha seven times over for `OperationType` alone, e.g.
> *"Added in a DEDICATED enum-only migration (Postgres `ALTER TYPE ADD VALUE` can't be used in the
> tx that adds it) so the value commits before removal-core.ts writes it"*
> ([`schema.prisma:2115-2117`](prisma/schema.prisma:2115)).
>
> **If this is forgotten until the RFC-002 structural migration, the whole phase blocks mid-flight
> and needs a new commit plus a redeploy before it can continue.** It goes in migration **M1**
> alongside RFC-003's `CaptureMethod` addition — see the cross-cutting notes, §B1. Take
> `VesselType.BIN` on the same free ride: the register names it in the same align-retro slice.

**Keg fill** — one filling of a keg from a source.

| Property | Notes |
|---|---|
| keg | the keg |
| source vessel + lot | the tank the wine came from |
| volume | the measured (or nominal) volume drawn |
| filled at, filled by | provenance |
| status | `OPEN` → `CLOSED` |
| closed at, remaining volume | remaining is 0 unless "wasn't quite empty" |
| resulting batch id | the `LotOperation.batchId` produced at close-out |

**Topping tick** — a pre-ledger intent record.

| Property | Notes |
|---|---|
| keg fill | which fill served this barrel |
| vessel | the barrel |
| work order task | the round it belongs to |
| ticked at, ticked by | provenance |
| note | optional free text — how the wine smells, the state of the head, a weeping stave |
| commandId | idempotency for the tick itself |

A tick is **not** a ledger event and must not be described as recorded to the ledger. Its UI language is "topped"; the receipt language for the *ledger* only appears at close-out. This distinction matters: until the keg closes out, no volume has been asserted.

### 3.3 Close-out arithmetic

```
per_barrel = (fill.volume − fill.remaining) / count(ticks on this fill)
```

Even division. **Notes do not weight the split** — a note is an observation, not a measurement, and weighting by one would dress a guess up as data. This is a deliberate reversal of an earlier design that gave flagged barrels a double share.

~~Rounding: compute at full precision, present to 2 decimals, and write the *unrounded* value with the divisor so a later recomputation is exact.~~

> [!warning] Corrected 2026-07-29 — writing the unrounded value is impossible, and unnecessary.
> **Impossible:** `LotOperationLine.deltaL` is `Decimal @db.Decimal(10, 2)`
> ([`schema.prisma:2694`](prisma/schema.prisma:2694)). There is no column that can hold
> `1.428571…`. Storing the rounded value instead breaks the arithmetic: 30 L ÷ 21 = 1.43 at 2dp,
> and 21 × 1.43 = **30.03 ≠ 30**. The 0.03 L residue is *above* `FUNCTIONAL_ZERO_L` (0.01 L), so
> `LEDGER-8`'s sweep will not absorb it — it lingers as dust, which is exactly what LEDGER-8
> forbids: *"No fabricated volume — a residual at/below FUNCTIONAL_ZERO_L (0.01 L) is swept to
> zero; balances never accumulate dust."*
>
> **Unnecessary:** the repo already solves this exactly. `computeProportionalDraw`
> ([`draw.ts:33`](src/lib/bottling/draw.ts:33)) allocates in **integer centilitres using
> largest-remainder distribution** ([`draw.ts:46-51`](src/lib/bottling/draw.ts:46)) and asserts the
> allocation sums exactly. Call it with equal weights.
>
> **Amended requirement:** the per-barrel shares are **exact to the centilitre via the existing
> largest-remainder helper**, so Σ per-barrel = `fill.volume − fill.remaining` with zero residue.
> Consequence: shares are *not all equal* — with 30 L over 21 barrels, some barrels get 1.43 L and
> some 1.42 L. That is the honest result and the UI must not claim otherwise (see §5 copy).
> The divisor goes in `metadata` **for explanation, not for recomputation**.

### 3.4 What close-out writes

> [!danger] ⛔ REWRITTEN 2026-07-29. The original shape could not be written at all.
> This section previously prescribed **one** `LotOperation` taking `−volume` from the source tank,
> plus **N** `LotOperation`s each adding `+per_barrel`. That first operation **is rejected by the
> database layer before it reaches Postgres.**
>
> **`LEDGER-6` — balanced operations (severity `critical`, pure-code):**
> *"for every operation `sum(deltaL) == 0` across all lines (in-vessel + external)"*
> ([`LEDGER-6-balanced-operations.md:19`](docs/architecture/invariants/LEDGER-6-balanced-operations.md:19)).
> Enforced by `assertBalanced` ([`math.ts:53-58`](src/lib/ledger/math.ts:53)), called at the single
> write chokepoint ([`write.ts:119`](src/lib/ledger/write.ts:119)) — so **every** op passes through
> it. A lone `−30 L` withdrawal sums to −30, not 0, and throws:
> *"Ledger operation is not balanced: lines sum to −30 L, expected 0."*
>
> The only way to write a lone withdrawal is to add a `+30 L` **EXTERNAL** counter-leg
> (`vesselId: null`). **That counter-leg silently breaks TTB reporting — see the compliance defect
> below.** So the original shape is not merely awkward; it is unwritable one way and
> non-compliant the other. The replacement below is the reversal recorded in **ADR 0013**.

**The balanced shape. Every leg, with its sign.** Nothing here needs a new ledger primitive —
`topping.ts` already writes shape ② today.

**① Fill the keg — ONE balanced transfer, tank → keg.** This *is* the measured withdrawal.
Happens when the keg is filled, **before** the round starts, so AC-1's "zero numeric entry until
close-out" is untouched.

| Line | `vesselId` | `lotId` | `deltaL` | `bucket` |
|---|---|---|---|---|
| 1 | source tank | tank's resident lot | **−30.00** | `VESSEL` |
| 2 | **keg** (`type = KEG`) | same lot | **+30.00** | `VESSEL` |
| | | **Σ = 0.00** ✅ | | |

`type = TOPPING`, one `captureMethod` for the whole op (`MANUAL` if measured — see OD-4).
**No external leg. No compliance exposure.**

**② Close out — N balanced transfers, keg → barrel, one per ticked barrel, sharing one `batchId`.**
Each is a separate `LotOperation`; each is independently balanced.

| Line | `vesselId` | `lotId` | `deltaL` | `bucket` |
|---|---|---|---|---|
| 1 | **keg** | keg lot | **−1.43** | `VESSEL` |
| 2 | barrel *i* | barrel's resident lot (after `decideCombineRoute`) | **+1.43** | `VESSEL` |
| | | **Σ = 0.00** ✅ | | |

`type = TOPPING`, `captureMethod = DERIVED` for the **whole op** — which is exactly right, because
the op is wholly derived: the divisor set its magnitude. Per-barrel share from the largest-remainder
helper (§3.3), so shares differ by ≤0.01 L and sum exactly. Derivation detail
(`{ kegFillId, divisor, fillVolumeL, method: "even-split" }`) in `LotOperation.metadata`, a `Json?`
column ([`schema.prisma:2661`](prisma/schema.prisma:2661)).

The `+` leg's `lotId` is **not** necessarily the keg's lot: `decideCombineRoute`
([`topping.ts:95`](src/lib/cellar/topping.ts:95)) resolves `LEDGER-12` (one lot per vessel) by
having the topping wine **absorb** into the barrel's resident lot. `topping.ts:100-105` already
performs exactly this remap.

**③ Residual — the keg is simply not empty.** "Wasn't quite empty" needs **no `remaining` field on
the fill**: it is the keg vessel's own balance. Σ per-barrel = `fill.volume − keg balance` by
construction, which is what makes AC-6 true to the cent.

**④ Lineage.** Where the topping wine is a different lot from the barrel's wine, a `LotLineage`
edge of kind `TOPPING`. Already written, already upserted with a fraction
([`topping.ts:143-147`](src/lib/cellar/topping.ts:143)).

**Net:** total lot volume across the winery is unchanged; wine moved between vessels. Zero
`EXTERNAL` legs anywhere in the flow.

#### 3.4.1 🚨 COMPLIANCE DEFECT in the original shape — verified, and it fails silently

**This is a compliance defect, not a design preference.** It is the highest-consequence finding
against this RFC, and it is why §3.4 could not simply be patched.

The original shape's `−30 L` withdrawal can only balance via an `EXTERNAL` counter-leg. The TTB
F 5120.17 fold branches on `bucket === "EXTERNAL"` and maps a **closed allowlist of reasons**:

```ts
// src/lib/compliance/generate.ts:391-402
if (l.bucket === "EXTERNAL") {
  const r = l.reason ?? "";
  if (r === "bottle") { … }
  else if (r === "tax_removal") { … }
  else if (r === "loss" || r === "dump" || r === "filtration" || r === "evaporation") { … }
  // "seed" / "crush_origination" / "dosage" external legs are not §A/§B summary flows.
}
```

**There is no final `else`.** An unrecognised reason — say `keg_withdrawal` — matches nothing and
**pushes no contribution**. Even if it reached the form mapper it would land on
`return none()` ([`form-map.ts:156-158`](src/lib/compliance/form-map.ts:156)), the
*"internal, in-bond, net-neutral … no summary line"* default. Two independent paths to silence.

**What is misreported without a reason mapping.** Per fill, ~30 L leaves the reported bulk position
with **nothing accounting for it**, then reappears via N addition ops that also post nothing:

- **§A does not foot.** Opening + additions − removals ≠ closing, by the fill volume, every period
  that contains a keg fill. Across a topping season on 22 barrels that is tens of litres; on the
  420-barrel round this RFC describes, hundreds.
- **The failure is silent.** No error, no anomaly flag, no rejected write — a generated 5120.17
  that is simply wrong. `verify:excise` and the 5120.17 engine are shipped and load-bearing.
- **The 5000.24 excise return inherits it**, since both forms are backed by one
  `compliance_report` table discriminated by `formType`.

**Required if any variant of the original shape is ever revived:** an explicit reason mapping added
to the `EXTERNAL` branch at [`generate.ts:391`](src/lib/compliance/generate.ts:391) **before** the
first fill is written, plus a case in `verify:excise`.

**Why the amended shape needs none of this.** Shapes ① and ② have **zero `EXTERNAL` legs**. Every
line is `bucket = VESSEL`, and internal `VESSEL` topping legs net to zero within the section and are
correctly skipped — *"Other VESSEL legs (rack/topping/press/crush internal) net to zero within the
section → skip"* ([`generate.ts:441`](src/lib/compliance/generate.ts:441)). The op type also stays
`TOPPING` on purpose so the fold treats it as cellar practice, not a declarable blend
([`topping.ts:121-123`](src/lib/cellar/topping.ts:121)). **The amended shape is compliant by
construction, not by remembering to map a reason.**

#### 3.4.2 Atomicity — scoped to the close-out record, not to N ledger writes

~~The whole close-out is atomic. A partial write is not acceptable: it would leave a tank short with no matching additions.~~

> [!warning] Amended 2026-07-29 — the original atomicity requirement fights the group model and the clock.
> - **It contradicts RFC-001 §4.7**, which this RFC's AC-3 would break. `applyToGroup` is
>   deliberately **one transaction per member**, catching per-vessel failures and always completing
>   ([`group-apply.ts:233-270`](src/lib/cellar/group-apply.ts:233)) — that is precisely what makes
>   "57 of 60 recorded, 3 named" true today. AC-3 demands the opposite of the mechanism AC-7 relies on.
> - **It probably exceeds the transaction ceiling.** `runLedgerWrite` is `SERIALIZABLE` with a 20 s
>   timeout ([`write.ts:62-63`](src/lib/ledger/write.ts:62)). Each barrel needs a
>   `decideCombineRoute` preflight, a fold, a capacity read and a co-residence assert. At 22
>   barrels that is tight; at 420 it will not finish.
> - **Some barrels can legitimately refuse.** A barrel whose resident wine rejects an absorb — bond,
>   form, ferment state, tax class ([`combine.ts`](src/lib/ledger/combine.ts)) — must be reportable
>   per-barrel, not fatal to the round.
>
> **Amended requirement.** The **keg fill's close-out record** flips `OPEN → CLOSED` atomically and
> exactly once. The N per-barrel ledger writes are **per-member transactions** sharing one
> `batchId`, following the existing group fan-out: any that fail are named individually and the
> rest are recorded. A close-out where some barrels failed is a **first-class state**, not an error
> — the same state §3.6 needs for a partial re-fan. The invariant that must hold is not "all or
> nothing" but **`TOPPING-1`**: Σ recorded per-barrel = the volume actually drawn from the keg, to
> the centilitre. The keg's own balance makes that self-correcting — a barrel that failed simply
> leaves its share in the keg.

### 3.5 Barrel capacity must not block

A 225 L barrel that has evaporated for six weeks has room. Any capacity validation on `TOPPING` into a `BARREL` is downgraded to a **soft warning at >15% of nominal**, overridable with a reason. See `08-data-dependency-matrix.md` DM-22.

> [!warning] This is NOT a class-C change, and it is the one genuinely irreversible item in the set.
> `08-data-dependency-matrix.md:57` classes the capacity downgrade as **class C** (behavioural, no
> DB). But vessel capacity is registered invariant **`LEDGER-4`** (severity `high`, app-code,
> guarded by `npm run verify:reverse`):
> *"an operation may not drive a vessel's total holdings above `capacityL` (checked under the write
> lock…)"* ([`LEDGER-4-vessel-capacity.md:18`](docs/architecture/invariants/LEDGER-4-vessel-capacity.md:18)).
>
> It is enforced in **three** places, and the third is the one that matters:
> 1. [`topping.ts:69-74`](src/lib/cellar/topping.ts:69) — a hard `ActionError` in the topping core.
> 2. [`group-apply.ts:181`](src/lib/cellar/group-apply.ts:181) — the group preview block.
> 3. **[`write.ts:212-215`](src/lib/ledger/write.ts:212) — the write chokepoint, which guards
>    *every* operation in the system.**
>
> Downgrading it for `TOPPING`-into-`BARREL` means **teaching the chokepoint an op-type exemption**
> and amending the `LEDGER-4` note. That is not a behavioural tweak; it is an edit to the narrowest,
> most load-bearing guard in the ledger. Re-class it and plan it as such.
>
> **Irreversibility:** the code change reverts, but **any barrel overfilled while the exemption was
> live stays overfilled.** Every other item in these four RFCs rolls back to zero data effect
> (`DROP INDEX`, `DROP TABLE`, drop columns). This one does not. Treat the exemption as the
> highest-care change in Phase 8 and scope it as narrowly as the code allows —
> `type === "TOPPING"` **and** destination `VesselType.BARREL`, never a global relaxation.

### 3.6 Correction

**OD-5:** correcting a closed-out keg. Two cases:

| Change | Effect |
|---|---|
| Fill volume corrected (30 L → 28 L) | Re-fan: every estimate on that fill recomputes. One `CORRECTION` op per affected line, sharing a new `batchId`, all referencing the original `batchId`. |
| Barrel count corrected (a barrel ticked in error) | Same — the divisor changed, so every estimate changes. |
| A single barrel's note corrected | No arithmetic change. |

**Recommendation: re-fan.** Not re-fanning would leave the arithmetic visibly wrong on screen, which destroys the credibility of the whole model. ~~The UI must state the consequence before confirming: *"The 20 other barrels on this keg will re-estimate to 1.50 L each."*~~

Blocked corrections follow the existing LEDGER-11 rule and its plain-language unwind message.

#### 3.6.1 The re-fan is inherently PARTIAL — amended 2026-07-29

> [!warning] OD-5's principle survives. Its promised UX does not.
> **Re-fan is right and needs no owner decision.** What needs specifying is that the ledger can
> *refuse* part of it, and the original confirmation copy promises something the database can
> reject between the dialog and the commit. Two verified constraints, neither accounted for:
>
> **1. `LEDGER-3` — one correction per op, ever.** `correctsOperationId Int? @unique`
> ([`schema.prisma:2655`](prisma/schema.prisma:2655)). The core states the consequence itself:
> *"correctsOperationId is unique, so any op can be corrected at most once (double-correct is
> rejected by the DB)"* ([`correct.ts:16-17`](src/lib/cellar/correct.ts:16)).
> **Each barrel's line can be corrected exactly once, for all time.** Correct 30→28, then discover
> it was really 27, and the second re-fan is refused by the database on every already-corrected
> barrel.
>
> **2. `LEDGER-11` — the conservative correction guard** (severity `critical`):
> *"a correction is blocked if any later non-correction op touched the affected (vessel, lot)
> positions, not merely when enough volume is present"*
> ([`LEDGER-11-conservative-correction-guard.md:18`](docs/architecture/invariants/LEDGER-11-conservative-correction-guard.md:18)),
> implemented via `laterTouchedBlockers` ([`correct.ts:6`](src/lib/cellar/correct.ts:6) →
> `src/lib/ledger/reverse-guard.ts`). **Any barrel topped again, racked, blended or bottled since
> close-out blocks** — by design, not by accident. A round corrected a week later will partially
> block as a matter of course.

**What a partial re-fan actually does.**

| | Behaviour |
|---|---|
| **Adjusted** | Every ticked barrel that (a) has never been corrected and (b) has had no later non-correction op on its (vessel, lot) position. Each gets one compensating `CORRECTION` op — append-only, never an `UPDATE` of the original estimate — sharing a new `batchId` that references the original. |
| **Left unchanged** | Every barrel that is already corrected (`LEDGER-3`) or has moved on (`LEDGER-11`). **Its original estimate stands, and stays visible as the recorded figure.** No silent rewrite, no deletion, no placeholder. |
| **The fill record** | Records the corrected volume and enters a **`PARTIALLY_CORRECTED`** state — a first-class state, not an error — naming which barrels were and were not adjusted. |
| **The arithmetic** | **Does not re-foot, and must not pretend to.** Σ per-barrel ≠ corrected fill volume when any barrel is skipped. `TOPPING-1` is scoped to close-out, not to post-correction totals. The fill's own display must show the discrepancy, attributed. |
| **Never** | A second re-fan of an already-corrected barrel. The UI must not offer it; the DB rejects it. |

**The count must be computed BEFORE the consequence is stated.** The dialog cannot say what will
happen until it has run the `LEDGER-3` + `LEDGER-11` checks against every ticked barrel. This is a
preflight, not a post-hoc error.

**Exact copy shown to the user** (replaces the original single sentence; the numbers are computed,
not illustrative):

> **Correct this keg fill from 30 L to 28 L?**
>
> **18 of 21 barrels will be re-estimated** — from 1.43 L to 1.33 L each.
>
> **3 barrels will keep their original figure and will not be adjusted:**
> - **Barrel 7** — 1.43 L — *topped again on 2 August, after this round.*
> - **Barrel 12** — 1.43 L — *racked to Tank 4 on 3 August.*
> - **Barrel 19** — 1.43 L — *already corrected once; a second correction isn't possible.*
>
> Cellarhand never rewrites a barrel's history once other work has happened to it — the original
> figure stays on the record, and this correction is added alongside it.
>
> After this, the 21 barrels will account for **27.9 L of the corrected 28 L**. The 0.1 L
> difference is the three barrels above.
>
> [ Correct 18 barrels ] [ Cancel ]

Copy rules: name **every** skipped barrel and **why** — never "3 barrels could not be updated".
State the residual arithmetic rather than hiding it. If **zero** barrels are correctable, say so
before the user commits to anything: *"None of the 21 barrels on this fill can be re-estimated —
all have been topped, racked or corrected since. You can still correct the fill's recorded volume;
the per-barrel figures will keep their original values."* This copy needs approval into
`09-content-terminology.md` §7 alongside the other failure states.

**Scope note.** The same partial logic governs the divisor-changed case (a barrel ticked in error):
the divisor changes for everyone, but only correctable barrels are adjusted.

### 3.7 Interrupted rounds

A fill may stay `OPEN` across days, users and devices. Reopening the round shows the fill, its tick count and its remaining barrels. If a fill is left open longer than a configurable window (default 7 days), the group's next round warns and offers to close the stale fill first.

If a keg is swapped mid-round, the open fill closes and a new one opens — the runner does not lose position.

### 3.8 Permissions and audit

Ticking: `user`. Closing out: `user`. Correcting a closed fill: `admin`, or the same user within the same shift (recommend: within the open work order). Every fill, close-out and correction is audited with actor, keg, source, volume and divisor.

## 4. Alternatives considered

| Alternative | Why not |
|---|---|
| Keep asking for a per-barrel volume | It is not measured; the numbers are invented and the round gets abandoned |
| Record only a group total with no per-barrel attribution | Loses the per-barrel history a winemaker actually wants when a barrel behaves oddly |
| Weight the split by "took a lot" flags | Dresses a guess as data; the user explicitly rejected it |
| Infer from barrel weight or ullage sensors | No hardware; a future concept (class E) |

## 5. Required UI states

`02-screen-inventory.md` SC-05 and SC-06 in full: keg panel with fill gauge, tick grid, ribbon, bulk tick, close-out dialog with the arithmetic in words, "keg wasn't quite empty", the receipt, source-short conflict, and the correction dialog with its stated downstream effect.

## 6. Unresolved decisions

1. ~~**OD-4** nominal vs. measured keg volume.~~ ✅ **RESOLVED 2026-07-29 by the owner: nominal is
   allowed, stored as `CaptureMethod.NOMINAL`, and badged *nominal · 30 L stamped* — never
   *measured*.** This winery accepts the stamped keg size, so requiring a measured number would
   fabricate one. Ratified **as amended**, not as originally recommended. See §3.2 and RFC-003 §3.6.
   **No longer blocking.**
2. **OD-5** re-fan on correction. **Recommend yes — and this needs no owner decision.** The
   principle is sound; what it needed was a *specification* of partial re-fan, now written as
   §3.6.1. **Ready to ratify.**
3. ~~Is a keg a `Vessel` with a new type, or its own entity?~~ **RESOLVED 2026-07-29: a `Vessel`
   with `type = KEG`.** Decided by the coalescence register
   ([`data_model_coalescence.md:175`](docs/architecture/data_model_coalescence.md:175)), which this
   RFC did not consult, and already assumed by the code. See §3.2. **Requires the M1 enum
   migration.**
4. Does a tick survive if the work order is cancelled before close-out? Recommend: the ticks are discarded with a stated count, because no volume was ever asserted — but the *notes* are preserved on the barrels.
5. Should topping from the *same* lot create a lineage edge? Recommend no — it is the same wine.
   *(Consistent with the shipped core, which excludes the just-moved keg lot from the lineage
   children — [`topping.ts:108`](src/lib/cellar/topping.ts:108). No change needed.)*

## 7. Acceptance criteria

1. A round can be completed with **zero numeric entry** until the keg is closed out.
2. A tick is idempotent: the same tick submitted twice produces one record.
3. ~~Close-out is atomic — a failure writes nothing, and the UI says nothing was written.~~
   **AMENDED (§3.4.2):** the close-out **record** flips `OPEN → CLOSED` atomically and exactly once;
   the N per-barrel ledger writes are per-member transactions sharing one `batchId`. A close-out
   that failed on 3 of 21 barrels **records the other 18 and names the 3** — matching RFC-001 §4.7
   and AC-7, which the original wording contradicted.
4. ~~Close-out produces exactly one measured withdrawal and N estimated additions sharing one `batchId`.~~
   **AMENDED (§3.4):** close-out produces **N balanced keg→barrel transfers** sharing one `batchId`,
   each `captureMethod = DERIVED`. The measured withdrawal is the **earlier, separate** tank→keg
   fill op with its own `batchId` — it is not a member of the close-out batch. Every operation
   written by this flow satisfies `LEDGER-6` (Σ`deltaL` = 0) and carries **zero `EXTERNAL` legs**.
5. Every estimated **operation** carries its divisor in `metadata` and can be recomputed exactly
   from stored values. *(Grain corrected — see RFC-003 AC-1: `captureMethod` and `metadata` are
   op-scalars, not line-scalars.)*
6. Source-tank volume after the **fill** equals its prior volume minus the fill volume, to the cent;
   and Σ per-barrel shares after close-out equals fill volume minus the keg's remaining balance, to
   the **centilitre**, with no residue. *(Restated: the tank is debited at fill time, not at
   close-out — §3.4 ①.)*
7. Topping a barrel at nominal capacity **succeeds**; topping at >15% of nominal warns and can be
   overridden with a reason. *(Requires the narrowly-scoped `LEDGER-4` chokepoint exemption — see
   §3.5. Not class C.)*
8. Correcting the fill volume re-fans **every estimate that `LEDGER-3` and `LEDGER-11` permit**,
   and states the exact effect — including which barrels are **not** adjusted and why — before
   confirming. A re-fan where some barrels are skipped is a success, not an error. *(See §3.6.1.)*
9. A fill left open across a session resumes with its tick count and position intact.
10. No screen ever describes a tick as "recorded to the ledger" before close-out.
11. Notes never alter the arithmetic and always survive on the barrel.
