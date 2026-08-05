import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildAssistantWorkOrderWhere, OPEN_STATUSES } from "@/lib/work-orders/archive-filters";

// Assistant work-order READ (feedback cmsgbjgov). Until this tool existed the assistant could create
// work orders and never read one back, so "did those work orders save?" — the question that ticket's
// user actually asked — had no answer. Two layers here: the pure where-builder, and the tool's own
// input handling with the data reader stubbed.

describe("buildAssistantWorkOrderWhere (pure)", () => {
  it("defaults to open work only — the states a person asks about", () => {
    expect(buildAssistantWorkOrderWhere({})).toEqual({ status: { in: [...OPEN_STATUSES] } });
  });

  it("includes DRAFT by default — the assistant only ever creates drafts", () => {
    // Plan 105: the assistant never issues. If DRAFT were outside the default set, every work order
    // it made would be invisible to the very tool meant to prove it exists.
    const where = buildAssistantWorkOrderWhere({}) as { status: { in: string[] } };
    expect(where.status.in).toContain("DRAFT");
  });

  it("drops the status floor ENTIRELY when finalized work is included", () => {
    // Not "open + finalized" — no status clause at all. "Did it save?" is a question about existence,
    // and a status filter that can hide the answer defeats the tool.
    expect(buildAssistantWorkOrderWhere({ includeFinalized: true })).toEqual({});
  });

  it("narrows to a single status when asked, over both defaults", () => {
    expect(buildAssistantWorkOrderWhere({ status: "APPROVED" })).toEqual({ status: "APPROVED" });
    expect(buildAssistantWorkOrderWhere({ status: "DRAFT", includeFinalized: true })).toEqual({ status: "DRAFT" });
  });

  it("applies the date range to createdAt, NOT dueAt", () => {
    // The user asking "did the four I just made save?" means when they were MADE. Filtering fresh
    // drafts by due date would drop every one with no due date — which is most of what it creates.
    const where = buildAssistantWorkOrderWhere({ createdFrom: "2026-08-05T00:00:00.000Z" }) as Record<string, unknown>;
    expect(where.createdAt).toEqual({ gte: new Date("2026-08-05T00:00:00.000Z") });
    expect(where.dueAt).toBeUndefined();
  });

  it("ignores an unparseable date rather than throwing or matching nothing", () => {
    const where = buildAssistantWorkOrderWhere({ createdFrom: "not-a-date" }) as Record<string, unknown>;
    expect(where.createdAt).toBeUndefined();
  });

  it("reuses the shared assignee / title / number clauses", () => {
    const where = buildAssistantWorkOrderWhere({ assigneeEmail: "mike", q: "83" }) as Record<string, unknown>;
    expect(where.assigneeEmail).toEqual({ contains: "mike", mode: "insensitive" });
    expect(where.OR).toEqual([{ title: { contains: "83", mode: "insensitive" } }, { number: 83 }]);
  });
});

// ── the tool ────────────────────────────────────────────────────────────────────────────────────

const listMock = vi.fn();
vi.mock("@/lib/work-orders/data", () => ({
  listWorkOrdersForAssistant: (...args: unknown[]) => listMock(...args),
  ASSISTANT_WO_DEFAULT_LIMIT: 10,
  ASSISTANT_WO_MAX_LIMIT: 50,
}));

const { queryWorkOrdersTool } = await import("@/lib/assistant/tools/query-work-orders");

const CTX = { user: { id: "u1", activeOrganizationId: "org_demo_winery", supportOrganizationId: null } } as never;

const ROW = {
  id: "wo_83",
  number: 83,
  title: "Bottling",
  status: "DRAFT",
  createdAt: "2026-08-05T16:44:48.417Z",
  dueAt: null,
  assigneeEmail: null,
  taskCount: 3,
  doneCount: 0,
  path: "/work-orders/wo_83",
};

beforeEach(() => {
  listMock.mockReset();
  listMock.mockResolvedValue({ rows: [ROW], total: 1 });
});

describe("query_work_orders tool", () => {
  it("is a READ tool — it must never propose or mutate", () => {
    expect(queryWorkOrdersTool.kind).toBe("read");
  });

  it("returns the rows with their link path", async () => {
    const out = (await queryWorkOrdersTool.run(CTX, {})) as { found: boolean; workOrders: unknown[] };
    expect(out.found).toBe(true);
    expect(out.workOrders).toEqual([ROW]);
  });

  it("an exact number search lifts the open-status floor", async () => {
    // "Show me WO 83" means find #83 — not "find #83 if it happens to still be open".
    await queryWorkOrdersTool.run(CTX, { number: 83 });
    const filters = listMock.mock.calls[0][1] as { q?: string; includeFinalized?: boolean };
    expect(filters.q).toBe("83");
    expect(filters.includeFinalized).toBe(true);
  });

  it("converts sinceDays into a createdFrom instant", async () => {
    await queryWorkOrdersTool.run(CTX, { sinceDays: 1 });
    const filters = listMock.mock.calls[0][1] as { createdFrom?: string };
    const ageMs = Date.now() - new Date(filters.createdFrom!).getTime();
    expect(ageMs).toBeGreaterThan(86_000_000);
    expect(ageMs).toBeLessThan(87_000_000);
  });

  it("rejects an unknown status with the real list rather than querying for nothing", async () => {
    const out = (await queryWorkOrdersTool.run(CTX, { status: "NOPE" })) as { found: boolean; message: string };
    expect(out.found).toBe(false);
    expect(out.message).toContain("DRAFT");
    expect(listMock).not.toHaveBeenCalled();
  });

  it("reports what it SEARCHED when nothing matched", async () => {
    // The whole point of this tool is to stop the assistant over-claiming an absence. A bare "none
    // found" reads as "none exist", so an empty result must name its own scope and its exclusions.
    listMock.mockResolvedValue({ rows: [], total: 0 });
    const out = (await queryWorkOrdersTool.run(CTX, {})) as { found: boolean; searched: string; message: string };
    expect(out.found).toBe(false);
    expect(out.searched).toBe("open work orders");
    expect(out.message).toContain("includeFinalized");
  });

  it("does not dangle the includeFinalized caveat when finalized work WAS searched", async () => {
    listMock.mockResolvedValue({ rows: [], total: 0 });
    const out = (await queryWorkOrdersTool.run(CTX, { includeFinalized: true })) as { searched: string; message: string };
    expect(out.searched).toBe("any status");
    expect(out.message).not.toContain("includeFinalized");
  });

  it("declares truncation instead of implying it listed everything", async () => {
    listMock.mockResolvedValue({ rows: [ROW], total: 40 });
    const out = (await queryWorkOrdersTool.run(CTX, {})) as { truncated?: { returned: number; matched: number } };
    expect(out.truncated).toEqual({ returned: 1, matched: 40 });
  });

  it("prefers the support org when acting inside another tenant", async () => {
    const supportCtx = { user: { id: "u1", activeOrganizationId: "org_a", supportOrganizationId: "org_b" } } as never;
    await queryWorkOrdersTool.run(supportCtx, {});
    expect(listMock.mock.calls[0][0]).toBe("org_b");
  });

  it("fails closed with no tenant in context", async () => {
    const noTenant = { user: { id: "u1", activeOrganizationId: null, supportOrganizationId: null } } as never;
    const out = (await queryWorkOrdersTool.run(noTenant, {})) as { found: boolean };
    expect(out.found).toBe(false);
    expect(listMock).not.toHaveBeenCalled();
  });
});
