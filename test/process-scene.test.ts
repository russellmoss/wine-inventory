import { describe, it, expect } from "vitest";
import {
  recipeHash,
  computeDatasetIdentity,
  faultToDisposition,
  parseSceneJobParams,
  roundedScl,
  NDVI_ALGORITHM_VERSION,
} from "@/lib/gis/satellite/process-scene-core";
import { SatelliteFault } from "@/lib/gis/satellite/client";

/**
 * Pure parts of the processing core. The full materialization + C1 idempotency (a second claimant sees the
 * INFLIGHT placeholder and does NOT re-fetch) + provenance are proven end-to-end on the fixture in
 * verify:ndvi (DB-gated), where the real (tenantId, datasetIdentity) unique enforces the guarantee.
 */
describe("dataset identity (council C1)", () => {
  it("recipeHash is deterministic and stable for the pinned recipe", () => {
    expect(recipeHash()).toBe(recipeHash());
    expect(recipeHash()).toMatch(/^[0-9a-f]{16}$/);
  });

  it("computeDatasetIdentity is stable per (tenant, vineyard, scene) and differs across them", () => {
    const a = computeDatasetIdentity("t1", "v1", "S2A_X");
    expect(a).toBe(computeDatasetIdentity("t1", "v1", "S2A_X")); // idempotent — same look, same key
    expect(a).not.toBe(computeDatasetIdentity("t1", "v1", "S2A_Y")); // different scene
    expect(a).not.toBe(computeDatasetIdentity("t2", "v1", "S2A_X")); // different tenant
    expect(a).not.toBe(computeDatasetIdentity("t1", "v2", "S2A_X")); // different vineyard
    expect(a).toMatch(/^[0-9a-f]{40}$/);
  });

  it("NDVI_ALGORITHM_VERSION is part of the recipe (a bump ⇒ a new coexisting materialization)", () => {
    expect(NDVI_ALGORITHM_VERSION).toBe("ndvi-1");
  });
});

describe("faultToDisposition — the fault→status contract", () => {
  it("402 quota → WITHHELD quota-exhausted (not retried, held till next billing window)", () => {
    expect(faultToDisposition(new SatelliteFault("quota", 402, "x"))).toEqual({ status: "WITHHELD", faultClass: "quota", withheldReason: "quota-exhausted" });
  });
  it("400/422 validation → FAILED", () => {
    expect(faultToDisposition(new SatelliteFault("validation", 400, "x")).status).toBe("FAILED");
  });
  it("429 rate_limit → retry under the lease", () => {
    expect(faultToDisposition(new SatelliteFault("rate_limit", 429, "x")).status).toBe("retry");
  });
  it("5xx transient → retry", () => {
    expect(faultToDisposition(new SatelliteFault("transient", 503, "x")).status).toBe("retry");
  });
});

describe("parseSceneJobParams", () => {
  it("accepts a well-formed payload", () => {
    const p = parseSceneJobParams({ aoiBbox: [-78.5, 38, -78.4, 38.1], requestedDateTarget: "2026-06-15T00:00:00Z", candidates: [] });
    expect(p.aoiBbox).toHaveLength(4);
  });
  it("throws on a malformed payload (a programming error, not a scene fault)", () => {
    expect(() => parseSceneJobParams({})).toThrow();
    expect(() => parseSceneJobParams(null)).toThrow();
    expect(() => parseSceneJobParams({ aoiBbox: [1, 2], requestedDateTarget: "x", candidates: [] })).toThrow();
  });
});

describe("roundedScl", () => {
  it("rounds float SCL DN to integer classes as a Uint8Array", () => {
    const out = roundedScl(new Float32Array([4.0, 5.0, 0.0, 3.9]));
    expect(out).toBeInstanceOf(Uint8Array);
    expect(Array.from(out)).toEqual([4, 5, 0, 4]);
  });
});
