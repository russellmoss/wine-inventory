/**
 * S0 Unit 4 — CART, the RH≥90% fallback, and the two-zone canopy modifier.
 *
 * PURE. No `src/` imports, no Prisma, no React, no I/O, no network. Shaped so S1 lifts it into
 * `src/lib/weather/` unchanged rather than rewriting it, following the purity discipline of
 * `src/lib/weather/obs-time-core.ts` and `src/lib/gis/*` (runbook rule §3.13).
 *
 * Goldens: `test/s0-lwd.test.ts`, written first.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS NOT
 *
 * Nothing here is validated against measured leaf wetness, because there is no measured leaf wetness
 * anywhere in this project (brief §15). These are two published estimators implemented so their
 * DISAGREEMENT can be measured. Any number this module produces is an estimate whose estimator must
 * be named at the point of display (rule §3.5).
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds, with their provenance. Every number here came from the literature, not from us.
// ─────────────────────────────────────────────────────────────────────────────

export const CART_THRESHOLDS = {
  /**
   * CART (classification and regression tree), Gleason et al. 1994, Plant Disease 78:1011–1016.
   *
   * The tree assigns each hour to one of four categories on three nodes:
   *   level 1  dew-point depression ≥ 3.7 °C  → DRY
   *   level 2  wind speed < 2.5 m/s           → WET
   *   level 3  relative humidity ≥ 87.8 %     → WET, else DRY
   *
   * Corroboration status, recorded honestly because the plan's own Risk table says anything the
   * source documents assert about disease weather is unverified until checked:
   *   - DPD 3.7 °C and wind 2.5 m/s: corroborated across multiple independent secondary sources,
   *     including papers that RE-CALIBRATE the 3.7 °C node for other climates (2.7 °C for Spanish
   *     greenhouses, 6.3 °C for Chinese greenhouses) — which only makes sense if 3.7 is the original.
   *   - RH 87.8 %: found in a single secondary source. ⚠️ THE LEAST-CORROBORATED NUMBER IN THIS
   *     MODULE. Unit 5 sweeps it as a sensitivity dimension rather than trusting it, and S1 must
   *     obtain the primary paper before this is lifted into `src/`.
   */
  dewPointDepressionC: 3.7,
  windMs: 2.5,
  relativeHumidityPct: 87.8,

  /**
   * The naive fallback. RH ≥ 90 %, the threshold Gleason et al. measured as carrying roughly 40 %
   * MORE error than CART. Kept because it runs on one input, labeled inferior because it is.
   */
  fallbackRelativeHumidityPct: 90,

  /**
   * Measurable precipitation makes a canopy wet regardless of what the dew tree says.
   *
   * ⚠️ THIS IS AN ADDITION TO THE PUBLISHED TREE AND IS FLAGGED AS SUCH. CART was developed to
   * estimate DEW duration; rain is a different wetting mechanism the tree does not model. Treating a
   * raining hour as dry because the air below the canopy is unsaturated would be obviously wrong, and
   * every operational LWD implementation overrides on rain. But it IS our addition, the verdict
   * records `decidedBy: "PRECIPITATION"` so it is visible in every measurement, and Unit 5 reports
   * what share of wet hours came from this node rather than from the tree.
   *
   * 0.2 mm is the conventional "measurable" floor — below it, a trace report is not evidence of a
   * wetted canopy.
   */
  precipitationWettingMm: 0.2,

  /**
   * The dew-eligible window, in SITE-LOCAL time (data-sources design §2.4: CART "performs on both
   * dew-eligible (20:00–09:00) and dew-ineligible periods"). The tree is applied to ALL hours; this
   * flag exists so Unit 5 can slice by it, NOT to gate the estimator. Making it a gate would be a
   * silent modeling change the design doc does not authorise.
   */
  dewEligibleLocalHours: { fromInclusive: 20, toExclusive: 9 },

  canopyManagements: {
    UNMANAGED_SPRAWL: 1,
    VSP: 1,
    VSP_LEAF_PULLED_FRUIT_ZONE: 1,
    DIVIDED_CANOPY: 1,
    UNKNOWN: 1,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Inputs and verdicts
// ─────────────────────────────────────────────────────────────────────────────

export type HourInput = {
  /** the UTC instant the hour starts — the alignment key from Unit 2's rollup rule */
  hourStartUtc: string;
  /** 0–23 in the SITE's IANA zone. Computed by the caller, because timezone maths is not this
   *  module's job and making it one would drag a dependency into a pure module. */
  localHour: number;
  tempC: number | null;
  dewPointC: number | null;
  relativeHumidityPct: number | null;
  windMs: number | null;
  precipMm: number | null;
  /** false when the source hour failed Unit 2's QC-admissibility rule. A distinct refusal cause from
   *  a merely absent value — council G9's point, applied upstream of the pathogen models. */
  qcAdmissible?: boolean;
};

export type EstimatorId = "CART" | "RH90_THRESHOLD";

/**
 * The estimator's standing, carried on EVERY verdict.
 *
 * This is what "labeled inferior at the type level, not in a comment" means in practice: there is no
 * bare boolean anywhere in this module's output. A caller cannot obtain wet-or-dry without
 * destructuring an object that also carries `estimator` and `qualityClass`, so consuming the
 * fallback without knowing it is the fallback is not a discipline question, it is not expressible.
 */
export type QualityClass = "PREFERRED" | "LABELED_INFERIOR";

/** Council G9: a refusal carries its CAUSE CLASS. "Cannot determine because the dew-point input is
 *  absent" and "do not spray because it is pouring" are agronomically opposite and must never render
 *  as each other. Within refusals, a missing input and an inadmissible one are also different: the
 *  first is a coverage gap, the second is a data-quality event, and they have different remedies. */
export type RefusalCause = "MISSING_INPUT" | "INADMISSIBLE_QC";

/** Which node actually decided the hour. Makes the precipitation override visible in every report
 *  rather than blended into "CART said wet". */
export type DecidedBy = "PRECIPITATION" | "DEW_POINT_DEPRESSION" | "WIND" | "RELATIVE_HUMIDITY";

type VerdictBase = {
  readonly hourStartUtc: string;
  readonly estimator: EstimatorId;
  readonly qualityClass: QualityClass;
  readonly dewEligible: boolean;
  /** always populated, even on a WET/DRY answer — Unit 6's confidence band is a function of input
   *  availability, not of the estimate */
  readonly inputsUsed: readonly string[];
  readonly inputsMissing: readonly string[];
};

export type Verdict =
  | (VerdictBase & {
      readonly state: "WET" | "DRY";
      readonly decidedBy: DecidedBy;
      /** true when an input was absent but could not have changed the outcome — see `cart` */
      readonly determinedUnderPartialInputs: boolean;
    })
  | (VerdictBase & {
      readonly state: "CANNOT_DETERMINE";
      readonly cause: RefusalCause;
    });

const FIELDS = ["tempC", "dewPointC", "relativeHumidityPct", "windMs", "precipMm"] as const;

function presence(h: HourInput) {
  const used: string[] = [];
  const missing: string[] = [];
  for (const f of FIELDS) (h[f] == null ? missing : used).push(f);
  return { used, missing };
}

function isDewEligible(localHour: number): boolean {
  const { fromInclusive, toExclusive } = CART_THRESHOLDS.dewEligibleLocalHours;
  // the window wraps midnight
  return localHour >= fromInclusive || localHour < toExclusive;
}

// ─────────────────────────────────────────────────────────────────────────────
// CART
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The published tree, plus two things the published tree does not have and this project needs:
 * a precipitation override (flagged), and PARTIAL-INPUT RESOLUTION.
 *
 * ── Partial-input resolution, and why it matters ──
 *
 * The plan's rule is "an hour with no wind reading is not a dry hour — that distinction is the whole
 * exercise, and getting it wrong is exactly how a coverage gap renders as 'no restriction' (rule
 * §3.6)". The naive implementation of that rule is "any missing input → refuse", and it is wrong in
 * the opposite direction: it throws away hours the tree can decide perfectly well.
 *
 *   - A dew-point depression of 15 °C decides the hour at level 1. Wind and RH are never consulted,
 *     so their absence changes nothing. Refusing there would manufacture a coverage gap out of a
 *     decided hour.
 *   - With wind absent, both wind branches sometimes AGREE. DPD 1 °C with RH 95 %: the calm branch
 *     says wet, and the windy branch falls through to the RH node which also says wet. The answer is
 *     wet under every value the missing input could take.
 *
 * So the rule this implements is sharper and, I think, the correct one: **refuse when the missing
 * input could change the answer, and only then.** Every verdict still records what was absent, so a
 * partially-determined hour is visible to Unit 6's confidence band and is never mistaken for a
 * fully-observed one.
 */
export function cart(h: HourInput): Verdict {
  const { used, missing } = presence(h);
  const base = {
    hourStartUtc: h.hourStartUtc,
    estimator: "CART" as const,
    qualityClass: "PREFERRED" as const,
    dewEligible: isDewEligible(h.localHour),
    inputsUsed: used,
    inputsMissing: missing,
  };

  if (h.qcAdmissible === false) {
    return { ...base, state: "CANNOT_DETERMINE", cause: "INADMISSIBLE_QC" };
  }

  // Node 0 (ours, flagged): measurable rain wets the canopy whatever the dew tree thinks.
  if (h.precipMm != null && h.precipMm >= CART_THRESHOLDS.precipitationWettingMm) {
    return { ...base, state: "WET", decidedBy: "PRECIPITATION", determinedUnderPartialInputs: missing.length > 0 };
  }

  const dpd = h.tempC != null && h.dewPointC != null ? h.tempC - h.dewPointC : null;
  if (dpd == null) {
    return { ...base, state: "CANNOT_DETERMINE", cause: "MISSING_INPUT" };
  }

  // Level 1 — decides on its own when the air is dry enough.
  if (dpd >= CART_THRESHOLDS.dewPointDepressionC) {
    return { ...base, state: "DRY", decidedBy: "DEW_POINT_DEPRESSION", determinedUnderPartialInputs: false };
  }

  // Below here the answer depends on wind, and possibly on RH.
  const rhSaysWet =
    h.relativeHumidityPct == null ? null : h.relativeHumidityPct >= CART_THRESHOLDS.relativeHumidityPct;

  if (h.windMs != null) {
    // Level 2.
    if (h.windMs < CART_THRESHOLDS.windMs) {
      return { ...base, state: "WET", decidedBy: "WIND", determinedUnderPartialInputs: false };
    }
    // Level 3.
    if (rhSaysWet == null) return { ...base, state: "CANNOT_DETERMINE", cause: "MISSING_INPUT" };
    return {
      ...base,
      state: rhSaysWet ? "WET" : "DRY",
      decidedBy: "RELATIVE_HUMIDITY",
      determinedUnderPartialInputs: false,
    };
  }

  // Wind absent. Both branches agree only when the RH node also says wet.
  if (rhSaysWet === true) {
    return { ...base, state: "WET", decidedBy: "WIND", determinedUnderPartialInputs: true };
  }
  // rhSaysWet is false (calm→WET, windy→DRY) or null (calm→WET, windy→unknown). Either way the
  // missing wind reading CAN change the answer. Refuse. It is not a dry hour.
  return { ...base, state: "CANNOT_DETERMINE", cause: "MISSING_INPUT" };
}

// ─────────────────────────────────────────────────────────────────────────────
// The labeled-inferior fallback
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RH ≥ 90 %. One input, and roughly 40 % more error than CART in the literature that produced both.
 *
 * It exists to be MEASURED AGAINST, and as the thing that runs when wind or dew point is
 * structurally unavailable from a provider. It is never silently substituted: rule §3.5 requires the
 * estimator to be named at the point of display, and `qualityClass: "LABELED_INFERIOR"` rides on
 * every verdict so a caller cannot drop the label without deleting a field it had to read.
 *
 * ⚠️ Note it does NOT get the precipitation override. That is deliberate. The fallback's whole
 * character is that it is the naive published threshold; improving it would make the disagreement
 * measurement flattering and meaningless. If a downstream consumer wants rain handling, it takes
 * CART.
 */
export function rh90Fallback(h: HourInput): Verdict {
  const { used, missing } = presence(h);
  const base = {
    hourStartUtc: h.hourStartUtc,
    estimator: "RH90_THRESHOLD" as const,
    qualityClass: "LABELED_INFERIOR" as const,
    dewEligible: isDewEligible(h.localHour),
    inputsUsed: used,
    inputsMissing: missing,
  };
  if (h.qcAdmissible === false) return { ...base, state: "CANNOT_DETERMINE", cause: "INADMISSIBLE_QC" };
  if (h.relativeHumidityPct == null) return { ...base, state: "CANNOT_DETERMINE", cause: "MISSING_INPUT" };
  return {
    ...base,
    state: h.relativeHumidityPct >= CART_THRESHOLDS.fallbackRelativeHumidityPct ? "WET" : "DRY",
    decidedBy: "RELATIVE_HUMIDITY",
    determinedUnderPartialInputs: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Wet-run segmentation
// ─────────────────────────────────────────────────────────────────────────────

export type WetRun = {
  startUtc: string;
  endUtc: string;
  /** hours actually classified WET inside the run */
  wetHours: number;
  /** total hours from first wet hour to last wet hour inclusive, gaps included */
  spanHours: number;
  /** ⚠️ a run containing a refused hour is NOT a measured run. Every consumer must treat its duration
   *  as a lower bound, and Unit 6's counterfactual specifies what a pathogen model does with it. */
  containsRefusal: boolean;
  refusedHours: number;
};

export type SegmentOptions = {
  /**
   * How long a dry spell must be before it ENDS a wetness period rather than interrupting it.
   *
   * Council G7: standard models use a dry-period threshold of roughly 4–12 hours below the wetness
   * threshold, radiation-dependent. **Use the literature rule and cite it. Do not invent an
   * interruption threshold by observing when estimator outputs flip** — that is fitting pathology to
   * a measurement artifact.
   *
   * So this is a REQUIRED parameter with no default. A caller must state which value in the
   * literature range it is using, and Unit 5 sweeps the whole 4–12 h range as a sensitivity
   * dimension rather than picking one and calling it settled.
   */
  interruptionThresholdH: number;
};

export function segmentWetRuns(verdicts: readonly Verdict[], opts: SegmentOptions): WetRun[] {
  const runs: WetRun[] = [];
  let cur: { startIdx: number; lastWetIdx: number; wet: number; refused: number } | null = null;

  const flush = () => {
    if (!cur) return;
    runs.push({
      startUtc: verdicts[cur.startIdx].hourStartUtc,
      endUtc: verdicts[cur.lastWetIdx].hourStartUtc,
      wetHours: cur.wet,
      spanHours: cur.lastWetIdx - cur.startIdx + 1,
      containsRefusal: cur.refused > 0,
      refusedHours: cur.refused,
    });
    cur = null;
  };

  for (let i = 0; i < verdicts.length; i++) {
    const v = verdicts[i];
    if (v.state === "WET") {
      if (!cur) cur = { startIdx: i, lastWetIdx: i, wet: 0, refused: 0 };
      cur.wet++;
      cur.lastWetIdx = i;
      continue;
    }
    if (!cur) continue;
    // A refusal inside a run is NOT a dry hour and must not count toward the interruption gap —
    // doing so would let a coverage gap silently terminate a wetness period, which is the §3.6
    // failure mode wearing a different hat. It is recorded and the run is flagged.
    if (v.state === "CANNOT_DETERMINE") {
      cur.refused++;
      continue;
    }
    // DRY. Close the run once the dry spell reaches the threshold.
    let gap = 0;
    let j = i;
    while (j < verdicts.length && verdicts[j].state === "DRY") {
      gap++;
      j++;
    }
    if (gap >= opts.interruptionThresholdH) {
      flush();
      i = j - 1;
    }
  }
  flush();
  return runs;
}

// ─────────────────────────────────────────────────────────────────────────────
// The TWO-ZONE canopy modifier
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ Council G3 — the plan's first draft carried a single block-level canopy state, and it was
 * ANATOMICALLY WRONG.
 *
 * Pathogens target organs living in different microclimates *within the same canopy*. Downy mildew
 * attacks foliage in the upper canopy and the growing tips; botrytis targets clusters in the
 * fruiting zone. "Leaf-pulled VSP" means leaves pulled **in the fruiting zone only** — the upper
 * canopy stays dense. A block-wide fast-drying modifier would model cluster drying correctly while
 * badly under-predicting downy risk on the foliage, which is the failure mode where the system tells
 * a grower they are protected on the exact tissue that is not.
 *
 * So: two microclimates, each with its own drying adjustment, and EVERY PATHOGEN MODEL DECLARES
 * WHICH ZONE IT READS.
 */
export type CanopyZone = "CLUSTER" | "FOLIAR";

export type CanopyManagement = keyof typeof CART_THRESHOLDS.canopyManagements;

export type ZoneAdjustment = {
  zone: CanopyZone;
  management: CanopyManagement;
  /** FASTER = the zone dries sooner than the open-air estimate, so wet runs shorten. */
  direction: "FASTER" | "SLOWER" | "NEUTRAL";
  /**
   * ⚠️ ALWAYS `null` IN S0, and that is the deliverable, not an omission.
   *
   * S0 defines the shape and measures sensitivity to it; it does NOT calibrate the adjustment,
   * because there is nothing to calibrate against — no on-site sensor, no measured wetness, no
   * paired canopy trial. Council specifically flagged the risk of inventing product logic here.
   * A number in this field before a phase that has data would be fabrication with a type signature.
   */
  dryingHoursDelta: null;
  /** true when the direction is a default rather than an observation about this block */
  isAssumption: boolean;
  basis: string;
};

const ZONE_MATRIX: Record<CanopyManagement, Record<CanopyZone, { direction: ZoneAdjustment["direction"]; basis: string }>> = {
  UNMANAGED_SPRAWL: {
    CLUSTER: { direction: "SLOWER", basis: "dense shoot mass shades and shelters the fruiting zone; poor air exchange" },
    FOLIAR: { direction: "SLOWER", basis: "overlapping leaf layers retain free water in the interior canopy" },
  },
  VSP: {
    CLUSTER: { direction: "NEUTRAL", basis: "vertical shoot positioning opens the canopy without exposing clusters directly" },
    FOLIAR: { direction: "NEUTRAL", basis: "the reference architecture most published models were developed against" },
  },
  VSP_LEAF_PULLED_FRUIT_ZONE: {
    CLUSTER: { direction: "FASTER", basis: "leaf removal in the fruiting zone exposes clusters to sun and airflow" },
    FOLIAR: {
      direction: "NEUTRAL",
      // The entire reason this modifier is two-zone.
      basis: "leaves are pulled in the FRUITING ZONE ONLY — the upper canopy stays dense and is unaffected",
    },
  },
  DIVIDED_CANOPY: {
    CLUSTER: { direction: "FASTER", basis: "split curtains increase exposure of both fruiting zones" },
    FOLIAR: { direction: "FASTER", basis: "reduced leaf-layer number per curtain improves drying" },
  },
  UNKNOWN: {
    CLUSTER: { direction: "NEUTRAL", basis: "no canopy-management state collected — NEUTRAL is an assumption, not an observation" },
    FOLIAR: { direction: "NEUTRAL", basis: "no canopy-management state collected — NEUTRAL is an assumption, not an observation" },
  },
};

export function zoneAdjustment(management: CanopyManagement, zone: CanopyZone): ZoneAdjustment {
  const cell = ZONE_MATRIX[management][zone];
  return {
    zone,
    management,
    direction: cell.direction,
    dryingHoursDelta: null,
    isAssumption: management === "UNKNOWN",
    basis: cell.basis,
  };
}

/**
 * Which canopy zone each pathogen model reads. S0 declares it so S5b inherits a specification rather
 * than a gap; S5b owns the final assignment when it encodes the models properly.
 *
 * ⚠️ Note for S4's lane: brief §17.2's block profile carries *cluster compactness* and *canopy
 * vigor* but NO CANOPY-MANAGEMENT STATE AT ALL. Everything above is unusable until S4 collects it,
 * which is why Unit 6 turns this into a named collection requirement rather than a note.
 */
export const PATHOGEN_ZONE: Readonly<Record<string, { zone: CanopyZone | "BOTH"; why: string }>> = {
  downy_mildew: { zone: "FOLIAR", why: "attacks foliage and growing tips in the upper canopy" },
  botrytis: { zone: "CLUSTER", why: "targets clusters in the fruiting zone" },
  black_rot: { zone: "BOTH", why: "leaf lesions produce the inoculum; the economic damage is on fruit" },
  phomopsis: { zone: "BOTH", why: "cane and leaf infection have separate published thresholds (Erincik et al.)" },
  anthracnose: { zone: "BOTH", why: "shoots, leaves and berries are all susceptible" },
  powdery_mildew: {
    zone: "FOLIAR",
    why: "secondary spread is temperature-driven on foliage; liquid water SUPPRESSES conidia, so a wetness-blind model recommends sprays into conditions already suppressing the pathogen",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// The series shape Unit 5 consumes
// ─────────────────────────────────────────────────────────────────────────────

export type SeriesResult = {
  cart: Verdict[];
  fallback: Verdict[];
};

export function estimateSeries(hours: readonly HourInput[]): SeriesResult {
  return { cart: hours.map(cart), fallback: hours.map(rh90Fallback) };
}

/** Convenience for the reports: counts by state, per estimator. */
export function tally(verdicts: readonly Verdict[]) {
  let wet = 0;
  let dry = 0;
  let refusedMissing = 0;
  let refusedQc = 0;
  let byPrecip = 0;
  let partial = 0;
  for (const v of verdicts) {
    if (v.state === "WET") {
      wet++;
      if (v.decidedBy === "PRECIPITATION") byPrecip++;
      if (v.determinedUnderPartialInputs) partial++;
    } else if (v.state === "DRY") {
      dry++;
      if (v.determinedUnderPartialInputs) partial++;
    } else if (v.state === "CANNOT_DETERMINE") {
      // Narrowed POSITIVELY on the discriminant. Falling through on `else` does not narrow here:
      // the WET/DRY member's `state` is itself a union (`"WET" | "DRY"`), so excluding both literals
      // leaves the member present with `state: never` rather than removing it, and `v.cause` stays
      // unreachable. Name the member you want.
      if (v.cause === "MISSING_INPUT") refusedMissing++;
      else refusedQc++;
    }
  }
  const total = verdicts.length;
  return {
    total,
    wet,
    dry,
    refusedMissing,
    refusedQc,
    refused: refusedMissing + refusedQc,
    refusalRate: total ? (refusedMissing + refusedQc) / total : 0,
    wetDecidedByPrecipitation: byPrecip,
    determinedUnderPartialInputs: partial,
  };
}
