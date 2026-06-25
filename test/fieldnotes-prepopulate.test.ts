import { describe, it, expect } from "vitest";
import { buildPrepopulationDefaults } from "@/lib/fieldnotes/prepopulate";
import { type BlockStatus, EMPTY_BLOCK_STATUS } from "@/lib/fieldnotes/types";

const prev: BlockStatus = {
  phenoStage: "VERAISON",
  phenoStagePct: 50,
  shootTip: "STAGNANT",
  canopyDensity: "DENSE",
  waterStress: "MILD",
  weedPressure: "HIGH",
  leafConditions: ["YELLOWING"],
  diseasePestSpotted: true,
  diseaseDescription: "powdery mildew on Block 1",
  photoUrls: ["https://blob/old.jpg"],
};

describe("buildPrepopulationDefaults", () => {
  it("blanks sprays, fertilizers, weather, and general notes every week", () => {
    const out = buildPrepopulationDefaults({ b1: prev }, ["b1"]);
    expect(out.spraysApplied).toEqual([]);
    expect(out.fertilizersApplied).toEqual([]);
    expect(out.weatherData).toEqual({ rainfallMm: null, maxTempC: null, minTempC: null });
    expect(out.generalNotes).toBe("");
  });

  it("carries slow-changing block phenology/canopy forward", () => {
    const out = buildPrepopulationDefaults({ b1: prev }, ["b1"]);
    expect(out.blockLevelStatuses.b1.phenoStage).toBe("VERAISON");
    expect(out.blockLevelStatuses.b1.phenoStagePct).toBe(50);
    expect(out.blockLevelStatuses.b1.canopyDensity).toBe("DENSE");
    expect(out.blockLevelStatuses.b1.waterStress).toBe("MILD");
    expect(out.blockLevelStatuses.b1.leafConditions).toEqual(["YELLOWING"]);
  });

  it("blanks per-block disease + photos (point-in-time, never carried)", () => {
    const out = buildPrepopulationDefaults({ b1: prev }, ["b1"]);
    expect(out.blockLevelStatuses.b1.diseasePestSpotted).toBe(false);
    expect(out.blockLevelStatuses.b1.diseaseDescription).toBeNull();
    expect(out.blockLevelStatuses.b1.photoUrls).toEqual([]);
  });

  it("drops blocks removed since last week", () => {
    const out = buildPrepopulationDefaults({ b1: prev, gone: prev }, ["b1"]);
    expect(Object.keys(out.blockLevelStatuses)).toEqual(["b1"]);
  });

  it("initializes newly-added blocks blank", () => {
    const out = buildPrepopulationDefaults({ b1: prev }, ["b1", "b2"]);
    expect(out.blockLevelStatuses.b2).toEqual(EMPTY_BLOCK_STATUS);
  });

  it("inits every block blank when there is no previous note", () => {
    const out = buildPrepopulationDefaults(null, ["b1", "b2"]);
    expect(out.blockLevelStatuses.b1).toEqual(EMPTY_BLOCK_STATUS);
    expect(out.blockLevelStatuses.b2).toEqual(EMPTY_BLOCK_STATUS);
  });

  it("does not mutate the previous status object", () => {
    const snapshot = JSON.parse(JSON.stringify(prev));
    buildPrepopulationDefaults({ b1: prev }, ["b1"]);
    expect(prev).toEqual(snapshot);
  });
});
