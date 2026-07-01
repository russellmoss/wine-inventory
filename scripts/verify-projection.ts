/**
 * Projection parity checker (Phase 1, Unit 11 / INVARIANT #7).
 *
 * Recomputes the VesselLot projection from the full operation ledger (folding lines in
 * sequence order) and diffs it against the stored projection. Any drift is a bug, not a
 * tolerated state. Exits non-zero on drift so it can gate CI / post-migration.
 *
 * Run:  npx tsx --env-file=.env scripts/verify-projection.ts
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { foldLines, balanceKey, type LedgerLine } from "@/lib/ledger/math";

async function main() {
  // Operations fold in monotonic id order (the autoincrement id IS the sequence).
  const ops = await prisma.lotOperation.findMany({
    orderBy: { id: "asc" },
    include: { lines: true },
  });
  const allLines: LedgerLine[] = ops.flatMap((op) =>
    op.lines.map((l) => ({ lotId: l.lotId, vesselId: l.vesselId, deltaL: Number(l.deltaL) })),
  );
  const folded = foldLines([], allLines);

  const proj = await prisma.vesselLot.findMany();
  const f = new Map(folded.map((b) => [balanceKey(b.vesselId, b.lotId), Math.round(b.volumeL * 100) / 100]));
  const p = new Map(proj.map((r) => [balanceKey(r.vesselId, r.lotId), Math.round(Number(r.volumeL) * 100) / 100]));

  let drift = 0;
  for (const [k, v] of f) {
    if (p.get(k) !== v) {
      drift++;
      console.error(`  MISMATCH ${k}: fold=${v} proj=${p.get(k) ?? "(none)"}`);
    }
  }
  for (const [k, v] of p) {
    if (!f.has(k)) {
      drift++;
      console.error(`  EXTRA projection row ${k}=${v} (not in ledger fold)`);
    }
  }

  console.log(
    JSON.stringify({ operations: ops.length, ledgerLines: allLines.length, foldedRows: folded.length, projectionRows: proj.length, drift }),
  );
  await prisma.$disconnect();
  if (drift > 0) {
    console.error("PROJECTION DRIFT — the projection does not equal the fold of the ledger.");
    process.exit(1);
  }
  console.log("OK: projection == fold of the ledger.");
}

runAsTenant("org_bhutan_wine_co", main).catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
