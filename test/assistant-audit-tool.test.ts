import { describe, it, expect } from "vitest";
import { getToolsFor } from "@/lib/assistant/registry";
import { queryAuditTool } from "@/lib/assistant/tools/query-audit";

describe("assistant audit tool access", () => {
  it("is a read tool visible to tenant staff", () => {
    expect(queryAuditTool.kind).toBe("read");
    expect(queryAuditTool.adminOnly).toBeFalsy();

    const names = getToolsFor({ role: "user" } as never).map((t) => t.name);
    expect(names).toContain("query_audit");
  });
});
