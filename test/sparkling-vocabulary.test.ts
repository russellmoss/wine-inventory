import { describe, it, expect } from "vitest";
import { OperationType } from "@prisma/client";
import { OPERATION_TYPES } from "@/lib/ledger/vocabulary";

// Phase 7 Unit 1: the TS OperationType mirror MUST stay in lock-step with the Prisma enum.
// A correctness-critical ledger uses an enum, not a string (VISION D4); this parity test is
// the guard that a schema edit and its TS mirror never drift.
describe("OperationType parity (Prisma ⇄ TS mirror)", () => {
  it("the TS mirror equals the Prisma enum, as a set", () => {
    const prismaValues = new Set(Object.values(OperationType));
    const tsValues = new Set<string>(OPERATION_TYPES);
    expect(tsValues).toEqual(prismaValues);
  });

  it("carries the five Phase 7 sparkling values", () => {
    for (const v of ["TIRAGE", "RIDDLING", "DISGORGEMENT", "DOSAGE", "FINISH"] as const) {
      expect(OPERATION_TYPES).toContain(v);
      expect(Object.values(OperationType)).toContain(v);
    }
  });
});
