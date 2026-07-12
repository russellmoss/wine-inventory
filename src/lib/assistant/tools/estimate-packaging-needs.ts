import "server-only";
import type { AssistantTool } from "../registry";
import { estimatePackagingNeeds } from "@/lib/work-orders/nl-resolve";

// Plan 055a (J2): read-only packaging estimate — "how many corks and bottles do I need to bottle the
// Estate Cab into 500 cases?". Computes theoretical consumption (bottles/cases × per-line factor) + on-hand
// + shortfall over the shipped packaging-bom math. No write, no confirm.

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export const estimatePackagingNeedsTool: AssistantTool = {
  name: "estimate_packaging_needs",
  description:
    "Read-only: estimate how much packaging (glass, cork, capsule, labels, case boxes) a bottling run needs, and whether stock is short. Use for 'how many corks and bottles to bottle 500 cases', 'do we have enough capsules for the Estate Cab run'. Pass the case OR bottle count, and either named packaging items or a SKU whose usual packaging to reuse. Never bottles anything — for that, propose a bottling work order.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      skuName: { type: "string", description: "Finished wine name whose usual packaging to reuse (its most recent run's BoM) when no items are named." },
      cases: { type: "number", description: "Estimated cases (×12 bottles)." },
      bottles: { type: "number", description: "Estimated bottle count, if given instead of cases." },
      packaging: { type: "array", items: { type: "string" }, description: "Named packaging dry goods to estimate (glass, cork, capsule, labels, case box)." },
    },
    required: [],
  },
  async run(ctx, rawInput) {
    const tenantId = ctx.user.activeOrganizationId;
    if (!tenantId) throw new Error("No active winery in context.");
    const r = (rawInput ?? {}) as Record<string, unknown>;
    const packaging = Array.isArray(r.packaging) ? (r.packaging as unknown[]).map(str).filter((x): x is string => !!x) : undefined;
    const est = await estimatePackagingNeeds(
      { skuName: str(r.skuName), cases: num(r.cases), bottles: num(r.bottles), ...(packaging && packaging.length ? { packaging } : {}) },
      { tenantId },
    );
    if (est.lines.length === 0) {
      return { bottles: est.bottles, cases: est.cases, lines: [], message: est.note ?? "Nothing to estimate." };
    }
    return {
      bottles: est.bottles,
      cases: est.cases,
      lines: est.lines.map((l) => ({
        item: l.label,
        per: l.per,
        factor: l.factor,
        needed: l.needed,
        onHand: l.onHand,
        short: l.shortfall > 0 ? l.shortfall : 0,
      })),
      ...(est.note ? { note: est.note } : {}),
    };
  },
};
