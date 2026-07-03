import { describe, it, expect } from "vitest";
import { buildArchiveWhere, parseArchiveFilters, serializeArchiveFilters } from "@/lib/work-orders/archive-filters";

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
    expect(buildArchiveWhere({ vesselId: "v_1" }).tasks).toEqual({ some: { OR: [{ destVesselId: "v_1" }, { sourceVesselId: "v_1" }] } });
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
    const f = { status: "CANCELLED" as const, from: "2026-06-01", to: "2026-06-30", assigneeEmail: "a@b.co", vesselId: "v9", q: "top" };
    const qs = serializeArchiveFilters(f).replace(/^\?/, "");
    const params = Object.fromEntries(new URLSearchParams(qs));
    expect(parseArchiveFilters(params)).toEqual(f);
  });
});
