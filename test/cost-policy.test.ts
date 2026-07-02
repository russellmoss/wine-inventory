import { describe, it, expect } from "vitest";
import {
  COST_SETTINGS_DEFAULTS,
  isComponentCapitalized,
  resolveMethodAt,
  type CostSettings,
} from "@/lib/cost/policy";

// Phase 8 Unit 9: the capitalization resolver the settings UI toggles drive. The roll-up (data.ts)
// consults this so turning a component OFF drops it from cost-per-bottle while the CostLine stays.

describe("isComponentCapitalized", () => {
  it("always capitalizes MATERIAL, DOSAGE_LIQUEUR, VARIANCE regardless of toggles", () => {
    const allOff: CostSettings = {
      ...COST_SETTINGS_DEFAULTS,
      capitalizeFruit: false,
      capitalizeBarrel: false,
      capitalizeLabor: false,
      capitalizeOverhead: false,
      capitalizePackaging: false,
    };
    expect(isComponentCapitalized("MATERIAL", allOff)).toBe(true);
    expect(isComponentCapitalized("DOSAGE_LIQUEUR", allOff)).toBe(true);
    expect(isComponentCapitalized("VARIANCE", allOff)).toBe(true);
  });

  it("gates FRUIT/BARREL/LABOR/OVERHEAD/PACKAGING on their toggle", () => {
    const on = { ...COST_SETTINGS_DEFAULTS, capitalizeLabor: true, capitalizeOverhead: true };
    expect(isComponentCapitalized("FRUIT", on)).toBe(true);
    expect(isComponentCapitalized("BARREL", on)).toBe(true);
    expect(isComponentCapitalized("PACKAGING", on)).toBe(true);
    expect(isComponentCapitalized("LABOR", on)).toBe(true);
    expect(isComponentCapitalized("OVERHEAD", on)).toBe(true);

    const overheadOff = { ...on, capitalizeOverhead: false };
    // The U9 exit contract: OVERHEAD off → excluded from capitalized cost (the CostLine still exists).
    expect(isComponentCapitalized("OVERHEAD", overheadOff)).toBe(false);
    expect(isComponentCapitalized("LABOR", overheadOff)).toBe(true);
  });

  it("defaults: FRUIT/BARREL/PACKAGING capitalized, LABOR/OVERHEAD not (Phase 11 allocates)", () => {
    const d = COST_SETTINGS_DEFAULTS;
    expect(isComponentCapitalized("FRUIT", d)).toBe(true);
    expect(isComponentCapitalized("BARREL", d)).toBe(true);
    expect(isComponentCapitalized("PACKAGING", d)).toBe(true);
    expect(isComponentCapitalized("LABOR", d)).toBe(false);
    expect(isComponentCapitalized("OVERHEAD", d)).toBe(false);
  });
});

describe("resolveMethodAt", () => {
  it("uses the current method when no effective date is set", () => {
    const s: CostSettings = { ...COST_SETTINGS_DEFAULTS, costingMethod: "FIFO", costingMethodEffectiveAt: null };
    expect(resolveMethodAt(s, new Date("2026-01-01"))).toBe("FIFO");
  });

  it("ops before the effective date keep the historical WEIGHTED_AVG; at/after use the new method", () => {
    const eff = new Date("2026-06-01");
    const s: CostSettings = { ...COST_SETTINGS_DEFAULTS, costingMethod: "FIFO", costingMethodEffectiveAt: eff };
    expect(resolveMethodAt(s, new Date("2026-05-31"))).toBe("WEIGHTED_AVG");
    expect(resolveMethodAt(s, eff)).toBe("FIFO");
    expect(resolveMethodAt(s, new Date("2026-06-02"))).toBe("FIFO");
  });
});
