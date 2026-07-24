import "server-only";

/**
 * Vineyard Intelligence — satellite provider configuration.
 *
 * Mirrors `src/lib/voice/config.ts` in structure and `src/lib/accounting/qbo/config.ts` in security
 * posture: the origins below are HARDCODED HTTPS constants, never derived from a request header, so
 * egress is locked to three known hosts (runbook rule §2.12).
 *
 * Callers gate on `satelliteEnabled()` first and return a clean unavailable state; only then do they
 * reach `loadSatelliteConfig()`, which throws.
 */

/** The ONLY hosts these modules ever talk to. */
export const CDSE = {
  /** OAuth2 client-credentials token endpoint. */
  token: "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
  /**
   * Sentinel Hub Process API. `/process/v1` is the current path after CDSE's March 2026 migration;
   * the legacy `/api/v1/process` alias still resolves but is slated for deprecation.
   */
  process: "https://sh.dataspace.copernicus.eu/process/v1",
  /**
   * The STAC product catalogue — a DIFFERENT service from Sentinel Hub's own catalog, and the only
   * confirmed source of the ESA processing baseline (`processing:version`). The Process API does not
   * return it, and `inputMetadata.serviceVersion` is Sentinel Hub's service version, not the
   * baseline: recording that as provenance would be silently wrong.
   */
  stac: "https://stac.dataspace.copernicus.eu/v1",
} as const;

/** Hosts we accept for any outbound raster/asset fetch. Anything else is refused. */
export const ALLOWED_ORIGINS: readonly string[] = [
  "https://identity.dataspace.copernicus.eu",
  "https://sh.dataspace.copernicus.eu",
  "https://stac.dataspace.copernicus.eu",
];

/**
 * Attribution required by the Copernicus Sentinel data licence.
 *
 * NDVI is a derived product, so the "modified" form is the legally correct one. This rides along
 * every export and every map surface that displays an index (rule §2.8).
 */
export function copernicusAttribution(year: number): string {
  return `Contains modified Copernicus Sentinel data ${year}`;
}

/** Measured 2026-07-24: CDSE returns `expires_in` 1800 s. Read the response, never hardcode this. */
export const OBSERVED_TOKEN_TTL_S = 1800;

/** Refresh when less than this much life remains. 120 s is 6.7% of the observed 1800 s TTL. */
export const TOKEN_SKEW_MS = 120_000;

export type SatelliteConfig = {
  readonly clientId: string;
  readonly clientSecret: string;
};

/** PURE: is the satellite adapter configured? Gate on this before reaching `loadSatelliteConfig`. */
export function satelliteEnabled(): boolean {
  return Boolean(process.env.CDSE_CLIENT_ID) && Boolean(process.env.CDSE_CLIENT_SECRET);
}

/**
 * Fail-closed config load. THROWS when unconfigured, by design: a caller that reaches here without
 * gating on `satelliteEnabled()` has a bug, and a silent empty-credential request would fail later
 * and less legibly.
 */
export function loadSatelliteConfig(): SatelliteConfig {
  const clientId = process.env.CDSE_CLIENT_ID;
  const clientSecret = process.env.CDSE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("CDSE_CLIENT_ID / CDSE_CLIENT_SECRET are not set.");
  }
  return { clientId, clientSecret };
}

/** PURE: is this URL on the allowlist? Used for any URL that arrives IN a provider response. */
export function isAllowedOrigin(url: string): boolean {
  try {
    const u = new URL(url);
    return ALLOWED_ORIGINS.includes(u.origin);
  } catch {
    return false;
  }
}
