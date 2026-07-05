import { describe, it, expect } from "vitest";
import { entityPath, sectionPath, SECTION_ROUTES, describeSectionsForPrompt, allSectionPathsSafe } from "@/lib/assistant/routes";
import { isSafeInternalPath } from "@/lib/assistant/assistant-events";

describe("entityPath", () => {
  it("builds the canonical path for each routable entity", () => {
    expect(entityPath("lot", "abc")).toBe("/lots/abc");
    expect(entityPath("workOrder", "wo1")).toBe("/work-orders/wo1");
    expect(entityPath("template", "t1")).toBe("/work-orders/templates/t1");
    expect(entityPath("vineyard", "v9")).toBe("/vineyards/harvest?vineyard=v9");
  });

  it("encodeURIComponent's ids with spaces / slashes / unicode", () => {
    expect(entityPath("vineyard", "Block 4A / East")).toBe("/vineyards/harvest?vineyard=Block%204A%20%2F%20East");
    expect(entityPath("lot", "a/b")).toBe("/lots/a%2Fb");
  });

  it("every built path is a safe internal path", () => {
    expect(isSafeInternalPath(entityPath("lot", "a b"))).toBe(true);
    expect(isSafeInternalPath(entityPath("template", "weird id"))).toBe(true);
  });

  it("throws on an unknown entity", () => {
    expect(() => entityPath("nope" as never, "x")).toThrow();
  });
});

describe("SECTION_ROUTES", () => {
  it("every section path is a safe internal path", () => {
    expect(allSectionPathsSafe()).toBe(true);
    for (const p of Object.values(SECTION_ROUTES)) {
      expect(p === "/" || isSafeInternalPath(p), p).toBe(true);
    }
  });

  it("sectionPath resolves case-insensitively and rejects unknowns", () => {
    expect(sectionPath("Work Orders")).toBe("/work-orders");
    expect(sectionPath("inventory")).toBe("/inventory");
    expect(sectionPath("not a page")).toBeNull();
  });

  it("describeSectionsForPrompt lists every route as a bullet", () => {
    const text = describeSectionsForPrompt();
    expect(text).toContain("/work-orders — work orders");
    expect(text.split("\n").length).toBe(Object.keys(SECTION_ROUTES).length);
  });
});
