import "server-only";

/**
 * Vineyard Intelligence — CDSE Process API client.
 *
 * Follows the house provider shape (`src/lib/commerce/commerce7/client.ts`): dependency-injected
 * fetch, `redirect: "error"` on every call, a pure exported `classifyFault`, retry only on
 * rate-limit/transient with full-jitter backoff honouring `Retry-After`, and no credential, token or
 * farm geometry in any log line (rule §2.12).
 */
import { CDSE, loadSatelliteConfig } from "./config";
import { getAccessToken, type TokenDeps } from "./token";
import { utmBboxFor } from "../projection";

export type FaultKind = "auth" | "not_found" | "rate_limit" | "transient" | "validation" | "quota" | "unknown";

export class SatelliteFault extends Error {
  readonly kind: FaultKind;
  readonly status: number;
  constructor(kind: FaultKind, status: number, message: string) {
    super(message);
    this.name = "SatelliteFault";
    this.kind = kind;
    this.status = status;
  }
}

/** PURE: map an HTTP status onto a fault kind. Exported so it is unit-testable in isolation. */
export function classifyFault(status: number): FaultKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit";
  if (status === 400 || status === 422) return "validation";
  // CDSE returns 402 when the processing-unit allowance is exhausted. Distinct from a rate limit:
  // retrying does not help, and the operator needs to know it was quota rather than throttling.
  if (status === 402) return "quota";
  if (status >= 500) return "transient";
  return "unknown";
}

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 500;
const BACKOFF_CAP_MS = 8000;

/** PURE: full-jitter exponential backoff. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(BACKOFF_CAP_MS, BASE_BACKOFF_MS * 2 ** attempt);
  return Math.floor(random() * ceiling);
}

export type ClientDeps = TokenDeps & {
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
};

/**
 * The evalscript.
 *
 * `units` is an ARRAY parallel to `bands`, and that shape is mandatory rather than stylistic:
 *
 *   - B04/B08 in **REFLECTANCE**. This is THE baseline guard: Sentinel Hub applies the
 *     BOA_ADD_OFFSET itself in these units, regardless of `harmonizeValues`. Runbook rule §2.13
 *     names the flag as the mechanism; that is wrong, and P0 corrected it (see Unit 15).
 *   - SCL in **DN**. SCL is a CLASSIFICATION band and CDSE rejects the request outright otherwise:
 *       "Band 'SCL' of collection 'S2L2A' requested in unsupported units 'REFLECTANCE'!
 *        Supported units for this band: DN."
 *     Found by the live round-trip, not by reading. A single blanket `units: "REFLECTANCE"` for all
 *     three bands looks tidier and is a hard 400.
 *
 * Two separate input OBJECTS with different units is the obvious next guess and is ALSO wrong:
 * Sentinel Hub maps each input object to a datasource, so it answers
 * "Dataset with id: 1 not found." when only one entry exists in `input.data[]`. The parallel-array
 * form keeps both unit systems inside a single datasource, which is what we actually want.
 *
 * One FLOAT32 output with three bands rather than two response objects: it avoids the multipart TAR
 * path and keeps the processing-unit cost identical.
 */
export const NDVI_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL"], units: ["REFLECTANCE", "REFLECTANCE", "DN"] }],
    output: { bands: 3, sampleType: "FLOAT32" }
  };
}
function evaluatePixel(s) {
  return [s.B04, s.B08, s.SCL];
}`;

export type ProcessRequest = {
  /** WGS84 bounding box `[minLon, minLat, maxLon, maxLat]`. */
  readonly bbox: readonly [number, number, number, number];
  readonly fromIso: string;
  readonly toIso: string;
  /** Output CRS as an OGC URI. Defaults to CRS84; pass a UTM URI to get a metric grid. */
  readonly outputCrs?: string;
  /** Native resolution in CRS units. 10 pins the Sentinel-2 B04/B08 grid. */
  readonly resolutionM?: number;
  readonly maxCloudCoveragePct?: number;
};

/**
 * PURE: build the Process API request body.
 *
 * Exported and pure precisely so the radiometric contract can be asserted by a test without a
 * network call. This is the single most important contract test in the phase: dropping
 * `units: "REFLECTANCE"` or flipping `harmonizeValues` to true silently corrupts cross-date NDVI by
 * up to −0.257 at vigorous canopy, and the failure would look like a real vineyard trend.
 */
export function buildProcessRequest(req: ProcessRequest): Record<string, unknown> {
  const res = req.resolutionM ?? 10;
  // `output.resx/resy` are in the units of the REQUESTED CRS. Under CRS84 that means DEGREES, and
  // CDSE rejects it: "Your request of 3504.23 meters per pixel exceeds the limit 1500.00". Pinning
  // Sentinel-2's native 10 m grid is only possible in a metric CRS, so the AOI's UTM zone is the
  // default and the bbox is projected into it. Correct by construction rather than by remembering.
  const utm = utmBboxFor(req.bbox);
  return {
    input: {
      bounds: {
        bbox: utm.bbox,
        properties: { crs: req.outputCrs ?? utm.crsUri },
      },
      data: [
        {
          type: "sentinel-2-l2a",
          dataFilter: {
            timeRange: { from: req.fromIso, to: req.toIso },
            ...(req.maxCloudCoveragePct === undefined ? {} : { maxCloudCoverage: req.maxCloudCoveragePct }),
          },
          processing: {
            // NEAREST is already the CDSE default for both. Pinned explicitly and recorded anyway:
            // SCL is a CLASS raster at 20 m, and bilinear/bicubic on a classifier produces values
            // that are not classes at all. Resampling happens BEFORE the evalscript runs, so by the
            // time we see SCL it is already on the output grid.
            upsampling: "NEAREST",
            downsampling: "NEAREST",
            // FALSE on purpose. In REFLECTANCE units this flag does NOT control offset
            // harmonisation; it only clamps negative reflectance to zero. Clamping is harmful: a
            // clamped B04 = 0 drives NDVI to a fabricated exactly-1.0. Negative reflectance over
            // deep shadow is real data and `ndvi.ts` handles it.
            harmonizeValues: false,
          },
        },
      ],
    },
    output: {
      resx: res,
      resy: res,
      responses: [{ identifier: "default", format: { type: "image/tiff" } }],
    },
    evalscript: NDVI_EVALSCRIPT,
  };
}

/** PURE: the CQL2-JSON STAC search body used to recover the processing baseline. */
export function buildStacSearchBody(req: {
  bbox: readonly [number, number, number, number];
  fromIso: string;
  toIso: string;
  maxCloudCoveragePct?: number;
}): Record<string, unknown> {
  return {
    collections: ["sentinel-2-l2a"],
    bbox: [...req.bbox],
    datetime: `${req.fromIso}/${req.toIso}`,
    limit: 20,
    ...(req.maxCloudCoveragePct === undefined
      ? {}
      : { query: { "eo:cloud_cover": { lte: req.maxCloudCoveragePct } } }),
  };
}

async function withRetry<T>(deps: ClientDeps, fn: () => Promise<T>): Promise<T> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = deps.random ?? Math.random;
  let last: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const retryable = e instanceof SatelliteFault && (e.kind === "rate_limit" || e.kind === "transient");
      if (!retryable || attempt === MAX_ATTEMPTS - 1) throw e;
      await sleep(backoffMs(attempt, random));
    }
  }
  throw last;
}

/** A provider Retry-After we will honour, capped so a hostile/garbled header cannot park a request. */
const RETRY_AFTER_CAP_MS = 30_000;

function retryAfterMs(res: Response): number | null {
  const h = res.headers.get("retry-after");
  if (!h) return null;
  const secs = Number(h);
  if (!Number.isFinite(secs) || secs < 0) return null;
  return Math.min(secs * 1000, RETRY_AFTER_CAP_MS);
}

/** Fetch a FLOAT32 GeoTIFF for the AOI. Returns raw bytes plus the PU cost header if present. */
export async function fetchProcessedScene(
  req: ProcessRequest,
  deps: ClientDeps = {},
): Promise<{ bytes: Uint8Array; processingUnits: number | null; contentType: string | null }> {
  loadSatelliteConfig(); // fail closed before doing anything
  const doFetch = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  return withRetry(deps, async () => {
    const token = await getAccessToken(deps);
    const res = await doFetch(CDSE.process, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "image/tiff",
      },
      body: JSON.stringify(buildProcessRequest(req)),
    });

    if (!res.ok) {
      const kind = classifyFault(res.status);
      if (kind === "rate_limit") {
        const wait = retryAfterMs(res);
        if (wait !== null) await sleep(wait);
      }
      // Include the provider's own message for VALIDATION failures only. A 400 from the Process API
      // describes a malformed request (bad CRS, resolution out of range) and is useless to debug
      // without it. The TOKEN endpoint is different — its body can echo credentials — so `token.ts`
      // deliberately never includes one. Different endpoints, different rules.
      let detail = "";
      if (kind === "validation" || kind === "not_found") {
        detail = await res.text().then((t) => ` — ${t.slice(0, 400)}`).catch(() => "");
      }
      throw new SatelliteFault(kind, res.status, `CDSE Process API returned HTTP ${res.status}${detail}`);
    }

    const puHeader = res.headers.get("x-processingunits-spent");
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      processingUnits: puHeader ? Number(puHeader) : null,
      contentType: res.headers.get("content-type"),
    };
  });
}

/**
 * Search the STAC catalogue for the scenes intersecting an AOI.
 *
 * Separate from the Process call because the ESA processing baseline is NOT available from the
 * Process API, and recording Sentinel Hub's `serviceVersion` in its place would be silently wrong.
 */
export async function searchStacScenes(
  req: { bbox: readonly [number, number, number, number]; fromIso: string; toIso: string; maxCloudCoveragePct?: number },
  deps: ClientDeps = {},
): Promise<{ id: string; datetime: string | null; processingVersion: string | null; cloudCover: number | null }[]> {
  const doFetch = deps.fetchImpl ?? fetch;
  return withRetry(deps, async () => {
    const res = await doFetch(`${CDSE.stac}/search`, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json", accept: "application/geo+json" },
      body: JSON.stringify(buildStacSearchBody(req)),
    });
    if (!res.ok) throw new SatelliteFault(classifyFault(res.status), res.status, `CDSE STAC returned HTTP ${res.status}`);
    const body = (await res.json()) as { features?: { id?: string; properties?: Record<string, unknown> }[] };
    return (body.features ?? []).map((f) => {
      const p = f.properties ?? {};
      return {
        id: String(f.id ?? ""),
        datetime: typeof p.datetime === "string" ? p.datetime : null,
        // The confirmed baseline field. Cross-check against the _N0511_ token in the SAFE product id.
        processingVersion:
          typeof p["processing:version"] === "string" ? (p["processing:version"] as string) : null,
        cloudCover: typeof p["eo:cloud_cover"] === "number" ? (p["eo:cloud_cover"] as number) : null,
      };
    });
  });
}

/** PURE: recover the processing baseline from a SAFE product id, e.g. `..._N0511_...` -> `05.11`. */
export function baselineFromProductId(id: string): string | null {
  const m = /_N(\d{2})(\d{2})_/.exec(id);
  return m ? `${m[1]}.${m[2]}` : null;
}
