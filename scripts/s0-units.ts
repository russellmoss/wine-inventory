/**
 * S0 — unit normalization, with assertions.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * Caught live while sizing the Unit 3 fetch: **Open-Meteo's archive returns `wind_speed_10m` in
 * km/h**, and CART's wind node is **2.5 m/s**. Feeding km/h into an m/s threshold makes essentially
 * every hour look windy (2.5 km/h is a dead calm), which collapses CART's level 2 and routes the
 * whole season through the RH node. The estimator would still run, still produce plausible-looking
 * wet-hour counts, and be wrong in a way no amount of staring at the output would reveal.
 *
 * Every provider in this spike reports wind differently:
 *
 *   Open-Meteo   km/h by default  (`wind_speed_unit=ms` forces m/s — we do both: force AND assert)
 *   NWS gridpoint`wmoUnit:km_h-1`
 *   NWS obs      `wmoUnit:m_s-1`
 *   IEM ASOS     knots (`sknt`)
 *   NCEI ISD     tenths of m/s, inside a comma-packed `WND` field
 *   NASA POWER   m/s — but at **2 m**, not 10 m. A different physical quantity, not a unit problem.
 *
 * Arm B compares three of those against each other. So conversion is not a detail here, it is the
 * measurement. Nothing in S0 reads a raw provider number directly; it goes through this module and
 * `assertUnit` fails loudly if a provider ever changes what it sends.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */

export class UnitMismatchError extends Error {
  constructor(what: string, expected: string, actual: string | null | undefined) {
    super(`unit mismatch for ${what}: expected "${expected}", provider sent "${actual ?? "(none)"}"`);
    this.name = "UnitMismatchError";
  }
}

/**
 * Fail loudly rather than convert on a guess. A silent unit change is the failure mode this whole
 * module exists to prevent, so a surprising unit is a crash, never a best-effort conversion.
 */
export function assertUnit(what: string, expected: string, actual: string | null | undefined): void {
  if (actual !== expected) throw new UnitMismatchError(what, expected, actual);
}

export const KMH_TO_MS = 1 / 3.6;
export const KNOTS_TO_MS = 0.514444;
export const MPH_TO_MS = 0.44704;

export const kmhToMs = (v: number) => v * KMH_TO_MS;
export const knotsToMs = (v: number) => v * KNOTS_TO_MS;
export const fahrenheitToC = (f: number) => ((f - 32) * 5) / 9;
export const inchesToMm = (i: number) => i * 25.4;

/**
 * Relative humidity from temperature and dew point, Magnus–Tetens.
 *
 * Needed because NCEI ISD carries `TMP` and `DEW` but has NO relative-humidity field. Unit 0 already
 * established the consequence and it is repeated here at the point of use: an RH computed by this
 * function is DERIVED, and comparing it against a provider's own derived RH tests arithmetic, not
 * measurement. Anything that calls this must carry the derivation into its report.
 */
export function rhFromTempDewC(tempC: number, dewPointC: number): number {
  const a = 17.625;
  const b = 243.04;
  const num = Math.exp((a * dewPointC) / (b + dewPointC));
  const den = Math.exp((a * tempC) / (b + tempC));
  return Math.max(0, Math.min(100, 100 * (num / den)));
}

/** Dew point from temperature and RH — the inverse, for providers that carry RH but no dew point. */
export function dewPointFromTempRhC(tempC: number, rhPct: number): number {
  const a = 17.625;
  const b = 243.04;
  const rh = Math.max(0.01, Math.min(100, rhPct));
  const g = Math.log(rh / 100) + (a * tempC) / (b + tempC);
  return (b * g) / (a - g);
}

/** The canonical internal units for every S0 script. Stated once so nothing has to remember. */
export const CANONICAL = {
  temperature: "°C",
  dewPoint: "°C",
  relativeHumidity: "%",
  windSpeed: "m/s at 10 m",
  precipitation: "mm/h",
  cloudCover: "%",
  shortwaveRadiation: "W/m²",
} as const;

/**
 * NASA POWER's `WS2M` is a 2 m wind. Converting it to a 10 m equivalent requires a wind profile and
 * a roughness assumption, and doing that silently would inject a systematic bias into exactly the
 * input council G2 already flagged as CART's weakest — at Paro, the one site with no alternative.
 *
 * So S0 does NOT convert it. It carries the measurement height as data and lets Unit 5 report
 * wind-sensitivity separately for that site. S1 decides whether to convert, with the conversion
 * named in the confidence band.
 */
export const WIND_MEASUREMENT_HEIGHT_M: Readonly<Record<string, number>> = {
  open_meteo: 10,
  nws_gridpoint: 10,
  nws_observation: 10,
  iem_asos: 10,
  ncei_isd: 10,
  nasa_power: 2,
};
