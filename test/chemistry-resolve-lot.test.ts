import { describe, it, expect } from "vitest";
import { resolveResidentLot } from "@/lib/chemistry/resolve-lot";

describe("resolveResidentLot", () => {
  it("auto-attaches when the vessel holds exactly one lot", () => {
    expect(resolveResidentLot(["lot-a"])).toEqual({ ok: true, lotId: "lot-a" });
    // an explicit pick that matches the sole resident is fine
    expect(resolveResidentLot(["lot-a"], "lot-a")).toEqual({ ok: true, lotId: "lot-a" });
  });

  it("requires an explicit pick when the vessel holds more than one lot", () => {
    expect(resolveResidentLot(["lot-a", "lot-b"])).toEqual({ ok: false, reason: "ambiguous" });
    expect(resolveResidentLot(["lot-a", "lot-b"], "lot-b")).toEqual({ ok: true, lotId: "lot-b" });
  });

  it("rejects an explicit lot that isn't resident (1 or many)", () => {
    expect(resolveResidentLot(["lot-a"], "lot-z")).toEqual({ ok: false, reason: "not_resident" });
    expect(resolveResidentLot(["lot-a", "lot-b"], "lot-z")).toEqual({ ok: false, reason: "not_resident" });
  });

  it("reports empty when the vessel holds nothing", () => {
    expect(resolveResidentLot([])).toEqual({ ok: false, reason: "empty" });
    expect(resolveResidentLot([], "lot-a")).toEqual({ ok: false, reason: "empty" });
  });
});
