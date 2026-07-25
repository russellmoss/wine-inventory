import { requireReadyUser, requireActiveTenant } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { Eyebrow } from "@/components/ui";
import { NdviConsole, type NdviJobRow, type NdviBlockRow } from "./NdviConsole";

// VI-P2 Unit 10 — the THIN data console. Not the map (that's P3): a manager picks a vineyard, queues an NDVI
// look "around a date", watches the job status, and sees per-block NDVI means land in a table. Proof the data
// pipeline works, end to end, from the UI. DESIGN.md tokens; no raster render, no scale modes, no legend.
export default async function NdviConsolePage({ searchParams }: { searchParams: Promise<{ vineyard?: string }> }) {
  const user = await requireReadyUser();
  await requireActiveTenant();
  const sp = await searchParams;

  const vineyards =
    user.role === "admin"
      ? await prisma.vineyard.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : user.vineyardIds.length
        ? await prisma.vineyard.findMany({ where: { id: { in: user.vineyardIds } }, orderBy: { name: "asc" }, select: { id: true, name: true } })
        : [];

  const selected = vineyards.find((v) => v.id === sp.vineyard) ?? vineyards[0] ?? null;

  let jobs: NdviJobRow[] = [];
  let blocks: NdviBlockRow[] = [];
  if (selected) {
    const [jobRows, metricRows, blockRows] = await Promise.all([
      prisma.spatialAnalysisJob.findMany({ where: { vineyardId: selected.id }, orderBy: { createdAt: "desc" }, take: 15, select: { id: true, status: true, withheldReason: true, faultClass: true, createdAt: true } }),
      prisma.blockSpatialMetric.findMany({ where: { vineyardId: selected.id, metric: "NDVI" }, orderBy: [{ blockId: "asc" }, { acquiredAt: "desc" }], select: { blockId: true, mean: true, acquiredAt: true, validFraction: true, qualityFlags: true, geometryVersion: true } }),
      prisma.vineyardBlock.findMany({ where: { vineyardId: selected.id }, orderBy: { sortOrder: "asc" }, select: { id: true, blockLabel: true } }),
    ]);
    jobs = jobRows.map((j) => ({ id: j.id, status: j.status, withheldReason: j.withheldReason, faultClass: j.faultClass, createdAt: j.createdAt.toISOString() }));
    const latest = new Map<string, (typeof metricRows)[number]>();
    for (const m of metricRows) if (!latest.has(m.blockId)) latest.set(m.blockId, m);
    const labelOf = new Map(blockRows.map((b) => [b.id, b.blockLabel]));
    blocks = blockRows.map((b) => {
      const m = latest.get(b.id);
      return {
        block: labelOf.get(b.id) ?? b.id,
        ndviMean: m && m.mean !== null ? Number(m.mean) : null,
        acquiredAt: m ? m.acquiredAt.toISOString() : null,
        validPct: m ? Math.round(Number(m.validFraction) * 100) : null,
        flags: m && Array.isArray(m.qualityFlags) ? (m.qualityFlags as string[]) : [],
        geometryVersion: m ? m.geometryVersion : null,
      };
    });
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Eyebrow rule>Vineyard Intelligence</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, margin: "10px 0 16px" }}>Satellite NDVI</h1>
      <NdviConsole vineyards={vineyards} selectedId={selected?.id ?? null} selectedName={selected?.name ?? null} jobs={jobs} blocks={blocks} />
    </div>
  );
}
