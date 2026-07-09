import { describe, expect, it } from "vitest";
import {
  canonicalizeNlWorkOrderDraft,
  normalizeDoseUnit,
  parseWorkOrderUtteranceForEval,
  NL_WORK_ORDER_MAX_TASKS,
} from "@/lib/work-orders/nl-proposal";

describe("natural-language work-order proposal parser", () => {
  it("parses the Phase 9.2 motivating utterance into ordered intents", () => {
    const intents = parseWorkOrderUtteranceForEval("Rack T12 to T15, add 30 ppm SO2, pull a juice panel.");
    expect(intents).toEqual([
      { kind: "RACK", from: "T12", to: "T15" },
      { kind: "ADDITION", vessel: "T15", material: "SO2", amount: 30, unit: "mg/L" },
      { kind: "PANEL", vessel: "T15", panelName: "juice panel" },
    ]);
  });

  it("keeps model structured input intent-ish and canonicalizes ppm", () => {
    const draft = canonicalizeNlWorkOrderDraft({
      sourceText: "Make a work order to add 30 ppm KMBS to tank 12",
      tasks: [{ kind: "addition", vessel: "tank 12", material: "KMBS", amount: "30", unit: "ppm" }],
      dueDate: "2026-07-10",
      assigneeEmail: "cellar@demowinery.test",
    });
    expect(draft.intents).toEqual([{ kind: "ADDITION", vessel: "tank 12", material: "KMBS", amount: 30, unit: "mg/L" }]);
    expect(draft.dueDate).toBe("2026-07-10");
    expect(draft.assigneeEmail).toBe("cellar@demowinery.test");
  });

  it("does not silently accept unsupported blend authoring", () => {
    expect(() => canonicalizeNlWorkOrderDraft({ sourceText: "Make a work order to blend T1 and T2" })).toThrow(/Blend authoring/);
  });

  it("bounds generated task count before signing", () => {
    const tasks = Array.from({ length: NL_WORK_ORDER_MAX_TASKS + 1 }, (_, i) => ({
      kind: "NOTE",
      title: `Check item ${i + 1}`,
    }));
    expect(() => canonicalizeNlWorkOrderDraft({ sourceText: "too much", tasks })).toThrow(/too much for one work order/i);
  });

  it("normalizes ppm to mg/L", () => {
    expect(normalizeDoseUnit("ppm")).toBe("mg/L");
    expect(normalizeDoseUnit("mg/L")).toBe("mg/L");
  });
});

