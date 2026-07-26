/**
 * Vineyard Intelligence P4 — NRCS Soil Data Access endpoint + allowlist.
 *
 * Security posture mirrors `src/lib/gis/satellite/config.ts`: the host is a HARDCODED HTTPS constant,
 * never derived from a request. SDA is public/keyless — there is no secret, no env var. The client only
 * ever POSTs to `SDA_URL`, so SSRF is structurally impossible; `isAllowedSdaUrl` exists as a belt-and-
 * suspenders assertion and to make the allowlist reviewable/testable.
 */

/** The ONLY host this module ever talks to. */
export const SDA_HOST = "https://sdmdataaccess.nrcs.usda.gov";

/** The tabular POST endpoint (returns JSON or an XML ServiceException body on error — see the client). */
export const SDA_URL = `${SDA_HOST}/Tabular/post.rest`;

/** Explicit timeout — SDA is a government service with no SLA; a stall must fall back to the last snapshot. */
export const SDA_TIMEOUT_MS = 20_000;

/** True only for the exact SDA endpoint over HTTPS. Anything else is refused. */
export function isAllowedSdaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.host === "sdmdataaccess.nrcs.usda.gov";
  } catch {
    return false;
  }
}
