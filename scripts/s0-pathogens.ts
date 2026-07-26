/**
 * S0 Unit 5, LAYER 0 — THE FOUR REAL LWD CONSUMERS.
 *
 * PURE. Throwaway measurement probes, NOT the S5b implementations — though S5b should start from
 * them (plan §2, "Out of scope").
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS AT ALL
 *
 * Council G1 found that brief §7's pathogen table is materially incomplete against the pathology
 * literature, and the plan's instruction is explicit: **encode the published models rather than the
 * brief's transcriptions.** So these are sourced, and each carries its provenance in the type.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠️ AND HERE IS THE FINDING THAT MATTERS MORE THAN THE MODELS
 *
 * Going to the sources produced an ASYMMETRY that has to be carried into the gate rather than
 * flattened out of it. Two of the four consumers are encodable from published numbers. Two are not,
 * because the papers are paywalled and only their EXPERIMENTAL DESIGN is public:
 *
 *   black rot   PUBLISHED_TABLE      Spotts' temperature × wetness-hours table, in operational use
 *                                    and reproduced by multiple extension services.
 *   anthracnose PUBLISHED_THRESHOLD  3–4 h at 25–30 °C, range 2–40 °C. Consistent across sources.
 *   botrytis    COARSENED_RENDERING  Broome et al. 1995 IS an LWD × temperature model — the brief was
 *                                    wrong to call it "cool, damp conditions" — but its published
 *                                    equation's coefficients are not freely available. What is public
 *                                    is the tested grid (4/8/12/16/20 h) and the ~15 h at 15 °C
 *                                    anchor. Encoded as a threshold surface through those points.
 *   phomopsis   COARSENED_RENDERING  Erincik et al. 2003 gives a generalized Beta model. Public:
 *                                    tested at 5–35 °C and 5/10/15/20 h, optimum 16–20 °C, minimum
 *                                    and maximum ~5 and ~35.5 °C. The Beta coefficients are not.
 *                                    Encoded as a threshold surface through those points.
 *
 * **The plan's Risk table anticipated exactly this** — "the brief's pathogen table is wrong in ways we
 * have not yet found... anything else the brief asserts about disease weather should be treated as
 * unverified until checked." It is right, and the honest response is not to invent two sets of
 * coefficients that would look identical to real ones in the output.
 *
 * So `provenance` is a required field, Unit 5 reports the estimator effect PER CONSUMER, and the gate
 * is carried by the two `PUBLISHED_*` consumers with the two `COARSENED_RENDERING` ones reported as
 * sensitivity rather than as evidence. A conclusion resting on a model we half-guessed would be worse
 * than no conclusion, because it would be indistinguishable from one that rested on a real model.
 *
 * ⚠️ S5b REQUIREMENT, not a footnote: obtain Broome et al. 1995 (Phytopathology 85:97-102) and
 * Erincik et al. 2003 (Plant Disease 87:832-840) before implementing either model for real.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
import type { CanopyZone } from "./s0-lwd";

export type Provenance = "PUBLISHED_TABLE" | "PUBLISHED_THRESHOLD" | "COARSENED_RENDERING";

export type ConsumerModel = {
  key: string;
  name: string;
  pathogen: string;
  provenance: Provenance;
  citation: string;
  /** which canopy microclimate the model reads (council G3) */
  zone: CanopyZone | "BOTH";
  /** does N hours of wetness at mean temperature T constitute an infection event? */
  infects(meanTempC: number, wetHours: number): boolean;
  /** the minimum wetness hours required at this temperature, or null if infection is impossible */
  requiredHours(meanTempC: number): number | null;
  /** what makes this model's spec uncertain, if anything — printed next to every result it produces */
  uncertainty: string | null;
};

const F = (f: number) => ((f - 32) * 5) / 9;

// ─────────────────────────────────────────────────────────────────────────────
// 1. BLACK ROT — Guignardia bidwellii. PUBLISHED_TABLE.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Spotts (1977), "Effect of leaf wetness duration and temperature on the infectivity of Guignardia
 * bidwellii on grape leaves", Phytopathology 67:1378–1381, in the operational form reproduced by
 * Michigan State University Extension and used by NEWA-style warning systems.
 *
 * ⚠️ Note the SHAPE, which is what council G1 was objecting to. Brief §7 gave three points —
 * ~24 h @ 50 °F, ~9 h @ 60 °F, ~6 h @ 70–80 °F — and called it coarse. It is not coarse: it is a
 * continuous U-shaped curve in 5 °F steps with a minimum at 80 °F, and requirement RISES again above
 * it. A three-point reading loses both the 85/90 °F rise and the resolution between them.
 */
const BLACK_ROT_TABLE: Array<[tempF: number, hours: number]> = [
  [50, 24],
  [55, 12],
  [60, 9],
  [65, 8],
  [70, 7],
  [75, 7],
  [80, 6],
  [85, 9],
  [90, 12],
];

function interpolateTable(table: Array<[number, number]>, tempC: number): number | null {
  const tF = (tempC * 9) / 5 + 32;
  if (tF < table[0][0] || tF > table[table.length - 1][0]) return null; // outside the infection range
  for (let i = 1; i < table.length; i++) {
    const [t0, h0] = table[i - 1];
    const [t1, h1] = table[i];
    if (tF <= t1) {
      const f = (tF - t0) / (t1 - t0);
      return h0 + f * (h1 - h0);
    }
  }
  return null;
}

export const BLACK_ROT: ConsumerModel = {
  key: "black_rot",
  name: "Black rot",
  pathogen: "Guignardia bidwellii",
  provenance: "PUBLISHED_TABLE",
  citation:
    "Spotts 1977, Phytopathology 67:1378-1381, in the operational temperature × wetness-hours form reproduced by MSU Extension. Infection range 50-90 °F; minimum requirement 6 h at 80 °F; requirement rises again above 80 °F.",
  zone: "BOTH",
  uncertainty: null,
  requiredHours: (t) => interpolateTable(BLACK_ROT_TABLE, t),
  infects(t, w) {
    const r = this.requiredHours(t);
    return r != null && w >= r;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. ANTHRACNOSE — Elsinoe ampelina. PUBLISHED_THRESHOLD.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 3–4 h of wetness at 25–30 °C; spore development across roughly 2–40 °C; longer wetness widens the
 * temperature range. Consistent between brief §7 and the operational model specifications, which is
 * itself worth recording — it is the one consumer where the brief and the literature agree.
 */
export const ANTHRACNOSE: ConsumerModel = {
  key: "anthracnose",
  name: "Anthracnose",
  pathogen: "Elsinoe ampelina",
  provenance: "PUBLISHED_THRESHOLD",
  citation:
    "3-4 h wetness optimal at 25-30 °C; development range ~2-40 °C; longer wetness widens the temperature range. Agrees with brief §7 — the only consumer where it does.",
  zone: "BOTH",
  uncertainty: null,
  requiredHours(t) {
    if (t < 2 || t > 40) return null;
    if (t >= 25 && t <= 30) return 3.5;
    // "longer wetness widens the temperature range": requirement grows with distance from the optimum
    const d = t < 25 ? 25 - t : t - 30;
    return 3.5 + d * 0.9;
  },
  infects(t, w) {
    const r = this.requiredHours(t);
    return r != null && w >= r;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. BOTRYTIS — Botrytis cinerea. COARSENED_RENDERING.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ Brief §7 says "cool, damp conditions — no LWD". That is WRONG, and it is council G1's clearest
 * catch: Broome et al. (1995), "Development of an infection model for Botrytis bunch rot of grapes
 * based on wetness duration and temperature", Phytopathology 85:97–102, is EXPLICITLY an
 * LWD × temperature model. Botrytis is an LWD consumer, and S5b's scope grows accordingly.
 *
 * What is public: berries were incubated at 4, 8, 12, 16 and 20 h of wetness across a temperature
 * range, and the plan's own reading of the model puts roughly 15 h at 15 °C at high risk. The fitted
 * equation's coefficients are not freely available.
 *
 * So this is a threshold surface through the public anchors, NOT Broome's equation. It is used to
 * measure estimator SENSITIVITY, never to produce a botrytis risk number anybody acts on.
 */
export const BOTRYTIS: ConsumerModel = {
  key: "botrytis",
  name: "Botrytis bunch rot",
  pathogen: "Botrytis cinerea",
  provenance: "COARSENED_RENDERING",
  citation:
    "Broome et al. 1995, Phytopathology 85:97-102 — an LWD × temperature model, contra brief §7's 'cool, damp conditions, no LWD'. Public: wetness grid 4/8/12/16/20 h and a ~15 h at 15 °C high-risk anchor. The fitted coefficients are NOT public.",
  zone: "CLUSTER",
  uncertainty:
    "Threshold surface through the public anchors, not Broome's published equation. Sensitivity only — never a risk number anybody acts on. S5b must obtain the paper.",
  requiredHours(t) {
    // Botrytis infects across a wide band; requirement is lowest near the ~20 °C optimum and rises
    // steeply toward the cold end, which is the shape the public anchors describe.
    if (t < 1 || t > 30) return null;
    const optimum = 20;
    const atOptimum = 10;
    const d = Math.abs(t - optimum);
    return atOptimum + d * (t < optimum ? 0.55 : 0.9);
  },
  infects(t, w) {
    const r = this.requiredHours(t);
    return r != null && w >= r;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. PHOMOPSIS — Phomopsis viticola. COARSENED_RENDERING.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ Brief §7 gives "no numbers at all". Erincik et al. (2003), "Temperature and wetness-duration
 * requirements for grape leaf and cane infection by Phomopsis viticola", Plant Disease 87:832–840,
 * gives exact requirements — a generalized Beta model, validated against natural rain events with
 * r = 0.71–0.81.
 *
 * Public: incubated at 5, 10, 15, 20, 25, 30 and 35 °C, wetness 5, 10, 15 and 20 h; optimum 16–20 °C;
 * minimum and maximum ~5 and ~35.5 °C; severity increases with wetness at most temperatures. The Beta
 * coefficients are not public.
 *
 * Cane and leaf infection have SEPARATE published thresholds in the paper. This renders the leaf case
 * only, and that is another reason it cannot carry a gate.
 */
export const PHOMOPSIS: ConsumerModel = {
  key: "phomopsis",
  name: "Phomopsis cane and leaf spot",
  pathogen: "Phomopsis viticola",
  provenance: "COARSENED_RENDERING",
  citation:
    "Erincik et al. 2003, Plant Disease 87:832-840. Public: 5-35 °C × 5/10/15/20 h grid, optimum 16-20 °C, min/max ~5 and ~35.5 °C. The generalized Beta model's coefficients are NOT public, and cane vs leaf infection have separate thresholds — only the leaf case is rendered here.",
  zone: "BOTH",
  uncertainty:
    "Threshold surface through the public grid, not Erincik's Beta model, and leaf-only. Sensitivity only. S5b must obtain the paper and implement both the cane and the leaf case.",
  requiredHours(t) {
    if (t < 5 || t > 35.5) return null;
    const lo = 16;
    const hi = 20;
    const atOptimum = 6;
    if (t >= lo && t <= hi) return atOptimum;
    const d = t < lo ? lo - t : t - hi;
    return atOptimum + d * 0.8;
  },
  infects(t, w) {
    const r = this.requiredHours(t);
    return r != null && w >= r;
  },
};

export const CONSUMERS: readonly ConsumerModel[] = [BLACK_ROT, ANTHRACNOSE, BOTRYTIS, PHOMOPSIS];

/** The two that may carry the gate. See the header. */
export const GATE_CONSUMERS = CONSUMERS.filter((c) => c.provenance !== "COARSENED_RENDERING");
export const SENSITIVITY_CONSUMERS = CONSUMERS.filter((c) => c.provenance === "COARSENED_RENDERING");

// ─────────────────────────────────────────────────────────────────────────────
// The wetness-interruption rule (council G7)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "Standard models use a dry-period threshold of roughly 4–12 hours below the wetness threshold,
 * radiation-dependent. **Use the literature rule and cite it. Do not invent an interruption threshold
 * by observing when estimator outputs flip** — that is fitting pathology to a measurement artifact."
 *
 * So S0 does not pick one. It sweeps the whole published range as an explicit sensitivity dimension
 * and reports how much the answer moves across it. If the answer is stable across 4–12 h, the choice
 * does not matter and S5b can pick on other grounds. If it is not, that is a finding S5b needs.
 */
export const INTERRUPTION_THRESHOLDS_H = [4, 8, 12] as const;

// ─────────────────────────────────────────────────────────────────────────────

export type InfectionEvent = {
  consumer: string;
  startUtc: string;
  wetHours: number;
  meanTempC: number;
  requiredHours: number;
  containsRefusal: boolean;
};

/** Evaluate one consumer over a set of wet runs. A run whose temperature is unknown cannot infect. */
export function evaluateConsumer(
  consumer: ConsumerModel,
  runs: ReadonlyArray<{ startUtc: string; wetHours: number; meanTempC: number | null; containsRefusal: boolean }>,
): InfectionEvent[] {
  const out: InfectionEvent[] = [];
  for (const r of runs) {
    if (r.meanTempC == null) continue;
    const req = consumer.requiredHours(r.meanTempC);
    if (req == null) continue;
    if (r.wetHours >= req) {
      out.push({
        consumer: consumer.key,
        startUtc: r.startUtc,
        wetHours: r.wetHours,
        meanTempC: Number(r.meanTempC.toFixed(2)),
        requiredHours: Number(req.toFixed(2)),
        containsRefusal: r.containsRefusal,
      });
    }
  }
  return out;
}
