import { describe, expect, it } from "vitest";
import {
  LONG_TAIL_DECISIONS,
  operationCustomLabel,
  operationDisplayLabel,
  operationLongTailMarker,
  withLongTailMetadata,
} from "@/lib/cellar/long-tail-metadata";
import { OPERATION_TYPES } from "@/lib/ledger/vocabulary";

describe("Phase 6E long-tail semantic fit", () => {
  it("does not add sticky enum values for incumbent labels", () => {
    expect(OPERATION_TYPES).not.toContain("DRAIN");
    expect(OPERATION_TYPES).not.toContain("DELESTAGE");
    expect(OPERATION_TYPES).not.toContain("COLD_STAB");
    expect(OPERATION_TYPES).not.toContain("CUSTOM");
  });

  it("records explicit default routing decisions for every candidate", () => {
    expect(LONG_TAIL_DECISIONS.map((d) => d.candidate)).toEqual(["DRAIN", "DELESTAGE", "COLD_STAB", "CUSTOM"]);
    expect(LONG_TAIL_DECISIONS.find((d) => d.candidate === "DRAIN")?.defaultRoute).toBe("LOSS");
    expect(LONG_TAIL_DECISIONS.find((d) => d.candidate === "DELESTAGE")?.defaultRoute).toBe("WORK_ORDER");
    expect(LONG_TAIL_DECISIONS.find((d) => d.candidate === "COLD_STAB")?.recordsLedgerOperation).toBe(false);
    expect(LONG_TAIL_DECISIONS.find((d) => d.candidate === "CUSTOM")?.defaultRoute).toBe("LOSS");
  });

  it("stores custom labels in metadata through helpers", () => {
    const metadata = withLongTailMetadata({ supplementalNote: "keep me" }, {
      candidate: "CUSTOM",
      route: "LOSS",
      label: "Bench trial discard",
      lineShape: "LOSS",
      decision: "custom loss",
    });
    expect(metadata.supplementalNote).toBe("keep me");
    expect(operationCustomLabel(metadata)).toBe("Bench trial discard");
    expect(operationDisplayLabel(metadata)).toBe("Bench trial discard");
    expect(operationLongTailMarker(metadata)?.candidate).toBe("CUSTOM");
  });
});
