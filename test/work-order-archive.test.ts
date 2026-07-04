import { describe, it, expect } from "vitest";
import { buildArchiveWhere, buildOpenWhere, parseArchiveFilters, parseOpenFilters, serializeArchiveFilters } from "@/lib/work-orders/archive-filters";

describe("buildOpenWhere (open dashboard filters)", () => {
  it("defaults to the open status set and applies the date range to dueAt", () => {
    const w = buildOpenWhere({ from: "2026-07-01" }) as { status: unknown; dueAt: { gte: Date } };
    expect(w.status).toEqual({ in: ["ISSUED", "IN_PROGRESS", "PENDING_APPROVAL"] });
    expect(w.dueAt.gte).toBeInstanceOf(Date);
  });
  it("narrows to a single open status and shares the common filters (vessel/assignee/q)", () => {
    expect(buildOpenWhere({ status: "IN_PROGRESS" }).status).toBe("IN_PROGRESS");
    expect(buildOpenWhere({ vesselIds: ["v1"] }).tasks).toEqual({ some: { OR: [{ destVesselId: { in: ["v1"] } }, { sourceVesselId: { in: ["v1"] } }] } });
  });
  it("parseOpenFilters accepts open statuses and rejects finalized ones", () => {
    expect(parseOpenFilters({ status: "IN_PROGRESS" }).status).toBe("IN_PROGRESS");
    expect(parseOpenFilters({ status: "APPROVED" }).status).toBeUndefined(); // not an open status
  });
});

describe("buildArchiveWhere", () => {
  it("constrains to the finalized set by default (APPROVED | CANCELLED)", () => {
    expect(buildArchiveWhere({}).status).toEqual({ in: ["APPROVED", "CANCELLED"] });
  });

  it("narrows to a single status when given", () => {
    expect(buildArchiveWhere({ status: "APPROVED" }).status).toBe("APPROVED");
  });

  it("builds an inclusive date range (to = end-of-day)", () => {
    const w = buildArchiveWhere({ from: "2026-07-01", to: "2026-07-03" }) as { updatedAt: { gte: Date; lte: Date } };
    expect(w.updatedAt.gte.getTime()).toBeLessThan(w.updatedAt.lte.getTime());
    expect(w.updatedAt.lte.getHours()).toBe(23);
    expect(w.updatedAt.lte.getMinutes()).toBe(59);
  });

  it("ignores an unparseable date", () => {
    expect(buildArchiveWhere({ from: "not-a-date" }).updatedAt).toBeUndefined();
  });

  it("filters assignee (case-insensitive contains), template, and vessel (either end)", () => {
    expect(buildArchiveWhere({ assigneeEmail: "sam" }).assigneeEmail).toEqual({ contains: "sam", mode: "insensitive" });
    expect(buildArchiveWhere({ templateId: "tpl_1" }).templateVersion).toEqual({ templateId: "tpl_1" });
    expect(buildArchiveWhere({ vesselIds: ["v_1", "v_2"] }).tasks).toEqual({ some: { OR: [{ destVesselId: { in: ["v_1", "v_2"] } }, { sourceVesselId: { in: ["v_1", "v_2"] } }] } });
    expect(buildArchiveWhere({ vesselIds: [] }).tasks).toBeUndefined();
  });

  it("q matches title (contains) and, when numeric, an exact WO number", () => {
    const textOnly = buildArchiveWhere({ q: "rack" }) as { OR: unknown[] };
    expect(textOnly.OR).toEqual([{ title: { contains: "rack", mode: "insensitive" } }]);
    const numeric = buildArchiveWhere({ q: "42" }) as { OR: unknown[] };
    expect(numeric.OR).toContainEqual({ number: 42 });
  });
});

describe("parse/serialize archive filters", () => {
  it("drops blanks + unknown status; round-trips the rest", () => {
    const parsed = parseArchiveFilters({ status: "PENDING", from: " 2026-07-01 ", q: "", assigneeEmail: "sam@x.io" });
    expect(parsed.status).toBeUndefined(); // PENDING is not an archive status
    expect(parsed.from).toBe("2026-07-01");
    expect(parsed.q).toBeUndefined();
    expect(parsed.assigneeEmail).toBe("sam@x.io");
  });

  it("serialize omits blanks and prefixes ? when non-empty", () => {
    expect(serializeArchiveFilters({})).toBe("");
    expect(serializeArchiveFilters({ status: "APPROVED", q: "rack" })).toBe("?status=APPROVED&q=rack");
  });

  it("parse(serialize(x)) is stable for the supported keys", () => {
    const f = { status: "CANCELLED" as const, from: "2026-06-01", to: "2026-06-30", assigneeEmail: "a@b.co", vesselIds: ["v9", "v10"], q: "top" };
    const qs = serializeArchiveFilters(f).replace(/^\?/, "");
    const params = Object.fromEntries(new URLSearchParams(qs));
    expect(parseArchiveFilters(params)).toEqual(f);
  });

  it("parses a comma-joined vesselId into an array (and an old single value still works)", () => {
    expect(parseArchiveFilters({ vesselId: "v1,v2" }).vesselIds).toEqual(["v1", "v2"]);
    expect(parseArchiveFilters({ vesselId: "v1" }).vesselIds).toEqual(["v1"]);
    expect(parseArchiveFilters({ vesselId: "" }).vesselIds).toBeUndefined();
  });
});
