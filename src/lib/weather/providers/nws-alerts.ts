// Plan 096 Phase 3 Unit 22 — official NWS active alerts (US only). Rendered VERBATIM — never
// paraphrased, never re-thresholded: these are authoritative, named products (Frost Advisory,
// Freeze Warning, Excessive Heat Warning) and the UI keeps them visually distinct from Cellarhand's
// computed badges (no suppression in either direction — Gemini DQ3 adjudicated: two labeled
// instruments, not a contradiction). Fetched alongside the 6-hourly forecast refresh and PERSISTED
// to config.activeAlertsJson (council C4) so the banner renders between refreshes.
// Live-verified: `ends` can be null → fall back to `expires`; multiple simultaneous alerts are
// real → keep ALL, severity-desc (Codex DQ2).

import { fetchJsonRetry, type JsonFetcher } from "./fetch-util";
import { ProviderFetchError } from "./types";

/** The persisted banner shape (bounded; stored as config.activeAlertsJson). */
export interface NwsActiveAlert {
  event: string; // "Freeze Warning" — the official product name
  headline: string | null; // rendered verbatim
  severity: string | null; // Extreme | Severe | Moderate | Minor | Unknown
  endsAt: string | null; // ends ?? expires (ISO)
  url: string | null; // the alert product page
}

const SEVERITY_RANK: Record<string, number> = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };

interface AlertFeature {
  id?: string;
  properties?: {
    event?: string;
    headline?: string | null;
    severity?: string | null;
    ends?: string | null;
    expires?: string | null;
    [k: string]: unknown;
  };
}

/** Pure: normalize an /alerts/active response — keep ALL, severity-desc, ends??expires. */
export function parseNwsActiveAlerts(json: unknown): NwsActiveAlert[] {
  const features = ((json as { features?: AlertFeature[] })?.features ?? []).filter((f) => f?.properties?.event);
  return features
    .map((f) => ({
      event: f.properties!.event!,
      headline: f.properties!.headline ?? null,
      severity: f.properties!.severity ?? null,
      endsAt: f.properties!.ends ?? f.properties!.expires ?? null, // live-verified nullable `ends`
      url: f.id ?? null,
    }))
    .sort((a, b) => (SEVERITY_RANK[a.severity ?? "Unknown"] ?? 9) - (SEVERITY_RANK[b.severity ?? "Unknown"] ?? 9))
    .slice(0, 10); // bounded storage — ten simultaneous products is already an apocalypse
}

/** Fetch active official alerts for a point. US only; non-fatal (a banner is enrich, not data). */
export async function fetchNwsActiveAlerts(lat: number, lon: number, deps: { fetch?: JsonFetcher } = {}): Promise<NwsActiveAlert[]> {
  const f = deps.fetch ?? fetchJsonRetry; // U24 retry on transient faults
  try {
    const json = await f("nws", `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`);
    return parseNwsActiveAlerts(json);
  } catch (e) {
    if (e instanceof ProviderFetchError) return [];
    throw e;
  }
}
