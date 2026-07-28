# RFC-002 · Topping measurement by keg

**Status:** proposed · **Owner decisions required:** OD-4, OD-5 · **Depends on:** RFC-001 (member order), RFC-003 (provenance) · **Blocks:** the topping runner

---

## 1. User problem

Nobody measures how much wine goes into an individual barrel. Asking for a per-barrel volume produces either invented numbers or an abandoned round — which is why topping is the least reliably recorded routine act in the cellar, and why barrel volumes drift from reality over a season.

What crews *do* know precisely is **how much wine left the keg**, and which barrels that keg served. From those two facts a per-barrel figure can be derived honestly.

## 2. Current behaviour

- `OperationType.TOPPING` exists.
- `LotLineage.kind` already includes `TOPPING`.
- `LotOperation.batchId` already groups the per-vessel operations of one fan-out.
- `LotOperation.commandId` is unique — idempotency is solved.
- There is **no keg entity**, no concept of a fill, no link from a fill to the barrels it served, and no way to mark a quantity as derived.
- A topping task today asks for a volume per vessel, or is recorded as a group maintenance activity with no volume at all.

## 3. Proposed behaviour

### 3.1 The model in one paragraph

A **keg** is a small, portable, reusable vessel used to carry topping wine. A **keg fill** draws a measured volume from a source tank. During a round, each barrel the crew tops is **ticked** — no volume. When the keg runs out, the crew closes it out: the fill's volume is divided evenly across the barrels that fill served, and Cellarhand writes **one measured withdrawal** from the source tank and **N estimated topping additions**, all sharing one `batchId`, each carrying the divisor.

### 3.2 Entities

**Keg** — a reusable, tenant-scoped, tagged vessel.

| Property | Notes |
|---|---|
| code | e.g. `K-3`, unique per tenant |
| nominal volume | e.g. 30 L |
| state | `EMPTY_CLEAN`, `IN_USE`, `NEEDS_CLEANING`, `RETIRED` |
| tag id | for QR/NFC (RFC-004) |
| current fill | nullable link to the open fill |

**Open question OD-4:** is a keg's volume nominal (stamped) or measured per fill? Recommend **nominal by default, overridable per fill**, with the override badged as measured and the default badged as nominal.

**Implementation note:** a keg is close enough to a `Vessel` that reusing `Vessel` with a new `VesselType.KEG` is worth evaluating — it inherits tenancy, RLS, tagging, activity events and cleaning history for free. The risk is that a keg would then appear in vessel pickers and capacity logic. Claude Code should decide against the real schema; the RFC does not mandate either.

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

Rounding: compute at full precision, present to 2 decimals, and write the *unrounded* value with the divisor so a later recomputation is exact.

### 3.4 What close-out writes

One transaction, one `batchId`:

1. One `LotOperation` of type `TOPPING` (or a `RACK`-like withdrawal, per the ledger core's existing conventions) whose lines take `−volume` from the source tank's `VesselLot` position, `captureMethod = MANUAL`, badged **measured**.
2. N `LotOperation`s of type `TOPPING`, one per ticked barrel, each `+per_barrel` to that barrel's position, each badged **estimated** and each carrying `{ kegFillId, divisor, fillVolume, method: "even-split" }` (see RFC-003 for where this lives).
3. Where the topping wine is a **different lot** from the barrel's wine, a `LotLineage` edge of kind `TOPPING` — the kind already exists.
4. Nothing else. Total lot volume across the winery is unchanged; wine moved between vessels.

The whole close-out is atomic. A partial write is not acceptable: it would leave a tank short with no matching additions.

### 3.5 Barrel capacity must not block

A 225 L barrel that has evaporated for six weeks has room. Any capacity validation on `TOPPING` into a `BARREL` is downgraded to a **soft warning at >15% of nominal**, overridable with a reason. See `08-data-dependency-matrix.md` DM-22.

### 3.6 Correction

**OD-5:** correcting a closed-out keg. Two cases:

| Change | Effect |
|---|---|
| Fill volume corrected (30 L → 28 L) | Re-fan: every estimate on that fill recomputes. One `CORRECTION` op per affected line, sharing a new `batchId`, all referencing the original `batchId`. |
| Barrel count corrected (a barrel ticked in error) | Same — the divisor changed, so every estimate changes. |
| A single barrel's note corrected | No arithmetic change. |

**Recommendation: re-fan.** Not re-fanning would leave the arithmetic visibly wrong on screen, which destroys the credibility of the whole model. The UI must state the consequence before confirming: *"The 20 other barrels on this keg will re-estimate to 1.50 L each."*

Blocked corrections follow the existing LEDGER-11 rule and its plain-language unwind message.

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

1. **OD-4** nominal vs. measured keg volume. Recommend nominal default, per-fill override.
2. **OD-5** re-fan on correction. Recommend yes.
3. Is a keg a `Vessel` with a new type, or its own entity?
4. Does a tick survive if the work order is cancelled before close-out? Recommend: the ticks are discarded with a stated count, because no volume was ever asserted — but the *notes* are preserved on the barrels.
5. Should topping from the *same* lot create a lineage edge? Recommend no — it is the same wine.

## 7. Acceptance criteria

1. A round can be completed with **zero numeric entry** until the keg is closed out.
2. A tick is idempotent: the same tick submitted twice produces one record.
3. Close-out is atomic — a failure writes nothing, and the UI says nothing was written.
4. Close-out produces exactly one measured withdrawal and N estimated additions sharing one `batchId`.
5. Every estimated line carries its divisor and can be recomputed exactly from stored values.
6. Source-tank volume after close-out equals its prior volume minus the fill volume, to the cent.
7. Topping a barrel at nominal capacity **succeeds**; topping at >15% of nominal warns and can be overridden with a reason.
8. Correcting the fill volume re-fans every estimate on that fill and states the effect before confirming.
9. A fill left open across a session resumes with its tick count and position intact.
10. No screen ever describes a tick as "recorded to the ledger" before close-out.
11. Notes never alter the arithmetic and always survive on the barrel.
