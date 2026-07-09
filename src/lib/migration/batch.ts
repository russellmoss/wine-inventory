import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { runInTenantTx } from "@/lib/tenant/tx";
import { requireTenantId } from "@/lib/tenant/context";
import { loadGenericMigrationFixture } from "./generic-fixture";
import type { MappingSuggestion, ParseDiagnostic } from "./types";

export type MigrationActor = { actorUserId: string | null; actorEmail: string; tenantId?: string };

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export type MigrationBatchSummary = {
  id: string;
  sourceSystem: string;
  sourceName: string | null;
  status: string;
  cutoverAt: Date;
  createdAt: Date;
  counts: {
    seedLots: number;
    positions: number;
    legacyOperations: number;
    analysisReadings: number;
    reconciliationOpen: number;
  };
};

export async function listMigrationBatches(): Promise<MigrationBatchSummary[]> {
  const rows = await prisma.migrationImportBatch.findMany({
    orderBy: { createdAt: "desc" },
  });
  const ids = rows.map((r) => r.id);
  const [lots, positions, legacy, readings, open] = await Promise.all([
    prisma.migrationSeedLot.groupBy({ by: ["importBatchId"], where: { importBatchId: { in: ids } }, _count: true }),
    prisma.migrationSeedPosition.groupBy({ by: ["importBatchId"], where: { importBatchId: { in: ids } }, _count: true }),
    prisma.legacyOperation.groupBy({ by: ["importBatchId"], where: { importBatchId: { in: ids } }, _count: true }),
    prisma.migrationAnalysisReading.groupBy({ by: ["importBatchId"], where: { importBatchId: { in: ids } }, _count: true }),
    prisma.migrationReconciliationItem.groupBy({ by: ["importBatchId"], where: { importBatchId: { in: ids }, status: "OPEN" }, _count: true }),
  ]);
  const countMap = (arr: { importBatchId: string; _count: number }[]) => new Map(arr.map((r) => [r.importBatchId, r._count]));
  const lotCount = countMap(lots);
  const posCount = countMap(positions);
  const legacyCount = countMap(legacy);
  const readingCount = countMap(readings);
  const openCount = countMap(open);
  return rows.map((r) => ({
    id: r.id,
    sourceSystem: r.sourceSystem,
    sourceName: r.sourceName,
    status: r.status,
    cutoverAt: r.cutoverAt,
    createdAt: r.createdAt,
    counts: {
      seedLots: lotCount.get(r.id) ?? 0,
      positions: posCount.get(r.id) ?? 0,
      legacyOperations: legacyCount.get(r.id) ?? 0,
      analysisReadings: readingCount.get(r.id) ?? 0,
      reconciliationOpen: openCount.get(r.id) ?? 0,
    },
  }));
}

export async function getMigrationBatchDetail(batchId: string) {
  const [batch, lots, positions, legacyOperations, panels, readings, reconciliation, fieldMappings, entityMappings] =
    await Promise.all([
      prisma.migrationImportBatch.findUnique({ where: { id: batchId } }),
      prisma.migrationSeedLot.findMany({ where: { importBatchId: batchId }, orderBy: { sourceLotKey: "asc" } }),
      prisma.migrationSeedPosition.findMany({ where: { importBatchId: batchId }, orderBy: { sourcePositionKey: "asc" } }),
      prisma.legacyOperation.findMany({ where: { importBatchId: batchId }, orderBy: { sourceActionId: "asc" } }),
      prisma.migrationAnalysisPanel.findMany({ where: { importBatchId: batchId }, orderBy: { sourcePanelKey: "asc" } }),
      prisma.migrationAnalysisReading.findMany({ where: { importBatchId: batchId }, orderBy: { analyte: "asc" } }),
      prisma.migrationReconciliationItem.findMany({
        where: { importBatchId: batchId },
        orderBy: [{ status: "asc" }, { severity: "asc" }, { kind: "asc" }],
      }),
      prisma.migrationFieldMapping.findMany({ orderBy: [{ sourceDataset: "asc" }, { sourceField: "asc" }] }),
      prisma.migrationEntityMapping.findMany({ orderBy: [{ sourceObjectType: "asc" }, { sourceKey: "asc" }] }),
    ]);
  if (!batch) return null;
  return { batch, lots, positions, legacyOperations, panels, readings, reconciliation, fieldMappings, entityMappings };
}

export async function createMigrationBatchCore(actor: MigrationActor, input?: { cutoverAt?: Date }): Promise<{ batchId: string }> {
  const fixture = loadGenericMigrationFixture();
  const cutoverAt = input?.cutoverAt ?? new Date("2026-02-01T00:00:00.000Z");
  const created = await runInTenantTx((tx) =>
    tx.migrationImportBatch.create({
      data: {
        sourceSystem: String(fixture.manifest.sourceSystem ?? "generic-proof"),
        sourceName: String(fixture.manifest.sourceName ?? "Generic proof import"),
        formatVersion: String(fixture.manifest.formatVersion ?? "phase3-v1"),
        cutoverAt,
        sourceManifest: fixture.manifest as Prisma.InputJsonValue,
        createdById: actor.actorUserId,
        createdByEmail: actor.actorEmail,
      },
      select: { id: true },
    }),
  );
  return { batchId: created.id };
}

export async function confirmMigrationFieldMappingCore(
  actor: MigrationActor,
  input: { sourceSystem: string; sourceDataset: string; formatVersion?: string | null; sourceObjectType: string; sourceField: string; targetField: string; transform?: Prisma.InputJsonValue | null },
): Promise<{ id: string }> {
  return runInTenantTx(async (tx) => {
    const existing = await tx.migrationFieldMapping.findFirst({
      where: {
        sourceSystem: input.sourceSystem,
        sourceDataset: input.sourceDataset,
        formatVersion: input.formatVersion ?? null,
        sourceObjectType: input.sourceObjectType,
        sourceField: input.sourceField,
      },
      select: { id: true },
    });
    const data = {
      targetField: input.targetField,
      transform: input.transform ?? Prisma.JsonNull,
      confirmedById: actor.actorUserId,
      confirmedByEmail: actor.actorEmail,
    };
    const row = existing
      ? await tx.migrationFieldMapping.update({ where: { id: existing.id }, data, select: { id: true } })
      : await tx.migrationFieldMapping.create({
          data: {
            sourceSystem: input.sourceSystem,
            sourceDataset: input.sourceDataset,
            formatVersion: input.formatVersion ?? null,
            sourceObjectType: input.sourceObjectType,
            sourceField: input.sourceField,
            ...data,
          },
          select: { id: true },
        });
    return row;
  });
}

export async function confirmMigrationEntityMappingCore(
  actor: MigrationActor,
  input: {
    sourceSystem: string;
    sourceDataset: string;
    formatVersion?: string | null;
    sourceObjectType: string;
    sourceKey: string;
    targetType: string;
    targetId?: string | null;
    targetCode?: string | null;
    resolution?: Prisma.InputJsonValue | null;
  },
): Promise<{ id: string }> {
  return runInTenantTx(async (tx) => {
    const existing = await tx.migrationEntityMapping.findFirst({
      where: {
        sourceSystem: input.sourceSystem,
        sourceDataset: input.sourceDataset,
        formatVersion: input.formatVersion ?? null,
        sourceObjectType: input.sourceObjectType,
        sourceKey: input.sourceKey,
      },
      select: { id: true },
    });
    const data = {
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      targetCode: input.targetCode ?? null,
      resolution: input.resolution ?? Prisma.JsonNull,
      confirmedById: actor.actorUserId,
      confirmedByEmail: actor.actorEmail,
    };
    const row = existing
      ? await tx.migrationEntityMapping.update({ where: { id: existing.id }, data, select: { id: true } })
      : await tx.migrationEntityMapping.create({
          data: {
            sourceSystem: input.sourceSystem,
            sourceDataset: input.sourceDataset,
            formatVersion: input.formatVersion ?? null,
            sourceObjectType: input.sourceObjectType,
            sourceKey: input.sourceKey,
            ...data,
          },
          select: { id: true },
        });
    return row;
  });
}

function reconciliationData(batchId: string, d: ParseDiagnostic) {
  return {
    importBatchId: batchId,
    kind: d.kind,
    subjectType: d.subjectType,
    subjectKey: d.subjectKey,
    label: d.label,
    severity: d.severity,
    status: "OPEN",
    message: d.message,
    expectedValue: d.expectedValue ?? null,
    actualValue: d.actualValue ?? null,
    deltaValue: d.deltaValue ?? null,
    unit: d.unit ?? null,
  };
}

async function getConfirmedFieldMappingKeys(tx: Prisma.TransactionClient, fixtureSourceSystem: string, formatVersion: string | null): Promise<Set<string>> {
  const rows = await tx.migrationFieldMapping.findMany({
    where: { sourceSystem: fixtureSourceSystem, formatVersion },
    select: { sourceDataset: true, sourceObjectType: true, sourceField: true, targetField: true },
  });
  return new Set(rows.map((r) => `${r.sourceDataset}:${r.sourceObjectType}:${r.sourceField}:${r.targetField}`));
}

function suggestionDiagnostics(batchId: string, missing: MappingSuggestion[]) {
  return missing.map((m) => ({
    importBatchId: batchId,
    kind: "UNMAPPED_ENTITY",
    subjectType: "FIELD",
    subjectKey: `${m.sourceDataset}:${m.sourceField}`,
    label: m.sourceField,
    severity: "BLOCKER",
    status: "OPEN",
    message: `Confirm mapping ${m.sourceDataset}.${m.sourceField} -> ${m.targetField}. Suggestions alone are not applied.`,
  }));
}

export async function runMigrationPreflightCore(batchId: string): Promise<{ status: string; suggestions: MappingSuggestion[]; openItems: number }> {
  const fixture = loadGenericMigrationFixture();
  const sourceSystem = String(fixture.manifest.sourceSystem ?? "generic-proof");
  const formatVersion = String(fixture.manifest.formatVersion ?? "phase3-v1");
  return runInTenantTx(async (tx) => {
    const batch = await tx.migrationImportBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new ActionError("Migration batch not found.");
    if (["SIGNED_OFF", "PUBLISHED", "DISCARDED"].includes(batch.status)) {
      throw new ActionError("This batch is frozen. Create a new draft to change mappings or staging.", "CONFLICT");
    }

    await tx.migrationAnalysisReading.deleteMany({ where: { importBatchId: batchId } });
    await tx.migrationAnalysisPanel.deleteMany({ where: { importBatchId: batchId } });
    await tx.migrationSeedPosition.deleteMany({ where: { importBatchId: batchId } });
    await tx.migrationSeedLot.deleteMany({ where: { importBatchId: batchId } });
    await tx.legacyOperation.deleteMany({ where: { importBatchId: batchId } });
    await tx.migrationReconciliationItem.deleteMany({ where: { importBatchId: batchId } });

    const confirmed = await getConfirmedFieldMappingKeys(tx, sourceSystem, formatVersion);
    const missing = fixture.expectedFieldMappings.filter(
      (m) => !confirmed.has(`${m.sourceDataset}:${m.sourceObjectType}:${m.sourceField}:${m.targetField}`),
    );
    if (missing.length > 0) {
      await tx.migrationReconciliationItem.createMany({ data: suggestionDiagnostics(batchId, fixture.suggestions.filter((s) => missing.some((m) => m.sourceField === s.sourceField && m.sourceDataset === s.sourceDataset))) });
      await tx.migrationImportBatch.update({ where: { id: batchId }, data: { status: "PREFLIGHT_BLOCKED" } });
      return { status: "PREFLIGHT_BLOCKED", suggestions: fixture.suggestions, openItems: missing.length };
    }

    const entityRows = await tx.migrationEntityMapping.findMany({
      where: { sourceSystem, sourceDataset: "current-state", formatVersion },
      select: { sourceObjectType: true, sourceKey: true, targetId: true, targetCode: true },
    });
    const entity = new Map(entityRows.map((r) => [`${r.sourceObjectType}:${r.sourceKey}`, r]));
    const diagnostics: ParseDiagnostic[] = [...fixture.diagnostics];

    const existingFiled = await tx.complianceReport.findFirst({
      where: { formType: "TTB_5120_17", status: "FILED", periodEnd: { gte: batch.cutoverAt } },
      select: { id: true, periodEnd: true },
    });
    if (existingFiled) {
      diagnostics.push({
        kind: "TTB_TOTAL",
        subjectType: "CUTOVER",
        subjectKey: batch.cutoverAt.toISOString(),
        label: "Cutover date",
        severity: "BLOCKER",
        message: `Cutover must be after filed 5120.17 period ending ${existingFiled.periodEnd.toISOString()}.`,
      });
    }

    for (const lot of fixture.lots) {
      const codeResolution = entity.get(`lot-code:${lot.sourceLotKey}`);
      const finalCode = codeResolution?.targetCode || lot.code;
      const collision = await tx.lot.findFirst({ where: { code: finalCode }, select: { id: true, code: true } });
      if (collision && collision.id !== codeResolution?.targetId) {
        diagnostics.push({
          kind: "UNMAPPED_ENTITY",
          subjectType: "LOT_CODE",
          subjectKey: lot.sourceLotKey,
          label: lot.code,
          severity: "BLOCKER",
          message: `Source lot code ${finalCode} collides with an existing live lot. Resolve it explicitly.`,
        });
      }
      await tx.migrationSeedLot.create({
        data: {
          importBatchId: batchId,
          sourceLotKey: lot.sourceLotKey,
          sourceSystemId: lot.sourceSystemId ?? null,
          code: lot.code,
          displayName: lot.displayName ?? null,
          form: lot.form,
          productType: lot.productType ?? null,
          carbonation: lot.carbonation ?? null,
          declaredTaxClass: lot.declaredTaxClass ?? null,
          vintageYear: lot.vintageYear ?? null,
          originVineyardName: lot.originVineyardName ?? null,
          originBlockName: lot.originBlockName ?? null,
          originVarietyName: lot.originVarietyName ?? null,
          legacySnapshot: lot.legacySnapshot == null ? Prisma.JsonNull : inputJson(lot.legacySnapshot),
          status: codeResolution?.targetCode ? "RESOLVED" : "READY",
          resolvedCode: codeResolution?.targetCode ?? null,
          resolvedExistingLotId: codeResolution?.targetId ?? null,
        },
      });
    }

    const seedLots = await tx.migrationSeedLot.findMany({ where: { importBatchId: batchId }, select: { id: true, sourceLotKey: true } });
    const seedLotIdByKey = new Map(seedLots.map((l) => [l.sourceLotKey, l.id]));

    for (const pos of fixture.positions) {
      const vessel = entity.get(`vessel:${pos.sourceVesselKey}`);
      const bond = pos.bondKey ? entity.get(`bond:${pos.bondKey}`) : null;
      if (!vessel?.targetId) {
        diagnostics.push({
          kind: "UNMAPPED_ENTITY",
          subjectType: "VESSEL",
          subjectKey: pos.sourceVesselKey,
          label: pos.vesselCode,
          severity: "BLOCKER",
          message: `Resolve source vessel ${pos.vesselCode} before sign-off.`,
        });
      }
      if (!bond?.targetId) {
        diagnostics.push({
          kind: "UNMAPPED_ENTITY",
          subjectType: "BOND",
          subjectKey: pos.bondKey ?? "missing",
          label: pos.bondKey ?? "Bond",
          severity: "BLOCKER",
          message: "Resolve the source bond before sign-off.",
        });
      }
      await tx.migrationSeedPosition.create({
        data: {
          importBatchId: batchId,
          seedLotId: seedLotIdByKey.get(pos.sourceLotKey) as string,
          sourcePositionKey: pos.sourcePositionKey,
          sourceVesselKey: pos.sourceVesselKey,
          vesselId: vessel?.targetId ?? null,
          vesselCode: pos.vesselCode,
          accountType: pos.accountType,
          volumeL: pos.volumeL,
          bondId: bond?.targetId ?? null,
          costAmount: pos.costAmount ?? null,
          costCurrency: pos.costCurrency ?? null,
          costCompleteness: pos.costCompleteness,
        },
      });
    }

    for (const op of fixture.legacyOperations) {
      const lotId = op.sourceLotKey ? seedLotIdByKey.get(op.sourceLotKey) : null;
      const vessel = op.sourceVesselKey ? entity.get(`vessel:${op.sourceVesselKey}`) : null;
      await tx.legacyOperation.create({
        data: {
          importBatchId: batchId,
          sourceSystem,
          sourceDataset: op.sourceDataset ?? null,
          sourceObjectType: op.sourceObjectType ?? null,
          sourceActionId: op.sourceActionId,
          sourceActionType: op.sourceActionType,
          subjectType: op.subjectType ?? null,
          occurredAt: op.occurredAt ?? null,
          sourceLotKey: op.sourceLotKey ?? null,
          lotId: null,
          lotCode: op.lotCode ?? null,
          sourceVesselKey: op.sourceVesselKey ?? null,
          vesselId: vessel?.targetId ?? null,
          vesselCode: vessel?.targetCode ?? op.vesselCode ?? null,
          volume: op.volume ?? null,
          volumeUnit: op.volumeUnit ?? null,
          canonicalVolumeL: op.canonicalVolumeL ?? null,
          costAmount: op.costAmount ?? null,
          costCurrency: op.costCurrency ?? null,
          actorName: op.actorName ?? null,
          note: op.note ?? null,
          evidenceRef: op.evidenceRef ?? null,
          normalizedPayload: op.normalizedPayload == null ? Prisma.JsonNull : inputJson(op.normalizedPayload),
          rawEvidence: op.rawEvidence == null ? Prisma.JsonNull : inputJson(op.rawEvidence),
        },
      });
      void lotId;
    }

    const panelByKey = new Map<string, string>();
    for (const reading of fixture.analysisReadings) {
      const analyte = entity.get(`analyte:${reading.analyte}`);
      if (!analyte?.targetCode && !analyte?.targetId) {
        diagnostics.push({
          kind: "UNMAPPED_ENTITY",
          subjectType: "ANALYTE",
          subjectKey: reading.analyte,
          label: reading.analyte,
          severity: "BLOCKER",
          message: `Confirm analyte mapping for ${reading.analyte}.`,
        });
      }
      let panelId = panelByKey.get(reading.sourcePanelKey);
      if (!panelId) {
        const vessel = reading.sourceVesselKey ? entity.get(`vessel:${reading.sourceVesselKey}`) : null;
        const panel = await tx.migrationAnalysisPanel.create({
          data: {
            importBatchId: batchId,
            sourcePanelKey: reading.sourcePanelKey,
            seedLotId: seedLotIdByKey.get(reading.sourceLotKey) as string,
            sourceVesselKey: reading.sourceVesselKey ?? null,
            vesselId: vessel?.targetId ?? null,
            observedAt: reading.observedAt,
            enteredByEmail: reading.enteredByEmail ?? null,
            note: reading.note ?? null,
          },
          select: { id: true },
        });
        panelId = panel.id;
        panelByKey.set(reading.sourcePanelKey, panelId);
      }
      await tx.migrationAnalysisReading.create({
        data: {
          importBatchId: batchId,
          panelId,
          sourceReadingKey: reading.sourceReadingKey ?? null,
          analyte: analyte?.targetCode ?? analyte?.targetId ?? reading.analyte,
          value: reading.value,
          unit: reading.unit,
        },
      });
    }

    const createdDiagnostics = diagnostics.map((d) => reconciliationData(batchId, d));
    const infoItems = [
      {
        importBatchId: batchId,
        kind: "VESSEL_VOLUME",
        subjectType: "BATCH",
        subjectKey: "bulk-vessels",
        label: "Bulk vessel volume",
        expectedValue: fixture.positions.reduce((a, p) => a + p.volumeL, 0),
        actualValue: fixture.positions.reduce((a, p) => a + p.volumeL, 0),
        deltaValue: 0,
        unit: "L",
        severity: "INFO",
        status: "RESOLVED",
        message: "Source vessel volume reconciles after unit normalization.",
      },
      {
        importBatchId: batchId,
        kind: "CHEMISTRY_COUNT",
        subjectType: "BATCH",
        subjectKey: "chemistry",
        label: "Chemistry readings",
        expectedValue: Number(fixture.manifest.expectedChemistryReadings ?? fixture.analysisReadings.length),
        actualValue: fixture.analysisReadings.length,
        deltaValue: fixture.analysisReadings.length - Number(fixture.manifest.expectedChemistryReadings ?? fixture.analysisReadings.length),
        unit: "reading",
        severity: "INFO",
        status: "RESOLVED",
        message: "Chemistry row count reconciles.",
      },
    ];
    await tx.migrationReconciliationItem.createMany({ data: [...createdDiagnostics, ...infoItems] });

    const openItems = await tx.migrationReconciliationItem.count({ where: { importBatchId: batchId, status: "OPEN" } });
    const openBlockers = await tx.migrationReconciliationItem.count({
      where: { importBatchId: batchId, status: "OPEN", severity: "BLOCKER" },
    });
    const status = openBlockers > 0 ? "PREFLIGHT_BLOCKED" : "READY_FOR_REVIEW";
    await tx.migrationImportBatch.update({ where: { id: batchId }, data: { status } });
    return { status, suggestions: fixture.suggestions, openItems };
  });
}

export async function acceptReconciliationItemCore(
  actor: MigrationActor,
  input: { itemId: string; reason: string },
): Promise<{ id: string; status: string }> {
  const reason = input.reason.trim();
  if (reason.length < 4) throw new ActionError("Accepted exceptions require a reason.");
  return runInTenantTx(async (tx) => {
    const item = await tx.migrationReconciliationItem.findUnique({ where: { id: input.itemId } });
    if (!item) throw new ActionError("Reconciliation item not found.");
    const batch = await tx.migrationImportBatch.findUnique({ where: { id: item.importBatchId }, select: { status: true } });
    if (!batch || ["SIGNED_OFF", "PUBLISHED", "DISCARDED"].includes(batch.status)) {
      throw new ActionError("This reconciliation pack is frozen.", "CONFLICT");
    }
    return tx.migrationReconciliationItem.update({
      where: { id: item.id },
      data: {
        status: "ACCEPTED",
        acceptedReason: reason,
        acceptedById: actor.actorUserId,
        acceptedByEmail: actor.actorEmail,
        acceptedAt: new Date(),
      },
      select: { id: true, status: true },
    });
  });
}

export async function signOffMigrationBatchCore(actor: MigrationActor, batchId: string): Promise<{ batchId: string; status: string }> {
  return runInTenantTx(async (tx) => {
    const batch = await tx.migrationImportBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new ActionError("Migration batch not found.");
    if (batch.status !== "READY_FOR_REVIEW") throw new ActionError("Run preflight and resolve blockers before sign-off.", "CONFLICT");
    const open = await tx.migrationReconciliationItem.count({ where: { importBatchId: batchId, status: "OPEN" } });
    if (open > 0) throw new ActionError("Every reconciliation item must be resolved or accepted before sign-off.", "CONFLICT");
    const unresolvedPosition = await tx.migrationSeedPosition.findFirst({
      where: { importBatchId: batchId, OR: [{ vesselId: null }, { bondId: null }] },
      select: { id: true },
    });
    if (unresolvedPosition) throw new ActionError("Every seed position needs a resolved vessel and bond.", "CONFLICT");
    const [mappings, reconciliation] = await Promise.all([
      tx.migrationEntityMapping.findMany({ where: { sourceSystem: batch.sourceSystem }, orderBy: { sourceKey: "asc" } }),
      tx.migrationReconciliationItem.findMany({ where: { importBatchId: batchId }, orderBy: { kind: "asc" } }),
    ]);
    const updated = await tx.migrationImportBatch.update({
      where: { id: batchId },
      data: {
        status: "SIGNED_OFF",
        signedOffById: actor.actorUserId,
        signedOffByEmail: actor.actorEmail,
        signedOffAt: new Date(),
        mappingSnapshot: inputJson(mappings),
        reconciliationSnapshot: inputJson(reconciliation),
      },
      select: { id: true, status: true },
    });
    return { batchId: updated.id, status: updated.status };
  });
}

export async function discardMigrationBatchCore(batchId: string): Promise<{ batchId: string; status: string }> {
  return runInTenantTx(async (tx) => {
    const batch = await tx.migrationImportBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new ActionError("Migration batch not found.");
    if (batch.status === "PUBLISHED") throw new ActionError("Published migration batches cannot be discarded.", "CONFLICT");
    const updated = await tx.migrationImportBatch.update({
      where: { id: batchId },
      data: { status: "DISCARDED", discardedAt: new Date() },
      select: { id: true, status: true },
    });
    return { batchId: updated.id, status: updated.status };
  });
}

export function migrationCommandId(batchId: string, positionId: string): string {
  return `migration:${requireTenantId()}:${batchId}:seed:${positionId}`;
}
