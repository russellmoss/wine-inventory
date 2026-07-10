import { describe, it, expect } from "vitest";
import { getToolsFor, type AssistantTool } from "@/lib/assistant/registry";
import { listTemplatesTool, getTemplateTool } from "@/lib/assistant/tools/templates-read";
import { createTemplateTool, updateTemplateSpecTool, cloneTemplateTool, archiveTemplateTool } from "@/lib/assistant/tools/templates-write";

// Phase 038: contract + access-control tests for the template tools. The material-resolution logic is
// covered by assistant-template-context.test.ts; dispatch/nonce/versioning are DB-backed (verify scripts,
// org_demo_winery). Here we lock the registry wiring, admin gating, schemas, and the tenant guard — all DB-free.

const READ = [listTemplatesTool, getTemplateTool];
const WRITE = [createTemplateTool, updateTemplateSpecTool, cloneTemplateTool, archiveTemplateTool];

function requiredOf(t: AssistantTool): string[] {
  return ((t.inputSchema as { required?: string[] }).required ?? []);
}

describe("template tools — kinds + admin gating", () => {
  it("read tools are reads, visible to everyone", () => {
    for (const t of READ) {
      expect(t.kind).toBe("read");
      expect(t.adminOnly).toBeFalsy();
    }
  });

  it("write tools are writes AND admin-only (parity with template actions)", () => {
    for (const t of WRITE) {
      expect(t.kind, `${t.name} must be a write tool (confirm-gated)`).toBe("write");
      expect(t.adminOnly, `${t.name} must be admin-only`).toBe(true);
    }
  });

  it("getToolsFor: admin and developer see write tools; a manager does not, but still sees the reads", () => {
    const adminNames = getToolsFor({ role: "admin" } as never).map((t) => t.name);
    const developerNames = getToolsFor({ role: "developer" } as never).map((t) => t.name);
    const managerNames = getToolsFor({ role: "manager" } as never).map((t) => t.name);
    for (const t of WRITE) {
      expect(adminNames, `admin should see ${t.name}`).toContain(t.name);
      expect(developerNames, `developer should see ${t.name}`).toContain(t.name);
      expect(managerNames, `manager must NOT see ${t.name}`).not.toContain(t.name);
    }
    for (const t of READ) {
      expect(adminNames).toContain(t.name);
      expect(developerNames).toContain(t.name);
      expect(managerNames, `manager should see ${t.name}`).toContain(t.name);
    }
  });
});

describe("template tools — input schema contracts", () => {
  it("each tool requires exactly the fields its committer needs", () => {
    expect(requiredOf(createTemplateTool).sort()).toEqual(["name", "spec"]);
    expect(requiredOf(updateTemplateSpecTool).sort()).toEqual(["spec", "template"]);
    expect(requiredOf(cloneTemplateTool)).toEqual(["template"]);
    expect(requiredOf(archiveTemplateTool)).toEqual(["template"]);
    expect(requiredOf(getTemplateTool)).toEqual(["template"]);
  });
});

describe("template tools — tenant guard (runs before any DB access)", () => {
  const noOrg = { role: "admin", activeOrganizationId: null } as never;

  it("read tools refuse a user with no active winery", async () => {
    await expect(listTemplatesTool.run({ user: noOrg }, {})).rejects.toThrow(/winery/i);
    await expect(getTemplateTool.run({ user: noOrg }, { template: "x" })).rejects.toThrow(/winery/i);
  });

  it("write tools refuse a user with no active winery", async () => {
    await expect(createTemplateTool.run({ user: noOrg }, { name: "T", spec: { tasks: [{ taskType: "NOTE", title: "x" }] } })).rejects.toThrow(/winery/i);
    await expect(updateTemplateSpecTool.run({ user: noOrg }, { template: "T", spec: { tasks: [{ taskType: "NOTE", title: "x" }] } })).rejects.toThrow(/winery/i);
    await expect(cloneTemplateTool.run({ user: noOrg }, { template: "T" })).rejects.toThrow(/winery/i);
    await expect(archiveTemplateTool.run({ user: noOrg }, { template: "T" })).rejects.toThrow(/winery/i);
  });

  it("create_template rejects an empty block list before touching the DB", async () => {
    // name present so it passes the name check, then hits the empty-spec guard inside prepareSpec's asSpec.
    await expect(
      createTemplateTool.run({ user: { role: "admin", activeOrganizationId: "org_demo_winery" } as never }, { name: "T", spec: { tasks: [] } }),
    ).rejects.toThrow(/at least one block/i);
  });

  it("create_template rejects a malformed (null) block with a friendly error, not a crash", async () => {
    await expect(
      createTemplateTool.run({ user: { role: "admin", activeOrganizationId: "org_demo_winery" } as never }, { name: "T", spec: { tasks: [null] } }),
    ).rejects.toThrow(/type and a title/i);
  });
});
