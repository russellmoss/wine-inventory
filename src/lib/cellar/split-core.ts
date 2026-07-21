import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/bottling/draw";
import { writeProportionalCostTransfers } from "@/lib/cost/transfer";
import { planPress, type PressFractionDraw } from "@/lib/ledger/math";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { FUNCTIONAL_ZERO_L, type CaptureMethod, type LotForm } from "@/lib/ledger/vocabulary";
import { nextBlendLotCode, nextLotCode, isUniqueViolation } from "@/lib/lot/generate";
import { normalizeToken } from "@/lib/lot/code";
import { LINEAGE_KIND } from "@/lib/lot/lineage";
import type { LedgerActor } from "@/lib/vessels/rack-core";

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

export type SplitChildRole = "SPLIT" | "LEES";

export type SplitChildInput = {
  volumeL: number;
  sublotTag: string;
  destVesselId?: string | null;
  role?: SplitChildRole;
};

export type SplitLotInPlaceInput = {
  commandId?: string | null;
  parentLotId: string;
  sourceVesselId: string;
  expectedRevision?: string | null;
  children: SplitChildInput[];
  discardedLeesL?: number | null;
  note?: string | null;
  captureMethod?: CaptureMethod;
};

export type SplitChildResult = {
  lotId: string;
  code: string;
  sublotTag: string;
  role: SplitChildRole;
  vesselId: string;
  volumeL: number;
  merged: false;
};

export type SplitLotInPlaceResult = {
  operationId: number;
  parentLotId: string;
  drawnL: number;
  discardedLeesL: number;
  children: SplitChildResult[];
  duplicate: boolean;
  message: string;
};

type CleanChild = { volumeL: number; sublotTag: string; destVesselId: string; role: SplitChildRole };

function cleanChildren(input: SplitChildInput[], sourceVesselId: string): CleanChild[] {
  return input.map((c) => ({
    volumeL: round2(Number(c.volumeL)),
    sublotTag: c.sublotTag.trim(),
    destVesselId: c.destVesselId?.trim() || sourceVesselId,
    role: c.role === "LEES" ? "LEES" : "SPLIT",
  }));
}

/**
 * LEDGER-12: a split makes each child its own LOT, and a vessel holds one cohesive liquid — so at
 * most ONE child can stay in the source vessel and every other needs its own destination. Two
 * sublots sitting in one tank is the same fiction at a smaller scale: there is no physical split,
 * it is still one liquid (plan 088, Unit 10).
 *
 * ⚠️ ux-principles rule 12, "no phantom vessels": this app deliberately built split-in-place as a
 * FIRST-CLASS operation instead of copying InnoVint's round-trip-through-a-throwaway-vessel
 * workaround. Refusing without offering a real alternative would push winemakers to invent fake
 * vessels and hand that advantage straight back, so the message has to name a way forward.
 */
function assertOneChildPerVessel(children: CleanChild[], sourceVesselCode: string): void {
  const byVessel = new Map<string, CleanChild[]>();
  for (const c of children) byVessel.set(c.destVesselId, [...(byVessel.get(c.destVesselId) ?? []), c]);

  for (const [, group] of byVessel) {
    if (group.length < 2) continue;
    const tags = group.map((c) => c.sublotTag || "untagged");
    throw new ActionError(
      `${sourceVesselCode} holds one wine, so ${tags.join(" and ")} can't sit in it side by side. ` +
        `Send all but one to their own vessel — or leave it as a single lot and note the trial on ` +
        `the readings you take from it.`,
      "CONFLICT",
    );
  }
}

function isCommandConflict(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "P2002" &&
    JSON.stringify((e as { meta?: unknown }).meta ?? "").includes("commandId")
  );
}

async function findByCommandId(commandId: string): Promise<SplitLotInPlaceResult | null> {
  const op = await prisma.lotOperation.findUnique({
    where: { commandId },
    select: { id: true, type: true, metadata: true },
  });
  if (!op || op.type !== "PRESS") return null;
  const m = (op.metadata ?? {}) as Record<string, unknown>;
  if (m.splitKind !== "IN_PLACE") return null;
  return {
    operationId: op.id,
    parentLotId: String(m.parentLotId ?? ""),
    drawnL: Number(m.drawnL ?? 0),
    discardedLeesL: Number(m.lossL ?? 0),
    children: (m.fractions as SplitChildResult[]) ?? [],
    duplicate: true,
    message: `Split already recorded (operation #${op.id}).`,
  };
}

export async function splitLotInPlaceTx(
  tx: Prisma.TransactionClient,
  actor: LedgerActor,
  input: SplitLotInPlaceInput,
): Promise<SplitLotInPlaceResult> {
  const children = cleanChildren(input.children ?? [], input.sourceVesselId);
  if (children.length === 0) throw new ActionError("Add at least one tracked sub-lot.");
  for (const c of children) {
    if (!(c.volumeL > 0)) throw new ActionError("Each sub-lot volume must be greater than 0.");
    if (!c.sublotTag) throw new ActionError("Each tracked sub-lot needs a tag.");
  }
  const discardedLeesL = round2(Number(input.discardedLeesL ?? 0));
  if (discardedLeesL < 0) throw new ActionError("Discarded lees can't be negative.");

  const parent = await tx.lot.findUnique({
    where: { id: input.parentLotId },
    select: {
      id: true,
      code: true,
      form: true,
      afState: true,
      mlfState: true,
      status: true,
      provenanceComplete: true,
      vintageYear: true,
      originVineyardId: true,
      originBlockId: true,
      originSubblockId: true,
      originVarietyId: true,
      productType: true,
      carbonation: true,
      taxAbvOverride: true,
      ownership: true,
      sourceVineyards: { select: { vineyardId: true } },
    },
  });
  if (!parent) throw new ActionError("Parent lot not found.");
  if (parent.status !== "ACTIVE") throw new ActionError(`Lot ${parent.code} is ${parent.status.toLowerCase()}.`);

  const destVesselIds = [...new Set(children.map((c) => c.destVesselId))];
  const vesselIds = [...new Set([input.sourceVesselId, ...destVesselIds])];
  const vessels = await tx.vessel.findMany({ where: { id: { in: vesselIds } } });
  const vesselById = new Map(vessels.map((v) => [v.id, v]));
  const source = vesselById.get(input.sourceVesselId);
  if (!source) throw new ActionError("Source vessel not found.");
  assertOneChildPerVessel(children, source.code);
  if (!source.isActive) throw new ActionError(`${source.code} is inactive.`);
  for (const destId of destVesselIds) {
    const dest = vesselById.get(destId);
    if (!dest) throw new ActionError("A destination vessel was not found.");
    if (!dest.isActive) throw new ActionError(`${dest.code} is inactive.`);
  }

  const parentVl = await tx.vesselLot.findFirst({
    where: { vesselId: input.sourceVesselId, lotId: input.parentLotId },
    select: { volumeL: true, updatedAt: true },
  });
  if (!parentVl) throw new ActionError(`Lot ${parent.code} isn't in that vessel.`, "CONFLICT");
  const available = Number(parentVl.volumeL);
  const currentRevision = parentVl.updatedAt.toISOString();
  if (input.expectedRevision != null && input.expectedRevision !== currentRevision) {
    throw new ActionError("The lot changed since you opened this split. Reload and re-enter the sub-lots.", "CONFLICT");
  }
  const childTotal = round2(children.reduce((a, c) => a + c.volumeL, 0));
  if (childTotal + discardedLeesL > available + 1e-9) {
    throw new ActionError(`That split draws ${childTotal + discardedLeesL} L, but ${parent.code} only has ${round2(available)} L in the source vessel.`, "CONFLICT");
  }

  // LEDGER-12: the source vessel must end holding exactly ONE lot. A child staying behind is only
  // legal when the parent is fully drawn out of it — otherwise the child would sit next to the
  // parent's remainder in the same tank, which is the fiction at its smallest scale: there was no
  // physical split, it is still one liquid.
  const stayingInSource = children.filter((c) => c.destVesselId === input.sourceVesselId);
  const parentRemainder = round2(available - childTotal - discardedLeesL);
  if (stayingInSource.length > 0 && parentRemainder > FUNCTIONAL_ZERO_L) {
    const tags = stayingInSource.map((c) => c.sublotTag || "the sub-lot").join(", ");
    throw new ActionError(
      `${source.code} would hold both ${parent.code} (${parentRemainder} L left) and ${tags}. ` +
        `A vessel holds one wine — either split ALL of ${parent.code} out, send ${tags} to its own ` +
        `vessel, or leave it as one lot and note the trial on the readings you take from it.`,
      "CONFLICT",
    );
  }

  let originAbbrs: { vineyardAbbr: string; varietyAbbr: string; blockCode?: string; blockLabel?: string; subblockCode?: string; subblockLabel?: string } | null = null;
  if (parent.originVineyardId && parent.originVarietyId) {
    const [vy, vt, bl, sub] = await Promise.all([
      tx.vineyard.findUnique({ where: { id: parent.originVineyardId }, select: { abbreviation: true } }),
      tx.variety.findUnique({ where: { id: parent.originVarietyId }, select: { abbreviation: true } }),
      parent.originBlockId
        ? tx.vineyardBlock.findUnique({ where: { id: parent.originBlockId }, select: { code: true, blockLabel: true } })
        : Promise.resolve(null),
      parent.originSubblockId
        ? tx.vineyardSubblock.findUnique({ where: { id: parent.originSubblockId }, select: { code: true, label: true } })
        : Promise.resolve(null),
    ]);
    if (vy?.abbreviation && vt?.abbreviation) {
      originAbbrs = {
        vineyardAbbr: vy.abbreviation,
        varietyAbbr: vt.abbreviation,
        blockCode: bl?.code ?? undefined,
        blockLabel: bl?.blockLabel ?? undefined,
        subblockCode: sub?.code ?? undefined,
        subblockLabel: sub?.label ?? undefined,
      };
    }
  }

  const lotCodes = new Map<string, string>([[input.parentLotId, parent.code]]);
  const fractionDraws: PressFractionDraw[] = [];
  const results: SplitChildResult[] = [];
  const childIds: string[] = [];

  for (const c of children) {
    const token = normalizeToken(c.sublotTag) || (c.role === "LEES" ? "LEES" : "SPLIT");
    const code = originAbbrs
      ? await nextLotCode(tx, {
          vintage: parent.vintageYear ?? new Date(0).getFullYear(),
          vineyardAbbr: originAbbrs.vineyardAbbr,
          varietyAbbr: originAbbrs.varietyAbbr,
          blockCode: originAbbrs.blockCode,
          blockLabel: originAbbrs.blockLabel,
          subblockCode: originAbbrs.subblockCode,
          subblockLabel: originAbbrs.subblockLabel,
          tag: token,
        })
      : await nextBlendLotCode(tx, { vintage: parent.vintageYear ?? null, token });
    const child = await tx.lot.create({
      data: {
        code,
        form: parent.form as LotForm,
        afState: parent.afState,
        mlfState: parent.mlfState,
        originVineyardId: parent.originVineyardId,
        originBlockId: parent.originBlockId,
        originSubblockId: parent.originSubblockId,
        originVarietyId: parent.originVarietyId,
        vintageYear: parent.vintageYear,
        productType: parent.productType,
        carbonation: parent.carbonation,
        taxAbvOverride: parent.taxAbvOverride,
        ownership: parent.ownership,
        provenanceComplete: parent.provenanceComplete,
        sublotTag: c.sublotTag,
      },
      select: { id: true, code: true },
    });
    childIds.push(child.id);
    lotCodes.set(child.id, child.code);
    fractionDraws.push({ childLotId: child.id, destVesselId: c.destVesselId, volumeL: c.volumeL });
    results.push({
      lotId: child.id,
      code: child.code,
      sublotTag: c.sublotTag,
      role: c.role,
      vesselId: c.destVesselId,
      volumeL: c.volumeL,
      merged: false,
    });
  }

  const plan = planPress(input.parentLotId, input.sourceVesselId, available, fractionDraws, discardedLeesL);
  const vesselCodes = new Map(vessels.map((v) => [v.id, v.code]));
  const capacityByVessel = new Map(vessels.map((v) => [v.id, Number(v.capacityL)]));
  const retainedLeesL = round2(results.filter((r) => r.role === "LEES").reduce((a, r) => a + r.volumeL, 0));
  const metadata = {
    op: "PRESS",
    splitKind: "IN_PLACE",
    parentLotId: input.parentLotId,
    drawnL: plan.drawnL,
    lossL: plan.lossL,
    childForm: parent.form,
    retainedLeesL,
    fractions: results,
  } satisfies Prisma.InputJsonObject;
  const summary = `Split ${plan.drawnL} L from ${parent.code} into ${results.length} sub-lot(s)${retainedLeesL > 0 ? ` (${retainedLeesL} L retained lees)` : ""}${plan.lossL > 0 ? `, discarded ${plan.lossL} L lees` : ""}`;

  const operationId = await writeLotOperation(tx, {
    type: "PRESS",
    lines: plan.lines,
    actorUserId: actor.actorUserId,
    enteredBy: actor.actorEmail,
    captureMethod: input.captureMethod,
    note: input.note?.trim() || summary,
    commandId: input.commandId ?? null,
    metadata,
    lotCodes,
    vesselCodes,
    capacityByVessel,
  });

  const grossByChild = new Map<string, number>();
  for (const draw of fractionDraws) grossByChild.set(draw.childLotId, round2((grossByChild.get(draw.childLotId) ?? 0) + draw.volumeL));
  const denom = [...grossByChild.values()].reduce((a, v) => a + v, 0);
  for (const [childLotId, gross] of grossByChild) {
    await tx.lotLineage.create({
      data: {
        parentLotId: input.parentLotId,
        childLotId,
        kind: LINEAGE_KIND.SPLIT,
        fraction: denom > 0 ? Math.min(0.99999, round5(gross / denom)) : null,
      },
    });
  }

  if (parent.sourceVineyards.length > 0) {
    await tx.lotVineyard.createMany({
      data: childIds.flatMap((lotId) => parent.sourceVineyards.map((sv) => ({ lotId, vineyardId: sv.vineyardId }))),
      skipDuplicates: true,
    });
  }

  await writeProportionalCostTransfers(
    tx,
    results.map((child) => ({
      operationId,
      fromLotId: input.parentLotId,
      toLotId: child.lotId,
      transferredVolumeL: child.volumeL,
      parentPreOpVolumeL: available,
    })),
  );

  await writeAudit(tx, {
    ...actor,
    action: "STOCK_MOVEMENT",
    entityType: "LotOperation",
    entityId: String(operationId),
    summary,
  });

  return {
    operationId,
    parentLotId: input.parentLotId,
    drawnL: plan.drawnL,
    discardedLeesL: plan.lossL,
    children: results,
    duplicate: false,
    message: `${summary}.`,
  };
}

export async function splitLotInPlaceCore(actor: LedgerActor, input: SplitLotInPlaceInput): Promise<SplitLotInPlaceResult> {
  if (input.commandId) {
    const prior = await findByCommandId(input.commandId);
    if (prior) return prior;
  }

  const MAX_CODE_RETRIES = 5;
  for (let attempt = 1; ; attempt++) {
    try {
      return await runLedgerWrite((tx) => splitLotInPlaceTx(tx, actor, input));
    } catch (e) {
      if (input.commandId && isCommandConflict(e)) {
        const prior = await findByCommandId(input.commandId);
        if (prior) return prior;
      }
      if (isUniqueViolation(e) && attempt < MAX_CODE_RETRIES) continue;
      throw e;
    }
  }
}
