import { prisma } from "@/lib/prisma";
import { requireActiveTenant } from "@/lib/dal";
import { classifyBlend } from "@/lib/bulk/blend";
import { computeFill } from "@/lib/vessels/fill";
import { tankState } from "@/lib/vessels/tank-state";
import { listMaterials } from "@/lib/cellar/materials";
import { listGroups } from "@/lib/vessels/groups";
import { BulkClient, type VesselWithContents, type Option, type BlockOption, type SubblockOption } from "./BulkClient";

/** Staleness only looks back 24h, so a 30-day window cannot change any answer. */
const READING_WINDOW_DAYS = 30;

export default async function BulkPage() {
  await requireActiveTenant();
  // One clock read for the whole render, and the staleness window both reading queries are
  // bounded by. Anything older than this cannot change a "stale?" answer, so there is no
  // reason to scan the tenant's entire panel history on every board paint.
  const now = new Date();
  const readingWindowStart = new Date(now.getTime() - READING_WINDOW_DAYS * 86_400_000);

  const [vessels, varieties, vineyards, blocks, subblocks, materials, groups, lastReadings, lotScopedReadings] =
    await Promise.all([
    prisma.vessel.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      include: {
        components: {
          orderBy: { volumeL: "desc" },
          include: { variety: { select: { id: true, name: true } }, vineyard: { select: { id: true, name: true } } },
        },
        // Ledger projection: the vessel's wine (LEDGER-12 — at most one row) and the source of truth
        // for fill. `vessel_component` now covers blend lots too (composeLeaves attributes an
        // origin-less lot through its lineage), so there is no second list of "blends in this vessel".
        vesselLots: {
          orderBy: { volumeL: "desc" },
          include: {
            // afState/mlfState feed the DERIVED tank state (DM-40). Never stored on the
            // vessel — see src/lib/vessels/tank-state.ts for why.
            lot: { select: { id: true, code: true, originVarietyId: true, vintageYear: true, afState: true, mlfState: true } },
          },
        },
      },
    }),
    prisma.variety.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vineyard.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vineyardBlock.findMany({
      orderBy: [{ sortOrder: "asc" }],
      select: { id: true, vineyardId: true, blockLabel: true, code: true },
    }),
    prisma.vineyardSubblock.findMany({
      orderBy: [{ sortOrder: "asc" }],
      select: { id: true, blockId: true, code: true, label: true },
    }),
    listMaterials(),
    listGroups(),
    // Newest non-voided reading per vessel, for the "fermenting but nobody has looked at it
    // in 24h" half of tank state.
    //
    // SOURCING RULE: this MUST match `loadTankDetail`'s, which also counts panels logged
    // against a resident lot with no vessel snapshot. An earlier version filtered
    // `vesselId: { not: null }` only — a third rule — so a tenant whose readings arrive
    // lot-scoped got `lastReadingAt = null` on every vessel and saw the whole cellar chipped
    // "Needs attention", while opening any of those tanks showed a Brix point from an hour
    // ago. Both halves are bounded to the staleness window; nothing older can change the answer.
    prisma.analysisPanel.groupBy({
      by: ["vesselId"],
      where: { voidedAt: null, vesselId: { not: null }, observedAt: { gte: readingWindowStart } },
      _max: { observedAt: true },
    }),
    prisma.analysisPanel.findMany({
      where: { voidedAt: null, vesselId: null, observedAt: { gte: readingWindowStart } },
      select: { lotId: true, observedAt: true },
      orderBy: { observedAt: "desc" },
      take: 2000,
    }),
  ]);

  const lastReadingByVesselId = new Map<string, string>();
  for (const row of lastReadings) {
    if (row.vesselId && row._max.observedAt) lastReadingByVesselId.set(row.vesselId, row._max.observedAt.toISOString());
  }
  // Fold the lot-scoped half in: newest wins per lot, then attribute to whichever vessel
  // currently holds that lot.
  const lastReadingByLotId = new Map<string, number>();
  for (const row of lotScopedReadings) {
    const t = row.observedAt.getTime();
    if (t > (lastReadingByLotId.get(row.lotId) ?? -Infinity)) lastReadingByLotId.set(row.lotId, t);
  }

  const groupNameByVesselId = new Map<string, string>();
  for (const g of groups) {
    for (const m of g.members) if (!groupNameByVesselId.has(m.id)) groupNameByVesselId.set(m.id, g.name);
  }

  const nowIso = now.toISOString();

  /** Newest reading for a vessel across BOTH sourcing halves (see the query comment). */
  function lastReadingAt(vesselId: string, lotIds: string[]): string | null {
    const direct = lastReadingByVesselId.get(vesselId);
    let best = direct ? Date.parse(direct) : -Infinity;
    for (const lotId of lotIds) best = Math.max(best, lastReadingByLotId.get(lotId) ?? -Infinity);
    return Number.isFinite(best) ? new Date(best).toISOString() : null;
  }

  const varietyNameById = new Map(varieties.map((v) => [v.id, v.name]));

  const data: VesselWithContents[] = vessels.map((v) => {
    const comps = v.components.map((c) => ({
      id: c.id,
      varietyId: c.variety.id,
      varietyName: c.variety.name,
      vineyardName: c.vineyard.name,
      vintage: c.vintage,
      volumeL: Number(c.volumeL),
    }));
    const blend = classifyBlend(comps.map((c) => ({ varietyId: c.varietyId, varietyName: c.varietyName, volumeL: c.volumeL })));
    const wineUnknown = v.vesselLots.length === 0 && comps.length > 0;
    const capacityL = Number(v.capacityL);
    const capacityUnknown = !Number.isFinite(capacityL) || capacityL <= 0;
    // Fill from the authoritative ledger total (includes blend lots), not just components.
    const fill = computeFill(v.vesselLots.map((vl) => Number(vl.volumeL)), capacityL);
    return {
      id: v.id,
      code: v.code,
      type: v.type,
      capacityL,
      blendName: v.blendName,
      components: comps,
      blend,
      fill,
      oakOrigin: v.oakOrigin,
      cooperageYear: v.cooperageYear,
      cooperage: v.cooperage,
      toastLevel: v.toastLevel,
      lotCodes: v.vesselLots.map((vl) => vl.lot.code),
      residentLots: v.vesselLots.map((vl) => ({
        lotId: vl.lotId,
        code: vl.lot.code,
        varietyName: vl.lot.originVarietyId ? varietyNameById.get(vl.lot.originVarietyId) ?? null : null,
      })),
      groupName: groupNameByVesselId.get(v.id) ?? null,
      capacityUnknown,
      state: tankState({
        hasWine: v.vesselLots.length > 0,
        // EVERY resident lot, not just the largest — see TankStateInput.lots.
        lots: v.vesselLots.map((vl) => ({ afState: vl.lot.afState, mlfState: vl.lot.mlfState })),
        over: fill.over,
        unknown: wineUnknown || capacityUnknown,
        lastReadingAt: lastReadingAt(v.id, v.vesselLots.map((vl) => vl.lotId)),
        now: nowIso,
      }),
      // Composition on record but no ledger occupancy. This, not a failed lookup, is the
      // real "partial" case SC-10 describes: the lot is joined in the same query, so there
      // is never anything to retry.
      wineUnknown,
    };
  });

  // Natural sort: codes are strings ("1","2","10"), so sort numerically not lexically.
  data.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  return (
    <BulkClient
      vessels={data}
      varieties={varieties as Option[]}
      vineyards={vineyards as Option[]}
      blocks={blocks as BlockOption[]}
      subblocks={subblocks as SubblockOption[]}
      materials={materials}
      groups={groups}
    />
  );
}
