import "server-only";
import { prisma } from "@/lib/prisma";
import { NAV_MODEL, isVisible } from "@/lib/nav/model";
import {
  SECTIONS,
  UTILITY_DESTINATIONS,
  isSectionVisible,
  type SectionContext,
} from "@/lib/nav/sections";
import { rankHits, type SearchHit } from "./rank";

/**
 * The global search read (doc 01 §7).
 *
 * ## Tenancy — the real risk in this phase
 * This query spans MANY tenant-scoped tables at once, which is exactly the shape
 * that leaks. Two rules, both load-bearing:
 *
 *   1. Every read goes through the **extended `prisma` client**, so the tenant is
 *      injected and Postgres RLS is enforced. There is no raw `$queryRaw` here.
 *      (If one is ever needed for a trigram index, it MUST go through
 *      `runInTenantRawTx` — a bare `$queryRaw` bypasses the tenant extension.)
 *   2. Destinations are filtered by the caller's ROLE before they are returned,
 *      so search cannot become a side channel that reveals an admin-only
 *      destination to a `user`.
 *
 * AC-P4 is the cross-tenant leak test: an object from another tenant must never
 * appear, for any query string.
 *
 * ## Bounded by construction
 * Every branch has a `take`. At 8,142 barrels an unbounded `contains` scan on
 * each keystroke is the difference between a palette and an outage.
 */

const PER_KIND = 8; // fetch slightly above the display cap so ranking has room

/**
 * Same context the sidebar and the sub-navs use (D2). Aliased rather than
 * re-declared so the palette cannot drift into a laxer idea of "admin-only" than
 * the nav — which is the exact shape of the leak the comment above warns about.
 */
export type SearchContext = SectionContext;

export async function searchEverything(query: string, ctx: SearchContext): Promise<SearchHit[]> {
  const q = query.trim();
  // One character matches nearly everything and is never a real intent.
  if (q.length < 2) return [];

  const hits: SearchHit[] = [];

  // --- Destinations (no DB, role-filtered) ---------------------------------
  const lower = q.toLowerCase();
  for (const group of NAV_MODEL) {
    for (const d of group.items) {
      if (!isVisible(d, ctx)) continue;
      const matchesLabel = d.label.toLowerCase().includes(lower);
      // The four renamed destinations keep their old label as a search alias for
      // one release, so muscle memory still lands.
      const matchesAlias = d.alias ? d.alias.toLowerCase().includes(lower) : false;
      if (matchesLabel || matchesAlias) {
        hits.push({
          kind: "destination",
          id: d.href,
          label: d.label,
          subtitle: matchesAlias && d.alias ? `formerly "${d.alias}" · ${group.label}` : group.label,
          href: d.href,
        });
      }
    }
  }

  // --- Section routes (no DB, role-filtered) -------------------------------
  // D2: the sub-navs and the palette read the SAME module, so a surface cannot be
  // reachable in one and invisible in the other. The role filter is `isSectionVisible`,
  // which delegates to the very same `isVisible` used two blocks up — an admin-only
  // section must never surface here for a plain `user`, for any query string.
  for (const [hub, def] of Object.entries(SECTIONS)) {
    const hubLabel = NAV_MODEL.flatMap((g) => g.items).find((d) => d.href === hub)?.label ?? def.hubLabel;
    for (const item of def.items) {
      if (!isSectionVisible(item, ctx)) continue;
      if (!item.label.toLowerCase().includes(lower)) continue;
      hits.push({
        kind: "destination",
        id: item.href,
        label: item.label,
        // Naming the parent is what makes "Reports" and "Review" tellable apart.
        subtitle: `under ${hubLabel}`,
        href: item.href,
      });
    }
  }

  // Palette-only destinations: no nav item exists for these, so search IS the way in.
  for (const util of UTILITY_DESTINATIONS) {
    if (!isSectionVisible(util, ctx)) continue;
    if (!util.label.toLowerCase().includes(lower)) continue;
    hits.push({ kind: "destination", id: util.href, label: util.label, subtitle: "Tools", href: util.href });
  }

  const [vessels, lots, workOrders, blocks, materials, groups] = await Promise.all([
    prisma.vessel.findMany({
      where: { isActive: true, code: { contains: q, mode: "insensitive" } },
      select: { id: true, code: true, type: true },
      take: PER_KIND,
    }),
    prisma.lot.findMany({
      where: { code: { contains: q, mode: "insensitive" } },
      select: { id: true, code: true, vintageYear: true, form: true },
      take: PER_KIND,
    }),
    prisma.workOrder.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          ...(/^\d+$/.test(q) ? [{ number: Number(q) }] : []),
        ],
      },
      select: { id: true, number: true, title: true, status: true },
      take: PER_KIND,
    }),
    prisma.vineyardBlock.findMany({
      where: {
        OR: [
          { blockLabel: { contains: q, mode: "insensitive" } },
          { code: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, blockLabel: true, code: true, vineyardId: true },
      take: PER_KIND,
    }),
    prisma.cellarMaterial.findMany({
      where: { isActive: true, name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true, kind: true },
      take: PER_KIND,
    }),
    prisma.vesselGroup.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true },
      take: PER_KIND,
    }),
  ]);

  for (const v of vessels) {
    // A barrel and a tank are different jobs, so they are different groups —
    // "find me a tank" should not wade through 40 barrels.
    const isBarrel = String(v.type) === "BARREL";
    hits.push({
      kind: isBarrel ? "barrel" : "tank",
      id: v.id,
      label: v.code,
      subtitle: String(v.type).toLowerCase(),
      href: "/bulk",
    });
  }

  for (const l of lots) {
    hits.push({
      kind: "lot",
      id: l.id,
      label: l.code,
      subtitle: [l.vintageYear, String(l.form).toLowerCase()].filter(Boolean).join(" · "),
      href: `/lots/${l.id}`,
    });
  }

  for (const w of workOrders) {
    hits.push({
      kind: "workOrder",
      id: w.id,
      label: `#${w.number} · ${w.title}`,
      subtitle: String(w.status).replace(/_/g, " ").toLowerCase(),
      href: `/work-orders/${w.id}`,
    });
  }

  for (const b of blocks) {
    hits.push({
      kind: "block",
      id: b.id,
      label: b.blockLabel ?? b.code ?? "(unnamed block)",
      subtitle: "vineyard block",
      href: "/reference",
    });
  }

  for (const m of materials) {
    hits.push({
      kind: "material",
      id: m.id,
      label: m.name,
      // `kind` is the load-bearing family (cost/dosing/identity) — more
      // disambiguating than a unit, which CellarMaterial does not carry anyway.
      subtitle: m.kind ? String(m.kind).toLowerCase() : "material",
      href: "/inventory",
    });
  }

  for (const g of groups) {
    hits.push({ kind: "group", id: g.id, label: g.name, subtitle: "barrel group", href: "/bulk" });
  }

  return rankHits(hits, q);
}
