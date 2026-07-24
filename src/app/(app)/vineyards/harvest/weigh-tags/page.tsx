import { requireReadyUser, requireActiveTenant } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { listOwnersCore } from "@/lib/owner/data";
import { listGrowersCore } from "@/lib/grower/data";
import { WeighTagIntake, type RecentTag } from "./WeighTagIntake";

// Plan 093 Unit 10b: the weigh-tag entry screen — the wet-hands crush-pad receiving surface. Server
// component loads the reference data (owners/growers/blocks) for the pickers + the recent tags.

export const dynamic = "force-dynamic";

export default async function WeighTagsPage() {
  await requireReadyUser();
  await requireActiveTenant();

  const [owners, growers, blocks, tags] = await Promise.all([
    listOwnersCore(),
    listGrowersCore(),
    prisma.vineyardBlock.findMany({
      orderBy: [{ sortOrder: "asc" }],
      select: { id: true, blockLabel: true, code: true, vineyard: { select: { name: true } } },
    }),
    prisma.weighTag.findMany({
      orderBy: { tagNumber: "desc" },
      take: 30,
      select: {
        id: true,
        tagNumber: true,
        truck: true,
        weighmaster: true,
        netKg: true,
        issuedAt: true,
        voidedAt: true,
        voidedReason: true,
        lines: { select: { needsOwnerAssignment: true } },
      },
    }),
  ]);

  const recent: RecentTag[] = tags.map((t) => ({
    id: t.id,
    tagNumber: t.tagNumber,
    truck: t.truck,
    weighmaster: t.weighmaster,
    netKg: t.netKg == null ? null : Number(t.netKg),
    issuedAt: t.issuedAt.toISOString(),
    voided: t.voidedAt != null,
    voidedReason: t.voidedReason,
    lineCount: t.lines.length,
    needsAssignmentCount: t.lines.filter((l) => l.needsOwnerAssignment).length,
  }));

  return (
    <WeighTagIntake
      owners={owners.filter((o) => o.isActive).map((o) => ({ id: o.id, name: o.name }))}
      growers={growers.filter((g) => g.isActive).map((g) => ({ id: g.id, name: g.name }))}
      blocks={blocks.map((b) => ({ id: b.id, label: `${b.vineyard.name} · ${b.blockLabel ?? b.code ?? b.id}` }))}
      recent={recent}
    />
  );
}
