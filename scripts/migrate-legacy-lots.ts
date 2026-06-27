/**
 * Day-Zero migration (Phase 1, Unit 10 / VISION D11).
 *
 * Wraps each existing `vessel_component` row as an `isLegacy` Lot seeded at its current
 * volume, recording a SEED operation through the ledger chokepoint so the `VesselLot`
 * projection is populated. Additive and idempotent: re-runs skip components already
 * migrated (deterministic code `LEGACY-<componentId>`). Fabricates NO lineage and does
 * NOT touch `vessel_component` or `BottlingSource.lotId`. Aborts if per-vessel volume
 * is not conserved (>0.01 L drift).
 *
 * Run:  npx tsx scripts/migrate-legacy-lots.ts
 */
import { prisma } from "@/lib/prisma";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";

async function main() {
  const components = await prisma.vesselComponent.findMany({
    include: { vessel: true, variety: true, vineyard: true },
  });
  console.log(`Day-Zero: ${components.length} vessel_component rows found.`);

  let created = 0;
  let skipped = 0;
  for (const c of components) {
    const code = `LEGACY-${c.id}`;
    if (await prisma.lot.findUnique({ where: { code }, select: { id: true } })) {
      skipped++;
      continue;
    }

    const volumeL = Number(c.volumeL);
    const lot = await prisma.lot.create({
      data: {
        code,
        form: "WINE",
        isLegacy: true,
        originVarietyId: c.varietyId,
        originVineyardId: c.vineyardId,
        vintageYear: c.vintage,
        legacySnapshot: {
          componentId: c.id,
          varietyId: c.varietyId,
          vineyardId: c.vineyardId,
          vintage: c.vintage,
          varietyName: c.variety.name,
          vineyardName: c.vineyard.name,
          vesselId: c.vesselId,
          vesselCode: c.vessel.code,
          volumeL,
        },
      },
    });

    const lines: LedgerLine[] = [
      { lotId: lot.id, vesselId: c.vesselId, deltaL: volumeL },
      { lotId: lot.id, vesselId: null, deltaL: -volumeL, reason: "seed" },
    ];
    await runLedgerWrite((tx) =>
      writeLotOperation(tx, {
        type: "SEED",
        lines,
        actorUserId: null,
        enteredBy: "system@day-zero-migration",
        captureMethod: "IMPORT",
        note: `Day-Zero legacy seed from vessel_component ${c.id}`,
        lotCodes: new Map([[lot.id, code]]),
        vesselCodes: new Map([[c.vesselId, c.vessel.code]]),
        capacityByVessel: new Map(), // recording existing reality; no capacity guard
      }),
    );
    created++;
  }

  // Verify per-vessel volume conservation: sum(vessel_lot) == sum(vessel_component).
  const comps = await prisma.vesselComponent.groupBy({ by: ["vesselId"], _sum: { volumeL: true } });
  const lots = await prisma.vesselLot.groupBy({ by: ["vesselId"], _sum: { volumeL: true } });
  const lotByVessel = new Map(lots.map((l) => [l.vesselId, Number(l._sum.volumeL ?? 0)]));
  let drift = 0;
  for (const c of comps) {
    const compTotal = Number(c._sum.volumeL ?? 0);
    const lotTotal = lotByVessel.get(c.vesselId) ?? 0;
    if (Math.abs(compTotal - lotTotal) > 0.01) {
      drift++;
      console.error(`  DRIFT vessel ${c.vesselId}: components=${compTotal} L vs vessel_lot=${lotTotal} L`);
    }
  }

  console.log(
    `Day-Zero done: created ${created}, skipped ${skipped}. Vessels checked: ${comps.length}. Drift>0.01L: ${drift}.`,
  );
  await prisma.$disconnect();
  if (drift > 0) {
    console.error("ABORT: per-vessel volume drift detected — investigate before trusting the projection.");
    process.exit(1);
  }
  console.log("Volume conservation OK. Projection populated from the ledger.");
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
