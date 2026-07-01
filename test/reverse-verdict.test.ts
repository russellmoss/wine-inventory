import { describe, it, expect } from "vitest";
import { reversibilityOf } from "@/lib/ledger/reverse";
import type { OperationType } from "@/lib/ledger/vocabulary";

// Pure verdict table (024a). This is the single source of truth the timeline reads to choose an
// affordance AND the dispatcher reads to fail closed — so they can never disagree.
describe("reversibilityOf", () => {
  it("routes the cellar-6 to the cellar family", () => {
    for (const t of ["ADDITION", "FINING", "CAP_MGMT", "TOPPING", "FILTRATION", "LOSS"] as OperationType[]) {
      expect(reversibilityOf(t)).toEqual({ reversible: true, family: "cellar" });
    }
  });

  it("routes RACK, BOTTLE and the sparkling-5 to their families", () => {
    expect(reversibilityOf("RACK")).toEqual({ reversible: true, family: "rack" });
    expect(reversibilityOf("BOTTLE")).toEqual({ reversible: true, family: "bottle" });
    for (const t of ["TIRAGE", "RIDDLING", "DISGORGEMENT", "DOSAGE", "FINISH"] as OperationType[]) {
      expect(reversibilityOf(t)).toEqual({ reversible: true, family: "sparkling" });
    }
  });

  it("marks the 024b origination/split ops coming-soon (never a wrong button)", () => {
    for (const t of ["CRUSH", "PRESS", "SAIGNEE", "BLEND"] as OperationType[]) {
      const v = reversibilityOf(t);
      expect(v.reversible).toBe(false);
      if (!v.reversible) expect(v.code).toBe("coming-soon");
    }
  });

  it("marks SEED / ADJUST / DEPLETE / CORRECTION non-undoable with a non-empty reason", () => {
    expect(reversibilityOf("SEED")).toMatchObject({ reversible: false, code: "origination" });
    expect(reversibilityOf("ADJUST")).toMatchObject({ reversible: false, code: "manual-adjust" });
    expect(reversibilityOf("DEPLETE")).toMatchObject({ reversible: false, code: "manual-adjust" });
    expect(reversibilityOf("CORRECTION")).toMatchObject({ reversible: false, code: "correction" });
    for (const t of ["SEED", "ADJUST", "DEPLETE", "CORRECTION"] as OperationType[]) {
      const v = reversibilityOf(t);
      if (!v.reversible) expect(v.reason.length).toBeGreaterThan(0);
    }
  });
});
