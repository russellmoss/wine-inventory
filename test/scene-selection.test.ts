import { describe, it, expect } from "vitest";
import {
  rankSceneCandidates,
  searchScenesCore,
  needsSclPreflight,
  bboxContains,
  offsetDaysBetween,
  topContainingCandidates,
  SCL_PREFLIGHT_BAND,
  type SearchStacFn,
} from "@/lib/gis/satellite/scene-selection-core";
import type { StacScene } from "@/lib/gis/satellite/client";

const AOI: [number, number, number, number] = [-78.52, 38.02, -78.5135, 38.0258];
// A Sentinel-2 tile bbox that fully contains the AOI, and a shifted one that does not (edge-of-tile).
const TILE_CONTAINS: [number, number, number, number] = [-79, 37.5, -78, 38.5];
const TILE_PARTIAL: [number, number, number, number] = [-78.518, 37.5, -78, 38.5]; // minLon > AOI minLon → cuts the AOI
const scene = (id: string, cloud: number | null, iso: string | null, bbox: [number, number, number, number] | null): StacScene => ({
  id,
  datetime: iso,
  processingVersion: "05.11",
  cloudCover: cloud,
  bbox,
});

describe("scene ranking — free signals first (C4)", () => {
  it("puts a footprint-containing scene ahead of an edge-of-tile one, even if the edge scene is clearer", () => {
    const scenes = [
      scene("edge-clear", 1, "2026-06-15T10:00:00Z", TILE_PARTIAL),
      scene("full-cloudier", 8, "2026-06-15T10:00:00Z", TILE_CONTAINS),
    ];
    const ranked = rankSceneCandidates(scenes, AOI, "2026-06-15T00:00:00Z");
    expect(ranked[0].providerSceneId).toBe("full-cloudier");
    expect(ranked[0].containsAoi).toBe(true);
    expect(ranked[1].containsAoi).toBe(false);
  });

  it("among containing scenes, ranks by ascending cloud then smallest date offset", () => {
    const scenes = [
      scene("c-hi", 30, "2026-06-15T10:00:00Z", TILE_CONTAINS),
      scene("c-lo", 3, "2026-06-20T10:00:00Z", TILE_CONTAINS),
      scene("c-lo-near", 3, "2026-06-15T10:00:00Z", TILE_CONTAINS),
    ];
    const ranked = rankSceneCandidates(scenes, AOI, "2026-06-15T00:00:00Z");
    expect(ranked.map((c) => c.providerSceneId)).toEqual(["c-lo-near", "c-lo", "c-hi"]);
  });

  it("records the requested-vs-acquired offset in whole days", () => {
    const ranked = rankSceneCandidates([scene("s", 5, "2026-06-20T10:00:00Z", TILE_CONTAINS)], AOI, "2026-06-15T00:00:00Z");
    expect(ranked[0].offsetDays).toBe(5);
  });
});

describe("SCL preflight gating — only the ambiguous 10–40% band", () => {
  it("does not preflight a clearly-clear tile", () => expect(needsSclPreflight(4)).toBe(false));
  it("does not preflight a clearly-cloudy tile", () => expect(needsSclPreflight(80)).toBe(false));
  it("preflights inside the band (blanket SCL would double request-spend)", () => {
    expect(needsSclPreflight(SCL_PREFLIGHT_BAND.minCloud)).toBe(true);
    expect(needsSclPreflight(25)).toBe(true);
    expect(needsSclPreflight(SCL_PREFLIGHT_BAND.maxCloud)).toBe(true);
  });
  it("never preflights a null (unknown) cloud", () => expect(needsSclPreflight(null)).toBe(false));
});

describe("window expansion + no fabrication", () => {
  it("widens ±7 → ±14 → ±30 only until a containing candidate appears", async () => {
    const calls: { fromIso: string; toIso: string }[] = [];
    const searchStac: SearchStacFn = async (req) => {
      calls.push({ fromIso: req.fromIso, toIso: req.toIso });
      // The containing scene only shows up once the window is wide enough (3rd call).
      return calls.length >= 3 ? [scene("late", 5, "2026-05-20T10:00:00Z", TILE_CONTAINS)] : [scene("edge", 2, "2026-06-14T10:00:00Z", TILE_PARTIAL)];
    };
    const res = await searchScenesCore({ searchStac, aoiBbox: AOI, aroundIso: "2026-06-15T00:00:00Z" });
    expect(calls.length).toBe(3);
    expect(res.windowDays).toBe(30);
    expect(res.noContainingScene).toBe(false);
    expect(topContainingCandidates(res)[0].providerSceneId).toBe("late");
  });

  it("returns an empty, non-fabricated result when the catalogue is empty", async () => {
    const searchStac: SearchStacFn = async () => [];
    const res = await searchScenesCore({ searchStac, aoiBbox: AOI, aroundIso: "2026-06-15T00:00:00Z" });
    expect(res.candidates).toEqual([]);
    expect(res.noContainingScene).toBe(true);
    expect(topContainingCandidates(res)).toEqual([]);
  });

  it("stops widening as soon as a containing scene is found (does not over-search)", async () => {
    let n = 0;
    const searchStac: SearchStacFn = async () => {
      n++;
      return [scene("good", 5, "2026-06-15T10:00:00Z", TILE_CONTAINS)];
    };
    await searchScenesCore({ searchStac, aoiBbox: AOI, aroundIso: "2026-06-15T00:00:00Z" });
    expect(n).toBe(1);
  });
});

describe("bbox helpers", () => {
  it("bboxContains is strict subset-or-equal", () => {
    expect(bboxContains(TILE_CONTAINS, AOI)).toBe(true);
    expect(bboxContains(TILE_PARTIAL, AOI)).toBe(false);
  });
  it("offsetDaysBetween is null for a missing datetime", () => {
    expect(offsetDaysBetween(null, "2026-06-15T00:00:00Z")).toBeNull();
  });
});
