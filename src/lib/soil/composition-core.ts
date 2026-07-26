/**
 * Vineyard Intelligence P4 — the soil composition core. Turns parsed SDA rows into a coverage-correct,
 * per-map-unit component set. PURE: no DB, no network, no Date.
 *
 * Load-bearing rules (design + council):
 *  - COVERAGE RATIO is the invariant, never "shares sum to 100%" — `covered = Σ isect / block` (both
 *    square degrees, SAME engine → unitless, exact, no projection, no cos(lat)). Three branches at
 *    ε=0.005: >1+ε flag `over` (don't normalize away); within 1±ε normalize vs Σisect; <1−ε normalize
 *    vs BLOCK area and emit an explicit `uncovered` row (council C4).
 *  - ONE ROW PER MUKEY: property rows (component×component) are reduced to the major component's topmost
 *    pH / min restrictive depth here — the SDA property query must never be joined into the spatial clip
 *    or areas multiply (council C2).
 *  - NO BLENDED PROPERTIES: area % is the only aggregate. Each property is the NRCS-published value at a
 *    cited level (`*Basis`).
 *  - SHARE FLOOR (~1%): sub-floor slivers are MARKED `belowFloor` (UI groups them as "Other") but their
 *    mukey + properties STAY in the JSON (council C8) — nothing is dropped.
 *  - areaSqM = share × blockAreaSqM (a LOCAL geodesic block area passed in — never a cos(lat)-scaled SDA
 *    square-degree value, council C3).
 */
import type { SdaCompositionRow, SdaPropertyRow } from "./parse-sda-core";
import { classifyMapUnit, majorComponents } from "./classify-core";
import type { CoverageState, SoilComponent, SoilComposition } from "./schema";

export const COVERAGE_EPSILON = 0.005; // spike-calibrated: real geometry error measured ~0.003%
export const SHARE_FLOOR = 0.01; // ~1% — below this a unit is a boundary sliver (spike NEW-2)
export const AWC_UNIT_MM_0_25 = "mm (0–25 cm storage)";
const DRAINAGE_BASIS = "map-unit dominant condition";
const PH_BASIS = "topmost mineral horizon";

function coverageStateFor(rowCount: number, covered: number): CoverageState {
  if (rowCount === 0) return "none";
  if (covered > 1 + COVERAGE_EPSILON) return "over";
  if (covered < 1 - COVERAGE_EPSILON) return "partial";
  return "covered";
}

/** The one property value we keep per map unit: its major component's cited pH / restrictive depth. */
function propertiesFor(comps: SdaPropertyRow[]): Pick<SoilComponent, "comppct" | "ph" | "phBasis" | "restrictiveDepthCm"> {
  const majors = majorComponents(comps);
  if (majors.length === 0) return { comppct: null, ph: null, phBasis: null, restrictiveDepthCm: null };
  // The dominant major component (highest percent) carries the headline property card.
  const dom = majors.reduce((a, b) => ((b.comppct ?? 0) > (a.comppct ?? 0) ? b : a));
  return {
    comppct: dom.comppct,
    ph: dom.phTop,
    phBasis: dom.phTop == null ? null : PH_BASIS,
    restrictiveDepthCm: dom.resdept,
  };
}

/**
 * Build a soil composition. `blockAreaSqM` is the block's LOCAL geodesic area (design §Storage areaSqM).
 * `properties` is grouped by mukey by the caller-agnostic reducer here.
 */
export function computeSoilComposition(input: {
  composition: SdaCompositionRow[];
  properties: SdaPropertyRow[];
  blockAreaSqM: number;
}): SoilComposition {
  const { composition, properties, blockAreaSqM } = input;

  const propsByMukey = new Map<string, SdaPropertyRow[]>();
  for (const p of properties) {
    const list = propsByMukey.get(p.mukey) ?? [];
    list.push(p);
    propsByMukey.set(p.mukey, list);
  }

  const isectSum = composition.reduce((s, r) => s + r.isectSqDeg, 0);
  const blockSqDeg = composition[0]?.blockSqDeg ?? 0;
  const covered = blockSqDeg > 0 ? isectSum / blockSqDeg : 0;
  const state = coverageStateFor(composition.length, covered);

  // Denominator: partial coverage normalizes against the BLOCK (shares sum to <1, uncovered explicit);
  // covered/over normalize against Σisect (shares sum to 1; `over` still flagged by state).
  const denom = state === "partial" ? blockSqDeg : isectSum;

  const surveyAreaSymbol = composition.find((r) => r.surveyAreaSymbol)?.surveyAreaSymbol ?? null;
  const surveyAreaVersion = composition.find((r) => r.surveyAreaVersion)?.surveyAreaVersion ?? null;

  const components: SoilComponent[] = composition.map((r) => {
    const share = denom > 0 ? r.isectSqDeg / denom : 0;
    const comps = propsByMukey.get(r.mukey) ?? [];
    const klass = classifyMapUnit(r.muname, comps);
    const props = propertiesFor(comps);
    const isSoil = klass === "soil" || klass === "mixed";
    return {
      mukey: r.mukey,
      muname: r.muname,
      class: klass,
      areaPct: share,
      areaSqM: share * blockAreaSqM,
      comppct: props.comppct,
      // Drainage/AWC only carry meaning for soils; non-soil units leave them null.
      drainageClass: isSoil ? r.drclassdcd : null,
      drainageBasis: isSoil && r.drclassdcd ? DRAINAGE_BASIS : null,
      awc: isSoil ? r.aws025wta : null,
      awcUnit: isSoil && r.aws025wta != null ? AWC_UNIT_MM_0_25 : null,
      ph: isSoil ? props.ph : null,
      phBasis: isSoil ? props.phBasis : null,
      restrictiveDepthCm: isSoil ? props.restrictiveDepthCm : null,
      belowFloor: share < SHARE_FLOOR,
    };
  });

  // Largest share first; the synthetic uncovered row (added below) sorts by its own share too.
  components.sort((a, b) => b.areaPct - a.areaPct);

  if (state === "partial") {
    const uncoveredShare = Math.max(0, 1 - covered);
    components.push({
      mukey: "UNCOVERED",
      muname: "Uncovered area",
      class: "uncovered",
      areaPct: uncoveredShare,
      areaSqM: uncoveredShare * blockAreaSqM,
      comppct: null,
      drainageClass: null,
      drainageBasis: null,
      awc: null,
      awcUnit: null,
      ph: null,
      phBasis: null,
      restrictiveDepthCm: null,
      belowFloor: false,
    });
  }

  return { coveredPct: covered, coverageState: state, components, surveyAreaSymbol, surveyAreaVersion };
}
