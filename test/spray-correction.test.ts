// Unit 7's PURE half — correctabilityOf, the single source of truth the UI and the mutation
// share (the reverse.ts pattern). The DB proofs — the at-most-once unique, the void race, the
// byte-identical predecessor, the copied-verbatim snapshot (KD-14) — live in
// scripts/verify-spray-record.ts assertions 4, 5 and 6.
import { describe, expect, it } from "vitest";
import { correctabilityOf } from "@/lib/spray/correction-core";

describe("correctabilityOf (KD-1)", () => {
  it("the current ACTIVE head is correctable", () => {
    expect(correctabilityOf({ status: "ACTIVE", supersededByApplicationId: null })).toEqual({ correctable: true });
  });

  it("a superseded revision is not — a revision can be corrected at most once", () => {
    const v = correctabilityOf({ status: "SUPERSEDED", supersededByApplicationId: "app2" });
    expect(v.correctable).toBe(false);
    if (!v.correctable) expect(v.code).toBe("already-superseded");
  });

  it("a revision with a successor pointer is not correctable even if status lags", () => {
    const v = correctabilityOf({ status: "ACTIVE", supersededByApplicationId: "app2" });
    expect(v.correctable).toBe(false);
    if (!v.correctable) expect(v.code).toBe("already-superseded");
  });

  it("a voided revision is terminal", () => {
    const v = correctabilityOf({ status: "VOIDED", supersededByApplicationId: null });
    expect(v.correctable).toBe(false);
    if (!v.correctable) expect(v.code).toBe("voided");
  });
});
