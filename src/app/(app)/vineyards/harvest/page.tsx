import { requireReadyUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getLatestBrixByBlock, getVineyardHarvest } from "@/lib/harvest/actions";
import type { Unit } from "@/lib/harvest/units";
import { Card } from "@/components/ui";
import { HarvestRouter } from "./HarvestRouter";
import { AdminViewToggle } from "../AdminViewToggle";

export const dynamic = "force-dynamic";

function normalizeUnit(raw: string | null | undefined): Unit {
  return raw === "metric" ? "metric" : "imperial";
}

export default async function HarvestPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; vineyard?: string }>;
}) {
  const user = await requireReadyUser();
  const isAdmin = user.role === "admin";

  if (isAdmin) {
    const sp = await searchParams;
    const view = sp.view === "manager" ? "manager" : "admin";
    const vineyards = await prisma.vineyard.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, detail: { select: { defaultUnit: true } } },
    });
    const pickerVineyards = vineyards.map((v) => ({ id: v.id, name: v.name }));

    // Admin "Manager view": log Brix / estimates / picks for any chosen vineyard.
    if (view === "manager") {
      const selected = vineyards.find((v) => v.id === sp.vineyard) ?? vineyards[0];
      if (!selected) {
        return (
          <div>
            <AdminViewToggle view="manager" />
            <Card style={{ maxWidth: 520 }}>
              <p style={{ color: "var(--text-secondary)", margin: 0 }}>
                No active vineyards yet. Add one under Setup → Varieties &amp; vineyards.
              </p>
            </Card>
          </div>
        );
      }
      const vineyardId = selected.id;
      const [blocks, latestBrix, harvest] = await Promise.all([
        prisma.vineyardBlock.findMany({
          where: { vineyardId },
          orderBy: { sortOrder: "asc" },
          select: { id: true, blockLabel: true, variety: { select: { name: true } } },
        }),
        getLatestBrixByBlock(vineyardId),
        getVineyardHarvest(vineyardId),
      ]);
      return (
        <div>
          <AdminViewToggle view="manager" vineyards={pickerVineyards} selectedVineyardId={vineyardId} />
          <HarvestRouter
            key={vineyardId}
            mode="manager"
            manager={{
              vineyardId,
              vineyardName: selected.name,
              defaultUnit: normalizeUnit(selected.detail?.defaultUnit),
              blocks: blocks.map((b) => ({
                id: b.id,
                label: b.blockLabel ?? b.id,
                varietyName: b.variety?.name ?? null,
              })),
              latestBrix,
              records: harvest.records,
            }}
          />
        </div>
      );
    }

    return (
      <div>
        <AdminViewToggle view="admin" />
        <HarvestRouter mode="admin" admin={{ vineyards: pickerVineyards }} />
      </div>
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
