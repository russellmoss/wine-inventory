import { describe, it, expect } from "vitest";
import { LITERS_PER_US_GALLON, litersToGallons, litersToGallonsExact, round2Gal } from "@/lib/compliance/gallons";

describe("gallons (E3 single conversion authority)", () => {
  it("uses the exact NIST US gallon", () => {
    expect(LITERS_PER_US_GALLON).toBe(3.785411784);
  });

  it("converts liters → gallons exactly then rounds to 2 dp", () => {
    // 1000 L / 3.785411784 = 264.172052...
    expect(litersToGallonsExact(1000)).toBeCloseTo(264.17205236, 6);
    expect(litersToGallons(1000)).toBe(264.17);
  });

  it("round2Gal rounds half-up and is symmetric for negatives", () => {
    expect(round2Gal(2.675)).toBe(2.68);
    expect(round2Gal(-2.675)).toBe(-2.68);
    expect(round2Gal(0.005)).toBe(0.01);
    expect(round2Gal(0)).toBe(0);
  });

  it("a full US barrel-ish volume converts sanely", () => {
    // 3785.411784 L is exactly 1000 gal.
    expect(litersToGallons(3785.411784)).toBe(1000);
  });
});
