import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runAsSystem } from "@/lib/tenant/system";
import {
  acceptReconciliationItemCore,
  confirmMigrationEntityMappingCore,
  confirmMigrationFieldMappingCore,
  createMigrationBatchCore,
  runMigrationPreflightCore,
  signOffMigrationBatchCore,
} from "@/lib/migration/batch";
import { publishMigrationBatchCore } from "@/lib/migration/publish";
import { loadGenericMigrationFixture } from "@/lib/migration/generic-fixture";
import { computeLotCost } from "@/lib/cost/data";

const T = "org_demo_winery";
const actor = { actorUserId: "verify-migration", actorEmail: "verify-migration@demowinery.test", tenantId: T };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log(`ok - ${message}`);
}

async function cleanup() {
  await runAsSystem(async (db) => {
    const batches = await db.migrationImportBatch.findMany({ where: { tenantId: T, sourceSystem: "generic-proof" }, select: { id: true } });
    const batchIds = batches.map((b) => b.id);
    const ops = await db.lotOperation.findMany({
      where: { tenantId: T, batchId: { in: batchIds } },
      select: { id: true },
    });
    const opIds = ops.map((o) => o.id);
    const lotIds = (await db.lotIdentifier.findMany({ where: { tenantId: T, sourceSystem: "generic-proof" }, select: { lotId: true } })).map((r) => r.lotId);
    await db.costLine.deleteMany({ where: { tenantId: T, operationId: { in: opIds } } });
    await db.changeOfTaxClassEvent.deleteMany({ where: { tenantId: T, commandId: { startsWith: `migration:${T}:` } } });
    await db.migrationAnalysisPanel.updateMany({ where: { tenantId: T, importBatchId: { in: batchIds } }, data: { publishedPanelId: null } });
    await db.analysisReading.deleteMany({ where: { tenantId: T, captureId: { startsWith: `migration:${T}:` } } });
    await db.analysisPanel.deleteMany({ where: { tenantId: T, clientRequestId: { startsWith: `migration:${T}:` } } });
    await db.lotOperationLine.deleteMany({ where: { tenantId: T, operationId: { in: opIds } } });
    await db.vesselLot.deleteMany({ where: { tenantId: T, lotId: { in: lotIds } } });
    await db.migrationSeedPosition.updateMany({ where: { tenantId: T, importBatchId: { in: batchIds } }, data: { publishedOperationId: null } });
    await db.lotOperation.deleteMany({ where: { tenantId: T, id: { in: opIds } } });
    await db.legacyOperation.deleteMany({ where: { tenantId: T, importBatchId: { in: batchIds } } });
    await db.migrationAnalysisReading.deleteMany({ where: { tenantId: T, importBatchId: { in: batchIds } } });
    await db.migrationAnalysisPanel.deleteMany({ where: { tenantId: T, importBatchId: { in: batchIds } } });
    await db.migrationSeedPosition.deleteMany({ where: { tenantId: T, importBatchId: { in: batchIds } } });
    await db.migrationSeedLot.deleteMany({ where: { tenantId: T, importBatchId: { in: batchIds } } });
    await db.migrationReconciliationItem.deleteMany({ where: { tenantId: T, importBatchId: { in: batchIds } } });
    await db.migrationImportBatch.deleteMany({ where: { tenantId: T, id: { in: batchIds } } });
    await db.lotIdentifier.deleteMany({ where: { tenantId: T, lotId: { in: lotIds } } });
    await db.lot.deleteMany({ where: { tenantId: T, id: { in: lotIds } } });
    await db.lot.deleteMany({ where: { tenantId: T, id: "verify_migration_collision" } });
    await db.complianceReport.deleteMany({ where: { tenantId: T, id: "verify_migration_filed_report" } });
    await db.vessel.deleteMany({ where: { tenantId: T, id: { in: ["verify_migration_tank_a", "verify_migration_tank_b"] } } });
    await db.bond.deleteMany({ where: { tenantId: T, id: "verify_migration_bond" } });
  });
}

async function setup() {
  await runAsSystem(async (db) => {
    await db.organization.upsert({ where: { id: T }, update: {}, create: { id: T, name: "Demo Winery", slug: T } });
    await db.lot.upsert({
      where: { id: "verify_migration_collision" },
      update: { code: "MIG-COLLIDE", tenantId: T },
      create: { id: "verify_migration_collision", tenantId: T, code: "MIG-COLLIDE" },
    });
    await db.vessel.upsert({
      where: { id: "verify_migration_tank_a" },
      update: { tenantId: T, code: "T-MIG-A", type: "TANK", capacityL: "2000" },
      create: { id: "verify_migration_tank_a", tenantId: T, code: "T-MIG-A", type: "TANK", capacityL: "2000" },
    });
    await db.vessel.upsert({
      where: { id: "verify_migration_tank_b" },
      update: { tenantId: T, code: "T-MIG-B", type: "TANK", capacityL: "2000" },
      create: { id: "verify_migration_tank_b", tenantId: T, code: "T-MIG-B", type: "TANK", capacityL: "2000" },
    });
    await db.bond.upsert({
      where: { id: "verify_migration_bond" },
      update: { tenantId: T, registryNumber: "VERIFY-MIGRATION-BOND", isPrimary: true },
      create: { id: "verify_migration_bond", tenantId: T, registryNumber: "VERIFY-MIGRATION-BOND", isPrimary: true },
    });
    await db.complianceReport.upsert({
      where: { id: "verify_migration_filed_report" },
      update: {
        tenantId: T,
        bondId: "verify_migration_bond",
        periodStart: new Date("2026-06-01T00:00:00.000Z"),
        periodEnd: new Date("2026-06-30T23:59:59.999Z"),
        formType: "TTB_5120_17",
        status: "FILED",
      },
      create: {
        id: "verify_migration_filed_report",
        tenantId: T,
        bondId: "verify_migration_bond",
        periodStart: new Date("2026-06-01T00:00:00.000Z"),
        periodEnd: new Date("2026-06-30T23:59:59.999Z"),
        formType: "TTB_5120_17",
        status: "FILED",
        onHandEnd: {},
        computed: {},
        overrides: {},
      },
    });
  });
}

async function main() {
  await cleanup();
  await setup();
  const fixture = loadGenericMigrationFixture();

  await runAsTenant(T, async () => {
    const { batchId } = await createMigrationBatchCore(actor);
    const firstPreflight = await runMigrationPreflightCore(batchId);
    assert(firstPreflight.status === "PREFLIGHT_BLOCKED", "suggested field mappings do not publish");

    for (const m of fixture.expectedFieldMappings) {
      await confirmMigrationFieldMappingCore(actor, {
        sourceSystem: "generic-proof",
        formatVersion: "phase3-v1",
        ...m,
      });
    }
    await confirmMigrationEntityMappingCore(actor, {
      sourceSystem: "generic-proof",
      sourceDataset: "current-state",
      formatVersion: "phase3-v1",
      sourceObjectType: "vessel",
      sourceKey: "tank-a",
      targetType: "vessel",
      targetId: "verify_migration_tank_a",
      targetCode: "T-MIG-A",
    });
    await confirmMigrationEntityMappingCore(actor, {
      sourceSystem: "generic-proof",
      sourceDataset: "current-state",
      formatVersion: "phase3-v1",
      sourceObjectType: "vessel",
      sourceKey: "tank-b",
      targetType: "vessel",
      targetId: "verify_migration_tank_b",
      targetCode: "T-MIG-B",
    });
    await confirmMigrationEntityMappingCore(actor, {
      sourceSystem: "generic-proof",
      sourceDataset: "current-state",
      formatVersion: "phase3-v1",
      sourceObjectType: "bond",
      sourceKey: "bond-main",
      targetType: "bond",
      targetId: "verify_migration_bond",
      targetCode: "VERIFY-MIGRATION-BOND",
    });
    await confirmMigrationEntityMappingCore(actor, {
      sourceSystem: "generic-proof",
      sourceDataset: "current-state",
      formatVersion: "phase3-v1",
      sourceObjectType: "analyte",
      sourceKey: "ALCOHOL",
      targetType: "analyte",
      targetCode: "ALCOHOL",
    });

    const collisionPreflight = await runMigrationPreflightCore(batchId);
    assert(collisionPreflight.status === "PREFLIGHT_BLOCKED", "code collision blocks preflight");
    const cutoverBlock = await prisma.migrationReconciliationItem.findFirst({
      where: { importBatchId: batchId, kind: "TTB_TOTAL", severity: "BLOCKER", status: "OPEN" },
      select: { id: true },
    });
    assert(cutoverBlock, "cutover at or before a filed 5120.17 period is blocked");
    await confirmMigrationEntityMappingCore(actor, {
      sourceSystem: "generic-proof",
      sourceDataset: "current-state",
      formatVersion: "phase3-v1",
      sourceObjectType: "lot-code",
      sourceKey: "lot-a",
      targetType: "lot-code",
      targetCode: "MIG-A-RESOLVED",
    });
    await prisma.migrationImportBatch.update({
      where: { id: batchId },
      data: { cutoverAt: new Date("2026-07-01T00:00:00.000Z") },
    });

    const ready = await runMigrationPreflightCore(batchId);
    assert(ready.status === "READY_FOR_REVIEW", "preflight reaches review with no blockers");
    const openItems = await prisma.migrationReconciliationItem.findMany({ where: { importBatchId: batchId, status: "OPEN" } });
    assert(openItems.some((i) => i.kind === "FINISHED_GOODS"), "finished goods are reported as a coverage gap");
    for (const item of openItems) {
      await acceptReconciliationItemCore(actor, { itemId: item.id, reason: "Verified named exception in migration proof." });
    }

    const signed = await signOffMigrationBatchCore(actor, batchId);
    assert(signed.status === "SIGNED_OFF", "sign-off freezes the trust packet");
    let mutationBlocked = false;
    try {
      await runMigrationPreflightCore(batchId);
    } catch {
      mutationBlocked = true;
    }
    assert(mutationBlocked, "preflight mutation is blocked after sign-off");

    const published = await publishMigrationBatchCore(actor, batchId);
    const republished = await publishMigrationBatchCore(actor, batchId);
    assert(published.status === "PUBLISHED", "batch publishes");
    assert(published.seedOperationIds.length === fixture.positions.length, "one SEED operation per staged bulk position");
    assert(republished.seedOperationIds.length === published.seedOperationIds.length, "repeat publish returns the same seed set");

    const seedOps = await prisma.lotOperation.findMany({
      where: { batchId, type: "SEED" },
      include: { lines: true },
    });
    assert(seedOps.length === fixture.positions.length, "double publish does not create duplicate SEED ops");
    assert(seedOps.every((op) => op.captureMethod === "IMPORT"), "migration seed ops use IMPORT capture method");
    assert(seedOps.every((op) => op.lines.some((l) => l.destBondId === "verify_migration_bond")), "seed lines stamp line-level bond");

    const vesselLots = await prisma.vesselLot.findMany({ where: { vesselId: { in: ["verify_migration_tank_a", "verify_migration_tank_b"] } } });
    const totalVesselL = vesselLots.reduce((a, r) => a + Number(r.volumeL), 0);
    const totalSourceL = fixture.positions.reduce((a, r) => a + r.volumeL, 0);
    assert(Math.round(totalVesselL * 100) === Math.round(totalSourceL * 100), "VesselLot equals published migration SEED fold");

    const legacy = await prisma.legacyOperation.findMany({ where: { importBatchId: batchId, publishedAt: { not: null } } });
    assert(legacy.length === fixture.legacyOperations.length, "legacy operations are archived and published");
    const legacyLineLeak = await prisma.lotOperationLine.findFirst({ where: { operation: { batchId }, reason: "legacy" } });
    assert(!legacyLineLeak, "legacy archive rows do not enter LotOperationLine");

    const panels = await prisma.analysisPanel.count({ where: { clientRequestId: { startsWith: `migration:${T}:${batchId}:panel:` } } });
    assert(panels === 1, "chemistry publishes to AnalysisPanel");

    const costLine = await prisma.costLine.findFirst({ where: { operationId: { in: published.seedOperationIds }, component: "OPENING_BALANCE" } });
    assert(costLine?.basisCompleteness === "KNOWN", "opening cost basis uses OPENING_BALANCE");
    const cost = await computeLotCost(published.lotIds[0]);
    assert((cost.components.OPENING_BALANCE ?? 0) > 0, "opening balance cost appears through cost authority");
  });

  await cleanup();
  await prisma.$disconnect();
  console.log("verify:migration passed");
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
