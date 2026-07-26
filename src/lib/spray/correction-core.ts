// Spray Intelligence S3a — correction-as-event (Unit 7, KD-1/KD-14). Mirrors the
// src/lib/ledger/reverse.ts architecture: a PURE correctability verdict that both the read DTO
// and the mutation call — the UI and the mutation can never disagree about what is correctable.
//
// The two rules that make this file what it is:
//   1. A correction COPIES the predecessor's facts snapshot VERBATIM — factsRevision and
//      factsAsOf included. It re-resolves ONLY a line whose own product identity changed
//      (KD-14, reversing the original design per council G1: re-resolving would repaint a July
//      application with November's registration data and break rule §3.8). Don't "fix" this back.
//   2. A VOID is a SUCCESSOR ROW, not the absence of one (council C2) — so the at-most-once
//      unique on (tenantId, supersedesApplicationId) covers the void path and kills the
//      double-correction race everywhere. INSERT-successor-first: the loser of a race dies on
//      the unique before touching the predecessor.

import "server-only";
import { Prisma } from "@prisma/client";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import { buildFactsSnapshot, type FactsSnapshot } from "./facts-snapshot-core";
import { NullProductFactsResolver, type ProductFactsResolver } from "./product-facts-port";
import { canonicalQuantityForBasis, computeRateBasis, snapshotBlockLine, validateSprayInput } from "./record-pure";
import { SprayRecordError } from "./record-core";
import type { RecordSprayInput, SprayActor, SprayProductIdentitySource, SprayWarning } from "./types";

export type Correctability =
  | { correctable: true }
  | { correctable: false; code: "already-superseded" | "voided" | "not-current"; reason: string };

/** PURE — the single source of truth the UI and the mutation share (reverse.ts pattern). */
export function correctabilityOf(application: {
  status: string;
  supersededByApplicationId: string | null;
}): Correctability {
  if (application.status === "VOIDED")
    return { correctable: false, code: "voided", reason: "This record was voided — a voided revision is terminal." };
  if (application.supersededByApplicationId != null || application.status === "SUPERSEDED")
    return {
      correctable: false,
      code: "already-superseded",
      reason: "This revision was already corrected — correct the CURRENT revision instead (a revision can be corrected at most once).",
    };
  if (application.status !== "ACTIVE")
    return { correctable: false, code: "not-current", reason: `Status ${application.status} is not correctable.` };
  return { correctable: true };
}

export interface CorrectionResult {
  applicationId: string;
  revision: number;
  supersededApplicationId: string;
  warnings: SprayWarning[];
}

function sameProductIdentity(
  a: { epaRegistrationNumber: string | null; tenantProductRef: string | null; productName: string },
  b: { epaRegistrationNumber?: string | null; tenantProductRef?: string | null; productName: string },
): boolean {
  return (
    (a.epaRegistrationNumber ?? null) === (b.epaRegistrationNumber ?? null) &&
    (a.tenantProductRef ?? null) === (b.tenantProductRef ?? null) &&
    a.productName === b.productName
  );
}

function identitySourceOf(line: {
  epaRegistrationNumber?: string | null;
  tenantProductRef?: string | null;
  productIdentitySource?: SprayProductIdentitySource;
}): SprayProductIdentitySource {
  if (line.productIdentitySource) return line.productIdentitySource;
  if (line.epaRegistrationNumber) return "EPA_REGISTRY";
  if (line.tenantProductRef) return "TENANT_DEFINED";
  return "UNKNOWN";
}

/**
 * Correct a spray record: a FULL new revision (header + all lines) superseding the predecessor.
 * `input` is the complete corrected document (whole-document correction — council CQ1/G1).
 */
export async function correctSprayApplicationCore(
  actor: SprayActor,
  predecessorId: string,
  input: RecordSprayInput & { correctionReason: string },
  deps?: { factsResolver?: ProductFactsResolver },
): Promise<CorrectionResult> {
  const resolver = deps?.factsResolver ?? NullProductFactsResolver;
  const { errors, warnings } = validateSprayInput(input);
  if (errors.length) throw new SprayRecordError(`Invalid correction: ${errors.join(" ")}`);

  return runInTenantTx(async (tx) => {
    const predecessor = await tx.sprayApplication.findUnique({ where: { id: predecessorId } });
    if (!predecessor) throw new SprayRecordError(`Application ${predecessorId} not found.`, "BLOCK_NOT_FOUND");
    const verdict = correctabilityOf(predecessor);
    if (!verdict.correctable) throw new SprayRecordError(verdict.reason);

    const predLines = await tx.sprayMaterialLine.findMany({
      where: { applicationId: predecessorId },
      orderBy: { lineNo: "asc" },
    });
    const predByLineNo = new Map(predLines.map((l) => [l.lineNo, l]));

    // KD-14: copy the predecessor's snapshot VERBATIM per line; re-resolve ONLY a changed identity.
    const snapshots: FactsSnapshot[] = [];
    const toResolve: { index: number }[] = [];
    for (let i = 0; i < input.materialLines.length; i++) {
      const line = input.materialLines[i];
      const pred = predByLineNo.get(i + 1);
      if (pred && sameProductIdentity(pred, line)) {
        snapshots[i] = {
          snapshotPhiDays: pred.snapshotPhiDays,
          snapshotReiHours: pred.snapshotReiHours,
          snapshotRainfastHours: pred.snapshotRainfastHours == null ? null : Number(pred.snapshotRainfastHours),
          snapshotMobilityClass: pred.snapshotMobilityClass,
          snapshotResistanceGroups: pred.snapshotResistanceGroups,
          resistanceGroupsKnown: pred.resistanceGroupsKnown,
          snapshotActiveIngredientKeys: pred.snapshotActiveIngredientKeys,
          activeIngredientsKnown: pred.activeIngredientsKnown,
          snapshotActiveIngredients: (pred.snapshotActiveIngredients as FactsSnapshot["snapshotActiveIngredients"]) ?? null,
          factsRevision: pred.factsRevision,
          factsAsOf: pred.factsAsOf,
          factsSource: pred.factsSource,
          factsCompleteness: pred.factsCompleteness,
        };
      } else {
        toResolve.push({ index: i });
      }
    }
    if (toResolve.length) {
      const resolved = await resolver.resolveMany(
        toResolve.map(({ index }) => {
          const l = input.materialLines[index];
          return { epaRegistrationNumber: l.epaRegistrationNumber ?? null, tenantProductRef: l.tenantProductRef ?? null, productName: l.productName };
        }),
      );
      toResolve.forEach(({ index }, j) => {
        snapshots[index] = buildFactsSnapshot(resolved[j]);
      });
    }

    const blockIds = [...new Set(input.blockLines.map((b) => b.blockId))];
    const blocks = await tx.vineyardBlock.findMany({
      where: { id: { in: blockIds } },
      select: { id: true, vineyardId: true, blockLabel: true, code: true, rowSpacingM: true, vineSpacingM: true, vineCount: true },
    });
    const blockById = new Map(blocks.map((b) => [b.id, b]));
    for (const id of blockIds) {
      if (!blockById.has(id)) throw new SprayRecordError(`Block ${id} not found in this tenant.`, "BLOCK_NOT_FOUND");
    }
    const vineyardId = input.vineyardId ?? blockById.get(input.blockLines[0].blockId)!.vineyardId;

    // INSERT the successor FIRST — the at-most-once unique on (tenantId, supersedesApplicationId)
    // kills a concurrent second correction (or a racing void) right here.
    const successor = await tx.sprayApplication.create({
      data: {
        vineyardId,
        applicatorUserId: actor.userId,
        applicatorName: input.applicatorName,
        applicatorLicense: input.applicatorLicense ?? null,
        operatorIdNumber: input.operatorIdNumber ?? null,
        countyPermitNumber: input.countyPermitNumber ?? null,
        applicationMethod: input.applicationMethod,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt ?? null,
        targetPest: input.targetPest ?? null,
        rowPattern: input.rowPattern ?? null,
        dilutionMode: input.dilutionMode ?? null,
        sprayVolumePerHaL: input.sprayVolumePerHaL ?? null,
        groundSpeedKph: input.groundSpeedKph ?? null,
        tankVolumeL: input.tankVolumeL ?? null,
        carrierWaterVolumeL: input.carrierWaterVolumeL ?? null,
        sprayWaterPh: input.sprayWaterPh ?? null,
        airTempC: input.airTempC ?? null,
        windSpeedKph: input.windSpeedKph ?? null,
        windDirection: input.windDirection ?? null,
        relHumidityPct: input.relHumidityPct ?? null,
        weatherObservedAt: input.weatherObservedAt ?? null,
        weatherSource: input.weatherSource ?? null,
        sprayRigName: input.sprayRigName ?? null,
        tractorName: input.tractorName ?? null,
        gearSetting: input.gearSetting ?? null,
        notes: input.notes ?? null,
        status: "ACTIVE",
        revision: predecessor.revision + 1,
        supersedesApplicationId: predecessor.id,
        correctionKind: "AMENDMENT",
        correctionReason: input.correctionReason,
        enteredById: actor.userId,
        enteredByEmail: actor.email,
      },
      select: { id: true, revision: true },
    });

    const materialLineIdByNo = new Map<number, string>();
    for (let i = 0; i < input.materialLines.length; i++) {
      const line = input.materialLines[i];
      const canonical = canonicalQuantityForBasis(line);
      if (!canonical)
        throw new SprayRecordError(`Material line ${i + 1}: the quantity cannot be converted.`, "QUANTITY_UNCONVERTIBLE");
      const snap = snapshots[i];
      const created = await tx.sprayMaterialLine.create({
        data: {
          applicationId: successor.id,
          lineNo: i + 1,
          productName: line.productName,
          epaRegistrationNumber: line.epaRegistrationNumber ?? null,
          tenantProductRef: line.tenantProductRef ?? null,
          productIdentitySource: identitySourceOf(line),
          materialRole: line.materialRole,
          adjuvantClass: line.adjuvantClass ?? null,
          quantityEntered: line.quantityEntered,
          quantityUnit: line.quantityUnit,
          quantityBasis: line.quantityBasis,
          quantityCanonical: canonical.quantityCanonical,
          quantityDimension: canonical.quantityDimension,
          enteredReiHours: line.enteredReiHours ?? null,
          enteredPhiDays: line.enteredPhiDays ?? null,
          enteredActiveIngredient: line.enteredActiveIngredient ?? null,
          snapshotPhiDays: snap.snapshotPhiDays,
          snapshotReiHours: snap.snapshotReiHours,
          snapshotRainfastHours: snap.snapshotRainfastHours,
          snapshotMobilityClass: snap.snapshotMobilityClass,
          snapshotResistanceGroups: snap.snapshotResistanceGroups,
          resistanceGroupsKnown: snap.resistanceGroupsKnown,
          snapshotActiveIngredientKeys: snap.snapshotActiveIngredientKeys,
          activeIngredientsKnown: snap.activeIngredientsKnown,
          snapshotActiveIngredients: snap.snapshotActiveIngredients === null ? Prisma.DbNull : (snap.snapshotActiveIngredients as unknown as Prisma.InputJsonValue),
          factsRevision: snap.factsRevision,
          factsAsOf: snap.factsAsOf,
          factsSource: snap.factsSource,
          factsCompleteness: snap.factsCompleteness,
        },
        select: { id: true, lineNo: true },
      });
      materialLineIdByNo.set(created.lineNo, created.id);
    }

    for (const mix of input.mixOrderLines ?? []) {
      await tx.sprayMixOrderLine.create({
        data: {
          applicationId: successor.id,
          sequence: mix.sequence,
          materialDescription: mix.materialDescription,
          amountPerTankEntered: mix.amountPerTankEntered ?? null,
          amountPerTankUnit: mix.amountPerTankUnit ?? null,
          materialLineId: mix.materialLineNo != null ? (materialLineIdByNo.get(mix.materialLineNo) ?? null) : null,
        },
      });
    }

    for (const line of input.blockLines) {
      const block = blockById.get(line.blockId)!;
      const area = snapshotBlockLine(line, {
          blockLabel: block.blockLabel,
          code: block.code,
          rowSpacingM: block.rowSpacingM == null ? null : Number(block.rowSpacingM),
          vineSpacingM: block.vineSpacingM == null ? null : Number(block.vineSpacingM),
          vineCount: block.vineCount,
        });
      if (area.treatedAreaHa == null)
        throw new SprayRecordError(`Block ${area.blockLabelSnapshot}: treated area is neither entered nor derivable.`, "AREA_UNDERIVABLE");
      const rate = computeRateBasis({ volumeUsedL: line.volumeUsedL, treatedAreaHa: area.treatedAreaHa }, input.sprayVolumePerHaL);
      await tx.sprayBlockLine.create({
        data: {
          applicationId: successor.id,
          blockId: line.blockId,
          segmentNo: line.segmentNo ?? 1,
          blockLabelSnapshot: area.blockLabelSnapshot,
          treatedAreaHa: area.treatedAreaHa,
          treatedAreaSource: area.treatedAreaSource,
          treatedAreaNote: line.treatedAreaNote ?? null,
          startedAt: line.startedAt ?? null,
          finishedAt: line.finishedAt ?? null,
          tankBatchRef: line.tankBatchRef ?? null,
          estTanks: line.estTanks ?? null,
          tanksUsed: line.tanksUsed ?? null,
          volumeUsedL: line.volumeUsedL ?? null,
          computedVolumePerHaL: rate.computedVolumePerHaL,
          rateBasis: rate.rateBasis,
          depositionMethod: line.depositionMethod ?? null,
          depositionAdequate: line.depositionAdequate ?? null,
          depositionCheckedAt: line.depositionCheckedAt ?? null,
          depositionNote: line.depositionNote ?? null,
        },
      });
    }

    // Bookkeeping on the predecessor (the ONLY allowlisted update): status + successor pointer.
    await tx.sprayApplication.update({
      where: { id: predecessor.id },
      data: { status: "SUPERSEDED", supersededByApplicationId: successor.id },
    });

    await writeAudit(tx, {
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: "CREATE",
      entityType: "spray_application",
      entityId: successor.id,
      summary: `Corrected spray record ${predecessor.id} → revision ${successor.revision}: ${input.correctionReason}`,
    });

    return { applicationId: successor.id, revision: successor.revision, supersededApplicationId: predecessor.id, warnings };
  });
}

/**
 * Void a spray record: "this pass never happened." A SUCCESSOR row (correctionKind VOID,
 * status VOIDED, ZERO line children) — so two concurrent voids, or a void racing an amendment,
 * resolve to exactly one winner on the same unique constraint (council C2).
 */
export async function voidSprayApplicationCore(actor: SprayActor, predecessorId: string, reason: string): Promise<CorrectionResult> {
  if (!reason?.trim()) throw new SprayRecordError("A void requires a reason.");
  return runInTenantTx(async (tx) => {
    const predecessor = await tx.sprayApplication.findUnique({ where: { id: predecessorId } });
    if (!predecessor) throw new SprayRecordError(`Application ${predecessorId} not found.`, "BLOCK_NOT_FOUND");
    const verdict = correctabilityOf(predecessor);
    if (!verdict.correctable) throw new SprayRecordError(verdict.reason);

    const successor = await tx.sprayApplication.create({
      data: {
        vineyardId: predecessor.vineyardId,
        applicatorUserId: predecessor.applicatorUserId,
        applicatorName: predecessor.applicatorName,
        applicatorLicense: predecessor.applicatorLicense,
        operatorIdNumber: predecessor.operatorIdNumber,
        countyPermitNumber: predecessor.countyPermitNumber,
        applicationMethod: predecessor.applicationMethod,
        startedAt: predecessor.startedAt,
        finishedAt: predecessor.finishedAt,
        targetPest: predecessor.targetPest,
        rowPattern: predecessor.rowPattern,
        dilutionMode: predecessor.dilutionMode,
        sprayVolumePerHaL: predecessor.sprayVolumePerHaL,
        groundSpeedKph: predecessor.groundSpeedKph,
        tankVolumeL: predecessor.tankVolumeL,
        carrierWaterVolumeL: predecessor.carrierWaterVolumeL,
        sprayWaterPh: predecessor.sprayWaterPh,
        airTempC: predecessor.airTempC,
        windSpeedKph: predecessor.windSpeedKph,
        windDirection: predecessor.windDirection,
        windDirectionDeg: predecessor.windDirectionDeg,
        relHumidityPct: predecessor.relHumidityPct,
        weatherObservedAt: predecessor.weatherObservedAt,
        weatherSource: predecessor.weatherSource,
        sprayRigName: predecessor.sprayRigName,
        tractorName: predecessor.tractorName,
        gearSetting: predecessor.gearSetting,
        notes: predecessor.notes,
        status: "VOIDED",
        revision: predecessor.revision + 1,
        supersedesApplicationId: predecessor.id,
        correctionKind: "VOID",
        correctionReason: reason,
        enteredById: actor.userId,
        enteredByEmail: actor.email,
      },
      select: { id: true, revision: true },
    });

    await tx.sprayApplication.update({
      where: { id: predecessor.id },
      data: { status: "SUPERSEDED", supersededByApplicationId: successor.id },
    });

    await writeAudit(tx, {
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: "CREATE",
      entityType: "spray_application",
      entityId: successor.id,
      summary: `Voided spray record ${predecessor.id}: ${reason}`,
    });

    return { applicationId: successor.id, revision: successor.revision, supersededApplicationId: predecessor.id, warnings: [] };
  });
}
