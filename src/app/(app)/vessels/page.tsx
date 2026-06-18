import { prisma } from "@/lib/prisma";
import { computeFill } from "@/lib/vessels/fill";
import { VesselsClient, type VesselRow } from "./VesselsClient";

export default async function VesselsPage() {
  const vessels = await prisma.vessel.findMany({
    include: { components: { select: { volumeL: true } } },
  });
  // Natural sort: codes are strings ("1","2","10"), so sort numerically not lexically.
  vessels.sort((a, b) =>
    a.isActive !== b.isActive
      ? (a.isActive ? -1 : 1)
      : a.code.localeCompare(b.code, undefined, { numeric: true }),
  );

  const rows: VesselRow[] = vessels.map((v) => {
    const fill = computeFill(
      v.components.map((c) => Number(c.volumeL)),
      Number(v.capacityL),
    );
    return {
      id: v.id,
      code: v.code,
      type: v.type,
      capacityL: Number(v.capacityL),
      isActive: v.isActive,
      componentCount: v.components.length,
      filledL: fill.filledL,
      pct: fill.pct,
      over: fill.over,
      oakOrigin: v.oakOrigin,
      cooperageYear: v.cooperageYear,
      cooperage: v.cooperage,
      toastLevel: v.toastLevel,
    };
  });

  return <VesselsClient vessels={rows} />;
}
