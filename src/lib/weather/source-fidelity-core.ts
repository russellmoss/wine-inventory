// SOURCE FIDELITY — does the primary series actually describe THIS vineyard?
//
// The failure this exists to stop (docs/analysis/bhutan-nasa-power-elevation-bias.md): a ~50 km grid
// product reports the temperature of its cell's MEAN elevation. At the Bhutan vineyards NASA POWER's
// cell sits 1.0–1.8 km above the site, so the series ran 4.8–9.7 °C cold — and the grower was shown
// Winkler **Region I at a site that is Region V**, Jones group "Too cool" at a subtropical valley, and
// a list of spring frost events on nights that were actually ~12 °C. None of those outputs looked
// broken. They looked like confident answers.
//
// The rule being applied is §3.6 — *a coverage gap must never render as a confident value* — plus
// §3.4/§3.5 (confidence sits beside the number; the estimator is named). A raw daily series that is
// off by a known constant is still useful for shape, trend and relative comparison. What is NOT
// recoverable is a HARD-BOUNDARY CLASSIFICATION: Winkler regions are ~278 °C-days wide and a growing
// season is ~214 days, so a 1 °C mean error moves the total by ~214 °C-days — roughly three-quarters
// of a whole class. There is no "approximately right" region label. So the classification refuses
// while the series itself keeps rendering, labelled.
//
// Deliberately NOT symmetric with "unknown": a provider that does not publish its cell elevation
// (gridMET, ACIS, Daymet) yields `UNKNOWN`, and UNKNOWN still classifies. Refusing everything we
// cannot measure would black out every US site to no benefit — the guard bites exactly where we have
// evidence of a mismatch, and says so when it doesn't. Pure; no Prisma, no React.

/** Standard environmental lapse rate. Only used to EXPLAIN a delta in prose, never to correct data. */
export const LAPSE_RATE_C_PER_M = 0.0065;

/**
 * Above this |Δz| the temperature-derived CLASSIFICATIONS refuse. 300 m ≈ 2 °C at the standard lapse
 * rate ≈ 0.7 of a full Winkler class — i.e. already enough to move the label, which is the whole
 * point. Measured deltas at the live sites: Bhutan valley floors 1,022–1,809 m (refuse), Ser Bhum /
 * Yusipang 265–319 m (one refuses, one warns), US Demo sites 112–482 m on a source that is not their
 * primary. After the ERA5-archive switch the downscale target IS the site, so Δz ≈ 0 and nothing refuses.
 */
export const CLASSIFICATION_REFUSE_DELTA_M = 300;

/** Below this the source is treated as describing the site; between the two we render a caveat. */
export const DEGRADED_DELTA_M = 100;

export type FidelityBand = "OK" | "DEGRADED" | "UNUSABLE" | "UNKNOWN";

export interface SourceFidelity {
  /** The vineyard's own elevation (m), as resolved by the elevation chain. */
  siteElevationM: number | null;
  /** The elevation the primary series actually describes (m) — the provider's own report. */
  sourceElevationM: number | null;
  /** source − site. Positive = the source describes a point ABOVE the vineyard (so it reads cold). */
  deltaM: number | null;
  band: FidelityBand;
  /** False → Winkler region and Jones group must NOT be rendered as labels (§3.6). */
  classificationAllowed: boolean;
  /** Magnitude of the temperature error the delta implies at the standard lapse rate. Explanatory only. */
  impliedTempErrorC: number | null;
  /** One grower-facing sentence, or null when there is nothing to say. Never blames the grower. */
  reason: string | null;
}

const round = (n: number, p = 1) => Math.round(n * 10 ** p) / 10 ** p;

/**
 * Classify how faithfully a primary series describes a site. Both inputs come from provenance the
 * provider itself published — this never guesses an elevation.
 */
export function assessSourceFidelity(input: {
  siteElevationM: number | null | undefined;
  sourceElevationM: number | null | undefined;
  /** Provider key, for the prose. */
  providerKey?: string | null;
}): SourceFidelity {
  const site = typeof input.siteElevationM === "number" && Number.isFinite(input.siteElevationM) ? input.siteElevationM : null;
  const source =
    typeof input.sourceElevationM === "number" && Number.isFinite(input.sourceElevationM) ? input.sourceElevationM : null;

  if (site === null || source === null) {
    return {
      siteElevationM: site,
      sourceElevationM: source,
      deltaM: null,
      band: "UNKNOWN",
      classificationAllowed: true, // see header — unknown is not evidence of a mismatch.
      impliedTempErrorC: null,
      reason: null,
    };
  }

  const deltaM = round(source - site, 0);
  const abs = Math.abs(deltaM);
  const impliedTempErrorC = round(abs * LAPSE_RATE_C_PER_M, 1);
  const direction = deltaM > 0 ? "above" : "below";
  // A source above the site reads COLD; below the site reads WARM.
  const readsAs = deltaM > 0 ? "too cold" : "too warm";

  if (abs > CLASSIFICATION_REFUSE_DELTA_M) {
    return {
      siteElevationM: site,
      sourceElevationM: source,
      deltaM,
      band: "UNUSABLE",
      classificationAllowed: false,
      impliedTempErrorC,
      reason:
        `The weather source for this site describes a point ${Math.abs(deltaM)} m ${direction} the vineyard ` +
        `(${Math.round(source)} m vs ${Math.round(site)} m), so its temperatures read about ${impliedTempErrorC} °C ` +
        `${readsAs}. Season totals and climate classifications are not reliable here and are withheld.`,
    };
  }

  if (abs > DEGRADED_DELTA_M) {
    return {
      siteElevationM: site,
      sourceElevationM: source,
      deltaM,
      band: "DEGRADED",
      classificationAllowed: true,
      impliedTempErrorC,
      reason:
        `The weather source describes a point ${Math.abs(deltaM)} m ${direction} the vineyard, which can shift ` +
        `temperatures by roughly ${impliedTempErrorC} °C. Treat class boundaries as approximate.`,
    };
  }

  return {
    siteElevationM: site,
    sourceElevationM: source,
    deltaM,
    band: "OK",
    classificationAllowed: true,
    impliedTempErrorC,
    reason: null,
  };
}

/**
 * Gap-fill eligibility. `nasa_power` is the uncorrected coarse grid; whenever the elevation-corrected
 * archive is present for the same vineyard, filling gaps from POWER would reintroduce the very bias
 * the archive exists to remove — into a number the card labels merely "derived". Excluded outright.
 */
export function gapFillCandidates(available: readonly string[], primary: string): string[] {
  const ORDER = ["gridmet", "open_meteo_archive", "daymet", "nasa_power"];
  const hasCorrectedGlobal = available.includes("open_meteo_archive");
  return ORDER.filter(
    (k) => k !== primary && available.includes(k) && !(k === "nasa_power" && hasCorrectedGlobal),
  );
}
