import { describe, it, expect } from "vitest";
import { displaySugar, brixToSG, checkBrix, checkTemp } from "@/lib/ferment/sugar";

describe("sugar unit display", () => {
  it("Brix shows as Brix above 0, but auto-falls back to SG past dryness", () => {
    expect(displaySugar(22.4, "BRIX")).toEqual({ value: 22.4, label: "°Bx" });
    const dry = displaySugar(-1.5, "BRIX");
    expect(dry.label).toBe("SG"); // council S12: density past dryness
    expect(dry.value).toBeLessThan(1);
  });

  it("SG and Baumé conversions are in a sane range", () => {
    expect(brixToSG(0)).toBeCloseTo(1.0, 2);
    expect(brixToSG(24)).toBeGreaterThan(1.09);
    expect(displaySugar(24, "SG").value).toBeGreaterThan(1.09);
    expect(displaySugar(24, "BAUME").value).toBeGreaterThan(12);
  });
});

describe("fat-finger guards", () => {
  it("hard-rejects absurd Brix and temp", () => {
    expect(checkBrix(50)).toEqual({ ok: false, error: expect.stringContaining("between") });
    expect(checkBrix(-10)).toMatchObject({ ok: false });
    expect(checkTemp(60)).toMatchObject({ ok: false });
    expect(checkTemp(20)).toMatchObject({ ok: true });
  });

  it("soft-warns when Brix rose since the previous reading", () => {
    const r = checkBrix(15, 12);
    expect(r.ok).toBe(true);
    expect((r as { warning?: string }).warning).toMatch(/went up/);
  });

  it("no warning on a normal drop", () => {
    expect(checkBrix(11, 12)).toEqual({ ok: true });
  });
});
