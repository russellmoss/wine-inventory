/**
 * Phase 1 — NAMING-1 / NAMING-2 end-to-end verification (the verify:naming guard).
 *
 * Drives the real cores (renameLotCore / setDisplayNameCore / swapLotCodes) + the resolver
 * (searchLotsByIdentifier / asRecordedWithRename) in the Demo Winery tenant and asserts:
 *   (a) rename appends a LotCodeEvent with from/to,
 *   (a2) rename updates the single current-code LotIdentifier in place; prior code findable via events,
 *   (b) EVERY LotOperationLine.lotCode snapshot is unchanged after rename (the moat — never rewritten),
 *   (c) current-state read returns the new code,
 *   (d) historical read returns the as-recorded code + immediate rename target (A -> B, currently C),
 *   (e) a colliding code rename is OFFERED disambiguation (throws CodeCollisionError) — not silent,
 *   (f) a duplicate displayName is accepted (non-unique),
 *   (g) static scan: no lineage/cost/ledger source filters lots on `code`/`lotCode`,
 *   (h) cross-identifier search resolves a lot by a LotIdentifier value AND by a historical code,
 *   (i) swapLotCodes swaps two lots' codes in one tx with exactly two LotCodeEvents,
 *   (j) setDisplayNameCore canonicalizes (strips control/zero-width, caps, ""->null).
 * Fixtures are ZZ-NM* / system@verify-naming and scrubbed in a finally.
 *
 * Run:  npx tsx --env-file=.env scripts/verify-naming.ts
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import { renameLotCore, setDisplayNameCore, swapLotCodes, CodeCollisionError } from "@/lib/lot/rename";
import { searchLotsByIdentifier, asRecordedWithRename, recordIdentifierTx } from "@/lib/lot/identify";
import { runInTenantTx } from "@/lib/tenant/tx";

const TENANT = "org_demo_winery";
const ACTOR = { actorUserId: null as string | null, actorEmail: "system@verify-naming" };
let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}
async function assertThrows<E extends Error>(
  fn: () => Promise<unknown>,
  msg: string,
  isKind?: (e: unknown) => e is E,
): Promise<E | Error> {
  try {
    await fn();
  } catch (e) {
    if (isKind && !isKind(e)) throw new Error(`ASSERT FAILED: wrong error type — ${msg} (${String(e)})`);
    passed++;
    console.log(`  ✓ ${msg}`);
    return e as E;
  }
  throw new Error(`ASSERT FAILED: expected throw — ${msg}`);
}

const created = { vineyardIds: [] as string[], vesselIds: [] as string[], lotIds: [] as string[] };

async function seedLot(code: string, vesselId: string, volumeL: number, vineyardId: string): Promise<string> {
  const lot = await prisma.lot.create({
    data: { code, form: "WINE", afState: "DRY", originVineyardId: vineyardId, vintageYear: 2024 },
  });
  created.lotIds.push(lot.id);
  await prisma.lotVineyard.create({ data: { lotId: lot.id, vineyardId } });
  await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "SEED",
      lines: [
        { lotId: lot.id, vesselId, deltaL: volumeL },
        { lotId: lot.id, vesselId: null, deltaL: -volumeL, reason: "seed" },
      ] as LedgerLine[],
      actorUserId: null,
      enteredBy: ACTOR.actorEmail,
      lotCodes: new Map([[lot.id, code]]),
      vesselCodes: new Map(),
      capacityByVessel: new Map([[vesselId, 3000]]),
    }),
  );
  // Seed a current-code identifier the way the backfill/import would (so search + flip are exercised).
  await runInTenantTx(async (tx) => {
    await recordIdentifierTx(tx, { lotId: lot.id, kind: "current-code", value: code, isCurrent: true });
  });
  return lot.id;
}

/** (g) Static scan: no lineage/cost/ledger source filters a lot query on the mutable code. */
function staticNoJoinOnCode(): void {
  const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
  const dirs = ["ledger", "cost", "transform", "blend", "compliance"].map((d) => join(REPO, "src", "lib", d));
  // A lot query filtering on the mutable code/lotCode (e.g. `lot.findFirst({ where: { code: ... } })`
  // or a raw `WHERE lotCode = `). Snapshot WRITES (`lotCode:` in a create data) are fine and excluded.
  const forbidden = /\.\s*lot\b[\s\S]{0,80}?where\s*:\s*\{[^}]*\bcode\s*:/m;
  const rawForbidden = /WHERE[^;]*\blotCode\s*=/i;
  const offenders: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts")) {
        const src = readFileSync(p, "utf8");
        if (forbidden.test(src) || rawForbidden.test(src)) offenders.push(p);
      }
    }
  };
  dirs.forEach(walk);
  assert(offenders.length === 0, `no lineage/cost/ledger source joins on code (${offenders.join(", ") || "clean"})`);
}

async function main() {
  await prisma.$queryRaw`SELECT 1`; // warm Neon

  const vy = await prisma.vineyard.create({ data: { name: "ZZ-NM Naming VY" } });
  created.vineyardIds.push(vy.id);
  const tank = await prisma.vessel.create({ data: { code: "ZZ-NM-TANK", type: "TANK", capacityL: 3000 } });
  created.vesselIds.push(tank.id);

  console.log("\n── rename appends history, never rewrites snapshots ──");
  const lotId = await seedLot("ZZ-NM-A", tank.id, 500, vy.id);
  const snapsBefore = await prisma.lotOperationLine.findMany({ where: { lotId }, select: { id: true, lotCode: true } });
  assert(snapsBefore.length > 0 && snapsBefore.every((s) => s.lotCode === "ZZ-NM-A"), "SEED froze the lotCode snapshot");

  const r = await renameLotCore({ lotId, newCode: "ZZ-NM-B", actor: ACTOR, commandId: "zznm-rename-1" });
  assert(r.code === "ZZ-NM-B" && r.renamed, "renameLotCore returns the new code");

  // (a) LotCodeEvent appended
  const ev = await prisma.lotCodeEvent.findFirst({ where: { lotId, field: "code" }, orderBy: { observedAt: "desc" } });
  assert(ev?.fromValue === "ZZ-NM-A" && ev?.toValue === "ZZ-NM-B", "(a) LotCodeEvent appended with from/to");

  // (a2) current-code identifier updated in place; prior code NOT written as a prior-code row
  const cur = await prisma.lotIdentifier.findFirst({ where: { lotId, kind: "current-code" } });
  assert(cur?.value === "ZZ-NM-B", "(a2) current-code identifier updated in place to the new code");
  const priorRows = await prisma.lotIdentifier.count({ where: { lotId, kind: "prior-code" } });
  assert(priorRows === 0, "(a2) no prior-code identifier row written by the app rename path (Q13)");
  const currentCount = await prisma.lotIdentifier.count({ where: { lotId, kind: "current-code" } });
  assert(currentCount === 1, "(a2) exactly one current-code row remains");

  // (b) snapshots unchanged
  const snapsAfter = await prisma.lotOperationLine.findMany({ where: { lotId }, select: { id: true, lotCode: true } });
  assert(snapsAfter.every((s) => s.lotCode === "ZZ-NM-A"), "(b) every LotOperationLine.lotCode snapshot UNCHANGED after rename");

  // (c) current-state read
  const lotNow = await prisma.lot.findUniqueOrThrow({ where: { id: lotId }, select: { code: true } });
  assert(lotNow.code === "ZZ-NM-B", "(c) current-state read returns the new code");

  // (d) historical read: A -> B, currently B (single rename); after a second rename, chain to C
  await renameLotCore({ lotId, newCode: "ZZ-NM-C", actor: ACTOR, commandId: "zznm-rename-2" });
  const asRec = await asRecordedWithRename(lotId, "ZZ-NM-A");
  assert(asRec.asRecorded === "ZZ-NM-A", "(d) historical read returns the as-recorded code");
  assert(asRec.renamedToImmediate === "ZZ-NM-B", "(d) immediate rename target is B (not C — no chain-skip)");
  assert(asRec.currentCode === "ZZ-NM-C", "(d) current code is C");

  // (e) collision OFFERS, not silent
  const otherLotId = await seedLot("ZZ-NM-TAKEN", tank.id, 100, vy.id);
  const err = (await assertThrows(
    () => renameLotCore({ lotId, newCode: "ZZ-NM-TAKEN", actor: ACTOR, commandId: "zznm-rename-3" }),
    "(e) colliding code rename OFFERS disambiguation (throws CodeCollisionError, not silent)",
    (e): e is CodeCollisionError => e instanceof CodeCollisionError,
  )) as CodeCollisionError;
  assert(err.suggestion === "ZZ-NM-TAKEN-2", "(e) the offer suggests ZZ-NM-TAKEN-2");
  const lotStillC = await prisma.lot.findUniqueOrThrow({ where: { id: lotId }, select: { code: true } });
  assert(lotStillC.code === "ZZ-NM-C", "(e) the lot was NOT silently renamed on collision");
  // accepting the offer applies the suggestion
  const accepted = await renameLotCore({ lotId, newCode: "ZZ-NM-TAKEN", actor: ACTOR, commandId: "zznm-rename-4", acceptSuggestion: true });
  assert(accepted.code === "ZZ-NM-TAKEN-2", "(e) accepting the offer applies the -2 suggestion");

  // (f) duplicate displayName accepted (non-unique)
  await setDisplayNameCore({ lotId, displayName: "House Red", actor: ACTOR, commandId: "zznm-dn-1" });
  await setDisplayNameCore({ lotId: otherLotId, displayName: "House Red", actor: ACTOR, commandId: "zznm-dn-2" });
  const dupes = await prisma.lot.count({ where: { id: { in: [lotId, otherLotId] }, displayName: "House Red" } });
  assert(dupes === 2, "(f) a duplicate displayName is accepted (non-unique)");

  // (j) canonicalization (control/zero-width stripped, cleared -> null)
  const zw = "Ta" + String.fromCharCode(0x200b) + "nk" + String.fromCharCode(0x7f) + "9";
  const dn = await setDisplayNameCore({ lotId, displayName: zw, actor: ACTOR, commandId: "zznm-dn-3" });
  assert(dn.displayName === "Tank9", "(j) setDisplayNameCore strips control/zero-width characters");
  const cleared = await setDisplayNameCore({ lotId, displayName: "   ", actor: ACTOR, commandId: "zznm-dn-4" });
  assert(cleared.displayName === null, "(j) whitespace-only displayName normalizes to null (cleared)");

  // (h) cross-identifier search — by a legacy LotIdentifier value AND by a historical code
  await runInTenantTx(async (tx) => {
    await recordIdentifierTx(tx, { lotId, kind: "source-system-id", value: "INV-LEGACY-42", sourceSystem: "innovint" });
  });
  const byLegacy = await searchLotsByIdentifier("INV-LEGACY-42");
  assert(byLegacy.some((m) => m.lotId === lotId && m.matchType === "legacy-identifier"), "(h) search resolves a lot by a LotIdentifier value");
  const byHist = await searchLotsByIdentifier("ZZ-NM-A");
  assert(byHist.some((m) => m.lotId === lotId && m.matchType === "historical-code"), "(h) search resolves a lot by a historical code");
  assert(byHist.find((m) => m.lotId === lotId)?.matchContext === "ZZ-NM-A", "(h) the envelope carries the historical matchContext");

  // (i) swap two lots' codes in one tx with exactly two events
  const swapA = await seedLot("ZZ-NM-SW1", tank.id, 100, vy.id);
  const swapB = await seedLot("ZZ-NM-SW2", tank.id, 100, vy.id);
  const evBefore = await prisma.lotCodeEvent.count({ where: { lotId: { in: [swapA, swapB] } } });
  await swapLotCodes({ lotIdA: swapA, lotIdB: swapB, actor: ACTOR, commandId: "zznm-swap-1" });
  const a2 = await prisma.lot.findUniqueOrThrow({ where: { id: swapA }, select: { code: true } });
  const b2 = await prisma.lot.findUniqueOrThrow({ where: { id: swapB }, select: { code: true } });
  assert(a2.code === "ZZ-NM-SW2" && b2.code === "ZZ-NM-SW1", "(i) swapLotCodes swapped the two codes");
  const evAfter = await prisma.lotCodeEvent.count({ where: { lotId: { in: [swapA, swapB] } } });
  assert(evAfter - evBefore === 2, "(i) swap wrote exactly two LotCodeEvents (no TMP garbage)");
  const noTemp = await prisma.lot.count({ where: { id: { in: [swapA, swapB] }, code: { startsWith: "__swap__" } } });
  assert(noTemp === 0, "(i) no temporary sentinel code leaked");

  // (g) static: nothing joins on code
  console.log("\n── static: no lineage/cost/ledger join on code ──");
  staticNoJoinOnCode();

  console.log(`\nALL ${passed} NAMING ASSERTIONS PASSED (NAMING-1 / NAMING-2 hold).`);
}

async function scrub() {
  // Orphan-robust, pattern/actor-based, FK-safe child->parent order. Each wrapped so a partial fixture
  // never blocks teardown.
  const lots = await prisma.lot.findMany({
    where: { OR: [{ code: { startsWith: "ZZ-NM" } }, { code: { startsWith: "__swap__" } }] },
    select: { id: true },
  });
  const lotIds = lots.map((l) => l.id);
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* ignore */ } };
  if (lotIds.length) {
    await del(() => prisma.lotCodeEvent.deleteMany({ where: { lotId: { in: lotIds } } }));
    await del(() => prisma.lotIdentifier.deleteMany({ where: { lotId: { in: lotIds } } }));
    await del(() => prisma.lotOperationLine.deleteMany({ where: { lotId: { in: lotIds } } }));
    await del(() => prisma.vesselLot.deleteMany({ where: { lotId: { in: lotIds } } }));
    await del(() => prisma.lotVineyard.deleteMany({ where: { lotId: { in: lotIds } } }));
    // ops whose only lines were the deleted lots' — remove childless SEED ops for these lots
    await del(() => prisma.lotOperation.deleteMany({ where: { lines: { none: {} }, enteredBy: ACTOR.actorEmail } }));
    await del(() => prisma.lot.deleteMany({ where: { id: { in: lotIds } } }));
  }
  await del(() => prisma.vessel.deleteMany({ where: { code: { startsWith: "ZZ-NM" } } }));
  await del(() => prisma.vineyard.deleteMany({ where: { name: { startsWith: "ZZ-NM" } } }));
  await del(() => prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } }));
}

runAsTenant(TENANT, async () => {
  await scrub();
  await main().then(scrub);
})
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => {
    console.error("\nFAILED:", e);
    try { await runAsTenant(TENANT, scrub); } catch (se) { console.error("scrub error:", se); }
    await prisma.$disconnect();
    process.exit(1);
  });
