import { describe, it, expect } from "vitest";
import type { AppUser } from "@/lib/access";
import { calcSo2Tool } from "@/lib/assistant/tools/calc-so2";
import { calcSugarTool } from "@/lib/assistant/tools/calc-sugar";
import { calcAdditionsTool } from "@/lib/assistant/tools/calc-additions";
import { calcBlendingTool } from "@/lib/assistant/tools/calc-blending";
import { calcFortificationTool } from "@/lib/assistant/tools/calc-fortification";
import { calcConvertTool } from "@/lib/assistant/tools/calc-convert";
import { buildAssistantLogPayload, isCalcToolResult, type CalcToolResult } from "@/lib/assistant/tools/calc-shared";
import { DomainError } from "@/lib/winemaking-calc";

const TOOLS = [calcSo2Tool, calcSugarTool, calcAdditionsTool, calcBlendingTool, calcFortificationTool, calcConvertTool];
const ctx = { user: { id: "u1", email: "u@test" } as AppUser };

describe("assistant calc tools (Unit 14)", () => {
  it("all six are read-only with a generated operation-enum schema", () => {
    for (const t of TOOLS) {
      expect(t.kind).toBe("read");
      expect(t.name.startsWith("calc_")).toBe(true);
      const schema = t.inputSchema as { type: string; properties: Record<string, { enum?: string[] }>; required: string[] };
      expect(schema.type).toBe("object");
      expect(schema.required).toContain("operation");
      expect(Array.isArray(schema.properties.operation.enum)).toBe(true);
      expect((schema.properties.operation.enum ?? []).length).toBeGreaterThan(0);
    }
  });

  it("every advertised operation runs on its defaults and returns a CalcToolResult", async () => {
    for (const t of TOOLS) {
      const ops = (t.inputSchema as { properties: { operation: { enum: string[] } } }).properties.operation.enum;
      for (const operation of ops) {
        const out = await t.run(ctx, { operation });
        expect(isCalcToolResult(out)).toBe(true);
        const r = out as CalcToolResult;
        expect(r.operation).toBe(operation);
        expect(r.result.length).toBeGreaterThan(0);
        for (const v of r.result) expect(Number.isFinite(v.value)).toBe(true);
        expect(typeof r.formula).toBe("string");
      }
    }
  });

  it("the motivating question: free SO₂ for 0.8 molecular at pH 3.4 ≈ 31.9 ppm", async () => {
    const out = (await calcSo2Tool.run(ctx, { operation: "so2-molecular", molecularTarget: 0.8, pH: 3.4 })) as CalcToolResult;
    expect(out.result[0].value).toBeCloseTo(31.9, 1);
    expect(out.warning).toBeUndefined();
  });

  it("echoes the low-molecular-target guard (0.08 → suggests 0.8)", async () => {
    const out = (await calcSo2Tool.run(ctx, { operation: "so2-molecular", molecularTarget: 0.08, pH: 3.4 })) as CalcToolResult;
    expect(out.warning).toMatch(/0\.8/);
  });

  it("a bad unit throws DomainError (surfaced as text by the run loop, never a silent NaN)", async () => {
    await expect(calcSo2Tool.run(ctx, { operation: "so2-kmbs", volume: 1000, volumeUnit: "furlongs" })).rejects.toBeInstanceOf(DomainError);
  });

  it("an unknown operation throws DomainError", async () => {
    await expect(calcSo2Tool.run(ctx, { operation: "not-a-calc" })).rejects.toBeInstanceOf(DomainError);
  });

  it("buildAssistantLogPayload maps a result to an ASSISTANT-source log row", async () => {
    const out = (await calcSo2Tool.run(ctx, { operation: "so2-kmbs", volume: 1000, volumeUnit: "GAL_US", target: 50 })) as CalcToolResult;
    const user: AppUser = { id: "u1", name: null, email: "u@test", role: "user", banned: false, mustChangePassword: false, vineyardIds: [], organizationIds: ["org1"], activeOrganizationId: "org1" };
    const payload = buildAssistantLogPayload(user, out);
    expect(payload.source).toBe("ASSISTANT");
    expect(payload.tenantId).toBe("org1");
    expect(payload.userId).toBe("u1");
    expect(payload.calculatorId).toBe("so2-kmbs");
    expect(payload.output).toBe(out.result);
    expect(payload.unitsUsed).toMatchObject({ volumeUnit: "GAL_US" });
  });
});
