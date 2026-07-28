import { prisma } from "@/lib/prisma";
import { requireActiveTenant } from "@/lib/dal";
import { classifyBlend } from "@/lib/bulk/blend";
import { computeFill } from "@/lib/vessels/fill";
import { tankState } from "@/lib/vessels/tank-state";
import { listMaterials } from "@/lib/cellar/materials";
import { listGroups } from "@/lib/vessels/groups";
import { BulkClient, type VesselWithContents, type Option, type BlockOption, type SubblockOption } from "./BulkClient";

export default async function BulkPage() {
  await requireActiveTenant();
  const [vessels, varieties, vineyards, blocks, subblocks, materials, groups, lastReadings] = await Promise.all([
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
    // in 24h" half of tank state. One indexed aggregate (analysis_panel has an index on
    // vesselId), not a per-vessel query.
    prisma.analysisPanel.groupBy({
      by: ["vesselId"],
      where: { voidedAt: null, vesselId: { not: null } },
      _max: { observedAt: true },
    }),
  ]);

  const lastReadingByVesselId = new Map<string, string>();
  for (const row of lastReadings) {
    if (row.vesselId && row._max.observedAt) lastReadingByVesselId.set(row.vesselId, row._max.observedAt.toISOString());
  }

  const groupNameByVesselId = new Map<string, string>();
  for (const g of groups) {
    for (const m of g.members) if (!groupNameByVesselId.has(m.id)) groupNameByVesselId.set(m.id, g.name);
  }

  // "now" is resolved once, here, and injected into the pure deriver. Reading the clock
  // inside tankState() would make it untestable and make two tiles in one render disagree.
  const now = new Date().toISOString();

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
    // LEDGER-12: at most one row, so "the" resident lot is well defined.
    const resident = v.vesselLots[0];
    // Fill from the authoritative ledger total (includes blend lots), not just components.
    const fill = computeFill(v.vesselLots.map((vl) => Number(vl.volumeL)), Number(v.capacityL));
    return {
      id: v.id,
      code: v.code,
      type: v.type,
      capacityL: Number(v.capacityL),
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
      state: tankState({
        hasWine: v.vesselLots.length > 0,
        afState: resident?.lot.afState ?? null,
        mlfState: resident?.lot.mlfState ?? null,
        over: fill.over,
        lastReadingAt: lastReadingByVesselId.get(v.id) ?? null,
        now,
      }),
      // Composition on record but no ledger occupancy. This, not a failed lookup, is the
      // real "partial" case SC-10 describes: the lot is joined in the same query, so there
      // is never anything to retry.
      wineUnknown: v.vesselLots.length === 0 && comps.length > 0,
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
