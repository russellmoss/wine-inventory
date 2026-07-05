import { describe, it, expect } from "vitest";
import { getToolsFor, type AssistantTool } from "@/lib/assistant/registry";
import { logHarvestPickTool } from "@/lib/assistant/tools/log-harvest-pick";

// Plan 039 Unit 4: contract + guard tests for the assistant weigh-in tool. All DB-free — the input
// coercion + block-resolution guards run BEFORE any Prisma access, so we exercise them without a database.
// (Dispatch/nonce/commit are DB-backed, proven by the verify scripts in org_demo_winery.)

function requiredOf(t: AssistantTool): string[] {
  return (t.inputSchema as { required?: string[] }).required ?? [];
}

describe("log_harvest_pick — kind + access", () => {
  it("is a write tool, NOT admin-only (a crew/floor action, parity with log_brix)", () => {
    expect(logHarvestPickTool.kind).toBe("write");
    expect(logHarvestPickTool.adminOnly).toBeFalsy();
  });

  it("requires only weight (Brix/pH/TA optional)", () => {
    expect(requiredOf(logHarvestPickTool)).toEqual(["weight"]);
  });

  it("is visible to a manager (not gated behind admin)", () => {
    const managerNames = getToolsFor({ role: "manager" } as never).map((t) => t.name);
    expect(managerNames).toContain("log_harvest_pick");
  });
});

describe("log_harvest_pick — input validation (runs before any DB access)", () => {
  const anyUser = { user: {} as never };

  it("rejects a non-positive / missing weight", async () => {
    await expect(logHarvestPickTool.run(anyUser, {})).rejects.toThrow(/weight/i);
    await expect(logHarvestPickTool.run(anyUser, { weight: 0 })).rejects.toThrow(/weight/i);
    await expect(logHarvestPickTool.run(anyUser, { weight: -5 })).rejects.toThrow(/weight/i);
  });

  it("rejects out-of-range Brix / pH / TA", async () => {
    await expect(logHarvestPickTool.run(anyUser, { weight: 1200, brix: 99 })).rejects.toThrow(/Brix/);
    await expect(logHarvestPickTool.run(anyUser, { weight: 1200, ph: 9 })).rejects.toThrow(/pH/);
    await expect(logHarvestPickTool.run(anyUser, { weight: 1200, ta: 99 })).rejects.toThrow(/TA/);
  });
});

describe("log_harvest_pick — block resolution guard (DB-free path)", () => {
  it("a manager with no vineyards in scope resolves no block and is told so", async () => {
    // findScopedBlocks short-circuits to [] for a manager with an empty membership set (no DB hit),
    // then resolveExactlyOne throws the no-match message — never a silent write.
    await expect(
      logHarvestPickTool.run({ user: { role: "manager", vineyardIds: [] } as never }, { weight: 1200, block: "Block 1" }),
    ).rejects.toThrow(/no block/i);
  });
});
