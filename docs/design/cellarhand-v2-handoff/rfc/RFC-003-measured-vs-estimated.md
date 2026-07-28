# RFC-003 · Measured vs. estimated quantities

**Status:** proposed · **Depends on:** nothing · **Blocks:** RFC-002 close-out, the barrel volume display, lineage volumes

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

### 3.3 Rules

1. Any quantity the system computes rather than reads is `DERIVED`.
2. A derived quantity **always** stores enough in `metadata` to recompute it exactly.
3. A derived quantity is **never** silently promoted to measured. If someone measures the real value later, that is a correction with a stated reason.
4. Derived quantities participate in the ledger normally — they are real volume movements, not annotations. The balance identity still holds.
5. A figure computed *at read time* for display only (a group volume rollup, a percentage full) is **not** a ledger row and carries no `captureMethod`; the UI still labels it as derived.

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

## 4. Unresolved decisions

1. Should `DERIVED` be exclusive with `VOICE`? A voice-dictated keg volume is measured; the per-barrel split is derived. They are different operations, so exclusivity is fine — but confirm no flow needs both on one row.
2. Does a derived quantity need a confidence or tolerance figure? Recommend no in v1 — an even split has no meaningful confidence interval, and inventing one would be the exact dishonesty this RFC exists to prevent.
3. Should reports be able to exclude derived volumes? Defer to compliance.

## 5. Acceptance criteria

1. A derived ledger line is distinguishable from a measured one by a single indexed query, with no Json parsing.
2. Every derived line can be recomputed exactly from its stored `metadata` plus the referenced records.
3. Every UI surface listed in §3.4 renders the badge, and the badge has an accessible description naming the derivation.
4. No existing row is reclassified by the migration.
5. Correcting a measured value never changes its classification; converting a derived value to measured requires an explicit correction with a reason.
6. The ledger balance identity holds with derived lines included.
