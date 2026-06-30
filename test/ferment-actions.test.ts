import { describe, it, expect } from "vitest";
import { planLotStateUpdate, type LotState } from "@/lib/ferment/state";

// Phase 6 Unit 10: the PURE transition-planning helper the action uses. The full matrix is
// covered in test/ferment-state.test.ts; here we check the DB-update payload it derives. The
// DB action + idempotency + stuck read are proven in scripts/verify-ferment.ts (Unit 12).

const S = (form: LotState["form"], af: LotState["afState"], mlf: LotState["mlfState"]): LotState => ({
  form,
  afState: af,
  mlfState: mlf,
});

describe("planLotStateUpdate", () => {
  it("AF NONE→ACTIVE updates only afState", () => {
    const r = planLotStateUpdate(S("MUST", "NONE", "NONE"), { kind: "AF", to: "ACTIVE" });
    expect(r.update).toEqual({ afState: "ACTIVE" });
    expect(r.event).toEqual({ kind: "AF", fromValue: "NONE", toValue: "ACTIVE" });
    expect(r.formAutoFlipped).toBe(false);
  });

  it("a white going dry updates BOTH afState and form (auto-flip)", () => {
    const r = planLotStateUpdate(S("JUICE", "ACTIVE", "NONE"), { kind: "AF", to: "DRY" });
    expect(r.update).toEqual({ form: "WINE", afState: "DRY" });
    expect(r.formAutoFlipped).toBe(true);
  });

  it("a red going dry updates only afState (stays MUST — extended maceration)", () => {
    const r = planLotStateUpdate(S("MUST", "ACTIVE", "NONE"), { kind: "AF", to: "DRY" });
    expect(r.update).toEqual({ afState: "DRY" });
    expect(r.formAutoFlipped).toBe(false);
  });

  it("MLF advances independently", () => {
    const r = planLotStateUpdate(S("MUST", "ACTIVE", "NONE"), { kind: "MLF", to: "ACTIVE" });
    expect(r.update).toEqual({ mlfState: "ACTIVE" });
  });

  it("throws on an illegal move (skipping AF steps)", () => {
    expect(() => planLotStateUpdate(S("MUST", "NONE", "NONE"), { kind: "AF", to: "DRY" })).toThrow();
  });
});
