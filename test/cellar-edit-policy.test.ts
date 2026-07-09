import { describe, expect, it } from "vitest";
import {
  operationSupplementalNote,
  validateOperationMetadataEdit,
  withSupplementalNote,
} from "@/lib/cellar/edit-policy";

describe("operation metadata edit policy", () => {
  it("allows only supplementalNote as the direct metadata edit", () => {
    expect(validateOperationMetadataEdit({ operationId: 1, supplementalNote: "  clarify this  " })).toEqual({
      ok: true,
      supplementalNote: "clarify this",
    });
    expect(validateOperationMetadataEdit({ operationId: 1, supplementalNote: "   " })).toEqual({
      ok: true,
      supplementalNote: null,
    });
  });

  it("rejects posting, fold, provenance, and unknown fields", () => {
    for (const field of ["observedAt", "volumeL", "vesselId", "lotId", "taxClass", "bondId", "rateValue", "type", "captureMethod"]) {
      const decision = validateOperationMetadataEdit({ operationId: 1, supplementalNote: "ok", [field]: "bad" });
      expect(decision).toMatchObject({ ok: false, field });
    }
    expect(validateOperationMetadataEdit({ operationId: 1, madeUpField: "bad" })).toMatchObject({
      ok: false,
      field: "madeUpField",
    });
  });

  it("reads and writes supplementalNote without disturbing other metadata", () => {
    const next = withSupplementalNote({ seedKind: "MANUAL_OPERATOR_SEED" }, "operator note");
    expect(next).toEqual({ seedKind: "MANUAL_OPERATOR_SEED", supplementalNote: "operator note" });
    expect(operationSupplementalNote(next)).toBe("operator note");
    expect(withSupplementalNote(next, null)).toEqual({ seedKind: "MANUAL_OPERATOR_SEED" });
  });
});
