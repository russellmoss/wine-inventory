import { describe, it, expect } from "vitest";
import {
  TASK_VOCABULARY,
  validateTemplateSpec,
  canonicalizeTemplateSpec,
  instantiateTaskBuilds,
  type TemplateSpec,
} from "@/lib/work-orders/template-vocabulary";

// Plan 039 Unit 8 (pure half): lock the HARVEST_WEIGH_IN vocabulary + that the block target canonicalizes
// to the blockId column. The DB e2e (issue → complete → a HarvestPick exists, no ledger op) lives in
// scripts/verify-work-orders.ts (org_demo_winery), which needs .env and runs in CI.

describe("HARVEST_WEIGH_IN vocabulary", () => {
  const def = TASK_VOCABULARY.HARVEST_WEIGH_IN;

  it("is an OBSERVATION with the HARVEST_WEIGH_IN observationType (no new enum)", () => {
    expect(def).toBeDefined();
    expect(def.kind).toBe("OBSERVATION");
    expect(def.observationType).toBe("HARVEST_WEIGH_IN");
    expect(def.opType).toBeUndefined();
  });

  it("targets a vineyard block and captures weight + Brix/pH/TA", () => {
    expect(def.fields.blockId).toBe("block");
    expect(def.fields.weightKg).toBe("number");
    expect(def.fields.brixAtPick).toBe("number");
    expect(def.fields.phAtPick).toBe("number");
    expect(def.fields.taAtPick).toBe("number");
  });

  it("validates as a template spec", () => {
    const spec: TemplateSpec = { tasks: [{ taskType: "HARVEST_WEIGH_IN", title: "Weigh in fruit" }] };
    expect(validateTemplateSpec(spec).ok).toBe(true);
  });
});

describe("blockId canonical column", () => {
  it("instantiateTaskBuilds maps a run-time blockId to the canonical column + carries the observation meta", () => {
    const [built] = instantiateTaskBuilds([
      { taskType: "HARVEST_WEIGH_IN", title: "Weigh in", values: { blockId: "blk_1", weightKg: 1200, brixAtPick: 24 } },
    ]);
    expect(built.kind).toBe("OBSERVATION");
    expect(built.observationType).toBe("HARVEST_WEIGH_IN");
    expect(built.blockId).toBe("blk_1");
    // Other targets stay null for a weigh-in.
    expect(built.lotId).toBeNull();
    expect(built.sourceVesselId).toBeNull();
    expect(built.destVesselId).toBeNull();
  });

  it("canonicalizeTemplateSpec keeps only vocabulary fields for the block (untrusted spec)", () => {
    const spec = { tasks: [{ taskType: "HARVEST_WEIGH_IN", title: "Weigh in", defaults: { blockId: "blk_1", bogus: "x" } }] } as unknown as TemplateSpec;
    const out = canonicalizeTemplateSpec(spec);
    expect(out.tasks[0].defaults).not.toHaveProperty("bogus");
  });
});
