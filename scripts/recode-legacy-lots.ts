/**
 * One-time recode of legacy lots to the readable scheme (plan 017, Unit 5).
 *
 * DECLARED EXCEPTION to the "lot code is immutable after the first operation" invariant
 * (docs/INVARIANTS.md), analogous to the Day-Zero migration (D11): legacy lots carry
 * machine codes (LEGACY-<cuid>) that are unusable for humans. We rename them to
 * YEAR-VINEYARD-VARIETY (block omitted — unknown for legacy lots) and refresh the durable
 * lotCode snapshots on their ledger lines so the timeline stays consistent.
 *
 * Idempotent: a lot whose code no longer starts with "LEGACY-" is skipped. Deterministic
 * order (by createdAt, id) so re-runs and disambiguation are stable.
 *
 * Run:  npx tsx --env-file=.env scripts/recode-legacy-lots.ts
 */
import { prisma } from "@/lib/prisma";
import { buildLotCode, disambiguate } from "@/lib/lot/code";

type Snapshot = { varietyName?: string | null; vineyardName?: string | null } | null;

async function abbrForVariety(id: string | null, snap: Snapshot): Promise<string | null> {
  if (id) {
    const v = await prisma.variety.findUnique({ where: { id }, select: { abbreviation: true } });
    if (v?.abbreviation) return v.abbreviation;
  }
  if (snap?.varietyName) {
    const v = await prisma.variety.findFirst({ where: { name: snap.varietyName }, select: { abbreviation: true } });
    if (v?.abbreviation) return v.abbreviation;
  }
  return null;
}

async function abbrForVineyard(id: string | null, snap: Snapshot): Promise<string | null> {
  if (id) {
    const v = await prisma.vineyard.findUnique({ where: { id }, select: { abbreviation: true } });
    if (v?.abbreviation) return v.abbreviation;
  }
  if (snap?.vineyardName) {
    const v = await prisma.vineyard.findFirst({ where: { name: snap.vineyardName }, select: { abbreviation: true } });
    if (v?.abbreviation) return v.abbreviation;
  }
  return null;
}

async function main() {
  const legacy = await prisma.lot.findMany({
    where: { isLegacy: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, code: true, originVarietyId: true, originVineyardId: true, vintageYear: true, legacySnapshot: true },
  });
  const taken = new Set((await prisma.lot.findMany({ select: { code: true } })).map((l) => l.code));

  let recoded = 0;
  let skipped = 0;
  for (const lot of legacy) {
    if (!lot.code.startsWith("LEGACY-")) {
      skipped++;
      console.log(`  skip ${lot.code} (already recoded)`);
      continue;
    }
    const snap = (lot.legacySnapshot as Snapshot) ?? null;
    const vineyardAbbr = await abbrForVineyard(lot.originVineyardId, snap);
    const varietyAbbr = await abbrForVariety(lot.originVarietyId, snap);
    if (!vineyardAbbr || !varietyAbbr || lot.vintageYear == null) {
      skipped++;
      console.log(`  skip ${lot.code} (missing abbreviation or vintage: vineyard=${vineyardAbbr} variety=${varietyAbbr} vintage=${lot.vintageYear})`);
      continue;
    }
    const base = buildLotCode({ vintage: lot.vintageYear, vineyardAbbr, varietyAbbr });
    taken.delete(lot.code); // free the old code from the collision set
    const newCode = disambiguate(base, taken);

    await prisma.$transaction(async (tx) => {
      await tx.lot.update({ where: { id: lot.id }, data: { code: newCode } });
      // Refresh durable lotCode snapshots on this lot's ledger lines (keeps the timeline honest).
      await tx.lotOperationLine.updateMany({ where: { lotId: lot.id }, data: { lotCode: newCode } });
    });
    taken.add(newCode);
    recoded++;
    console.log(`  ${lot.code}  ->  ${newCode}`);
  }

  console.log(`\nDone: recoded ${recoded}, skipped ${skipped}.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
