/**
 * Assistant cellar contents + transform WO verification.
 *
 * Demo Winery fixtures only for the main path (`ZZAC-*`). A throwaway second tenant is created only for
 * the explicit cross-tenant leak probe, then scrubbed. This script avoids assistant model calls: it drives
 * the deterministic read model, NL resolver, readiness freshness guard, and work-order cores directly.
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { queryCellarContents } from "@/lib/cellar/contents-query";
import { buildNlWorkOrderCommitArgs, buildNlWorkOrderProposal, assertFreshNlWorkOrderProposal } from "@/lib/work-orders/nl-resolve";
import { instantiateTaskBuilds } from "@/lib/work-orders/template-vocabulary";
import { createWorkOrderCore, issueWorkOrderCore } from "@/lib/work-orders/lifecycle";
import { completeTaskCore } from "@/lib/work-orders/execute";
import type { LedgerActor } from "@/lib/vessels/rack-core";

const TENANT = "org_demo_winery";
const OTHER_TENANT = "org_assistant_cellar_leak_probe";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-assistant-cellar" };

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  OK ${msg}`);
}

async function scrubTenant(prefix = "ZZAC") {
  const wos = await prisma.workOrder.findMany({ where: { title: { startsWith: prefix } }, select: { id: true } });
  const woIds = wos.map((w) => w.id);
  await prisma.reservation.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => {});
  await prisma.workOrder.deleteMany({ where: { id: { in: woIds } } }).catch(() => {});

  const ops = await prisma.lotOperation.findMany({ where: { enteredBy: ACTOR.actorEmail }, select: { id: true } }).catch(() => []);
  const opIds = ops.map((op) => op.id);
  await prisma.workOrderTaskAttempt.deleteMany({ where: { operationId: { in: opIds } } }).catch(() => {});
  await prisma.lotTreatment.deleteMany({ where: { operationId: { in: opIds } } }).catch(() => {});
  await prisma.vesselTransfer.deleteMany({ where: { lotOperationId: { in: opIds } } }).catch(() => {});
  await prisma.lotOperation.deleteMany({ where: { id: { in: opIds } } }).catch(() => {});

  const lots = await prisma.lot.findMany({ where: { code: { startsWith: prefix } }, select: { id: true } });
  const lotIds = lots.map((l) => l.id);
  await prisma.vesselLot.deleteMany({ where: { lotId: { in: lotIds } } }).catch(() => {});
  await prisma.lotVineyard.deleteMany({ where: { lotId: { in: lotIds } } }).catch(() => {});
  await prisma.lotLineage.deleteMany({ where: { OR: [{ parentLotId: { in: lotIds } }, { childLotId: { in: lotIds } }] } }).catch(() => {});
  await prisma.lot.deleteMany({ where: { id: { in: lotIds } } }).catch(() => {});

  await prisma.vessel.deleteMany({ where: { code: { startsWith: `${prefix}-` } } }).catch(() => {});
  await prisma.variety.deleteMany({ where: { name: { startsWith: `${prefix} ` } } }).catch(() => {});
  await prisma.vineyard.deleteMany({ where: { name: { startsWith: `${prefix} ` } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } }).catch(() => {});
}

async function seedMustFixture(prefix = "ZZAC") {
  const variety = await prisma.variety.create({ data: { name: `${prefix} Cabernet Sauvignon`, abbreviation: "ZCS" } });
  const vineyard = await prisma.vineyard.create({ data: { name: `${prefix} QBO Demo Vineyard`, abbreviation: "ZQ" } });
  const src = await prisma.vessel.create({ data: { code: `${prefix}-T6`, type: "TANK", capacityL: 5000 } });
  const dest = await prisma.vessel.create({ data: { code: `${prefix}-T5`, type: "TANK", capacityL: 5000 } });
  const crushDest = await prisma.vessel.create({ data: { code: `${prefix}-T12`, type: "TANK", capacityL: 5000 } });
  const lot = await prisma.lot.create({
    data: {
      code: `${prefix}-MUST-1`,
      form: "MUST",
      originVarietyId: variety.id,
      originVineyardId: vineyard.id,
      vintageYear: 2026,
    },
  });
  await prisma.lotVineyard.create({ data: { lotId: lot.id, vineyardId: vineyard.id } });
  await prisma.vesselLot.create({ data: { vesselId: src.id, lotId: lot.id, volumeL: 1200 } });
  return { variety, vineyard, src, dest, crushDest, lot };
}

async function issueFromProposal(raw: unknown) {
  const proposal = await buildNlWorkOrderProposal(raw);
  assert(proposal.status === "ready", "proposal is ready");
  const args = buildNlWorkOrderCommitArgs(proposal);
  await assertFreshNlWorkOrderProposal(args);
  const created = await createWorkOrderCore(ACTOR, { title: args.title, tasks: instantiateTaskBuilds(args.taskBuilds) });
  const issued = await issueWorkOrderCore(ACTOR, { workOrderId: created.workOrderId });
  assert(issued.status === "ISSUED", "work order issued");
  return created.workOrderId;
}

async function assertThrows(fn: () => Promise<unknown>, msg: string) {
  try {
    await fn();
  } catch (e) {
    passed++;
    console.log(`  OK ${msg} (${e instanceof Error ? e.message : String(e)})`);
    return;
  }
  throw new Error(`ASSERT FAILED: ${msg}`);
}

async function mainPath() {
  await runAsTenant(TENANT, async () => {
    await scrubTenant();
    const f = await seedMustFixture();

    const single = await queryCellarContents({ vessel: "ZZAC-T6" });
    assert(single.vessels.length === 1 && single.vessels[0].lots[0].lotId === f.lot.id, "contents query answers single-vessel lookup");
    const byVariety = await queryCellarContents({ variety: "ZZAC Cabernet", vesselType: "TANK" });
    assert(byVariety.vessels.some((v) => v.vesselId === f.src.id), "reverse variety query finds the source tank");
    const byVineyard = await queryCellarContents({ vineyard: "ZZAC QBO Demo", vesselType: "TANK" });
    assert(byVineyard.vessels.some((v) => v.vesselId === f.src.id), "reverse vineyard query uses LotVineyard source membership");

    const opsBeforeIssue = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } });
    const pressWoId = await issueFromProposal({
      sourceText: "Press ZZAC-T6 into ZZAC-T5",
      title: "ZZAC press proposal",
      tasks: [{ kind: "PRESS", sourceVessel: "ZZAC-T6", destVessel: "ZZAC-T5", op: "PRESS" }],
    });
    const pressTask = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: pressWoId } });
    assert(pressTask.lotId === f.lot.id && pressTask.sourceVesselId === f.src.id, "PRESS canonical lot/source columns populated after issue");
    assert(pressTask.destVesselId == null, "PRESS destination hint stays out of canonical destVesselId");
    assert(((pressTask.plannedPayload ?? {}) as Record<string, unknown>).plannedDestVesselId === f.dest.id, "PRESS destination hint remains in plannedPayload");

    const crushWoId = await issueFromProposal({
      sourceText: "Crush into ZZAC-T12",
      title: "ZZAC crush proposal",
      tasks: [{ kind: "CRUSH", destVessel: "ZZAC-T12" }],
    });
    const crushTask = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: crushWoId } });
    assert(crushTask.destVesselId === f.crushDest.id, "CRUSH canonical destination column populated after issue");

    const opsAfterIssue = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } });
    assert(opsAfterIssue === opsBeforeIssue, "confirmed authoring issued work orders but wrote no LotOperation rows");

    await assertThrows(
      () => buildNlWorkOrderProposal({ sourceText: "Press ZZAC-T5", tasks: [{ kind: "PRESS", sourceVessel: "ZZAC-T5" }] }),
      "PRESS with no active MUST source blocks before confirmation",
    );

    const staleProposal = await buildNlWorkOrderProposal({
      sourceText: "Press ZZAC-T6",
      title: "ZZAC stale proposal",
      tasks: [{ kind: "PRESS", sourceVessel: "ZZAC-T6" }],
    });
    const staleArgs = buildNlWorkOrderCommitArgs(staleProposal);
    await prisma.vesselLot.deleteMany({ where: { lotId: f.lot.id, vesselId: f.src.id } });
    await assertThrows(() => assertFreshNlWorkOrderProposal(staleArgs), "stale PRESS proposal is rejected at issue time");

    await prisma.vesselLot.create({ data: { vesselId: f.src.id, lotId: f.lot.id, volumeL: 1200 } });
    const staleCompletionWoId = await issueFromProposal({
      sourceText: "Press ZZAC-T6",
      title: "ZZAC stale completion",
      tasks: [{ kind: "PRESS", sourceVessel: "ZZAC-T6" }],
    });
    const staleTask = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: staleCompletionWoId } });
    await prisma.vesselLot.deleteMany({ where: { lotId: f.lot.id, vesselId: f.src.id } });
    const beforeCompleteOps = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } });
    await assertThrows(
      () => completeTaskCore(ACTOR, {
        taskId: staleTask.id,
        commandId: "zzac-stale-complete",
        actualPayload: {
          parentLotId: f.lot.id,
          sourceVesselId: f.src.id,
          fractions: [{ destVesselId: f.dest.id, volumeL: 100, label: "free-run" }],
        },
      }),
      "stale PRESS task is blocked at completion",
    );
    const afterCompleteOps = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } });
    assert(afterCompleteOps === beforeCompleteOps, "stale completion wrote no LotOperation rows");
  });
}

async function crossTenantProbe() {
  await prisma.organization.upsert({
    where: { id: OTHER_TENANT },
    update: {},
    create: { id: OTHER_TENANT, name: "Assistant Cellar Leak Probe", slug: OTHER_TENANT },
  });
  await runAsTenant(OTHER_TENANT, async () => {
    await scrubTenant("ZZACX");
    await seedMustFixture("ZZACX");
  });
  await runAsTenant(TENANT, async () => {
    const byVariety = await queryCellarContents({ variety: "ZZACX Cabernet", vesselType: "TANK" });
    const byVineyard = await queryCellarContents({ vineyard: "ZZACX QBO Demo", vesselType: "TANK" });
    assert(byVariety.vessels.length === 0, "cross-tenant variety reverse search returns no other-tenant vessels");
    assert(byVineyard.vessels.length === 0, "cross-tenant vineyard reverse search returns no other-tenant vessels");
  });
}

async function main() {
  await mainPath();
  await crossTenantProbe();
  console.log(`\nALL ASSISTANT CELLAR CONTENTS CHECKS PASSED (${passed} assertions)`);
}

main()
  .catch((e) => {
    console.error("\nVERIFY FAILED\n", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await runAsTenant(TENANT, () => scrubTenant()).catch((e) => console.error("demo scrub error", e));
    await runAsTenant(OTHER_TENANT, () => scrubTenant("ZZACX")).catch(() => {});
    await prisma.organization.delete({ where: { id: OTHER_TENANT } }).catch(() => {});
    await prisma.$disconnect();
  });
