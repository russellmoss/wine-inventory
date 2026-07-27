---
title: S0 Unit 9 — a PROPOSED decision-record output shape (non-gating, non-binding)
type: phase-artifact
phase: S0
unit: 9
date: 2026-07-26
status: proposal
gates: none
binding: false
---

# S0 Unit 9 — a proposed decision-record shape

> ## ⚠️ NON-GATING and NON-BINDING
>
> **This cannot block S0's verdict** and **no lane is required to build against it.** It is a proposal
> S9 adopts, amends or discards. Council C11 corrected the plan's first draft, which called this a
> deliverable of a phase that "gates S1 only" — self-contradictory, since the shape ripples into every
> lane. It stays because the runbook scopes it here and deleting it recreates the problem it exists to
> prevent: eight phases each inventing a return shape, and S9 spending its budget reconciling them.

Brief §9 gives a fixed-width worked example and a prose contract. **There is no typed schema anywhere
in the brief.** This proposes one.

---

## 1. The design rule

The brief's contract is a list of things that must be true. A field table that merely *permits* them
to be true is not worth writing — the whole value is in a shape where **violating the contract is not
expressible**. Every row in §3 points at a structural mechanism, not a convention.

Two rules follow from that:

- **No optional field whose absence means something.** If "we don't know" is a real state, it is a
  member of a union, never a `null`.
- **No bare primitive that carries a claim.** A `number` that is a risk, a `boolean` that is a
  restriction, a `string` that is a reason — each must arrive attached to the thing that qualifies it.

---

## 2. The shape

```ts
// ─── the record ────────────────────────────────────────────────────────────────
type SprayDecisionRecord = {
  decision: Decision;                       // closed union, never a string
  target: { pathogen: PathogenKey; blockId: string; varietyId: string | null };

  biologicalRisk: Qualified<RiskBand>;      // value + why, inseparable
  protection: Qualified<ProtectionBand>;    // categorical + drivers, NEVER a percentage
  confidence: Qualified<ConfidenceBand>;    // ALWAYS a second, separate number from risk

  hardRestrictions: readonly HardRestriction[];
  legalWindows: readonly LegalWindow[];
  applicationWindow: ApplicationWindow;     // discriminated — see §3, council G4
  resistanceNote: Qualified<string> | null;
  nextAction: Qualified<string>;

  whatWeDontKnow: NonEmpty<Unknown>;        // non-empty BY CONSTRUCTION
  visualState: VisualState;                 // five-state vocabulary, S9 owns the tokens

  factsAsOf: FactsSnapshot;                 // part of the record, NOT a join
};

// ─── decision, with the refusal itself discriminated (council G9) ──────────────
type Decision =
  | { kind: "SPRAY_IN_NEXT_SUITABLE_WINDOW" }
  | { kind: "HOLD_AND_SCOUT" }
  | { kind: "DO_NOT_SPRAY"; because: MeteorologicallyUnsuitable | AgronomicallyUnnecessary }
  | { kind: "CANNOT_DETERMINE_SAFELY"; cause: RefusalCause };

// "cannot determine because the dew-point input is absent" and "do not spray because it is pouring"
// are agronomically OPPOSITE. They are different members, and the second is not even a refusal.
type RefusalCause =
  | { class: "MISSING_DATA"; missing: NonEmpty<string>; couldBeResolvedBy: string }
  | { class: "INADMISSIBLE_QC"; failing: NonEmpty<string> }
  | { class: "NO_CODE_EXISTS"; forWhat: string }        // distinct from a gap — see §3
  | { class: "STALE_INPUTS"; lastUpdate: string; ageHours: number };  // the intra-cron window

// ─── the value/why pair, which cannot be separated ────────────────────────────
type Qualified<T> = { value: T; why: NonEmpty<string> };   // `why` is REQUIRED, not a sibling optional

type NonEmpty<T> = readonly [T, ...T[]];

// ─── protection: categorical + drivers. The internal number is NOT in the DTO. ──
type ProtectionBand = "NONE" | "LOW" | "LOW_MEDIUM" | "MEDIUM" | "MEDIUM_HIGH" | "HIGH" | "UNKNOWN";
// there is deliberately no `percent` field anywhere in this file

// ─── "we know everything" is a MEMBER, not an empty list ──────────────────────
type Unknown =
  | { kind: "ESTIMATED_VALUE"; what: string; estimator: EstimatorIdentity }
  | { kind: "NOT_OBSERVED"; what: string; lastObserved: string | null }
  | { kind: "NOT_COLLECTED"; what: string; wouldRequire: string }
  | { kind: "COVERAGE_GAP"; what: string; provider: string }
  | { kind: "NOTHING_MATERIAL"; attestedAt: string };   // the explicit "we know everything" case

// ─── every modeled value carries its estimator (rule §3.5) ────────────────────
type EstimatorIdentity = {
  id: string;                                  // e.g. "CART"
  qualityClass: "PREFERRED" | "LABELED_INFERIOR";
  inputsUsed: readonly string[];
  inputsMissing: readonly string[];
  determinedUnderPartialInputs: boolean;
};

// ─── application window: wind availability GATES it, structurally (council G4) ──
type ApplicationWindow =
  | {
      kind: "DETERMINED";
      startLocal: string;
      endLocal: string;
      windAtWindow: WindReading;               // REQUIRED on this member. Cannot be omitted.
      rainfastAvailable: boolean;
    }
  | { kind: "CANNOT_DETERMINE_SAFELY"; cause: RefusalCause };

// A null-wind provider CANNOT construct the DETERMINED member. Not by convention — the type
// does not permit it.
type WindReading = {
  speedMs: number;
  directionDeg: number;                        // distinct column: CA PUR requires direction
  measurementHeightM: number;                  // NASA POWER is 2 m, everything else is 10 m
  source: WeatherInputProvenance;
};

// ─── a block reason is rendered VERBATIM (council D2, SAFE-23) ────────────────
type HardRestriction = {
  blockReasonCode: string;                     // opaque, for logic
  humanText: NonEmpty<string>;                 // canonical string, rendered verbatim, never rebuilt
  productId: string | null;
  source: "LABEL" | "INTERLOCK" | "RESISTANCE_STRATEGY" | "TENANT_OVERRIDE";
};

// ─── coverage gap, no-code-exists and clear are DISTINCT members ──────────────
type LegalWindow =
  | { kind: "CLEAR"; earliestRepeat: string; phiEndsOn: string }
  | { kind: "BLOCKED"; restriction: HardRestriction }
  | { kind: "NO_CODE_EXISTS"; jurisdiction: string; manualPathAvailable: boolean }  // rule §3.9, Bhutan
  | { kind: "COVERAGE_GAP"; what: string };
// there is no `restricted: boolean | null` anywhere. A nullable boolean is how a gap renders as
// no-restriction (rule §3.6, SAFE-3/4).

// ─── facts as of then: PART OF THE RECORD, not a join (council C4) ────────────
type FactsSnapshot = {
  composedAt: string;
  productFacts: readonly ProductFactSnapshot[];
  weatherInputs: readonly WeatherInputSnapshot[];
  blockState: BlockStateSnapshot;
};

type WeatherInputSnapshot = {
  field: string;
  value: number | null;
  seriesKind: "OBSERVED" | "FORECAST" | "REANALYSIS";   // council C3, SAFE-21
  validTime: string;
  providerIssuedAt: string | null;    // null MEANS "the provider does not expose one" — see §4
  ingestedAt: string;                 // the replay key (Unit 8 §3)
  provenance: WeatherInputProvenance;
};

type WeatherInputProvenance = {
  providerKey: string;
  archiveModel: string | null;        // `era5` vs `default` moves 50.6% of classifications (Unit 5)
  stationId: string | null;
  stationDistanceM: number | null;
  stationElevationDeltaM: number | null;
  nativeIntervalH: number;            // RH arrives in bins up to 10 h wide at long lead (Unit 2)
  agreementWithStation: AgreementBand | null;   // null = no station to compare against (Paro)
};

// The Madera lesson, made structural: confidence must carry AGREEMENT, not just completeness.
type AgreementBand = "WITHIN_TOLERANCE" | "EXCEEDS_TOLERANCE" | "NOT_COMPARABLE";

// ─── the five-state visual vocabulary (rule §3.18, council D3) ────────────────
type VisualState = {
  state: "CLEAR" | "WATCH" | "ACT" | "UNKNOWN" | "BLOCKED";
  operatorInstruction: NonEmpty<string>;   // each state carries what to DO, not just a colour
};
```

---

## 3. Every constraint, and the mechanism that makes violating it inexpressible

| Constraint | Source | Mechanism |
|---|---|---|
| `Decision` is one of four values including *cannot determine safely* | brief §9 | closed union `Decision`, not a string |
| **A refusal carries its cause class** | **council G9** | the refusal member is itself discriminated by `RefusalCause`; *do-not-spray-because-rain* is a different member of `Decision` entirely, so the two cannot render as each other |
| Every risk and protection line carries a `why` | brief §9 | `Qualified<T>` — `why` is a required field of the same object, not a sibling optional. There is no way to hold the value without it |
| `whatWeDontKnow` is **never empty by construction** | brief §9, SAFE-11 | `NonEmpty<Unknown>` is a tuple type requiring ≥1 element; "we know everything" is the explicit `NOTHING_MATERIAL` member |
| Risk and confidence are always two numbers | rule §3.4, brief §15 | two separate top-level fields with different band types. No composite score type exists in the file |
| No percentage reaches the UI | council S1, SAFE-22 | `ProtectionBand` is categorical and there is **no numeric protection field anywhere in the DTO**. The internal number is not merely hidden, it is absent |
| A block reason is rendered verbatim | council D2, SAFE-23 | `HardRestriction` requires **both** `blockReasonCode` (opaque, for logic) and `humanText` (canonical, rendered as-is). Neither is derivable from the other |
| A coverage gap never renders as no-restriction | rule §3.6, SAFE-3/4 | `LegalWindow` has distinct `CLEAR`, `COVERAGE_GAP` and `NO_CODE_EXISTS` members. There is no nullable boolean in the type |
| Estimated is labeled, with the estimator named | rule §3.5, SAFE-8 | every modeled value carries `EstimatorIdentity` including its `qualityClass`, so the labeled-inferior fallback cannot be consumed unlabelled |
| **Wind availability gates the application window** | **council G4** | `ApplicationWindow.DETERMINED` **requires** `windAtWindow`. A null-wind provider cannot construct that member and must fall to `CANNOT_DETERMINE_SAFELY`. Structural, not conventional — and this is the door that leads to a label violation, so it is the most important row in this table |
| A forecast row never satisfies a historical read | council C3, SAFE-21 | every `WeatherInputSnapshot` carries `seriesKind` plus all three timestamps |
| Decisions replay under facts-as-of-then | council C4 | `factsAsOf` is a **field of the record**, not a foreign key. Nothing to re-resolve at read time means nothing to drift |
| Five-state visual vocabulary with an operational instruction each | rule §3.18, council D3 | `VisualState` pairs the state with a required `operatorInstruction`; S9 owns the tokens |

---

## 4. What is a PROPOSAL versus what is INHERITED

**Inherited (not this unit's to change):** every row in §3's Source column. Those come from the brief,
the runbook's standing rules, the QA protocol's SAFE cases, or a council finding that was folded.
Changing one is a runbook edit, not a schema edit.

**Proposed here, and genuinely open:**

- the `Qualified<T>` wrapper, versus a flatter `{ value, valueWhy }` pair;
- the specific `Unknown` member set — four kinds plus the attestation may be too few or too many;
- `NonEmpty<T>` as a tuple type, which is ergonomically awkward in TypeScript and could instead be a
  branded type with a smart constructor;
- whether `factsAsOf` is embedded (proposed) or content-addressed and referenced by hash. Embedding is
  simpler and cannot drift; hashing deduplicates when many decisions share one fact set. Unit 8's
  measured storage numbers suggest embedding is affordable, but S9 should decide with its own numbers.

**Deliberately under-specified:** the internals of `ProductFactSnapshot`, `BlockStateSnapshot`,
`LegalWindow.earliestRepeat` semantics and `PathogenKey`'s membership. Those belong to S2b, S4, S7a
and S5a/S5b respectively, and over-specifying them here is exactly the failure mode this document's
non-binding status exists to avoid.

---

## 5. Two additions the brief's contract does not have

Both come from S0's own measurements rather than from a council finding, so they are flagged as
this unit's additions rather than inherited requirements.

1. **`WeatherInputProvenance.agreementWithStation`.** The brief's confidence contract is about
   completeness and estimation. Unit 5 measured a case where those are actively misleading: Madera
   has the **lowest** refusal rate in the fixture set (0.6 %) and the **worst** inputs (dew-point
   depression MAE 5.07 °C against a 1.85 °C tolerance). Confidence keyed on availability would report
   its highest value exactly where the answer is least trustworthy. `AgreementBand` makes that
   representable, and `NOT_COMPARABLE` covers Paro, where no station exists to compare against —
   which must not silently read as agreement.

2. **`WeatherInputProvenance.archiveModel`.** Unit 5 measured `era5` versus Open-Meteo's `default`
   blend moving **50.6 %** of infection-event classifications on average. A record that names the
   provider but not the model variant is not replayable, because "Open-Meteo" is not a single data
   product.

---

## 6. Round-tripping brief §9's worked example

Every line of the brief's fixed-width example maps, with nothing lost:

| Brief §9 line | Field |
|---|---|
| `Decision  Spray in the next suitable window` | `decision.kind = "SPRAY_IN_NEXT_SUITABLE_WINDOW"` |
| `Target  Downy mildew — Block 4, Riesling` | `target` |
| `Biological risk  HIGH` + `why` | `biologicalRisk: Qualified<RiskBand>` |
| `Protection  LOW–MEDIUM` + `why` | `protection.value = "LOW_MEDIUM"` + `.why` |
| `Hard restrictions  JMS Stylet-Oil … sulfur excluded under the loaded label rule` | `hardRestrictions[0]` with `blockReasonCode` + verbatim `humanText` |
| `Legal windows  Earliest repeat date + PHI shown per eligible product` | `legalWindows[]` |
| `Application window  5:00–9:00 a.m.; … wind … unacceptable after 10:00 a.m.` | `applicationWindow.DETERMINED` with `windAtWindow` |
| `Resistance note  Exclude the FRAC group …` | `resistanceNote` |
| `Next action  Human selects … rescout 7–10 days …` | `nextAction` |
| `Confidence  MEDIUM — the station lacks a functioning leaf-wetness sensor` | `confidence: Qualified<ConfidenceBand>` |
| `What we don't know  Leaf wetness is estimated (CART, …); no deposition check since 6/12; block canopy density not recorded this week` | `whatWeDontKnow` = `[ESTIMATED_VALUE(CART), NOT_OBSERVED(deposition, 6/12), NOT_COLLECTED(canopy density)]` |

⚠️ **One observation from doing the round-trip.** The brief's example puts three *different kinds* of
not-knowing on one line — an estimated value, a stale observation, and a datum never collected. They
have different remedies: change the estimator, go and look, start collecting. The `Unknown` union
separates them, and that separation is the single largest thing the typed shape adds over the prose
contract. It also directly serves Unit 6's canopy contract, where "canopy density not recorded" is
precisely a `NOT_COLLECTED` with a known `wouldRequire`.
