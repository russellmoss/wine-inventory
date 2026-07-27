/**
 * S0 spike — the five fixture sites, shared by Units 0, 2, 3 and 5.
 *
 * Four are real rows in the live database (coordinates, timezone and elevation copied here so the
 * probe scripts never need a DB connection or a tenant context). The fifth is fixture-only: a humid
 * subtropical Southeast site the first plan draft was missing (council G6 — the most aggressive US
 * disease environment, where extreme nighttime humidity plus high heat breaks simplistic dew-point
 * estimators).
 *
 * Bhutan discipline (plan §Unit 3): Paro is coordinates and a timezone ONLY. Nothing is read from or
 * written to `org_bhutan_wine_co` by any S0 script. The fixture is a flat file.
 *
 * NOTE ON `elevationM`: `VineyardDetail.elevationM` and `VineyardWeatherConfig.siteElevationM`
 * disagree for Paro (2225.04 vs 2302). The weather config's value is the USGS/OM-resolved site
 * elevation the forecast adapters already downscale against, so that is the one used here — S0 must
 * match what production would do, not average the two.
 */

export type SeriesRegime =
  | "humid_continental_east"
  | "coastal_fog"
  | "hot_arid_interior"
  | "monsoon_high_altitude"
  | "humid_subtropical_southeast";

export type S0Site = {
  /** stable slug used in filenames, JSON keys and report tables */
  key: string;
  name: string;
  /** the live tenant this site belongs to, or null when the site is fixture-only */
  tenantId: string | null;
  /** live vineyard row id, or null when fixture-only. Never used to WRITE. */
  vineyardId: string | null;
  lat: number;
  lon: number;
  elevationM: number;
  /** IANA zone — load-bearing for CART's dew-eligible night window (Unit 4) */
  timeZone: string;
  regime: SeriesRegime;
  /** true when NWS covers the point (US only). Paro is the jurisdiction-neutrality case (rule §3.9). */
  nwsCovered: boolean;
  /** why the site earns a slot — quoted into the reports so the set is never silently re-cut */
  rationale: string;
};

export const S0_SITES: readonly S0Site[] = [
  {
    key: "stoney_hill",
    name: "Stoney Hill",
    tenantId: "org_demo_winery",
    vineyardId: "cms1d1g8g0000l8044j3sgkdp",
    lat: 40.328822,
    lon: -75.007183,
    elevationM: 75.78,
    timeZone: "America/New_York",
    regime: "humid_continental_east",
    nwsCovered: true,
    rationale:
      "Black rot, downy, phomopsis and anthracnose country. Has a measuring station ~8 km away (KDYL) with RH — an Arm B site.",
  },
  {
    key: "russian_river",
    name: "Russian River Ranch",
    tenantId: "org_demo_winery",
    vineyardId: "cmr3hr8po0003d1182qglhq17",
    lat: 38.5058,
    lon: -122.8536,
    elevationM: 18.1,
    timeZone: "America/Los_Angeles",
    regime: "coastal_fog",
    nwsCovered: true,
    rationale:
      "Marine-layer dew without rain — the regime where rain-driven intuition fails hardest.",
  },
  {
    key: "madera",
    name: "Madera",
    tenantId: "org_demo_winery",
    vineyardId: "cmrs9x4a30000l804qljnnulm",
    lat: 36.857887,
    lon: -119.99701,
    elevationM: 82.41,
    timeZone: "America/Los_Angeles",
    regime: "hot_arid_interior",
    nwsCovered: true,
    rationale:
      "RH rarely reaches 90%, so the fallback reports 'never wet' all season while CART may still find radiative-dew nights. The refusal threshold's proving ground.",
  },
  {
    key: "paro",
    name: "Paro",
    tenantId: "org_bhutan_wine_co",
    vineyardId: "cmqjgpdvb0002l804u7y6om99",
    lat: 27.396872,
    lon: 89.421769,
    elevationM: 2302,
    timeZone: "Asia/Thimphu",
    regime: "monsoon_high_altitude",
    nwsCovered: false,
    rationale:
      "Non-US, no NWS coverage, reanalysis only. Proves runbook rule §3.9's jurisdiction-neutrality on a live tenant's real geography. READ-ONLY: coordinates and timezone, nothing else.",
  },
  {
    key: "monticello_va",
    name: "Monticello AVA (Virginia) — fixture only",
    tenantId: null,
    vineyardId: null,
    lat: 38.02,
    lon: -78.48,
    elevationM: 180,
    timeZone: "America/New_York",
    regime: "humid_subtropical_southeast",
    nwsCovered: true,
    rationale:
      "Council G6 — the most aggressive US disease environment: extreme nighttime humidity plus high heat, which breaks simplistic dew-point estimators. Absent from the plan's first draft. KCHO sits ~10 km away, so this is a candidate SECOND Arm B site.",
  },
] as const;

export const SITE_BY_KEY: Readonly<Record<string, S0Site>> = Object.fromEntries(
  S0_SITES.map((s) => [s.key, s]),
);

/** 2021–2025, the five seasons Unit 3 harvests. Council G5: one season guarantees blind spots. */
export const S0_SEASONS = [2021, 2022, 2023, 2024, 2025] as const;
export type S0Season = (typeof S0_SEASONS)[number];

/**
 * Northern-hemisphere growing season, used ONLY to bound the archive fetch window.
 *
 * Deliberately NOT a phenological season definition: S4's council review established that a
 * hard-coded NH Apr 1 – Oct 31 window silently truncates Bhutan, and that GDD must anchor to the
 * BUD_BREAK biofix rather than the calendar. S0 has no phenology, so it fetches a WIDE calendar
 * window per site and lets the estimator run over all of it. For Paro the window is widened to cover
 * the monsoon, which runs later than the NH temperate season.
 */
export function seasonWindow(site: S0Site, year: number): { start: string; end: string } {
  // Paro's monsoon peaks Jun–Sep and its season runs later; widen rather than truncate.
  const wide = site.regime === "monsoon_high_altitude";
  return {
    start: `${year}-${wide ? "03" : "04"}-01`,
    end: `${year}-${wide ? "11" : "10"}-31`,
  };
}

/** Politeness delay between provider calls. The archive is free; do not hammer it. */
export const POLITE_MS = 1_200;

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * S0 probes use plain `fetch` from `scripts/`, NOT the SSRF-guarded edge in
 * `src/lib/weather/providers/fetch-util.ts` — that guard's host allowlist is a Record keyed by an
 * exhaustive `WeatherSourceKey` union, so adding a probe host would require editing two files under
 * `src/`, which this lane must not touch (plan §2 "Lane boundary"). Acceptable here because these
 * are throwaway measurement scripts on no production path.
 *
 * >>> S1 OWNS wiring every RETAINED provider through the guarded edge and the allowlist. <<<
 * That is a named S1 requirement, not an oversight.
 */
export const UA = "Cellarhand-S0-Spike/1.0 (russellmoss87@gmail.com)";

/** Open-Meteo is CC BY 4.0 and the attribution must appear in every output document (design §6). */
export const OPEN_METEO_ATTRIBUTION =
  "Weather data by Open-Meteo.com (CC BY 4.0). ERA5/ERA5-Land © Copernicus Climate Change Service.";

export type FetchOutcome<T> =
  | { ok: true; status: number; body: T; url: string; ms: number }
  | { ok: false; status: number; error: string; url: string; ms: number; coverageSignal: boolean };

/**
 * A 404 is a COVERAGE SIGNAL and is never retried (design §6, and the plan-096 lesson that a
 * retried 404 burns the request budget without ever succeeding).
 *
 * A **429 is the opposite** and must be retried with backoff. Learned the hard way in Unit 0's first
 * run: an IEM depth probe at 2005 came back 429 "slow down", and a naive reading would have recorded
 * *"no data before 2015"* — a fabricated absence that would have understated the backfill archive's
 * depth by a decade and weakened the retention decision. **Rate-limited is not empty.** Any S0 probe
 * that treats a 429 as a negative result is producing evidence that is worse than none.
 */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

async function probeRaw(
  url: string,
  init: { headers?: Record<string, string>; timeoutMs?: number; accept?: string } = {},
): Promise<{ ok: boolean; status: number; text: string; ms: number; attempts: number }> {
  const started = Date.now();
  let attempt = 0;
  // 3 tries, 5s → 15s → 45s. Politeness, not aggression: the archives are free.
  for (;;) {
    attempt++;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), init.timeoutMs ?? 120_000);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          ...(init.accept ? { Accept: init.accept } : {}),
          ...(init.headers ?? {}),
        },
        signal: ctl.signal,
      });
      const text = await res.text().catch(() => "");
      if (!res.ok && RETRYABLE.has(res.status) && attempt < 3) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5_000 * 3 ** (attempt - 1);
        console.log(`      ↻ HTTP ${res.status} on attempt ${attempt}, backing off ${wait} ms (retryable, NOT an absence)`);
        clearTimeout(timer);
        await sleep(wait);
        continue;
      }
      return { ok: res.ok, status: res.status, text, ms: Date.now() - started, attempts: attempt };
    } catch (e) {
      if (attempt < 3) {
        const wait = 5_000 * 3 ** (attempt - 1);
        console.log(`      ↻ ${e instanceof Error ? e.message : String(e)} on attempt ${attempt}, backing off ${wait} ms`);
        clearTimeout(timer);
        await sleep(wait);
        continue;
      }
      return {
        ok: false,
        status: 0,
        text: e instanceof Error ? e.message : String(e),
        ms: Date.now() - started,
        attempts: attempt,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function probeJson<T = unknown>(
  url: string,
  init?: { headers?: Record<string, string>; timeoutMs?: number },
): Promise<FetchOutcome<T>> {
  const r = await probeRaw(url, { ...init, accept: "application/json", timeoutMs: init?.timeoutMs ?? 60_000 });
  if (!r.ok) {
    return { ok: false, status: r.status, error: r.text.slice(0, 300), url, ms: r.ms, coverageSignal: r.status === 404 };
  }
  try {
    return { ok: true, status: r.status, body: JSON.parse(r.text) as T, url, ms: r.ms };
  } catch (e) {
    return {
      ok: false,
      status: r.status,
      error: `unparseable JSON: ${e instanceof Error ? e.message : String(e)}`,
      url,
      ms: r.ms,
      coverageSignal: false,
    };
  }
}

export async function probeText(
  url: string,
  init?: { headers?: Record<string, string>; timeoutMs?: number },
): Promise<FetchOutcome<string>> {
  const r = await probeRaw(url, init);
  if (!r.ok) {
    return { ok: false, status: r.status, error: r.text.slice(0, 300), url, ms: r.ms, coverageSignal: r.status === 404 };
  }
  return { ok: true, status: r.status, body: r.text, url, ms: r.ms };
}

/** Great-circle distance in metres. */
export function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
