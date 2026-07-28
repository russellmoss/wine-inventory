/**
 * Time each query in the ferment worksheet against the real database.
 *
 *   npx tsx --env-file=.env scripts/time-ferment-worksheet.ts
 *
 * Written because /ferment measured 35s in dev and two rounds of guessing at the
 * cause were wrong. Measure, then fix.
 */
import { runAsTenant } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";

const TENANT = process.env.TIMING_TENANT || "org_demo_winery";

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  const out = await fn();
  const n = Array.isArray(out) ? out.length : 1;
  console.log(`  ${String(Date.now() - t0).padStart(6)} ms   ${label}  (${n} rows)`);
  return out;
}

async function main() {
  console.log(`Timing the ferment worksheet against tenant ${TENANT}\n`);

  await runAsTenant(TENANT, async () => {
    const vesselLots = await time("vesselLot.findMany + lot OR filter", () =>
      prisma.vesselLot.findMany({
        where: { volumeL: { gt: 0 }, lot: { OR: [{ afState: "ACTIVE" }, { mlfState: "ACTIVE" }] } },
        include: {
          vessel: { select: { id: true, code: true, type: true, isActive: true } },
          lot: { select: { id: true, code: true, vintageYear: true, form: true, afState: true, mlfState: true, originVarietyId: true } },
        },
      }),
    );

    const lotIds = vesselLots.map((v) => v.lot.id);
    console.log(`\n  ${lotIds.length} fermenting lot(s)\n`);

    await time("variety.findMany", () =>
      prisma.variety.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    );

    if (lotIds.length > 0) {
      const panels = await time("analysisPanel.findMany (bounded, scalar order)", () =>
        prisma.analysisPanel.findMany({
          where: { lotId: { in: lotIds }, voidedAt: null },
          orderBy: { observedAt: "desc" },
          select: { id: true, lotId: true, observedAt: true },
          take: lotIds.length * 6,
        }),
      );

      if (panels.length > 0) {
        await time("analysisReading.findMany (by panelId)", () =>
          prisma.analysisReading.findMany({
            where: { panelId: { in: panels.map((p) => p.id) }, analyte: { in: ["BRIX", "TEMP"] } },
            select: { panelId: true, analyte: true, value: true },
          }),
        );
      }
    }
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
