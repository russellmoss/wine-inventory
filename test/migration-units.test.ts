import { describe, expect, it } from "vitest";
import { convertVolumeToLiters } from "@/lib/migration/units";

const subject = { subjectType: "POSITION", subjectKey: "p1", label: "Position 1" };

describe("migration unit normalization", () => {
  it("converts supported volume units to liters", () => {
    expect(convertVolumeToLiters(1, "L", subject)).toEqual({ ok: true, valueL: 1 });
    expect(convertVolumeToLiters(500, "mL", subject)).toEqual({ ok: true, valueL: 0.5 });
    expect(convertVolumeToLiters(10, "gal", subject)).toEqual({ ok: true, valueL: 37.85 });
    expect(convertVolumeToLiters(2, "US gal", subject)).toEqual({ ok: true, valueL: 7.57 });
  });

  it("rejects mass as a volume-folded seed quantity", () => {
    const result = convertVolumeToLiters(100, "kg", subject);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.severity).toBe("BLOCKER");
      expect(result.diagnostic.message).toContain("cannot seed a volume-folded vessel position");
    }
  });
});
