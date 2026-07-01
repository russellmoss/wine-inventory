/**
 * Reverse a lot's sparkling bottle-phase chain back to the tank (Approach B — the dev/admin tool).
 *
 * Given a lot id or code, it reverses the lot's sparkling operations LIFO — FINISH → DOSAGE →
 * DISGORGEMENT → RIDDLING → TIRAGE — via the SAME cores the UI uses (reverseSparklingOperationCore),
 * so the ledger stays balanced and the wine lands back in its source tank(s). Idempotent-ish: run
 * it again and it stops when there's nothing left to reverse.
 *
 * Run:  npx tsx --env-file=.env scripts/reverse-sparkling.ts <lotIdOrCode> [--yes]
 *
 * Without --yes it's a DRY RUN: it prints the plan and the current/target state, changes nothing.
 * NOTE: a partial disgorgement peels a separate CHILD lot — reverse that child first (run this on
 * the child id), then the parent.
 */
import { prisma } from "@/lib/prisma";
import { reverseSparklingOperationCore } from "@/lib/sparkling/correct";
import type { LedgerActor } from "@/lib/vessels/rack-core";

const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@reverse-sparkling" };
const REVERSIBLE = ["TIRAGE", "RIDDLING", "DISGORGEMENT", "DOSAGE", "FINISH"] as const;

async function resolveLot(idOrCode: string) {
  const lot = await prisma.lot.findFirst({
    where: { OR: [{ id: idOrCode }, { code: idOrCode }] },
    select: { id: true, code: true, form: true, afState: true, status: true },
  });
  if (!lot) throw new Error(`No lot found for "${idOrCode}".`);
  return lot;
}

/** The lot's not-yet-reversed sparkling ops, newest first (RIDDLING has no lines → match treatments). */
async function pendingOps(lotId: string) {
  const ops = await prisma.lotOperation.findMany({
    where: {
      type: { in: [...REVERSIBLE] },
      correctedBy: { is: null },
      OR: [{ lines: { some: { lotId } } }, { treatments: { some: { lotId } } }],
    },
    orderBy: { id: "desc" },
    select: { id: true, type: true },
  });
  return ops;
}

async function tankPositions(lotId: string) {
  const rows = await prisma.vesselLot.findMany({
    where: { lotId },
    include: { vessel: { select: { code: true } } },
    orderBy: { vessel: { code: "asc" } },
  });
  return rows.map((r) => `${r.vessel.code}: ${Number(r.volumeL)} L`);
}

async function printState(label: string, lotId: string) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId }, select: { code: true, form: true, afState: true } });
  const bls = await prisma.bottledLotState.findUnique({ where: { lotId } });
  const tanks = await tankPositions(lotId);
  console.log(`\n[${label}] ${lot?.code}`);
  console.log(`  form=${lot?.form}  af=${lot?.afState}`);
  console.log(`  tanks: ${tanks.length ? tanks.join(", ") : "(none)"}`);
  console.log(`  bottledState: ${bls ? `${bls.bottleCount} bottles / ${Number(bls.volumeL)} L (stage ${bls.stage})` : "(none)"}`);
}

async function main() {
  const idOrCode = process.argv[2];
  const commit = process.argv.includes("--yes");
  if (!idOrCode) throw new Error("Usage: reverse-sparkling.ts <lotIdOrCode> [--yes]");

  const lot = await resolveLot(idOrCode);
  console.log(`Target lot: ${lot.code} (${lot.id}) — status ${lot.status}, form ${lot.form}`);
  await printState("BEFORE", lot.id);

  const plan = await pendingOps(lot.id);
  if (plan.length === 0) {
    console.log("\nNothing to reverse — no pending sparkling operations on this lot.");
    return;
  }
  console.log(`\nWill reverse ${plan.length} op(s) LIFO: ${plan.map((o) => `#${o.id} ${o.type}`).join(" → ")}`);

  if (!commit) {
    console.log("\nDRY RUN (no --yes) — nothing changed. Re-run with --yes to execute.");
    return;
  }

  // Reverse LIFO. Re-query each pass: reversing FINISH reopens the projection and marks the op
  // corrected, so the next latest op becomes reversible.
  let guard = 0;
  for (;;) {
    if (guard++ > 50) throw new Error("Too many reversal iterations — aborting.");
    const [next] = await pendingOps(lot.id);
    if (!next) break;
    const res = await reverseSparklingOperationCore(ACTOR, { operationId: next.id, note: `reverse-sparkling script (${lot.code})` });
    console.log(`  ✓ reversed #${next.id} ${next.type} → correction #${res.correctionId}`);
  }

  await printState("AFTER", lot.id);
  console.log("\nDone. The wine is back in tank (compensating corrections; fully auditable).");
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error("\nFAILED:", e instanceof Error ? e.message : e); await prisma.$disconnect(); process.exit(1); });
