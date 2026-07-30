# RFC-003 · Measured vs. estimated quantities

**Status:** proposed · **Depends on:** nothing · **Blocks:** RFC-002 close-out, the barrel volume display, lineage volumes · **Carries:** OD-4's unresolved provenance gap (§3.6)

> [!note] Changelog
> **2026-07-29 — RFC amendment pass, against `main` @ `91cd1dcd`.** Amended to be implementable
> against the code that exists. This RFC remains **`proposed`**; the amendment does not approve it.
> - **AC-1 restated at the correct grain.** It required a derived ledger **line** to be
>   distinguishable by one indexed query. `captureMethod` is a per-**record** scalar; there is no
>   such column on `LotOperationLine`. AC-1 now reads at op grain, and the per-line alternative is
>   written up as an explicit costed schema proposal (§3.7) rather than smuggled in as a criterion.
> - **§3.2 gains the real blast radius.** `CaptureMethod` is shared by **six** models across the
>   ledger, lab, tasting and **spray-record** domains — adding a value is not a ledger-local change.
> - **NEW §3.6 — the `assumed` provenance gap** that OD-4 opens. A nominal-accepted keg fill is
>   neither measured nor derived, and this RFC's binary has no word for it. Candidate third values
>   are listed with what each commits us to. **OD-4 is marked NOT READY. No enum value is added by
>   this pass** — enum values cannot be dropped in Postgres, so this is a one-way door.
> - **§3.3 rule 6 added** so `DERIVED` has a defined meaning on the five non-ledger models.

---

## 1. User problem

Once topping volumes are derived by division (RFC-002), the ledger contains two kinds of number that look identical on screen: quantities somebody actually read, and quantities the system computed. A winemaker reconciling a barrel, an accountant reconciling a tank and a TTB auditor reading a report each need to know which is which. If the product cannot tell them apart, the honest arithmetic of RFC-002 becomes indistinguishable from invented data — which is worse than not deriving at all.

## 2. Current behaviour

`LotOperation.captureMethod` is a `CaptureMethod` enum:

```
MANUAL | VOICE | SENSOR | IMPORT
```

All four describe **how the number reached the system**, not **whether it was measured**. A voice-dictated 219 L is measured; a computed 1.43 L is not. There is no value that means "derived".

`LotOperation.metadata` is a free `Json?` column, already used for facts like crush kilograms.

## 3. Proposed behaviour

### 3.1 The distinction

| Class | Definition | Examples |
|---|---|---|
| **Measured** | A person or instrument read this value | Keg fill volume, rack volume, bottle count, a Brix reading, a weigh-tag |
| **Estimated** | The system computed it from other values | Per-barrel topping share, a barrel's current volume, a group's volume rollup |

Estimated is **not** the same as uncertain, approximate or provisional. It means *derived*, and it is always reproducible from stored inputs.

### 3.2 Where the flag lives — recommendation

**Add `DERIVED` to `CaptureMethod`.**

Reasons: it is a single enum value on a column that already exists and is already carried through the ledger core; it is queryable and indexable, which `metadata` is not; and TTB reporting will eventually need to answer "how much of this figure is derived", which a Json probe cannot do efficiently.

The derivation *detail* — the divisor, the source fill, the method — goes in `metadata`, which is exactly what that column is for:

```json
{
  "derivation": {
    "method": "even-split",
    "kegFillId": "…",
    "fillVolumeL": 30.0,
    "divisor": 21,
    "computedAt": "2026-07-27T12:58:00Z"
  }
}
```

**Alternative considered:** a separate boolean `isEstimated`. Rejected — it duplicates a dimension `captureMethod` already owns, and two columns describing provenance will drift.

**Migration:** adding an enum value in Postgres requires its own migration ahead of any code that writes it (the schema comments already document this gotcha several times). All existing rows keep their current value; nothing is backfilled to `DERIVED`.

> [!warning] Blast radius, added 2026-07-29 — `CaptureMethod` is not a ledger-local enum.
> This RFC reads as though `captureMethod` were a `LotOperation` column. It is a per-record scalar
> on **six** models, verified on `91cd1dcd`:
>
> | Model | Line | Domain |
> |---|---|---|
> | `LotOperation` | [2653](prisma/schema.prisma:2653) | ledger |
> | `LotStateEvent` | [2823](prisma/schema.prisma:2823) | ledger |
> | `AnalysisPanel` | [3140](prisma/schema.prisma:3140) | lab |
> | `LotTastingNote` | [3218](prisma/schema.prisma:3218) | tasting |
> | `Sample` | [3265](prisma/schema.prisma:3265) | lab |
> | **`SprayApplication`** | [6281](prisma/schema.prisma:6281) | **spray record** |
>
> Adding `DERIVED` makes it **representable on all six the moment the migration lands**, including
> a spray application — a compliance-adjacent record governed by `SPRAY-2`. This RFC must therefore
> state what `DERIVED` means, or that it is refused, on each. See §3.3 rule 6.
>
> Confidence: **high** on the enumeration (grepped field by field); **medium** on whether refusal
> is the right posture for `AnalysisPanel` — a computed analyte value is arguably genuinely derived,
> and that is a lab-domain judgement this RFC should not make alone.

### 3.3 Rules

1. Any quantity the system computes rather than reads is `DERIVED`.
2. A derived quantity **always** stores enough in `metadata` to recompute it exactly.
3. A derived quantity is **never** silently promoted to measured. If someone measures the real value later, that is a correction with a stated reason.
4. Derived quantities participate in the ledger normally — they are real volume movements, not annotations. The balance identity still holds.
5. A figure computed *at read time* for display only (a group volume rollup, a percentage full) is **not** a ledger row and carries no `captureMethod`; the UI still labels it as derived.
6. **(Added 2026-07-29)** `DERIVED` is meaningful **only** on `LotOperation` and `LotStateEvent`.
   On `AnalysisPanel`, `LotTastingNote`, `Sample` and `SprayApplication` it is **refused at the
   core**, because nothing in those domains computes a quantity by division today and a permissive
   default would let provenance drift into records governed by `SPRAY-2`. If a lab-domain case for
   a derived analyte emerges, it is a **separate decision with its own review** — not an
   inheritance from this RFC. *(Flagged as medium confidence — see §3.2.)*

### 3.4 UI requirement

Every derived quantity in the interface carries a `ProvenanceBadge` reading **≈ estimated**, and every measured one reads **measured** where the two appear side by side. Tokens are in `05-design-system-v2.md` §A5. The badge's `aria-describedby` states the derivation: *"30 L ÷ 21 barrels, keg K-3, 27 July"*.

Places this is mandatory:

- Barrel history rows
- Barrel current volume ("~219 L of 225 L nominal · derived from fills, racks and topping estimates")
- Keg close-out card
- Group volume rollups
- Lineage node volumes where any input was derived
- Any export or report column containing a derived figure

### 3.5 Compliance implication

A TTB figure that includes derived volumes must be able to state that. This RFC does not propose a reporting change; it makes the reporting change **possible** later by keeping the classification queryable. Flag this to whoever owns compliance before the first period that contains derived topping volumes.

### 3.6 ⛔ The `assumed` gap — OD-4's provenance hole (NEW, 2026-07-29)

> [!danger] OD-4 is NOT READY for ratification, and this section is why.
> **Do not answer OD-4 yet. No enum value is being added by this pass.**

**The hole.** RFC-002's OD-4 recommends a keg fill default to its **nominal** (stamped) volume,
overridable, *"with the override badged as measured and the default badged as nominal."* But this
RFC's model is a **binary**: *"Measured: a person or instrument read this value / Estimated: the
system computed it"* (§3.1). A crew that accepts a 30 L prefill without weighing the keg has
produced a number that is **neither**:

- Not **measured** — nobody read it.
- Not **derived** — nothing computed it; it is a stamp on the side of a vessel.

It is a **third class: assumed.** Under this RFC as written it would be stored as
`captureMethod = MANUAL` and badged **measured** on screen. **That is precisely the dishonesty this
RFC exists to prevent, arriving through OD-4's front door** — and it is worse than a display bug:
every per-barrel `DERIVED` figure downstream inherits its credibility from that fill number, so
badging an assumed 30 L as measured **launders one assumption across 21 barrels**.

**Why this cannot be deferred.** `ALTER TYPE … ADD VALUE` is a **one-way door — Postgres cannot
drop an enum value.** The M1 enum migration is one cheap, cleanly-batched shot (see the
cross-cutting notes §B1); a second value costs nothing there and a full migration cycle later.
Deciding OD-4 *after* M1 is the expensive order.

**Candidate resolutions, and what each commits us to.**

| Option | What it commits us to | Cost |
|---|---|---|
| **A. Add `NOMINAL` to `CaptureMethod`** in M1, alongside `DERIVED`. Measured fill → `MANUAL` (badge **measured**); accepted stamp → `NOMINAL` (badge **nominal · 30 L stamped**); per-barrel share → `DERIVED` (badge **≈ estimated**). | A **third provenance class the entire UI must handle**, permanently, on all six models. RFC-003's clean binary — a real part of why it is comprehensible — becomes a trinary. Every badge surface in §3.4 grows a third state. | One extra line in M1. Large, permanent UI//conceptual surface. |
| **B. Require a measured number per fill; drop nominal entirely.** The crew states the volume when the keg is filled. | Nothing new in the model. The binary holds. Arguably better cellar practice. | **One extra thought per keg, not per barrel** — and it happens *before* the round, so RFC-002 AC-1 ("zero numeric entry until close-out") is untouched. Friction where RFC-002 wanted none. |
| **C. Ship OD-4 as recommended** (nominal default, badged measured). | — | ❌ **Not defensible.** It is the exact failure this RFC was written to prevent. Listed only to be explicitly rejected. |

**Assessment, stated with its uncertainty.** Option C is out; **that** judgement is high-confidence.
Between **A and B this is genuinely close, and it is the closest call in the whole gate.** A is
honest but permanently complicates the model; B is simpler and arguably better practice but
reintroduces the friction RFC-002 was written to remove. **This RFC does not pick.** A weak lean to
**A** — because a winery that never weighs a keg is a real and common case, and B's friction lands
on the crew every single fill — but the lean is weak enough that the owner should decide it
deliberately rather than inherit it.

**Whichever is chosen, one rule is non-negotiable: a number nobody read is never badged as
measured.**

### 3.7 Per-line provenance — an explicit costed proposal, NOT an acceptance criterion

**(Added 2026-07-29.)** AC-1 originally required a derived ledger **line** to be distinguishable by
one indexed query. **No such column exists**, and creating one is a real schema change that was
being smuggled in as a criterion. Stated properly:

**Is per-line provenance needed?** For RFC-002's amended shape, **no.** Each close-out operation is
*wholly* derived (§3.4 ②: one `−` keg leg and one `+` barrel leg, both magnitudes set by the
divisor), and the fill op is wholly measured. Every operation in the flow is provenance-homogeneous,
so the op-grain scalar classifies all of them exactly. **The need only arises for a mixed-provenance
operation — which the amended design deliberately does not create.**

**If it is ever needed**, the cost is:

- `LotOperationLine.captureMethod CaptureMethod?` — nullable, inheriting from the parent op when
  null, so no backfill of the ~500 existing lines is required.
- An index on `(tenantId, captureMethod)` for the queryable requirement.
- A rule reconciling line-level and op-level values (proposal: the op value is a summary and must be
  `DERIVED` if **any** line is — otherwise the two drift, the exact failure that killed the
  `isEstimated` boolean in §3.2).
- Every write path that constructs lines must set it: the ledger chokepoint
  ([`write.ts`](src/lib/ledger/write.ts)) plus every core that builds `LedgerLine[]`.

**Recommendation: do not build it now.** Op-grain provenance is sufficient for everything these
four RFCs require. Revisit only if a genuinely mixed-provenance operation is proposed — and treat
that proposal as the signal to re-examine the *operation*, not to add the column.

## 4. Unresolved decisions

0. **⛔ OD-4's `assumed` gap (§3.6) — the blocking one.** Add a third value (`NOMINAL`), or require
   a measured number per fill? A one-way door; it gates the M1 enum migration. **Owner decision
   required. RFC-002's OD-4 cannot be ratified until this is answered.**
1. Should `DERIVED` be exclusive with `VOICE`? A voice-dictated keg volume is measured; the per-barrel split is derived. They are different operations, so exclusivity is fine — but confirm no flow needs both on one row.
   *(Confirmed 2026-07-29 for the amended RFC-002 shape: the fill and the close-out are separate
   operations, so no row needs both. `captureMethod` being a single scalar makes exclusivity
   structural, not a rule to enforce.)*
2. Does a derived quantity need a confidence or tolerance figure? Recommend no in v1 — an even split has no meaningful confidence interval, and inventing one would be the exact dishonesty this RFC exists to prevent.
3. Should reports be able to exclude derived volumes? Defer to compliance.

## 5. Acceptance criteria

1. ~~A derived ledger line is distinguishable from a measured one by a single indexed query, with no Json parsing.~~
   **RESTATED 2026-07-29 at the grain the schema has:** a derived **`LotOperation`** is
   distinguishable from a measured one by a single indexed query on `captureMethod`, with no Json
   parsing. *(`captureMethod` is a per-record scalar on `LotOperation`
   ([`schema.prisma:2653`](prisma/schema.prisma:2653)); `LotOperationLine` has no such column —
   verified field by field. The amended RFC-002 shape makes every operation
   provenance-homogeneous, so op grain is sufficient. Per-line provenance is written up as a
   costed proposal in §3.7 and is **not** required by these RFCs.)*
2. Every derived **operation** can be recomputed exactly from its stored `metadata` plus the referenced records.
3. Every UI surface listed in §3.4 renders the badge, and the badge has an accessible description naming the derivation.
4. No existing row is reclassified by the migration.
5. Correcting a measured value never changes its classification; converting a derived value to measured requires an explicit correction with a reason.
6. The ledger balance identity holds with derived lines included.
