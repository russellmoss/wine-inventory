import { describe, it, expect } from "vitest";
import {
  draftKey,
  serializeDraft,
  parseDraft,
  saveDraftTo,
  restoreDraftFrom,
  clearDraftIn,
  type DraftFormState,
  type StorageLike,
} from "@/app/(app)/vineyards/field-notes/manager/useDraft";
import { SCHEMA_VERSION } from "@/lib/fieldnotes/types";

function memStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

function sampleForm(weekOf = "2026-06-19"): DraftFormState {
  return {
    weekOf,
    weatherData: { rainfallMm: 12, maxTempC: 28, minTempC: 14 },
    spraysApplied: [{ name: "SULFUR", scope: "WHOLE", blockIds: [] }],
    fertilizersApplied: [],
    blockLevelStatuses: {
      b1: {
        phenoStage: "FLOWERING",
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
    generalNotes: "All good.",
  };
}

describe("draftKey", () => {
  it("derives by vineyardId only", () => {
    expect(draftKey("v1")).toBe("bwc:field-note-draft:v1");
    expect(draftKey("v2")).not.toBe(draftKey("v1"));
  });
});

describe("serialize / parse round-trip", () => {
  it("round-trips after a simulated reload", () => {
    const form = sampleForm();
    const raw = serializeDraft(form, new Date("2026-06-20T10:00:00Z"));
    // simulate reload: only the string survives
    const restored = parseDraft(raw);
    expect(restored).not.toBeNull();
    expect(restored!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(restored!.form).toEqual(form);
  });

  it("returns null on missing / corrupt input", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft("")).toBeNull();
    expect(parseDraft("{not json")).toBeNull();
    expect(parseDraft(JSON.stringify({ nope: true }))).toBeNull();
  });

  it("rejects a draft from a different schema version", () => {
    const raw = JSON.stringify({ schemaVersion: SCHEMA_VERSION + 99, savedAt: "", form: sampleForm() });
    expect(parseDraft(raw)).toBeNull();
  });
});

describe("storage helpers", () => {
  it("save then restore yields the same form", () => {
    const s = memStorage();
    const form = sampleForm();
    saveDraftTo(s, "v1", form, new Date("2026-06-20T10:00:00Z"));
    const restored = restoreDraftFrom(s, "v1");
    expect(restored!.form).toEqual(form);
  });

  it("scopes by vineyardId", () => {
    const s = memStorage();
    saveDraftTo(s, "v1", sampleForm("2026-06-19"));
    expect(restoreDraftFrom(s, "v2")).toBeNull();
  });

  it("clear empties the key", () => {
    const s = memStorage();
    saveDraftTo(s, "v1", sampleForm());
    clearDraftIn(s, "v1");
    expect(s.map.has(draftKey("v1"))).toBe(false);
    expect(restoreDraftFrom(s, "v1")).toBeNull();
  });

  it("surfaces a stale week via the stored weekOf", () => {
    const s = memStorage();
    saveDraftTo(s, "v1", sampleForm("2026-06-12")); // last week
    const restored = restoreDraftFrom(s, "v1");
    const currentDefault = "2026-06-19";
    const stale = restored!.form.weekOf !== currentDefault;
    expect(stale).toBe(true);
  });
});
