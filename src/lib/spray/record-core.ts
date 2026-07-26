// Spray Intelligence S3a — the write core (Unit 6): one pass, header + all three line tables, one
// transaction. Script-safe (no "use server", no next/cache — src/lib/ledger/reverse.ts pattern),
// so verify scripts and the future S11 assistant tool both call it.
//
// Product facts arrive through the INJECTED ProductFactsResolver port (KD-3), defaulting to the
// null resolver — which is what makes "unknown product ⇒ UNKNOWN, never clear" the current,
// tested behavior. resolveMany, deduped per application (council C11 — no N+1 for S2b to inherit).
//
// Idempotency is a RE-READ, not a constraint violation (council C8): on a commandId conflict we
// re-read by commandId and return the winner when the requestHash matches; a same-commandId,
// DIFFERENT-payload submission is rejected loudly.

import "server-only";
import { Prisma } from "@prisma/client";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import { buildFactsSnapshot } from "./facts-snapshot-core";
import { NullProductFactsResolver, type ProductFactsKey, type ProductFactsResolver } from "./product-facts-port";
import {
  canonicalQuantityForBasis,
  computeRateBasis,
  computeRequestHash,
  snapshotBlockLine,
  validateSprayInput,
} from "./record-pure";
import type { RecordSprayInput, SprayActor, SprayProductIdentitySource, SprayWarning } from "./types";

export class SprayRecordError extends Error {
  constructor(
    message: string,
    readonly code:
      | "VALIDATION"
      | "BLOCK_NOT_FOUND"
      | "AREA_UNDERIVABLE"
      | "QUANTITY_UNCONVERTIBLE"
      | "COMMAND_REPLAY_MISMATCH" = "VALIDATION",
  ) {
    super(message);
    this.name = "SprayRecordError";
  }
}

export interface SprayRecordResult {
  applicationId: string;
  revision: number;
  isCrossSite: boolean;
  warnings: SprayWarning[];
  /** True when this call returned an existing record via the commandId re-read path. */
  idempotentReplay: boolean;
}

function factsKeyOf(line: { epaRegistrationNumber?: string | null; tenantProductRef?: string | null; productName: string }): string {
  return JSON.stringify([line.epaRegistrationNumber ?? null, line.tenantProductRef ?? null, line.productName]);
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

/** Resolve + freeze the facts snapshot per material line (deduped resolveMany — council C11). */
export async function resolveFactsSnapshots(
  lines: RecordSprayInput["materialLines"],
  resolver: ProductFactsResolver,
): Promise<ReturnType<typeof buildFactsSnapshot>[]> {
  const uniqueKeys = new Map<string, ProductFactsKey>();
  for (const line of lines) {
    const key = factsKeyOf(line);
    if (!uniqueKeys.has(key))
      uniqueKeys.set(key, {
        epaRegistrationNumber: line.epaRegistrationNumber ?? null,
        tenantProductRef: line.tenantProductRef ?? null,
        productName: line.productName,
      });
  }
  const keys = [...uniqueKeys.keys()];
  const resolved = await resolver.resolveMany(keys.map((k) => uniqueKeys.get(k)!));
  const byKey = new Map(keys.map((k, i) => [k, resolved[i]]));
  return lines.map((line) => buildFactsSnapshot(byKey.get(factsKeyOf(line))!));
}

/**
 * Record one spray pass. Cross-site passes are ALLOWED (KD-12): blocks may span vineyards;
 * the header vineyardId defaults to the first block line's vineyard.
 */
export async function recordSprayApplicationCore(
  actor: SprayActor,
  input: RecordSprayInput,
  deps?: { factsResolver?: ProductFactsResolver },
): Promise<SprayRecordResult> {
  const resolver = deps?.factsResolver ?? NullProductFactsResolver;
  const { errors, warnings } = validateSprayInput(input);
  if (errors.length) throw new SprayRecordError(`Invalid spray record: ${errors.join(" ")}`);

  const requestHash = input.commandId ? computeRequestHash({ ...input, commandId: input.commandId }) : null;
  const snapshots = await resolveFactsSnapshots(input.materialLines, resolver);

  try {
    return await runInTenantTx(async (tx) => {
      const blockIds = [...new Set(input.blockLines.map((b) => b.blockId))];
      const blocks = await tx.vineyardBlock.findMany({
        where: { id: { in: blockIds } },
        select: { id: true, vineyardId: true, blockLabel: true, code: true, rowSpacingM: true, vineSpacingM: true, vineCount: true },
      });
      const blockById = new Map(blocks.map((b) => [b.id, b]));
      for (const id of blockIds) {
        if (!blockById.has(id)) throw new SprayRecordError(`Block ${id} not found in this tenant.`, "BLOCK_NOT_FOUND");
      }
      const vineyardIds = [...new Set(blocks.map((b) => b.vineyardId))];
      const isCrossSite = vineyardIds.length > 1;
      const vineyardId = input.vineyardId ?? blockById.get(input.blockLines[0].blockId)!.vineyardId;

      const application = await tx.sprayApplication.create({
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
          enteredById: actor.userId,
          enteredByEmail: actor.email,
          commandId: input.commandId ?? null,
          requestHash,
        },
        select: { id: true, revision: true },
      });

      const materialLineIdByNo = new Map<number, string>();
      for (let i = 0; i < input.materialLines.length; i++) {
        const line = input.materialLines[i];
        const canonical = canonicalQuantityForBasis(line);
        if (!canonical)
          throw new SprayRecordError(
            `Material line ${i + 1} ("${line.productName}"): the quantity cannot be converted — check the unit and the basis denominator.`,
            "QUANTITY_UNCONVERTIBLE",
          );
        const snap = snapshots[i];
        const created = await tx.sprayMaterialLine.create({
          data: {
            applicationId: application.id,
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
            factsPublishedRevisionId: snap.factsPublishedRevisionId,
            factsApprilAsOf: snap.factsApprilAsOf,
            factsCdprAsOf: snap.factsCdprAsOf,
            factsResistanceArtifactSha256: snap.factsResistanceArtifactSha256,
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
            applicationId: application.id,
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
          throw new SprayRecordError(
            `Block ${area.blockLabelSnapshot}: treated area is neither entered nor derivable from spacing × vine count — enter it explicitly (never defaulted).`,
            "AREA_UNDERIVABLE",
          );
        const rate = computeRateBasis({ volumeUsedL: line.volumeUsedL, treatedAreaHa: area.treatedAreaHa }, input.sprayVolumePerHaL);
        await tx.sprayBlockLine.create({
          data: {
            applicationId: application.id,
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

      await writeAudit(tx, {
        actorUserId: actor.userId,
        actorEmail: actor.email,
        action: "CREATE",
        entityType: "spray_application",
        entityId: application.id,
        summary: `Recorded spray pass (${input.materialLines.length} material line(s), ${input.blockLines.length} block line(s))${isCrossSite ? " — cross-site" : ""}.`,
      });

      return { applicationId: application.id, revision: application.revision, isCrossSite, warnings, idempotentReplay: false };
    });
  } catch (e) {
    // council C8 — the commandId retry path: same payload → return the winner; different → reject.
    if (input.commandId && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await runInTenantTx((tx) =>
        tx.sprayApplication.findFirst({
          where: { commandId: input.commandId },
          select: { id: true, revision: true, requestHash: true },
        }),
      );
      if (existing) {
        if (existing.requestHash != null && existing.requestHash === requestHash) {
          return { applicationId: existing.id, revision: existing.revision, isCrossSite: false, warnings, idempotentReplay: true };
        }
        throw new SprayRecordError(
          `commandId ${input.commandId} was already used for a DIFFERENT payload — refusing the replay (council C8).`,
          "COMMAND_REPLAY_MISMATCH",
        );
      }
    }
    throw e;
  }
}
