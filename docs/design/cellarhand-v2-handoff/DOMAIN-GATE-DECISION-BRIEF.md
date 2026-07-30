# ⛔ Domain gate — decision brief for the owner

**Prepared:** 29 July 2026 · **Against:** `main` @ `f7040b7e` · **Status:** decision required, nothing built
**Scope:** RFC-001/002/003/004 + OD-3, OD-4, OD-5, OD-6, OD-7. Read-only investigation; no branch, no migration, no writes.

> [!important] Amended 29 July 2026, against `main` @ `91cd1dcd` (RFC amendment pass)
> **One finding is struck: OD-7's "the premise does not exist yet" was WRONG.** Phase 9 had
> already merged as `408f8aa5` when this brief was written — the brief was prepared from a
> checkout at `f7040b7e`, the commit immediately *before* it, and so described superseded code.
> The OD-7 section below is corrected in place. See the note there for the full correction.
>
> **Everything else in this brief was re-verified against `91cd1dcd` and holds**, including the
> two findings that carry the most weight: §0.1's data measurements (re-queried read-only against
> production — every number unchanged) and §2's ruling that RFC-002 §3.4's operation shape is not
> writable. Two claims were *sharpened* rather than struck, both flagged inline: `captureMethod`
> is on **six** models, not five; and the coalescence register's own tool count (~86) is itself
> stale — the real figure is 96.
>
> **Read the stale-checkout failure as a process finding, not a one-off.** The brief's §9 closes
> by observing that the handoff was written without the schema in front of it. This brief was
> written with the schema in front of it but one commit behind HEAD, and produced a wrong finding
> on exactly the topic that commit changed. Verify the commit before citing `file:line`.

---

## 0. The two facts that reframe everything

Before the five decisions, two measurements from the live database. Both change how you should
read the handoff.

### 0.1 The tables these RFCs migrate are EMPTY. All of them. On every tenant.

```
tenant                vessels  barrels  tanks  groups  memberships  vessels_in_2+_groups
org_bhutan_wine_co         36       22     14       0            0                    0
org_demo_winery            23        6     17       0            0                    0
(9 synthetic tenants)    0–5        0    0–5       0            0                    0
```

`vessel_group` and `vessel_group_member` have **never held a single row** in production.
And further:

| Measurement | Value |
|---|---|
| `lot_operation` rows, all tenants | **167** |
| …of type `TOPPING` | **0** |
| `lot_lineage` rows of kind `TOPPING` | **0** |
| `lot_operation.batchId` — distinct batches ever written | **1** (8 ops) |
| `captureMethod` values ever written | `MANUAL`, `IMPORT` only (never `VOICE`, never `SENSOR`) |
| Vessels holding 2+ lots (LEDGER-12 violations) | **0** |
| Small tank/keg-like vessels (≤60 L) | **0** |

**What this means for the gate.** The handoff repeatedly frames these RFCs as a migration risk on
an 8,142-barrel estate. The real estate is **22 barrels**, and the group layer, the topping op, the
batch fan-out and three of four `captureMethod` values are **all unexercised**. The RFCs are not
risky migrations of live data. They are **greenfield domain design being introduced through a
migration-shaped door**, and the actual risk is that they are wrong on paper with nothing in the
data to contradict them.

Consequence: **OD-3's "how dirty is the data" question has a definitive answer — zero dirt, zero
violations, nothing to backfill.** Phase 7's instruction to *report* rather than *enforce* the OD-3
constraint (`11-implementation-sequence.md:143`) was written as prudence against unknown data. The
data is now known. That caution costs nothing to keep, but it buys nothing either.

### 0.2 The topping domain is already half-built, and the RFC does not know it

RFC-002 §2 states: *"There is **no keg entity**, no concept of a fill, no link from a fill to the
barrels it served."* Two of those three claims are wrong.

[`src/lib/cellar/topping.ts`](src/lib/cellar/topping.ts) is a complete, shipped, LEDGER-12-aware
topping core. Its input signature is:

```ts
// src/lib/cellar/topping.ts:29
fromVesselId: string; // the source keg vessel (holds the keg lot)
```

**A keg is already modelled — as a `Vessel` in the source position of a transfer.** The core draws
proportionally from the keg via `planLedgerRack` ([`topping.ts:77`](src/lib/cellar/topping.ts:77)),
routes identity through `decideCombineRoute` so the keg wine absorbs into the barrel's resident lot
([`topping.ts:94-105`](src/lib/cellar/topping.ts:94)), writes the `TOPPING` lineage edge
([`topping.ts:143-147`](src/lib/cellar/topping.ts:143)), and accepts a `batchId` for group fan-out
([`topping.ts:135`](src/lib/cellar/topping.ts:135)). `group-apply.ts` already fans it across a
group's members ([`group-apply.ts:222`](src/lib/cellar/group-apply.ts:222)).

What is genuinely missing is narrower than RFC-002 claims: **the tick, the fill record, and the
divisor.** Everything volumetric already works.

This matters because RFC-002 proposes a *different* ledger shape than the one already built, and
the proposed shape is not writable in this ledger (see OD-5 and §2 below).

---

## 1. The five decisions

### OD-3 · Can a vessel belong to more than one barrel group at a time?

**Handoff recommends:** one OPERATIONAL group at a time, enforced; tag-style groups deferred.

**What it commits you to, in plain English.**
Every barrel has exactly one home — one rack, one hall row, one aging set — and that home is the
thing work gets assigned to. If you want to also call out "the new French oak" or "everything
Nick is watching", that is a second, looser kind of list (`AD_HOC`), it can overlap freely, and it
disappears when its job is done. You cannot accidentally schedule the same barrel into two
competing topping rounds.

**What it forecloses.**
Persistent cross-cutting sets. A winery that wants standing labels — *"all 2024 Pinot barrels"*,
*"the reserve programme"*, *"barrels on trial with the new cooper"* — cannot express them as
groups, because those legitimately overlap with the rack a barrel physically sits in. RFC-001 §4.2
handles this by making them `AD_HOC` and auto-archiving them when a work order closes, which is
exactly wrong for a standing label. So the constraint forecloses **tags**, and the RFC's own
answer to tags (`AD_HOC`) is a mismatch. That is fixable later — a third type, or a separate `Tag`
model — but the coalescence register already has *"First-class **Tag** model"* as a P1 pipeline
item ([`data_model_coalescence.md:162`](docs/architecture/data_model_coalescence.md:162)), so you
would be building two overlapping grouping mechanisms.

**Does the recommendation survive the real schema? Yes, and more cleanly than the RFC expects.**
- The constraint is expressible as a partial unique index — `UNIQUE (tenantId, vesselId) WHERE
  type = 'OPERATIONAL' AND removedAt IS NULL` — because the current unique is only
  `@@unique([tenantId, groupId, vesselId])` ([`schema.prisma:3086`](prisma/schema.prisma:3086)),
  which does not conflict.
- RFC-001 §4.12's composite tenant FK works: `Vessel` already carries
  `@@unique([tenantId, id])` ([`schema.prisma:1413`](prisma/schema.prisma:1413)), which is the FK
  target it needs.
- **One gap the RFC misses:** `VesselGroup` does **not** have `@@unique([tenantId, id])`
  ([`schema.prisma:3073-3075`](prisma/schema.prisma:3073) — only `(tenantId, name)`). For
  `vessel_group_member` to carry a composite tenant FK to its group (Phase-12 checklist step 5),
  that unique has to be added first. Cheap, but it is a migration step nobody has written down.
- **Zero violations to resolve** (§0.1). The constraint can be enforced from day one.

**Where the recommendation does NOT survive: §4.3, effective-dated membership.**
This is the part RFC-001 calls *"the single most important addition"*, and it is the part that
conflicts with a critical invariant.

RFC-001 wants a past work order to *re-read* membership as of its date (`addedAt`/`removedAt`),
**and** wants admins to be able to correct membership changes retroactively (§4.9). Those two
together are precisely the failure mode `SPRAY-2` exists to forbid:

> *"A correction COPIES the predecessor's snapshot VERBATIM… Re-resolving on correction would
> repaint a July spray with November's registration data. A monthly reference refresh must never
> silently change what a past decision meant."*
> — [`SPRAY-2-facts-as-of-snapshot.md:17-24`](docs/architecture/invariants/SPRAY-2-facts-as-of-snapshot.md:17)

Under effective-dating, an admin correcting a mis-dated membership row silently changes what a
closed work order covered. Under a **snapshot at issue** — the work order freezes its member list
when it is issued — that is structurally impossible, it needs no `removedAt` semantics, it needs
no as-of query on every historical read, and it matches the pattern this codebase already treats
as critical.

**My recommendation: accept the OD-3 constraint as written; replace §4.3's effective-dated
membership with a member-list snapshot on the work order.** The RFC's acceptance criterion 3
("a test that adds a barrel after the fact and asserts the historical count is unchanged") passes
either way — and passes more strongly with a snapshot.

**Dirt:** none. 0 groups, 0 memberships, 0 vessels in 2+ groups, on all 11 tenants.

---

### OD-4 · Is keg volume nominal (30 L stamped) or measured per fill?

**Handoff recommends:** nominal default, overridable per fill, override badged.

**What it commits you to.**
The app assumes a keg holds its stamped size unless somebody says otherwise. A crew that never
touches the number still produces a usable round; a crew that weighs the keg gets credit for it.

**What it forecloses.**
Nothing structural — but it creates a **provenance class the rest of the design has no word for.**

**Does the recommendation survive? It mostly dissolves, and it exposes a hole in RFC-003.**

1. **There is no schema decision here.** If a keg is a `Vessel` (which it already is —
   §0.2), the "nominal volume" is `Vessel.capacityL`
   ([`schema.prisma:1382`](prisma/schema.prisma:1382)), which exists. And filling the keg is a real
   ledger transfer, which **requires** a positive liters figure:
   `if (!(volumeL > 0)) throw new ActionError("Enter a topping volume greater than 0.")`
   ([`topping.ts:51`](src/lib/cellar/topping.ts:51)). The ledger has no representation for
   "an unstated amount". So OD-4 is not "nominal *or* measured" — it is **"what number do we
   prefill the required field with"**. That is a form default, not a domain decision, and it needs
   no column.

2. **But that reveals the real problem.** A crew that accepts the 30 L prefill without measuring
   has produced a number that is **neither measured nor derived**. RFC-003's whole thesis is a
   binary — *"Measured: a person or instrument read this value / Estimated: the system computed
   it"* (RFC-003 §3.1). A nominal-accepted fill is a **third thing: assumed.** It is not derived
   (nothing computed it) and it is not measured (nobody read it), and under RFC-003 as written it
   would be written as `captureMethod = MANUAL` and badged **measured** on screen.

   That is the exact dishonesty RFC-003 exists to prevent, arriving through OD-4's front door.
   And it is worse than a display bug: every per-barrel estimate downstream inherits its
   credibility from that fill number, so badging an assumed 30 L as "measured" launders the
   assumption across 21 barrels.

**My recommendation: add BOTH `DERIVED` and `NOMINAL` to `CaptureMethod` in the single enum-only
migration.** You get one cheap shot at that migration (§2); a second enum value costs nothing then
and a fortune later. Then:
- crew measured the fill → `MANUAL`, badge **measured**
- crew accepted the stamped size → `NOMINAL`, badge **nominal · 30 L stamped**
- per-barrel share → `DERIVED`, badge **≈ estimated**

If you would rather keep the model minimal, the defensible alternative is **(a) require a measured
number per fill and drop nominal entirely.** The ledger already forces a number; forcing the crew
to state it honestly is one extra thought per keg, not per barrel, and RFC-002's central promise —
*"zero numeric entry until close-out"* (AC-1) — is untouched, because the fill happens before the
round starts.

What I would **not** accept is the recommendation exactly as written: nominal default badged as
measured.

**Dirt:** none — no keg-like vessels exist yet (0 vessels ≤60 L), and `captureMethod` has only
ever been `MANUAL`/`IMPORT`, so a new value collides with nothing.

---

### OD-5 · Does a corrected topping estimate re-fan across all barrels, or adjust only the one?

**Handoff recommends:** re-fan, because the divisor changed.

**What it commits you to.**
Correcting one number — "the keg was 28 L, not 30" — silently rewrites the recorded volume in
every barrel that keg served. The arithmetic on screen always agrees with itself. The cost is that
one small correction becomes N ledger events.

**What it forecloses.**
Per-barrel independence. Once estimates are coupled through a divisor, you can never correct one
barrel in isolation without either breaking the arithmetic or re-fanning. That is inherent to the
model, not to the choice, and it is the honest consequence of deriving by division at all.

**Does the recommendation survive? The principle survives. The promised behaviour does not.**

Three hard constraints in the existing ledger, none of which RFC-002 §3.6 accounts for:

1. **`correctsOperationId` is `@unique`** ([`schema.prisma:2655`](prisma/schema.prisma:2655)) —
   *"any op can be corrected at most once (kills the double-correction race)"*, registered as
   invariant LEDGER-3. So **each barrel's line can be corrected exactly once, ever.** Correct the
   fill volume from 30→28, then discover it was really 27, and the second re-fan is rejected by the
   database on all N barrels.

2. **LEDGER-11, the conservative correction guard** (severity *critical*):
   *"a correction is blocked if any later non-correction op touched the affected (vessel, lot)
   positions"* ([`LEDGER-11…md:18`](docs/architecture/invariants/LEDGER-11-conservative-correction-guard.md:18)),
   implemented via `laterTouchedBlockers` ([`correct.ts:6`](src/lib/cellar/correct.ts:6)). Any
   barrel that has since been topped again, racked, or blended **blocks**. A round corrected a week
   later will partially block, by design.

3. So a re-fan is **inherently partial**, and RFC-002's approved confirmation copy —
   *"The 20 other barrels on this keg will re-estimate to 1.50 L each"* (§3.6) — is a promise the
   ledger can refuse to keep between the dialog and the commit.

**My recommendation: re-fan — yes — but specify it as a partial, per-barrel operation, not an
atomic one.** Concretely: the correction dialog must count what is still correctable *before* it
states a consequence ("18 of 21 barrels will re-estimate; 3 have moved on and will keep their
original figure, listed below"), and a fill whose barrels have diverged must be able to sit in a
**partially-corrected** state without the UI claiming otherwise. RFC-002 does not model that
state; it needs to.

**Dirt:** none — 0 `TOPPING` operations exist, so there is nothing to re-fan retroactively.

---

### OD-6 · Barcode/NFC hardware: phone camera only, or dedicated scanners?

**Handoff recommends:** `BarcodeDetector` + Web NFC on Android, camera fallback on iOS.

**What it commits you to.**
No hardware purchase, no device management, no vendor. A cellar hand's own phone is the scanner.
Android users get tap-to-read through a glove; iPhone users aim a camera. Every object stays
reachable by typing, so a dead battery is an inconvenience, not a stoppage.

**What it forecloses.**
- **Web NFC is Chrome-on-Android only** and has no Safari implementation. Committing to it means
  the best experience is permanently unavailable on iOS, and the *quality* of the floor experience
  becomes a function of which phone a seasonal worker happens to own. That is a real
  equity-of-experience problem in a barrel hall at 6am, and it is not solvable later without
  buying hardware after all.
- It forecloses nothing on the data side. RFC-004 §3.6 is right that recording `tagToken`,
  `tagIssuedAt`, `tagRevokedAt` keeps a printer pipeline and a dedicated-scanner path open.

**Does the recommendation survive the codebase? Yes on the data model, NO on two stated
requirements.**
- RFC-004 §2 ("None") is accurate: no `BarcodeDetector`, no `NDEFReader`, no `tagToken`, no `/t/`
  route anywhere in `src/`. Verified by search.
- **Requirement gap 1 — rate limiting does not exist.** RFC-004 §3.5 requires *"Rate-limit token
  resolution to prevent enumeration."* There is no request rate-limiting primitive in this
  codebase. The only `rateLimit` hits are outbound third-party API clients
  (`src/lib/gis/satellite/client.ts`, `src/lib/weather/providers/fetch-util.ts`,
  `src/lib/knowledge/embed.ts`) — none of them gate an inbound route. So RFC-004 as written
  requires building a piece of shared infrastructure the RFC does not scope, or the enumeration
  requirement quietly ships unmet.
- **Requirement gap 2 — RFC-004 §3.1 says tokens are "tenant-scoped".** With an opaque token
  resolved through an authenticated session, the correct implementation is that the `/t/<token>`
  lookup is a *tenant-scoped read* (the RLS extension gives you that for free), so a foreign
  token returns nothing and the "unknown tag" copy fires — satisfying AC-3 by construction. Worth
  stating explicitly in the plan, because the tempting implementation (a global token index, then
  compare tenants in app code) violates TENANT-1 and would leak existence through timing.

**My recommendation: accept OD-6 as recommended, with two conditions.** (1) Web NFC is built as a
*progressive enhancement only*, never as the assumed path, so the iOS experience is the one that
gets designed and QA'd first. (2) The rate-limit requirement is either scoped as its own unit in
Phase 10 or explicitly deferred with the owner's knowledge — not left as an unmet line in an
approved RFC. Phase 10 is the last of the four and depends on 7/8, so there is time.

**Dirt:** none. Nothing to migrate; every field is new.

---

### OD-7 · Does a work order issued from an AI draft need a second human approver?

**Handoff recommends:** no — issuing *is* the human act.

**What it commits you to.**
One person, one press. The cellar hand who reads the AI's proposal and presses *Issue* is
accountable for it. No supervisor queue, no second login, no work order stuck waiting for someone
who has gone home.

**What it forecloses.**
A four-eyes control on floor work. If a winery later wants one — a trainee's work orders reviewed
before release, or an insurer/auditor asking who countersigned — retrofitting it means adding a
state between DRAFT and ISSUED, which touches the work-order status machine, the queue's saved
views, and `WORKORDER-1`. Not impossible, but not additive either. Note the ledger-side control
already exists and is unaffected: `WorkOrderTaskAttempt` gives you an approve/reject gate at
*completion* ([`data_model_coalescence.md:52`](docs/architecture/data_model_coalescence.md:52)),
which both incumbents lack. So the thing you are declining is pre-issue review, not all review.

**Does the recommendation survive the real code? YES — and the premise it needs already shipped.**

> [!warning] ⚠️ CORRECTED 29 July 2026 — this section previously said the opposite, and was wrong.
> The original text claimed `propose-work-order.ts:536-544` still creates *and* issues on one
> confirmation, and that "Phase 9 … **has not landed**". **Both claims were false at the time of
> writing.** Phase 9 merged as `408f8aa5` (PR #566); the brief was prepared from a checkout at
> `f7040b7e`, the immediately preceding commit. The struck reasoning is preserved here only as a
> record of the error — the finding itself is withdrawn.

The recommendation rests on "issuing is a distinct, deliberate human act". **It now is one.**
The assistant's work-order path stops at a `DRAFT` and hands the user to the builder — the code
says so in its own comments:

```ts
// src/lib/assistant/tools/propose-work-order.ts:538-540
// Plan 105: it STOPS there. The assistant never issues — issuing publishes to the floor, takes
// …
// (03-interaction-spec.md:179: "A WorkOrder in DRAFT. Never ISSUED").
```

and the confirmation copy was changed to match: *"the preview names the act the press actually
performs. Confirming ALWAYS leaves a DRAFT and takes the user to it — the assistant never issues"*
([`propose-work-order.ts:326-327`](src/lib/assistant/tools/propose-work-order.ts:326)).

The separation is enforced **structurally, not by convention**: `test/assistant-never-issues.test.ts`
fails if any file under `src/lib/assistant/` references `issueWorkOrderAction`/`Core` at all, so a
future tool cannot quietly re-merge the two acts.

So OD-7 is a genuine decision about a safeguard, asked against code where create and issue are
already two separate human acts. Answering "no second approver" means: the person who opens the
draft in the builder, reviews it and presses *Issue* is the accountable human. That is a real
review step, not a rubber stamp on a single confirmation.

**My recommendation: answer OD-7 "no second approver".** It is true as stated, it costs nothing,
and its stated dependency on Phase 9 is already satisfied. **OD-7 is ready to ratify.**

**Dirt:** n/a — no data question.

---

## 2. The finding that outranks all five: RFC-002's ledger shape is not writable

This is not an open decision in the handoff, so nobody is being asked about it — which is why it
matters. **RFC-002 §3.4 prescribes an operation shape this ledger cannot write.**

RFC-002 §3.4 says close-out writes:
> 1. **One** `LotOperation` … `−volume` from the source tank … badged **measured**.
> 2. **N** `LotOperation`s … each `+per_barrel` … each badged **estimated**.

Three independent blockers:

**(a) LEDGER-6 — balanced operations (severity *critical*).**
*"For every operation `sum(deltaL) == 0` across all lines (in-vessel + external)"*
([`LEDGER-6…md:19`](docs/architecture/invariants/LEDGER-6-balanced-operations.md:19)), enforced by
`assertBalanced` ([`math.ts:53-58`](src/lib/ledger/math.ts:53)) at the chokepoint
([`write.ts:8`](src/lib/ledger/write.ts:8)). A lone `−30 L` withdrawal op does not balance. It can
only be written by adding a `+30 L` **EXTERNAL** counter-leg (`vesselId: null`).

**(b) That external leg silently breaks TTB.**
The 5120.17 fold branches on `bucket === "EXTERNAL"` and maps only a closed set of reasons —
`bottle`, `tax_removal`, `loss`/`dump`/`filtration`/`evaporation`
([`generate.ts:391-402`](src/lib/compliance/generate.ts:391)) — with everything else falling
through to `none()` ([`form-map.ts:156-158`](src/lib/compliance/form-map.ts:156)). A new
`keg_withdrawal` external reason posts **no summary line at all**, so 30 L would leave the bulk
position each fill with nothing reported accounting for it, and reappear via N addition ops that
also post nothing. The period's arithmetic would not foot, and it would fail **silently** — no
error, no anomaly flag. Given `verify:excise` and the 5120.17 engine are shipped and load-bearing,
this is the highest-consequence item in the gate.

**(c) `captureMethod` is one scalar per *record*, not per line.**
It lives on `LotOperation` ([`schema.prisma:2653`](prisma/schema.prisma:2653)), and
`LotOperationLine` ([`schema.prisma:2686-2718`](prisma/schema.prisma:2686)) **has no such column** —
verified field by field. So RFC-003 AC-1 — *"A derived ledger **line** is distinguishable from a
measured one by a single indexed query"* — is stated at the wrong grain. It is op-grain. Any single
op that contains both a measured withdrawal and a derived addition **cannot be classified at all.**

> **Sharpened 29 July 2026:** `captureMethod` is a per-record scalar on **six** models, not five —
> `LotOperation` (2653), `LotStateEvent` (2823), `AnalysisPanel` (3140), `LotTastingNote` (3218),
> `Sample` (3265) and **`SprayApplication` (6281)**, which earlier counts missed. This widens the
> blast radius of adding an enum value: `CaptureMethod` is shared vocabulary across the ledger,
> lab, tasting and **spray-record** domains. A `DERIVED` value becomes representable on a spray
> application the moment it is added, so RFC-003's rules must say what `DERIVED` means — or that
> it is refused — on all six, not just on ledger ops.

**The shape that does work — and it is better.**
Use what `topping.ts` already implements, with the keg as a first-class vessel:

| Step | Operation | Provenance | Notes |
|---|---|---|---|
| 1 · Fill the keg | ONE balanced transfer, tank → keg | `MANUAL` (or `NOMINAL`, per OD-4) | This **is** the measured withdrawal. Already expressible today. No external leg. |
| 2 · Close out | N balanced transfers, keg → barrel, sharing one `batchId` | `DERIVED` | Each op is wholly derived: the divisor set its magnitude. Divisor detail in `metadata` (`Json?`, [`schema.prisma:2661`](prisma/schema.prisma:2661)). |
| 3 · Residual | stays in the keg | — | "wasn't quite empty" needs no `remaining` field — it is the keg's balance. |

This satisfies LEDGER-6 with **zero external legs**, keeps TTB at `none()` correctly (topping is
internal and net-neutral — [`form-map.ts:156`](src/lib/compliance/form-map.ts:156)), gives RFC-003
a clean op-grain classification, and satisfies RFC-002 AC-6 exactly (source volume after = before
− fill volume, to the cent) because Σ per-barrel = fill − remaining by construction.

It costs RFC-002 **AC-4** as literally worded ("exactly one measured withdrawal and N estimated
additions sharing one `batchId`") — the measured withdrawal is a separate earlier op with its own
`batchId`, not a member of the close-out batch. That criterion should be rewritten.

**Two smaller RFC-002 defects, both already solved in-repo:**

- **§3.3 "write the *unrounded* value with the divisor" is impossible.** `deltaL` is
  `Decimal(10,2)` ([`schema.prisma:2694`](prisma/schema.prisma:2694)). 30 L ÷ 21 = 1.428571…; at
  2dp, 21 × 1.43 = 30.03 ≠ 30, and the 0.03 L residue is *above* `FUNCTIONAL_ZERO_L` (0.01 L), so
  LEDGER-8's sweep will not absorb it — it lingers as dust, which is exactly what LEDGER-8 forbids.
  **It is also unnecessary:** `computeProportionalDraw` already does integer-centilitre
  largest-remainder allocation and *asserts* the sum is exact
  ([`draw.ts:26-65`](src/lib/bottling/draw.ts:26)). Use it with equal weights; §3.3's requirement
  should be "exact to the centilitre via the existing largest-remainder helper", and the divisor
  goes in `metadata` for explanation, not for recomputation.

- **§3.4 "the whole close-out is atomic" fights the group model and probably the clock.**
  `applyToGroup` is deliberately **one transaction per member**, catching per-vessel failures and
  always completing ([`group-apply.ts:233-270`](src/lib/cellar/group-apply.ts:233)) — which is
  what makes RFC-001 §4.7's "57 of 60 recorded, 3 named" true today. RFC-002 AC-3 demands the
  opposite for close-out. And a single `runLedgerWrite` is `SERIALIZABLE` with a 20s ceiling
  ([`write.ts:35`](src/lib/ledger/write.ts:35)); N barrels each require a `decideCombineRoute`
  preflight, a fold, a capacity read and a co-residence assert. At 21 barrels that is tight; at the
  420-barrel round the handoff describes it will not finish. **Atomicity has to be scoped to the
  close-out *record*, not to N ledger writes** — and any barrel whose resident wine refuses an
  absorb (bond, form, ferment state, tax class —
  [`combine.ts:99-148`](src/lib/ledger/combine.ts:99)) must be reportable per-barrel, not fatal to
  the round.

---

## 3. Incumbent parity

Source: [`docs/architecture/data_model_coalescence.md`](docs/architecture/data_model_coalescence.md).

| RFC | Where Vintrace + InnoVint COALESCE (align — load-bearing) | Where they DIVERGE (our choice) | Where WE diverge ON PURPOSE (keep) |
|---|---|---|---|
| **001 barrel groups** | Barrel-group metadata is a named gap: *"Break-barrel op + barrel-group metadata — **align-retro** … `VesselGroup` is thin"* ([:177](docs/architecture/data_model_coalescence.md:177)). Both have a richer group object than ours. **Align.** | Whether a group may hold mixed lots. The register's own nuance: *"a macro-bin/cage/pallet in custom crush holds MIXED lots — the group must allow a mixed-lot association even though the atomic vessel stays 1:1"* ([:177](docs/architecture/data_model_coalescence.md:177)). This **confirms** RFC-001 §4.1's "two or three lots in a group is legal". | Nothing group-specific. But the group must never become a vessel: `LEDGER-12` / one-lot-per-vessel is **parity, not divergence** ([:48](docs/architecture/data_model_coalescence.md:48)) and our `UNIQUE(tenantId, vesselId)` implementation is the moat-grade version of it. RFC-001 §4.1 gets this right. |
| **002 topping / keg** | **Keg as a vessel type.** *"Vessel types **KEG, BIN** + capacity display-unit — **align-retro** — S — additive enum"* ([:175](docs/architecture/data_model_coalescence.md:175)). Both incumbents model kegs as vessels. **This answers RFC-002's own open question 3** ("Is a keg a `Vessel` with a new type, or its own entity?") — the register decided, the codebase already assumes it (`topping.ts:29`). Also: Vintrace documents *"Topping Without Updating Wine Composition"*, which is why `topping.ts:490` deliberately excludes TOPPING from composition restatement. **Align on both.** | The tick / divisor / even-split model. Neither incumbent derives per-barrel topping by division; this is ours to choose. | **Append-only correction-as-event** ([:45](docs/architecture/data_model_coalescence.md:45)) — the re-fan of OD-5 must be compensating `CORRECTION` ops, never an UPDATE of the original estimates. RFC-002 §3.6 says this correctly; hold the line. |
| **003 measured vs estimated** | Nothing. Neither incumbent classifies derived quantities at all. | — | **This is a new moat candidate and should be marketed as one.** Both incumbents surface computed and read volumes identically. A queryable `DERIVED` classification is a differentiator on the same axis as immutable lineage and derived bond — and it is cheap. Add it to the moat table when it ships. |
| **004 tags / QR / NFC** | Neither incumbent has scan-to-context in the barrel hall. No parity signal either way. | Everything. | Nothing yet — but note the register's **P1 first-class `Tag` model** ([:162](docs/architecture/data_model_coalescence.md:162)) is a *different* "tag" (a client-lot sort key, InnoVint-style) from RFC-004's *tagToken* (a physical label). Same word, two objects. **Name them differently before either is built**, or you will spend a year disambiguating in code review. |

**Contradictions found between the RFCs and the register — the contradiction is the finding:**

1. **RFC-002 §3.2 defers a question the register already answered.** It says *"Claude Code should
   decide against the real schema; the RFC does not mandate either."* The register mandates:
   `VesselType.KEG`, align-retro, additive enum ([:175](docs/architecture/data_model_coalescence.md:175)).
   **Decision: keg is a `Vessel` with `type = KEG`.** RFC-002's stated risk ("a keg would appear in
   vessel pickers and capacity logic") is real and is handled by filtering pickers on type — which
   the app must do anyway once `BIN` lands for weigh-tags.
2. **RFC-001 omits `break-barrel`**, which the same register line names as part of the same
   align-retro slice. If you are opening `VesselGroup` for a migration, that is the moment to add
   it. Not a blocker; a missed economy.
3. **RFC-002 §3.5 / DM-22 amend a registered invariant and are classed as if they do not.**
   `08-data-dependency-matrix.md:57` classes the capacity downgrade as **class C** (behavioural, no
   DB). But vessel capacity is invariant **LEDGER-4** (severity *high*), and it is enforced in
   **three** places: [`topping.ts:69-74`](src/lib/cellar/topping.ts:69) (hard `ActionError`),
   [`group-apply.ts:181`](src/lib/cellar/group-apply.ts:181) (preview block), and
   [`write.ts:209-219`](src/lib/ledger/write.ts:209) (the chokepoint, which guards *every* op).
   Downgrading it for `TOPPING`-into-`BARREL` means teaching the chokepoint an op-type exemption
   and amending LEDGER-4's note. That is not class C.

---

## 4. Migration order

RFC-003 depends on nothing. RFC-002 depends on RFC-001 (member order) and RFC-003 (provenance).
RFC-004 depends on 001/002 for objects worth scanning. That much the handoff has right. But there
are **two** enum-only migrations, not one, and the handoff only names one.

```
M1  ENUM-ONLY, ALONE, FIRST, ITS OWN COMMIT
    ALTER TYPE "CaptureMethod" ADD VALUE 'DERIVED';
    ALTER TYPE "CaptureMethod" ADD VALUE 'NOMINAL';   ← if OD-4 answers "nominal allowed"
    ALTER TYPE "VesselType"    ADD VALUE 'KEG';       ← ⚠️ THE HANDOFF DOES NOT MENTION THIS
    ALTER TYPE "VesselType"    ADD VALUE 'BIN';       ← free ride; register P-item, unblocks weigh-tag tare
        ↓  must be a MERGED, DEPLOYED commit before ANY code references these values
M2  RFC-001 structure — vessel_group: add @@unique([tenantId, id]), type, status,
    location, settings; vessel_group_member: position, addedAt/removedAt (or drop these
    per §1/OD-3), composite tenant FK → vessel_group(tenantId, id)
        ↓
M3  RFC-001 backfill + enforce — 0 rows to backfill (§0.1); then create the partial
    unique index for the OD-3 constraint
        ↓
M4  RFC-002 structure — keg_fill + topping_tick tables (both NEW, both tenant-scoped);
    kegs are just vessel rows with type=KEG, no new vessel table work
        ↓
M5  RFC-002 behaviour — DERIVED writes, close-out, LEDGER-4 exemption for
    TOPPING→BARREL, correction re-fan
        ↓
M6  RFC-004 — tag columns on vessel + vessel_group (tagToken/tagIssuedAt/tagRevokedAt),
    unique on tagToken, /t/ resolver
```

**What breaks if it is done wrong:**

| Mis-step | Failure |
|---|---|
| Any `ALTER TYPE … ADD VALUE` in the same migration/transaction as code or a default that uses it | `ERROR: unsafe use of new value` — Postgres refuses. The migration fails **on deploy**, after CI passed. Documented ~7 times in this schema already (`OperationType` lines 2092, 2099, 2102, 2108, 2115, 2119, 2127; `AuditAction` line 191) — the team has been bitten repeatedly. |
| **`VesselType.KEG` forgotten until M4** | The whole of RFC-002 blocks mid-phase and needs a new M1-shaped commit + redeploy before it can continue. This is the single most likely way Phase 8 stalls, and no handoff document mentions it. |
| M1 split across two commits instead of one | Two deploy cycles instead of one, for zero benefit. Batch every enum value you will need into M1 — that is why I recommend deciding OD-4 *before* M1, not after. |
| M2 without `vessel_group.@@unique([tenantId, id])` | The composite tenant FK in M2 cannot be created (no unique target) → Phase-12 checklist step 5 fails, and you discover it while writing the FK, not while planning. |
| M3's partial unique index before M2's `type` column exists | Index references a non-existent column. |
| RFC-002 code merged before M1 is **deployed** (not merged) | Runtime `invalid input value for enum` on the first close-out — in production, on the floor. |
| M6's `tagToken` unique added without RLS on the lookup | Cross-tenant enumeration. See §1/OD-6. |

**On the enum gotcha specifically:** the schema's own comments are the best evidence this is a real
and repeated hazard, e.g. *"Added in a DEDICATED enum-only migration (Postgres `ALTER TYPE ADD
VALUE` can't be used in the tx that adds it) so the value commits before removal-core.ts writes
it"* ([`schema.prisma:2115-2117`](prisma/schema.prisma:2115)). And per memory of this box: use
hand-authored SQL — `prisma migrate diff` is unsafe here (it drops tenant FKs).

---

## 5. Live-tenant risk

**Overall posture: unusually low, for one reason — every table these RFCs touch is empty (§0.1).**
The AGENTS.md rule *"anything with an FK / RLS / uniqueness / event-write is backfill-then-enforce,
never a bare additive migration"* still applies as process, but on 0 rows the backfill step is a
verification, not a data operation. **The risk here is not corruption; it is a failed deploy from
the enum ordering (§4), and wrong domain design shipped against data too thin to contradict it.**

| Table / change | Backfill | Enforce | Rollback |
|---|---|---|---|
| `CaptureMethod` += `DERIVED`, `NOMINAL` | **None.** RFC-003 §3.2 is correct: no existing row is reclassified. 0 rows would qualify anyway (only `MANUAL`/`IMPORT` ever written). | Nothing to enforce — additive value. | **Enum values cannot be dropped in Postgres.** Rollback is code-only (stop writing them). Accept as permanent. This is a one-way door — decide OD-4 first. |
| `VesselType` += `KEG`, `BIN` | None. | Picker/capacity call sites must filter on type. | Same one-way door. Code-only rollback. |
| `vessel_group` += `type`, `status`, `location`, `settings`, `@@unique([tenantId,id])` | 0 rows. Spec anyway: `type='OPERATIONAL'`, `status` from `isActive` (RFC-001 §4.13). | `NOT NULL` on `type`/`status` in the same migration — safe on 0 rows. | Drop the columns + index. Zero data loss. |
| `vessel_group_member` += `position`, `addedAt`, `removedAt`, composite tenant FK | 0 rows. Spec: position by vessel-code natural sort, `addedAt = group.createdAt`. | `NOT NULL` on `position`; FK `(tenantId, groupId) → vessel_group(tenantId, id)` `ON DELETE RESTRICT`. | Drop columns + FK. |
| OD-3 partial unique index | 0 violations — verified (§0.1). | `CREATE UNIQUE INDEX … WHERE type='OPERATIONAL' AND "removedAt" IS NULL`. **Can be enforced immediately**; the Phase-7 "report only" step is optional here. | `DROP INDEX`. Instant, no data change. Cheapest rollback in the set — which is why enforcing now is safe. |
| `keg_fill` (NEW) | n/a | Full Phase-12 checklist below. | `DROP TABLE`. |
| `topping_tick` (NEW) | n/a | Full Phase-12 checklist below. `commandId` unique for idempotency (mirror `LotOperation.commandId`, [`schema.prisma:2660`](prisma/schema.prisma:2660)). | `DROP TABLE`. |
| `vessel` += `tagToken`, `tagIssuedAt`, `tagRevokedAt` | 0 tokens to mint; issue lazily on first label print. | `@@unique([tenantId, tagToken])` — **tenant-scoped, not global** (a global unique leaks cross-tenant existence via conflict). | Drop columns. |
| LEDGER-4 exemption for `TOPPING`→`BARREL` | n/a — behavioural | Chokepoint change ([`write.ts:209`](src/lib/ledger/write.ts:209)) + `topping.ts:69` + `group-apply.ts:181`, **and** amend `docs/architecture/invariants/LEDGER-4-vessel-capacity.md`. | Revert code. **But**: any barrel overfilled while the exemption was live stays overfilled. This is the one genuinely irreversible change in the set, and it is the one classed "C". |

### Phase-12 checklist, walked for the two new tenant-scoped tables (`keg_fill`, `topping_tick`)

Per AGENTS.md, all nine or you get a leak or a broken table.

| # | Step | `keg_fill` | `topping_tick` |
|---|---|---|---|
| 1 | `tenantId String @default("")` + `@@index([tenantId])` | ✔ | ✔ |
| 2 | Migration: `tenantId` column + index + FK → `organization(id)` `ON DELETE RESTRICT` | ✔ | ✔ |
| 3 | Backfill then `SET NOT NULL` | n/a (new table) — set `NOT NULL` at creation | same |
| 4 | Per-tenant uniques (every global unique becomes `@@unique([tenantId, …])`) | none needed | **`@@unique([tenantId, commandId])`** — do *not* use a global unique for the idempotency key |
| 5 | `@@unique([tenantId, id])` + composite FKs for cross-tenant-risk refs | **Required** — `topping_tick.kegFillId` must be a composite FK `(tenantId, kegFillId) → keg_fill(tenantId, id)`, else a tick can point at another tenant's fill | composite FKs out to `vessel(tenantId,id)` ✔ (target exists, [`schema.prisma:1413`](prisma/schema.prisma:1413)) and to `work_order_task` |
| 6 | RLS: `ENABLE` + `FORCE` + `tenant_isolation` policy with **USING *and* WITH CHECK** on `current_setting('app.tenant_id', true)` | ✔ fail-closed | ✔ fail-closed |
| 7 | **Not** in the extension denylist (`GLOBAL_MODELS`, `src/lib/tenant/models.ts`) | ✔ leave out | ✔ leave out |
| 8 | `app_rls` DML grants (covered by default privileges from `…_app_rls_role`) | verify, don't assume | verify |
| 9 | Case in `scripts/verify-tenant-isolation.ts` + `test/tenant-isolation.test.ts` | ✔ both exist, add cases | ✔ |

**Plus two rules from memory of this repo that the checklist does not state:**
- **Append-only needs `REVOKE`, not `GRANT`.** New tables arrive with `UPDATE`/`DELETE` already
  granted to `app_rls`. If a `topping_tick` is meant to be append-only-ish, revoke explicitly.
- **`$queryRaw` bypasses the tenant extension** (`TENANT-2`). Any raw SQL for the as-of membership
  read or a rollup must go through `runInTenantRawTx`.

---

## 6. Assistant coverage

Per CLAUDE.md, coverage is part of *done*: `verify:ai-native` fails on a domain core with no tool.

**The count is worse than "near the STOP rule."** `ALL_TOOLS` currently holds **96 tools**
([`registry.ts:143`](src/lib/assistant/registry.ts:143)) against a stated **~40-tool
selection-accuracy cliff** ([`data_model_coalescence.md:102-104`](docs/architecture/data_model_coalescence.md:102)).

> **Sharpened 29 July 2026:** the register's own line reads *"We're at ~86 tools"*
> ([`:102`](docs/architecture/data_model_coalescence.md:102)) — **the register is itself stale by
> ten tools.** Re-counted directly from `ALL_TOOLS` on `91cd1dcd`: 96. The drift is the finding.
> The register is the document that tells us not to proliferate tools, and it is under-reporting
> proliferation; fix that line as part of any consolidation pass.
That is **2.4× over**, and the register's own instruction is unambiguous: *"Domain-composite, not
one tool per micro-core… extend an existing tool where possible, don't proliferate."* The
`GAP_ALLOWLIST` ratchet is at `MAX_ALLOWED = 2` ([`ai-native-allowlist.mjs:156`](scripts/ai-native-allowlist.mjs:156))
and only ever decrements — so a new core with no tool cannot simply be parked.

**Wet-hands vs desk-with-coffee, for the new cores:**

| New core | Classification | Assistant requirement |
|---|---|---|
| **Tick a barrel** | 🧤 **Wet-hands.** This is the archetype — gloves, one hand, 60 barrels, dark hall. | **Needs a write tool + golden eval.** Voice-first: *"top barrel 14"*, *"that one's weeping"*. Note the ~40-tool pressure means this should **extend the existing topping/vessel write surface**, not arrive as `tick_barrel`. |
| **Close out a keg** | 🧤 **Wet-hands.** Happens at the keg, standing up, with the divisor stated aloud. | **Needs a write tool + golden eval**, and the confirmation card must state the arithmetic in words (RFC-002 §3.4/§5). Fold into the same composite tool as tick. |
| **Fill a keg** | 🧤 Wet-hands, but it is already a transfer. | **Extend the existing rack/transfer tool** with the keg as a destination. No new tool. |
| **Query group state** ("what's due on rack 14", "which barrels haven't been topped") | 🧤 Wet-hands read | **Extend `query_cellar_contents` / `query_operations`**, do not add a `query_groups`. |
| **Create / rename / archive a group; edit settings** | ☕ **Desk-with-coffee.** RFC-001 §4.10 gates it to `admin`. Configuration, done sitting down. | **GUI only.** Mark the core `INTERNAL` in `ai-native-allowlist.mjs` — that is the sanctioned exemption. |
| **Edit membership** | ☕ Desk, mostly — but *"move barrel 14 to rack 9"* is plausibly wet-hands. | GUI is sufficient for v1. If it gets a tool, it extends the group read tool, and it is `admin`-gated. |
| **Correct a closed-out keg (re-fan)** | ☕ Desk. It is a correction with a stated downstream effect. | GUI only. Corrections are deliberate-danger (principle 7); a voice confirmation of a 21-barrel re-fan is the wrong affordance. |
| **Issue / revoke a tag** | ☕ Desk (label printing is class E anyway) | GUI only, `INTERNAL`. |
| **Resolve a scanned tag** | Not a core — a route (`/t/<token>`) | No tool. |

**Net:** **one new domain-composite write tool** (topping: fill → tick → close out, as one
vessel-scoped surface) with golden evals for tick idempotency, close-out arithmetic and the
capacity soft-warning path; **two existing tools extended**; **everything group-configuration and
correction-shaped marked `INTERNAL`**. That is the only shape that does not make the 96→40 problem
worse. A plan that emits `create_barrel_group`, `tick_barrel`, `close_out_keg`,
`correct_keg_fill`, `query_groups` — the naive decomposition — should be rejected at review.

---

## 7. New invariants these RFCs imply

Each needs a typed note in `docs/architecture/invariants/`. There are currently **52** notes
(counted on `91cd1dcd`); these six are additive.

> [!important] Corrected 29 July 2026 — the mechanism below was described wrongly.
> This section originally said each note needs *"a real `verify:` guard that exists"*. That is
> true only for a **`status: guarded`** note. The register has a first-class state for exactly
> this case, and it forbids the opposite:
> - `verify-invariant-frontmatter.mjs:105-106` **rejects** a `planned`/`deferred` note that
>   declares `verify:` — *"planned/deferred notes must omit it (or flip to guarded)"*.
> - `verify-invariant-guards.mjs:53` skips any note with no `verify:`, so a planned note passes.
> - `:102-103` rejects a `guarded` note that omits `verify:`. The two checkers are complementary.
>
> So an invariant for **code that does not exist yet cannot be `guarded`**, and naming a guard
> script that isn't in `package.json` would fail `verify:invariants` at `:60` and break CI.
> The six notes below are therefore filed as **`status: planned`, with no `verify:` field** and
> the intended guard named in the body prose — the precedent is `CBMA-1`, the register's one
> existing `deferred` note. **Flipping each to `guarded` + `verify:` is part of the definition of
> done for the phase that implements it**, not of this docs pass.
>
> The `verify:` column below is retained as the *intended* guard, to be created with the feature.

| Proposed | Statement | Severity | `verify:` guard |
|---|---|---|---|
| **GROUP-1** | A vessel belongs to at most one `OPERATIONAL` group at a time. Partial unique index; `AD_HOC` unbounded. | high | `verify:group-membership` — cross-tenant sweep, same shape as `verify:one-lot-per-vessel` |
| **GROUP-2** | A group is never a vessel and never a lot: it holds no volume, appears in no `LotOperationLine`, and never appears in `LotLineage`. | high | `verify:group-not-a-vessel` — assert no FK path from group to a ledger line |
| **TOPPING-1** | Every derived per-barrel share sums **exactly** to `fill.volume − fill.remaining` at centilitre granularity, via largest-remainder. No dust. | critical | `verify:keg-closeout` — extends the arithmetic proof; pairs with LEDGER-8 |
| **TOPPING-2** | A tick is never a ledger event. No `topping_tick` row may reference a `LotOperation`; no UI may describe a tick as recorded. | high | `verify:tick-is-not-ledger` — schema test, same shape as `test/commerce7-schema.test.ts` (which fails if a PII column appears) |
| **PROV-1** | A `DERIVED` (or `NOMINAL`) operation always carries enough in `metadata` to explain its magnitude, and is never silently promoted to `MANUAL`. Promotion is a `CORRECTION` with a reason. | high | `verify:provenance` — assert every `DERIVED` op has `metadata.derivation` |
| **PROV-2** | Every derived figure rendered in the UI carries a `ProvenanceBadge` with an accessible description. | medium | a11y/component test in the existing axe gate, not a script |

**Amendments to existing invariants (not new notes — edits, which is riskier):**
- **LEDGER-4** must gain the `TOPPING`-into-`BARREL` exemption, in the note and at all three
  enforcement points (§3, contradiction 3). Do not let this ship as an undocumented code change to
  a chokepoint.
- **LEDGER-3 / LEDGER-11** need the OD-5 consequence written down: a keg fill's estimates are
  correctable **once**, and only while no barrel has moved on.
- **LEDGER-6** is the invariant that rejects RFC-002 §3.4's op shape. It needs no change — the RFC
  does.

---

## 8. What the owner must answer before Phase 7 can be planned

~~Five questions.~~ **Two of the five — the two that actually gated work — were answered by the
owner on 2026-07-29 and are struck below. The remaining three are plan-review items, not blockers.**

1. **OD-3 — one operational group per vessel: yes or no?** *(gates M2/M3)* — recommended **yes**,
   enforced immediately (0 violations exist).
   ✅ **The second half is ANSWERED. Owner, 2026-07-29: the work-order snapshot** — *"do the
   worksheet approach."* A work order freezes its member list at **issue**; membership is not
   effective-dated. `addedAt`/`removedAt` drop out of M2 and the OD-3 partial index loses its
   `removedAt` clause. Recorded as **ADR 0014** + invariant **GROUP-3**. The retroactive-repaint
   hazard is now structurally impossible rather than guarded by a rule. **No longer blocking.**

2. ✅ **OD-4 — ANSWERED. Owner, 2026-07-29: nominal is allowed, and it is badged *nominal*.**
   *"If we fill it up it holds what it holds and it's what is stamped on it — that's what we know."*
   The crew has no way to measure a keg fill, so requiring a number would have **manufactured** one:
   a typed-in `30` wearing the word *measured*. `NOMINAL` therefore ships in M1 alongside `DERIVED`,
   and **provenance becomes a trinary** (measured / nominal / estimated — RFC-003 §3.1, §3.6).
   Note this ratifies OD-4 **as amended, not as originally recommended**: the original badged the
   nominal default as *measured*, which is the failure this brief flagged. **No longer blocking.**

   *Retrospective worth keeping:* this was called "the closest call of the five" and I leaned
   `NOMINAL` while flagging low confidence. The lean was right, but the reasoning that settled it was
   not a design preference — it was one question about what the crew actually does at the keg.
   **A close call between two designs often stops being close the moment someone asks about
   practice instead of elegance.**

3. ~~**OD-7 — do you want Phase 9 landed before the RFC-002 runner?**~~ **RESOLVED — no longer a
   question.** Phase 9 shipped as `408f8aa5`; the assistant already creates a DRAFT and never
   issues ([`propose-work-order.ts:538-540`](src/lib/assistant/tools/propose-work-order.ts:538)).
   "Issue" is a real separate act today. **OD-7 is ready to ratify as "no second approver".**

4. **RFC-002's op shape — do you accept the correction in §2?** The RFC's "one withdrawal + N
   additions" cannot be written without breaking LEDGER-6 and silently breaking the 5120.17 fold.
   The alternative (measured tank→keg fill, then N derived keg→barrel ops) is already 80%
   implemented. This is not really a question of taste, but you should know the approved RFC is
   being amended rather than followed.

5. **OD-6's unmet requirements — scoped or deferred, knowingly?** RFC-004 §3.5's rate limit has no
   infrastructure behind it. Say "build it in Phase 10" or "defer it", but not nothing.

**OD-5 needs no owner answer.** Re-fan is right and I would proceed on it — what it needs is a
*specification* of partial re-fan (§1/OD-5), which is plan-review work, not an owner decision.

**Not blocking, worth an economy:** `VesselType.BIN` and the `break-barrel` op are both named in
the coalescence register as part of the same align-retro slice
([:175](docs/architecture/data_model_coalescence.md:175), [:177](docs/architecture/data_model_coalescence.md:177)).
M1 and M2 are the cheapest moment they will ever have.

---

## 9. My confidence, and which of these are genuinely close calls

Stated honestly — they are not equally clear, and pretending otherwise would be the least useful
thing in this document.

| Decision | Confidence | Why |
|---|---|---|
| **OD-3** (one operational group) | **High.** Proceed. | Zero violations in live data, the constraint is a partial index with a `DROP INDEX` rollback, and the register independently confirms the mixed-lot nuance. The *only* real cost is foreclosing tags, and the register already plans a separate `Tag` model. |
| **OD-3's second half** (effective-dating vs snapshot) | **Medium-high**, and it is a **close call** I am recommending against the RFC on. | SPRAY-2 is strong precedent and the retroactive-correction hazard is real. But effective-dating is also a legitimate pattern this codebase uses elsewhere (`deriveBond` is point-in-time from the ledger), and RFC-001 calls it "the single most important addition" — the author may have a use case I cannot see from the schema. **Worth 10 minutes of the owner's attention rather than my recommendation.** |
| **OD-4** (nominal vs measured) | **Medium. This is the closest call of the five.** | The recommendation as written is not safe — nominal badged as measured is the dishonesty RFC-003 exists to prevent, and I am confident about *that*. What I am **not** confident about is the fix. Adding `NOMINAL` is cheap and honest but adds a third provenance class the entire UI must then handle, and RFC-003's clean binary is part of why it is comprehensible. Requiring a measured number per fill is simpler and arguably better cellar practice, but it puts a number in front of a crew at the start of every round, which is the friction RFC-002 was written to remove. **I lean `NOMINAL`, but I would not be surprised to be wrong, and this is a one-way door (enum values cannot be dropped).** Decide it deliberately. |
| **OD-5** (re-fan) | **High on the principle, high on the correction.** | Re-fan is clearly right — not re-fanning leaves visibly wrong arithmetic on screen. And LEDGER-3/LEDGER-11 are unambiguous in code: the re-fan *will* partially block. That is a fact, not a judgement. |
| **OD-6** (camera + NFC) | **Medium-high.** Proceed. | The data model is right and the fallbacks are right. My hesitation is not technical: committing to Web-NFC-on-Android means the floor experience depends on which phone a seasonal worker owns, which is an equity problem no amount of feature detection fixes. Low regret either way — nothing forecloses buying scanners later. The two unmet requirements (rate limit, tenant-scoped resolution) are real but ordinary. |
| **OD-7** (no second approver) | **High on the answer. The premise claim was WRONG and is withdrawn.** | "No second approver" is right — a supervisor queue would strand work orders. My original "today one press does both jobs" was **false**: Phase 9 (`408f8aa5`) had already landed and I read a checkout one commit behind it. The safeguard the handoff describes **exists**, is enforced by `test/assistant-never-issues.test.ts`, and OD-7 is **ready to ratify**. The lesson stands, inverted: I was most confident about the one thing I got wrong, because a stale tree returns *plausible* code, not obviously-missing code. |
| **§2 — RFC-002's op shape is not writable** | **High, and this is the most consequential finding in the brief.** | Three independent confirmations: `assertBalanced` is called at the chokepoint; the TTB fold's EXTERNAL branch has a closed reason allowlist and falls through to `none()`; `captureMethod` is a single scalar on the operation. I would want one adversarial review of the TTB-footing claim specifically before it goes in a plan — the failure is *silent*, which is exactly the class of claim worth double-checking — but the LEDGER-6 blocker alone is sufficient to require the amendment. |
| **§4 — the missing `VesselType.KEG` enum migration** | **High.** | The register says additive enum; the schema has seven documented instances of this exact gotcha; no handoff document mentions it. This is the most likely single cause of a stalled Phase 8, and it costs one line in M1 to avoid. |
| **§0.1 — the tables are empty** | **Certain.** | Direct query against the production database, all 11 tenants. |

**One meta-observation, offered as a finding rather than a recommendation.** The handoff is
detailed, internally consistent, and repeatedly wrong about the current state of the codebase in
ways that all point the same direction — it under-credits what is already built (`topping.ts`, the
group fan-out, `computeProportionalDraw`, `decideCombineRoute`) and over-credits what is
constrained (it does not know about LEDGER-6, LEDGER-12's combine routing, the `Decimal(10,2)`
grain, the op-grain `captureMethod`, or the `VesselType` enum). Its own §"Source branch/commit" line
admits why: *"not captured — the working tree was mounted as a local folder, not a git checkout."*
The design work is good. It was done without the schema in front of it. **Phase 7 and 8 should be
planned against the code, using these RFCs as the intent — not implemented as specified.**

---

*Prepared read-only. No branch created, no migration written, no tenant written to. Data queries
ran against the production Neon project (`muddy-shape-80817041`) as `SELECT` only.*
