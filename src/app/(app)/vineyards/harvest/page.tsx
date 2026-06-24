import { requireReadyUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getLatestBrixByBlock, getVineyardHarvest } from "@/lib/harvest/actions";
import type { Unit } from "@/lib/harvest/units";
import { HarvestRouter } from "./HarvestRouter";

export const dynamic = "force-dynamic";

function normalizeUnit(raw: string | null | undefined): Unit {
  return raw === "metric" ? "metric" : "imperial";
}

export default async function HarvestPage() {
  const user = await requireReadyUser();
  const isAdmin = user.role === "admin";

  if (isAdmin) {
    const vineyards = await prisma.vineyard.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return (
      <HarvestRouter
        mode="admin"
        admin={{ vineyards }}
      />
    );
  }

  // Manager (role "user").
  const vineyardId = user.assignedVineyardId;
  if (!vineyardId) {
    return <HarvestRouter mode="manager-unassigned" />;
  }

  const [vineyard, blocks, latestBrix, harvest] = await Promise.all([
    prisma.vineyard.findUnique({
      where: { id: vineyardId },
      select: { name: true, detail: { select: { defaultUnit: true } } },
    }),
    prisma.vineyardBlock.findMany({
      where: { vineyardId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, blockLabel: true, variety: { select: { name: true } } },
    }),
    getLatestBrixByBlock(vineyardId),
    getVineyardHarvest(vineyardId),
  ]);

  const defaultUnit = normalizeUnit(vineyard?.detail?.defaultUnit);

  return (
    <HarvestRouter
      mode="manager"
      manager={{
        vineyardId,
        vineyardName: vineyard?.name ?? "Your vineyard",
        defaultUnit,
        blocks: blocks.map((b) => ({
          id: b.id,
          label: b.blockLabel ?? b.id,
          varietyName: b.variety?.name ?? null,
        })),
        latestBrix,
        records: harvest.records,
      }}
    />
  );
}
