import { describe, expect, it } from "vitest";
import { parseDraft } from "@/app/(app)/vineyards/field-notes/manager/useDraft";
import { SCHEMA_VERSION } from "@/lib/fieldnotes/types";

// S4 / council C1. SCHEMA_VERSION deliberately stays at 1 because bumping it would DISCARD a
// manager's in-progress report — visible data loss for a purely additive change. The price is
// that a draft written before the deploy comes back with the six new keys `undefined`, and every
// tri-state control then reads an impossible third value. parseDraft normalizes on restore.

/** Exactly the shape a draft saved BEFORE the S4 deploy has: ten block-status keys, no more. */
function v1Draft(): string {
  return JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    savedAt: "2026-07-20T10:00:00.000Z",
    form: {
      weekOf: "2026-07-20",
      weatherData: { rainfallMm: 4, maxTempC: 27, minTempC: 13 },
      spraysApplied: [],
      fertilizersApplied: [],
      blockLevelStatuses: {
        b1: {
          phenoStage: "FRUIT_SET",
          phenoStagePct: null,
          shootTip: "ACTIVE",
          canopyDensity: "MODERATE",
          waterStress: "NONE",
          weedPressure: "LOW",
          leafConditions: [],
          diseasePestSpotted: false,
          diseaseDescription: null,
          photoUrls: [],
        },
      },
      generalNotes: "Pre-deploy draft.",
    },
  });
}

describe("pre-S4 draft restore (council C1)", () => {
  it("restores rather than discarding — the grower's in-progress work survives", () => {
    const restored = parseDraft(v1Draft());
    expect(restored).not.toBeNull();
    expect(restored!.form.weekOf).toBe("2026-07-20");
    expect(restored!.form.generalNotes).toBe("Pre-deploy draft.");
  });

  it("normalizes all six new fields to null, NOT undefined", () => {
    const b1 = parseDraft(v1Draft())!.form.blockLevelStatuses.b1;
    for (const key of [
      "shootLengthCm",
      "shootLengthBand",
      "hedgedThisWeek",
      "fruitZoneLeafRemoval",
      "clusterDamage",
      "vinegarFlyPressure",
    ] as const) {
      expect(b1[key], key).toBeNull();
      // The distinction that matters: a tri-state control reading `undefined` has no defined
      // rendering. `null` is the documented "not assessed" value.
      expect(b1[key], key).not.toBeUndefined();
      expect(key in b1, `${key} must be PRESENT, not merely absent`).toBe(true);
    }
  });

  it("keeps every pre-existing value untouched while normalizing", () => {
    const b1 = parseDraft(v1Draft())!.form.blockLevelStatuses.b1;
    expect(b1.phenoStage).toBe("FRUIT_SET");
    expect(b1.shootTip).toBe("ACTIVE");
    expect(b1.canopyDensity).toBe("MODERATE");
    expect(b1.diseasePestSpotted).toBe(false);
  });

  it("a draft whose block statuses cannot be parsed falls back to null, never crashes the form", () => {
    const bad = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      savedAt: "",
      form: { weekOf: "2026-07-20", blockLevelStatuses: { b1: { phenoStage: "NOT_A_STAGE" } } },
    });
    expect(parseDraft(bad)).toBeNull();
  });

  it("a draft with no blockLevelStatuses at all still restores", () => {
    const thin = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      savedAt: "",
      form: { weekOf: "2026-07-20" },
    });
    expect(parseDraft(thin)?.form.blockLevelStatuses).toEqual({});
  });
});
