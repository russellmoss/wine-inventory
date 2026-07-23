import { Prisma } from "@prisma/client";
import { ActionError } from "@/lib/action-error";
import { writeLotOperation, runLedgerWrite } from "@/lib/ledger/write";
import { recordIdentifierTx, CURRENT_CODE_KIND } from "@/lib/lot/identify";
import { recordTaxClassEventTx } from "@/lib/compliance/tax-class-event-core";
import { WINE_TAX_CLASSES, type WineTaxClass } from "@/lib/compliance/types";
import { requireTenantId } from "@/lib/tenant/context";
import { migrationCommandId, type MigrationActor } from "./batch";

type PublishResult = {
  batchId: string;
  status: string;
  seedOperationIds: number[];
  lotIds: string[];
  legacyRowsPublished: number;
};

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function publishedResult(db: Prisma.TransactionClient, batchId: string, sourceSystem: string): Promise<PublishResult> {
  const [batch, positions, lots, legacyRowsPublished] = await Promise.all([
    db.migrationImportBatch.findUnique({ where: { id: batchId }, select: { status: true } }),
    db.migrationSeedPosition.findMany({ where: { importBatchId: batchId }, select: { publishedOperationId: true } }),
    db.lotIdentifier.findMany({
      where: { sourceSystem, sourceObjectType: "lot" },
      select: { lotId: true },
    }),
    db.legacyOperation.count({ where: { importBatchId: batchId, publishedAt: { not: null } } }),
  ]);
  return {
    batchId,
    status: batch?.status ?? "UNKNOWN",
    seedOperationIds: positions.map((p) => p.publishedOperationId).filter((id): id is number => id != null),
    lotIds: [...new Set(lots.map((l) => l.lotId))],
    legacyRowsPublished,
  };
}

export async function publishMigrationBatchCore(actor: MigrationActor, batchId: string): Promise<PublishResult> {
  const tenantId = requireTenantId();
  return runLedgerWrite(async (tx) => {
    const batch = await tx.migrationImportBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new ActionError("Migration batch not found.");
    if (batch.status === "PUBLISHED") return publishedResult(tx, batchId, batch.sourceSystem);
    if (batch.status !== "SIGNED_OFF") throw new ActionError("Only signed-off migration batches can be published.", "CONFLICT");
    const open = await tx.migrationReconciliationItem.count({ where: { importBatchId: batchId, status: "OPEN" } });
    if (open > 0) throw new ActionError("Publish is blocked while reconciliation items are open.", "CONFLICT");

    const [seedLots, positions, panels, readings, settings] = await Promise.all([
      tx.migrationSeedLot.findMany({ where: { importBatchId: batchId }, orderBy: { sourceLotKey: "asc" } }),
      tx.migrationSeedPosition.findMany({ where: { importBatchId: batchId }, orderBy: { sourcePositionKey: "asc" } }),
      tx.migrationAnalysisPanel.findMany({ where: { importBatchId: batchId }, orderBy: { sourcePanelKey: "asc" } }),
      tx.migrationAnalysisReading.findMany({ where: { importBatchId: batchId }, orderBy: { sourceReadingKey: "asc" } }),
      tx.appSettings.findFirst({ select: { currency: true, costingPolicyVersion: true } }),
    ]);
    if (positions.some((p) => !p.vesselId || !p.bondId)) {
      throw new ActionError("Every seed position needs a resolved vessel and bond before publish.", "CONFLICT");
    }

    const lotIdBySeedLotId = new Map<string, string>();
    const lotCodeById = new Map<string, string>();
    for (const seed of seedLots) {
      const sourceValue = seed.sourceSystemId || seed.sourceLotKey;
      const existingIdentifier = await tx.lotIdentifier.findFirst({
        where: { sourceSystem: batch.sourceSystem, sourceObjectType: "lot", value: sourceValue },
        select: { lotId: true },
      });
      let lot = existingIdentifier
        ? await tx.lot.findUnique({ where: { id: existingIdentifier.lotId }, select: { id: true, code: true } })
        : null;
      const finalCode = seed.resolvedCode || seed.code;
      if (!lot) {
        const collision = await tx.lot.findFirst({ where: { code: finalCode }, select: { id: true } });
        if (collision) throw new ActionError(`Lot code ${finalCode} still collides. Resolve it before publish.`, "CONFLICT");
        lot = await tx.lot.create({
          data: {
            code: finalCode,
            displayName: seed.displayName,
            form: seed.form as never,
            productType: (seed.productType ?? "WINE") as never,
            carbonation: (seed.carbonation ?? "NONE") as never,
            vintageYear: seed.vintageYear,
            isLegacy: true,
            legacySnapshot: seed.legacySnapshot ?? Prisma.JsonNull,
            provenanceComplete: false,
            // ⚠️ Plan 093 Unit 4b — DEFERRED: a migrated custom-crush lot should land OWNED. The seed shape
            // does not yet carry an owner, so this stamps Estate (NULL). Currently correct (no client imports
            // exist), but the seed→owner mapping (add seed.ownerName → resolve-or-create Owner) is the one
            // remaining Unit 4b piece; the eng-review flagged this exact site as the silent-NULL landmine.
            ownerId: null,
          },
          select: { id: true, code: true },
        });
        await recordIdentifierTx(tx, {
          lotId: lot.id,
          kind: CURRENT_CODE_KIND,
          value: finalCode,
          isCurrent: true,
        });
        await recordIdentifierTx(tx, {
          lotId: lot.id,
          kind: "source-system-id",
          sourceSystem: batch.sourceSystem,
          sourceObjectType: "lot",
          value: sourceValue,
          isCurrent: true,
        });
      }
      lotIdBySeedLotId.set(seed.id, lot.id);
      lotCodeById.set(lot.id, lot.code);
      await tx.legacyOperation.updateMany({
        where: { importBatchId: batchId, sourceLotKey: seed.sourceLotKey },
        data: { lotId: lot.id, lotCode: lot.code },
      });
    }

    const vesselIds = [...new Set(positions.map((p) => p.vesselId).filter((id): id is string => !!id))];
    const vessels = await tx.vessel.findMany({ where: { id: { in: vesselIds } }, select: { id: true, code: true, capacityL: true } });
    const vesselCodeById = new Map(vessels.map((v) => [v.id, v.code]));
    const capacityByVessel = new Map(vessels.map((v) => [v.id, Number(v.capacityL)]));

    const panelIdByStagedId = new Map<string, string>();
    for (const panel of panels) {
      const lotId = lotIdBySeedLotId.get(panel.seedLotId);
      if (!lotId) throw new ActionError("Staged chemistry references an unresolved lot.", "CONFLICT");
      const clientRequestId = `migration:${tenantId}:${batchId}:panel:${panel.sourcePanelKey}`;
      let live = await tx.analysisPanel.findFirst({ where: { clientRequestId }, select: { id: true } });
      if (!live) {
        live = await tx.analysisPanel.create({
          data: {
            lotId,
            vesselId: panel.vesselId,
            observedAt: panel.observedAt,
            enteredById: actor.actorUserId,
            enteredByEmail: panel.enteredByEmail ?? actor.actorEmail,
            captureMethod: "IMPORT",
            note: panel.note,
            clientRequestId,
          },
          select: { id: true },
        });
      }
      panelIdByStagedId.set(panel.id, live.id);
      await tx.migrationAnalysisPanel.update({ where: { id: panel.id }, data: { publishedPanelId: live.id } });
    }

    for (const reading of readings) {
      const panelId = panelIdByStagedId.get(reading.panelId);
      if (!panelId) throw new ActionError("Staged chemistry reading references an unresolved panel.", "CONFLICT");
      const captureId = `migration:${tenantId}:${batchId}:reading:${reading.sourceReadingKey || reading.id}`;
      const existing = await tx.analysisReading.findFirst({ where: { captureId }, select: { id: true } });
      if (!existing) {
        await tx.analysisReading.create({
          data: { panelId, analyte: reading.analyte, value: reading.value, unit: reading.unit, captureId },
        });
      }
    }

    const operationIds: number[] = [];
    for (const pos of positions) {
      const existingId = pos.publishedOperationId;
      if (existingId) {
        operationIds.push(existingId);
        continue;
      }
      const lotId = lotIdBySeedLotId.get(pos.seedLotId);
      if (!lotId || !pos.vesselId || !pos.bondId) throw new ActionError("Staged position is not publishable.", "CONFLICT");
      const commandId = migrationCommandId(batchId, pos.id);
      const duplicate = await tx.lotOperation.findUnique({ where: { commandId }, select: { id: true, tenantId: true, metadata: true } });
      let opId: number;
      if (duplicate) {
        const meta = duplicate.metadata as { migration?: { importBatchId?: string; seedPositionId?: string } } | null;
        if (duplicate.tenantId !== tenantId || meta?.migration?.importBatchId !== batchId || meta.migration.seedPositionId !== pos.id) {
          throw new ActionError("Migration seed command id collided with a different operation.", "CONFLICT");
        }
        opId = duplicate.id;
      } else {
        opId = await writeLotOperation(tx, {
          type: "SEED",
          captureMethod: "IMPORT",
          observedAt: batch.cutoverAt,
          actorUserId: actor.actorUserId,
          enteredBy: actor.actorEmail,
          commandId,
          batchId,
          metadata: asJson({ migration: { importBatchId: batchId, seedPositionId: pos.id, sourcePositionKey: pos.sourcePositionKey } }),
          lotCodes: lotCodeById,
          vesselCodes: vesselCodeById,
          capacityByVessel,
          lines: [
            { lotId, vesselId: pos.vesselId, deltaL: Number(pos.volumeL), destBondId: pos.bondId },
            { lotId, vesselId: null, deltaL: -Number(pos.volumeL), reason: "seed" },
          ],
        });
      }
      await tx.migrationSeedPosition.update({ where: { id: pos.id }, data: { publishedOperationId: opId } });
      operationIds.push(opId);
      if (pos.costAmount != null) {
        await tx.costLine.create({
          data: {
            operationId: opId,
            lotId,
            component: "OPENING_BALANCE",
            amount: pos.costAmount,
            currency: pos.costCurrency ?? settings?.currency ?? "USD",
            basisCompleteness: pos.costCompleteness as never,
            policyVersion: settings?.costingPolicyVersion ?? 1,
            note: `Opening balance imported from ${batch.sourceName ?? batch.sourceSystem}.`,
          },
        });
      }
    }

    const volumeBySeedLotId = new Map<string, number>();
    for (const pos of positions) {
      volumeBySeedLotId.set(pos.seedLotId, (volumeBySeedLotId.get(pos.seedLotId) ?? 0) + Number(pos.volumeL));
    }
    for (const seed of seedLots) {
      if (!seed.declaredTaxClass || !(WINE_TAX_CLASSES as readonly string[]).includes(seed.declaredTaxClass)) continue;
      const lotId = lotIdBySeedLotId.get(seed.id);
      if (!lotId) continue;
      await recordTaxClassEventTx(tx, actor, {
        lotId,
        lotCode: lotCodeById.get(lotId),
        fromClass: null,
        toClass: seed.declaredTaxClass as WineTaxClass,
        volumeAtEvent: Math.round((volumeBySeedLotId.get(seed.id) ?? 0) * 100) / 100,
        observedAt: batch.cutoverAt,
        reason: `Imported source-declared tax class from ${batch.sourceName ?? batch.sourceSystem}.`,
        commandId: `migration:${tenantId}:${batchId}:tax-class:${seed.id}`,
      });
    }

    const legacyRowsPublished = await tx.legacyOperation.updateMany({
      where: { importBatchId: batchId, publishedAt: null },
      data: { publishedAt: new Date() },
    });

    const updated = await tx.migrationImportBatch.updateMany({
      where: { id: batchId, status: "SIGNED_OFF" },
      data: { status: "PUBLISHED", publishedById: actor.actorUserId, publishedByEmail: actor.actorEmail, publishedAt: new Date() },
    });
    if (updated.count !== 1) throw new ActionError("Publish raced with another state transition.", "CONFLICT");
    return {
      batchId,
      status: "PUBLISHED",
      seedOperationIds: operationIds,
      lotIds: [...new Set([...lotIdBySeedLotId.values()])],
      legacyRowsPublished: legacyRowsPublished.count,
    };
  });
}
