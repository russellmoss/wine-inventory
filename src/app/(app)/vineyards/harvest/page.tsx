import { requireReadyUser, isTenantAdminLike } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getLatestBrixByBlock, getVineyardHarvest } from "@/lib/harvest/actions";
import { Card } from "@/components/ui";
import { HarvestRouter } from "./HarvestRouter";
import { AdminViewToggle } from "../AdminViewToggle";
import { ManagerVineyardSwitcher } from "../ManagerVineyardSwitcher";

export const dynamic = "force-dynamic";

export default async function HarvestPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; vineyard?: string }>;
}) {
  const user = await requireReadyUser();
  const isAdmin = isTenantAdminLike(user);

  if (isAdmin) {
    const sp = await searchParams;
    const view = sp.view === "manager" ? "manager" : "admin";
    const vineyards = await prisma.vineyard.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
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
          select: {
        id: true,
        blockLabel: true,
        variety: { select: { id: true, name: true, color: true } },
      },
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
              blocks: blocks.map((b) => ({
                id: b.id,
                label: b.blockLabel ?? b.id,
                varietyName: b.variety?.name ?? null,
                varietyId: b.variety?.id ?? null,
                varietyColor: b.variety?.color ?? null,
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

  // Manager (role "user"). D9: a manager may belong to N vineyards; a single-vineyard
  // manager behaves exactly as before (the switcher renders nothing).
  if (user.vineyardIds.length === 0) {
    return <HarvestRouter mode="manager-unassigned" />;
  }
  const sp = await searchParams;
  const vineyardId =
    sp.vineyard && user.vineyardIds.includes(sp.vineyard) ? sp.vineyard : user.vineyardIds[0];
  const myVineyards =
    user.vineyardIds.length > 1
      ? await prisma.vineyard.findMany({
          where: { id: { in: user.vineyardIds } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [];

  const [vineyard, blocks, latestBrix, harvest] = await Promise.all([
    prisma.vineyard.findUnique({
      where: { id: vineyardId },
      select: { name: true },
    }),
    prisma.vineyardBlock.findMany({
      where: { vineyardId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        blockLabel: true,
        variety: { select: { id: true, name: true, color: true } },
      },
    }),
    getLatestBrixByBlock(vineyardId),
    getVineyardHarvest(vineyardId),
  ]);

  return (
    <div>
      <ManagerVineyardSwitcher vineyards={myVineyards} selectedId={vineyardId} />
      <HarvestRouter
        key={vineyardId}
        mode="manager"
        manager={{
          vineyardId,
          vineyardName: vineyard?.name ?? "Your vineyard",
          blocks: blocks.map((b) => ({
            id: b.id,
            label: b.blockLabel ?? b.id,
            varietyName: b.variety?.name ?? null,
            varietyId: b.variety?.id ?? null,
            varietyColor: b.variety?.color ?? null,
          })),
          latestBrix,
          records: harvest.records,
        }}
      />
    </div>
  );
}
