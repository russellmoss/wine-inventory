import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  classifyFault,
  backoffMs,
  buildProcessRequest,
  buildStacSearchBody,
  baselineFromProductId,
  fetchProcessedScene,
  searchStacScenes,
  SatelliteFault,
  NDVI_EVALSCRIPT,
} from "@/lib/gis/satellite/client";
import {
  getAccessToken,
  _clearTokenCache,
  _seedTokenCache,
  SatelliteAuthError,
} from "@/lib/gis/satellite/token";
import {
  satelliteEnabled,
  loadSatelliteConfig,
  isAllowedOrigin,
  copernicusAttribution,
  CDSE,
  TOKEN_SKEW_MS,
} from "@/lib/gis/satellite/config";

const BBOX = [-78.5, 38.03, -78.49, 38.04] as const;
const REQ = { bbox: BBOX, fromIso: "2026-06-01T00:00:00Z", toIso: "2026-06-15T00:00:00Z" };

/** A fetch stub that records calls and returns queued responses. No network, ever. */
function stubFetch(responses: Partial<Response>[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses[Math.min(i++, responses.length - 1)];
    return r as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const jsonRes = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(8),
  }) as unknown as Partial<Response>;

const ORIGINAL = { id: process.env.CDSE_CLIENT_ID, secret: process.env.CDSE_CLIENT_SECRET };

beforeEach(() => {
  process.env.CDSE_CLIENT_ID = "test-id";
  process.env.CDSE_CLIENT_SECRET = "test-secret";
  _clearTokenCache();
});

afterEach(() => {
  if (ORIGINAL.id === undefined) delete process.env.CDSE_CLIENT_ID;
  else process.env.CDSE_CLIENT_ID = ORIGINAL.id;
  if (ORIGINAL.secret === undefined) delete process.env.CDSE_CLIENT_SECRET;
  else process.env.CDSE_CLIENT_SECRET = ORIGINAL.secret;
  _clearTokenCache();
});

describe("config", () => {
  it("gates on both credentials being present", () => {
    expect(satelliteEnabled()).toBe(true);
    delete process.env.CDSE_CLIENT_SECRET;
    expect(satelliteEnabled()).toBe(false);
  });

  it("fails closed rather than sending an empty credential", () => {
    delete process.env.CDSE_CLIENT_ID;
    expect(() => loadSatelliteConfig()).toThrow(/CDSE_CLIENT_ID/);
  });

  it("hardcodes three HTTPS origins and nothing else", () => {
    for (const u of [CDSE.token, CDSE.process, CDSE.stac]) {
      expect(u.startsWith("https://")).toBe(true);
    }
    expect(isAllowedOrigin("https://sh.dataspace.copernicus.eu/process/v1")).toBe(true);
    expect(isAllowedOrigin("https://evil.example.com/x")).toBe(false);
    expect(isAllowedOrigin("http://sh.dataspace.copernicus.eu")).toBe(false);
    expect(isAllowedOrigin("not a url")).toBe(false);
  });

  it("uses the STAC catalogue, not Sentinel Hub's own, for the baseline", () => {
    expect(CDSE.stac).toContain("stac.dataspace.copernicus.eu");
    expect(CDSE.stac).not.toContain("sh.dataspace");
  });

  it("produces the legally required MODIFIED attribution, since NDVI is derived", () => {
    expect(copernicusAttribution(2026)).toBe("Contains modified Copernicus Sentinel data 2026");
  });
});

describe("token cache", () => {
  it("fetches once and reuses inside the skew window", async () => {
    const { impl, calls } = stubFetch([jsonRes(200, { access_token: "tok-1", expires_in: 1800 })]);
    expect(await getAccessToken({ fetchImpl: impl })).toBe("tok-1");
    expect(await getAccessToken({ fetchImpl: impl })).toBe("tok-1");
    expect(calls.length).toBe(1);
  });

  it("refetches once the token is inside the skew window", async () => {
    const { impl, calls } = stubFetch([
      jsonRes(200, { access_token: "tok-1", expires_in: 1800 }),
      jsonRes(200, { access_token: "tok-2", expires_in: 1800 }),
    ]);
    let t = 1_000_000;
    const now = () => t;
    expect(await getAccessToken({ fetchImpl: impl, now })).toBe("tok-1");
    t += 1800 * 1000 - TOKEN_SKEW_MS + 1;
    expect(await getAccessToken({ fetchImpl: impl, now })).toBe("tok-2");
    expect(calls.length).toBe(2);
  });

  it("READS expires_in rather than hardcoding 1800", async () => {
    const { impl, calls } = stubFetch([
      jsonRes(200, { access_token: "short", expires_in: 300 }),
      jsonRes(200, { access_token: "next", expires_in: 300 }),
    ]);
    let t = 0;
    const now = () => t;
    expect(await getAccessToken({ fetchImpl: impl, now })).toBe("short");
    // past a 300 s lifetime but far inside 1800 s — a hardcoded TTL would wrongly reuse
    t += 300 * 1000 - TOKEN_SKEW_MS + 1;
    expect(await getAccessToken({ fetchImpl: impl, now })).toBe("next");
    expect(calls.length).toBe(2);
  });

  it("_clearTokenCache forces a refetch", async () => {
    const { impl, calls } = stubFetch([jsonRes(200, { access_token: "a", expires_in: 1800 })]);
    await getAccessToken({ fetchImpl: impl });
    _clearTokenCache();
    await getAccessToken({ fetchImpl: impl });
    expect(calls.length).toBe(2);
  });

  it("_seedTokenCache short-circuits the network entirely", async () => {
    const { impl, calls } = stubFetch([jsonRes(500, {})]);
    _seedTokenCache("seeded");
    expect(await getAccessToken({ fetchImpl: impl })).toBe("seeded");
    expect(calls.length).toBe(0);
  });

  it("throws on a failed token request WITHOUT echoing the response body", async () => {
    const { impl } = stubFetch([jsonRes(401, { error: "invalid_client", secret_echo: "test-secret" })]);
    await expect(getAccessToken({ fetchImpl: impl })).rejects.toThrow(SatelliteAuthError);
    await expect(getAccessToken({ fetchImpl: impl })).rejects.toThrow(/HTTP 401/);
    // the message must not carry anything from the body
    await getAccessToken({ fetchImpl: impl }).catch((e: Error) => {
      expect(e.message).not.toContain("test-secret");
      expect(e.message).not.toContain("invalid_client");
    });
  });

  it("rejects a token response with no access_token", async () => {
    const { impl } = stubFetch([jsonRes(200, { expires_in: 1800 })]);
    await expect(getAccessToken({ fetchImpl: impl })).rejects.toThrow(/no access_token/);
  });

  it("sets redirect:error on the token request", async () => {
    const { impl, calls } = stubFetch([jsonRes(200, { access_token: "t", expires_in: 1800 })]);
    await getAccessToken({ fetchImpl: impl });
    expect((calls[0].init as RequestInit).redirect).toBe("error");
  });
});

describe("classifyFault", () => {
  it("maps statuses onto actionable kinds", () => {
    expect(classifyFault(401)).toBe("auth");
    expect(classifyFault(403)).toBe("auth");
    expect(classifyFault(404)).toBe("not_found");
    expect(classifyFault(429)).toBe("rate_limit");
    expect(classifyFault(400)).toBe("validation");
    expect(classifyFault(500)).toBe("transient");
    expect(classifyFault(503)).toBe("transient");
    expect(classifyFault(418)).toBe("unknown");
  });

  it("separates QUOTA exhaustion from throttling — retrying does not fix quota", () => {
    expect(classifyFault(402)).toBe("quota");
    expect(classifyFault(402)).not.toBe("rate_limit");
  });
});

describe("backoff", () => {
  it("grows with attempt and stays inside the cap", () => {
    expect(backoffMs(0, () => 1)).toBeLessThanOrEqual(500);
    expect(backoffMs(3, () => 1)).toBeLessThanOrEqual(4000);
    expect(backoffMs(20, () => 1)).toBeLessThanOrEqual(8000);
  });

  it("is full-jitter — zero at the low end", () => {
    expect(backoffMs(5, () => 0)).toBe(0);
  });
});

describe("THE RADIOMETRIC CONTRACT — the most important test in the phase", () => {
  const body = buildProcessRequest(REQ) as {
    input: { data: { processing: Record<string, unknown>; type: string; dataFilter: unknown }[] };
    output: { resx: number; resy: number };
    evalscript: string;
  };

  it("requests the REFLECTANCE bands in REFLECTANCE units — THE baseline guard", () => {
    // In REFLECTANCE, Sentinel Hub applies the BOA_ADD_OFFSET itself. Dropping this silently
    // corrupts cross-date NDVI by up to -0.257 at vigorous canopy, and the failure would read as a
    // real vineyard trend. Runbook rule 2.13 names harmonizeValues as the mechanism; it is wrong.
    expect(NDVI_EVALSCRIPT).toContain('"REFLECTANCE", "REFLECTANCE"');
    expect(body.evalscript).toContain('"REFLECTANCE"');
  });

  it("requests SCL in DN units — it is a CLASS band and REFLECTANCE is a hard 400", () => {
    // Found live, not by reading: "Band 'SCL' of collection 'S2L2A' requested in unsupported units
    // 'REFLECTANCE'! Supported units for this band: DN." A single blanket units for all three bands
    // looks tidier and does not work.
    expect(NDVI_EVALSCRIPT).toContain('"DN"');
  });

  it("uses ONE input group with a parallel units array, not two input objects", () => {
    // Two input objects is the obvious next guess after the SCL/DN 400, and is also wrong: Sentinel
    // Hub maps each input object to a DATASOURCE and answers "Dataset with id: 1 not found." when
    // input.data[] has only one entry. Both facts were found live.
    expect(NDVI_EVALSCRIPT).toContain('units: ["REFLECTANCE", "REFLECTANCE", "DN"]');
    // count INPUT band groups only; `output: { bands: 3 }` also matches a naive /bands:/
    expect(NDVI_EVALSCRIPT.match(/bands: \[/g)?.length).toBe(1);
  });

  it("pins harmonizeValues to FALSE, so negative reflectance is not clamped", () => {
    // true would clamp a negative B04 to 0, making NDVI a fabricated exactly-1.0
    expect(body.input.data[0].processing.harmonizeValues).toBe(false);
  });

  it("pins NEAREST resampling both ways, because SCL is a CLASS raster", () => {
    expect(body.input.data[0].processing.upsampling).toBe("NEAREST");
    expect(body.input.data[0].processing.downsampling).toBe("NEAREST");
  });

  it("pins the native 10 m grid rather than letting width/height imply a resampled one", () => {
    expect(body.output.resx).toBe(10);
    expect(body.output.resy).toBe(10);
  });

  it("asks for FLOAT32, not an 8-bit visualisation", () => {
    expect(body.evalscript).toContain('sampleType: "FLOAT32"');
  });

  it("requests exactly B04, B08 and SCL", () => {
    expect(body.evalscript).toContain('"B04"');
    expect(body.evalscript).toContain('"B08"');
    expect(body.evalscript).toContain('"SCL"');
  });

  it("targets the current /process/v1 path", () => {
    expect(CDSE.process.endsWith("/process/v1")).toBe(true);
  });
});

describe("STAC search — the only confirmed baseline source", () => {
  it("targets the sentinel-2-l2a collection with the AOI and window", () => {
    const b = buildStacSearchBody(REQ) as Record<string, unknown>;
    expect(b.collections).toEqual(["sentinel-2-l2a"]);
    expect(b.bbox).toEqual([...BBOX]);
    expect(String(b.datetime)).toContain("/");
  });

  it("parses processing:version out of a STAC feature", async () => {
    const { impl } = stubFetch([
      jsonRes(200, {
        features: [
          {
            id: "S2B_MSIL2A_20260601T101559_N0511_R065_T17SUB_20260601T120000",
            properties: { datetime: "2026-06-01T10:15:59Z", "processing:version": "05.11", "eo:cloud_cover": 4.2 },
          },
        ],
      }),
    ]);
    const scenes = await searchStacScenes(REQ, { fetchImpl: impl });
    expect(scenes[0].processingVersion).toBe("05.11");
    expect(scenes[0].cloudCover).toBe(4.2);
  });

  it("cross-checks the baseline from the SAFE product id", () => {
    expect(baselineFromProductId("S2B_MSIL2A_20260601T101559_N0511_R065_T17SUB_x")).toBe("05.11");
    expect(baselineFromProductId("S2A_MSIL2A_20220201T000000_N0400_R000_T00XXX_x")).toBe("04.00");
    expect(baselineFromProductId("no-baseline-here")).toBeNull();
  });
});

describe("fetchProcessedScene", () => {
  it("sends a bearer token and redirect:error, and returns bytes", async () => {
    const { impl, calls } = stubFetch([
      jsonRes(200, { access_token: "tok", expires_in: 1800 }),
      jsonRes(200, {}, { "content-type": "image/tiff", "x-processingunits-spent": "0.038" }),
    ]);
    const out = await fetchProcessedScene(REQ, { fetchImpl: impl });
    expect(out.bytes.byteLength).toBe(8);
    expect(out.processingUnits).toBeCloseTo(0.038, 6);
    const processCall = calls[1];
    expect((processCall.init as RequestInit).redirect).toBe("error");
    expect((processCall.init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("does NOT retry an auth failure — retrying a bad credential is pointless", async () => {
    const { impl, calls } = stubFetch([
      jsonRes(200, { access_token: "tok", expires_in: 1800 }),
      jsonRes(401, {}),
    ]);
    await expect(fetchProcessedScene(REQ, { fetchImpl: impl, sleep: async () => {} })).rejects.toThrow(SatelliteFault);
    // one token call + exactly one process attempt
    expect(calls.length).toBe(2);
  });

  it("does NOT retry quota exhaustion", async () => {
    const { impl, calls } = stubFetch([jsonRes(200, { access_token: "t", expires_in: 1800 }), jsonRes(402, {})]);
    await expect(fetchProcessedScene(REQ, { fetchImpl: impl, sleep: async () => {} })).rejects.toMatchObject({
      kind: "quota",
    });
    expect(calls.length).toBe(2);
  });

  it("retries a transient 500 and gives up after the attempt budget", async () => {
    const { impl, calls } = stubFetch([jsonRes(200, { access_token: "t", expires_in: 1800 }), jsonRes(503, {})]);
    await expect(
      fetchProcessedScene(REQ, { fetchImpl: impl, sleep: async () => {}, random: () => 0 }),
    ).rejects.toMatchObject({ kind: "transient" });
    // 5 attempts, each preceded by a cached-token check
    expect(calls.length).toBeGreaterThan(2);
  });

  it("honours Retry-After on a 429", async () => {
    const waits: number[] = [];
    const { impl } = stubFetch([
      jsonRes(200, { access_token: "t", expires_in: 1800 }),
      jsonRes(429, {}, { "retry-after": "2" }),
    ]);
    await fetchProcessedScene(REQ, {
      fetchImpl: impl,
      sleep: async (ms) => void waits.push(ms),
      random: () => 0,
    }).catch(() => {});
    expect(waits).toContain(2000);
  });

  it("fails closed when unconfigured, before any network call", async () => {
    delete process.env.CDSE_CLIENT_ID;
    const { impl, calls } = stubFetch([jsonRes(200, {})]);
    await expect(fetchProcessedScene(REQ, { fetchImpl: impl })).rejects.toThrow(/CDSE_CLIENT_ID/);
    expect(calls.length).toBe(0);
  });
});
