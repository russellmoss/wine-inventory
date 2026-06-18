import { prisma } from "@/lib/prisma";
import { BottlingClient, type VesselOpt, type LocOpt, type RunRow } from "./BottlingClient";

export default async function BottlingPage() {
  const [vessels, locations, runs] = await Promise.all([
    prisma.vessel.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      include: { components: { include: { variety: { select: { name: true } }, vineyard: { select: { name: true } } } } },
    }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: [{ isSystem: "desc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.bottlingRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        wineSku: { select: { name: true, vintage: true } },
        destinationLocation: { select: { name: true } },
        sources: { include: { variety: { select: { name: true } }, vineyard: { select: { name: true } } } },
      },
    }),
  ]);

  const vesselOpts: VesselOpt[] = vessels
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    .map((v) => ({
      id: v.id,
      code: v.code,
      type: v.type,
      availableL: Math.round(v.components.reduce((a, c) => a + Number(c.volumeL), 0) * 100) / 100,
      contents: v.components.map((c) => `${c.variety.name} · ${c.vineyard.name} · ${c.vintage} (${Number(c.volumeL)} L)`),
    }));

  const runRows: RunRow[] = runs.map((r) => ({
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    skuName: r.wineSku.name,
    skuVintage: r.wineSku.vintage,
    bottlesProduced: r.bottlesProduced,
    destinationLocationId: r.destinationLocationId,
    location: r.destinationLocation.name,
    vesselIds: [...new Set(r.sources.map((s) => s.vesselId))],
    sources: r.sources.map((s) => `${s.variety.name} · ${s.vineyard.name} · ${s.vintage}: ${Number(s.volumeConsumedL)} L`),
  }));

  return <BottlingClient vessels={vesselOpts} locations={locations} runs={runRows} />;
}
