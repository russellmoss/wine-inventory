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

  it("routes CRUSH/PRESS/SAIGNEE to the transform family and BLEND to blend (024b)", () => {
    for (const t of ["CRUSH", "PRESS", "SAIGNEE"] as OperationType[]) {
      expect(reversibilityOf(t)).toEqual({ reversible: true, family: "transform" });
    }
    expect(reversibilityOf("BLEND")).toEqual({ reversible: true, family: "blend" });
  });

  it("routes TRANSFER_IN_BOND to the bond family (Phase 2, BOND-1)", () => {
    expect(reversibilityOf("TRANSFER_IN_BOND")).toEqual({ reversible: true, family: "bond" });
  });

  it("makes REMOVE_TAXPAID and RETURN_TO_BOND terminal (Phase 2, TAXPAID-1 — T1 IRON RULE)", () => {
    // REMOVE_TAXPAID was formerly in CELLAR_TYPES (reversible); the tax-paid boundary is now one-way.
    expect(reversibilityOf("REMOVE_TAXPAID")).toMatchObject({ reversible: false, code: "taxpaid-terminal" });
    // A RETURN_TO_BOND is itself the refund event — not reversed by the generic path.
    expect(reversibilityOf("RETURN_TO_BOND")).toMatchObject({ reversible: false, code: "refund-event" });
    for (const t of ["REMOVE_TAXPAID", "RETURN_TO_BOND"] as OperationType[]) {
      const v = reversibilityOf(t);
      if (!v.reversible) expect(v.reason.length).toBeGreaterThan(0);
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
