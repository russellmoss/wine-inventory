import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { planPress, type PressFractionDraw } from "@/lib/ledger/math";
import { nextLotCode, nextBlendLotCode, isUniqueViolation } from "@/lib/lot/generate";
import { normalizeToken } from "@/lib/lot/code";
import type { CaptureMethod, LotForm } from "@/lib/ledger/vocabulary";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Script-safe core for the PRESS / SAIGNEE transforms (Phase 6 Unit 4). Press is the Phase 5
// split run 1 parent → N children: draw the parent vessel-lot position down (lock + optional
// expectedRevision guard — press can run mid-ferment while volume changes, council S7),
// originate free-run + press fraction child lots (NEW or MERGED into an existing destination),
// lees/skins as a typed loss line, and a SPLIT lineage edge per distinct child. Whites press
// pre-ferment (MUST→JUICE); reds press dry-on-skins (MUST→WINE). SAIGNEE is the same core run
// before ferment: bleed a JUICE fraction off a MUST lot, concentrating the parent.

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

export type PressFractionInput = {
  destVesselId: string;
  volumeL: number;
  label: string; // FR / light / hard / rosé … (drives the new lot's code tag)
  estimated?: boolean; // press pans aren't gauged until pumped — metadata only, balance is the same
  mergeIntoLotId?: string | null; // route into an existing destination lot instead of a new child
  form?: LotForm; // override the derived child form
};

export type PressLotInput = {
  commandId?: string | null;
  parentLotId: string;
  sourceVesselId: string;
  expectedRevision?: string | null; // the parent VesselLot.updatedAt ISO the client last saw
  fractions: PressFractionInput[];
  lossL?: number;
  op?: "PRESS" | "SAIGNEE"; // default PRESS
  note?: string | null;
  captureMethod?: CaptureMethod;
};

export type PressFractionResult = {
  lotId: string;
  code: string;
  label: string;
  volumeL: number;
  estimated: boolean;
  merged: boolean;
};

export type PressLotResult = {
  operationId: number;
  op: "PRESS" | "SAIGNEE";
  parentLotId: string;
  drawnL: number;
  lossL: number;
  fractions: PressFractionResult[];
  duplicate: boolean;
  message: string;
};

function isCommandConflict(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "P2002" &&
    JSON.stringify((e as { meta?: unknown }).meta ?? "").includes("commandId")
  );
}

async function findByCommandId(commandId: string): Promise<PressLotResult | null> {
  const op = await prisma.lotOperation.findUnique({
    where: { commandId },
    select: { id: true, type: true, metadata: true },
  });
  if (!op || (op.type !== "PRESS" && op.type !== "SAIGNEE")) return null;
  const m = (op.metadata ?? {}) as Record<string, unknown>;
  return {
    operationId: op.id,
    op: op.type,
    parentLotId: String(m.parentLotId ?? ""),
    drawnL: Number(m.drawnL ?? 0),
    lossL: Number(m.lossL ?? 0),
    fractions: (m.fractions as PressFractionResult[]) ?? [],
    duplicate: true,
    message: `${op.type === "SAIGNEE" ? "Saignée" : "Press"} already recorded (operation #${op.id}).`,
  };
}

/** Derive the fraction child's form from the parent's form + alcoholic-ferment state. */
function deriveChildForm(op: "PRESS" | "SAIGNEE", parentForm: LotForm, parentAf: string): LotForm {
  if (op === "SAIGNEE") return "JUICE"; // bleed juice off a pre-ferment must
  if (parentForm === "MUST") return parentAf === "DRY" ? "WINE" : "JUICE"; // red dry-on-skins → wine; white → juice
  if (parentForm === "JUICE") return "WINE"; // pressing settled juice → wine
  return parentForm; // WINE → WINE
}

export async function pressLotCore(actor: LedgerActor, input: PressLotInput): Promise<PressLotResult> {
  const op = input.op ?? "PRESS";
  if (!input.fractions || input.fractions.length === 0) throw new ActionError("Add at least one press fraction.");

  if (input.commandId) {
    const prior = await findByCommandId(input.commandId);
    if (prior) return prior;
  }

  // Parent lot + its position in the source vessel (the revision token + available volume).
  const parent = await prisma.lot.findUnique({
    where: { id: input.parentLotId },
    select: {
      id: true,
      code: true,
      form: true,
      afState: true,
      status: true,
      provenanceComplete: true,
      vintageYear: true,
      originVineyardId: true,
      originVarietyId: true,
      originBlockId: true,
      sourceVineyards: { select: { vineyardId: true } },
    },
  });
  if (!parent) throw new ActionError("Parent lot not found.");
  if (parent.status !== "ACTIVE") throw new ActionError(`Lot ${parent.code} is ${parent.status.toLowerCase()}.`);
  if (op === "SAIGNEE" && parent.form !== "MUST") {
    throw new ActionError(`Saignée bleeds juice off a MUST lot — lot ${parent.code} is ${parent.form}.`);
  }

  const childForm = deriveChildForm(op, parent.form as LotForm, parent.afState);

  // Source vessel + every destination vessel, with capacities and codes.
  const destVesselIds = [...new Set(input.fractions.map((f) => f.destVesselId))];
  const vesselIds = [...new Set([input.sourceVesselId, ...destVesselIds])];
  const vessels = await prisma.vessel.findMany({ where: { id: { in: vesselIds } } });
  const vesselById = new Map(vessels.map((v) => [v.id, v]));
  if (!vesselById.has(input.sourceVesselId)) throw new ActionError("Source vessel not found.");
  for (const dv of destVesselIds) {
    const v = vesselById.get(dv);
    if (!v) throw new ActionError("A destination vessel was not found.");
    if (!v.isActive) throw new ActionError(`${v.code} is inactive.`);
  }

  // Pre-resolve abbreviations for new-lot codes (single-origin parent → readable code).
  let originAbbrs: { vineyardAbbr: string; varietyAbbr: string; blockCode?: string; blockLabel?: string } | null = null;
  if (parent.originVineyardId && parent.originVarietyId) {
    const [vy, vt, bl] = await Promise.all([
      prisma.vineyard.findUnique({ where: { id: parent.originVineyardId }, select: { abbreviation: true } }),
      prisma.variety.findUnique({ where: { id: parent.originVarietyId }, select: { abbreviation: true } }),
      parent.originBlockId
        ? prisma.vineyardBlock.findUnique({ where: { id: parent.originBlockId }, select: { code: true, blockLabel: true } })
        : Promise.resolve(null),
    ]);
    if (vy?.abbreviation && vt?.abbreviation) {
      originAbbrs = {
        vineyardAbbr: vy.abbreviation,
        varietyAbbr: vt.abbreviation,
        blockCode: bl?.code ?? undefined,
        blockLabel: bl?.blockLabel ?? undefined,
      };
    }
  }

  const MAX_CODE_RETRIES = 5;
  for (let attempt = 1; ; attempt++) {
    try {
      return await runLedgerWrite(async (tx) => {
        // Lock + read the parent position (SERIALIZABLE). updatedAt is the revision token.
        const parentVl = await tx.vesselLot.findUnique({
          where: { vesselId_lotId: { vesselId: input.sourceVesselId, lotId: input.parentLotId } },
          select: { volumeL: true, updatedAt: true },
        });
        if (!parentVl) throw new ActionError(`Lot ${parent.code} isn't in that vessel.`, "CONFLICT");
        const available = Number(parentVl.volumeL);
        const currentRevision = parentVl.updatedAt.toISOString();
        if (input.expectedRevision != null && input.expectedRevision !== currentRevision) {
          throw new ActionError(
            "The lot changed since you opened this press — reload and re-enter the fractions.",
            "CONFLICT",
          );
        }

        // Resolve each fraction's child lot: merge into an existing lot, or mint a new one.
        const lotCodes = new Map<string, string>([[input.parentLotId, parent.code]]);
        const fractionDraws: PressFractionDraw[] = [];
        const fractionResults: PressFractionResult[] = [];
        const newChildIds: string[] = [];

        for (const f of input.fractions) {
          if (!(f.volumeL > 0)) throw new ActionError("Each fraction volume must be greater than 0.");
          let childLotId: string;
          let childCode: string;
          let merged = false;

          if (f.mergeIntoLotId) {
            const dest = await tx.lot.findUnique({
              where: { id: f.mergeIntoLotId },
              select: { id: true, code: true, status: true },
            });
            if (!dest) throw new ActionError("The destination lot to merge into was not found.");
            if (dest.status !== "ACTIVE") throw new ActionError(`Can't merge into inactive lot ${dest.code}.`);
            childLotId = dest.id;
            childCode = dest.code;
            merged = true;
          } else {
            const tag = normalizeToken(f.label) || "PR";
            childCode = originAbbrs
              ? await nextLotCode(tx, {
                  vintage: parent.vintageYear ?? new Date(0).getFullYear(),
                  vineyardAbbr: originAbbrs.vineyardAbbr,
                  varietyAbbr: originAbbrs.varietyAbbr,
                  blockCode: originAbbrs.blockCode,
                  blockLabel: originAbbrs.blockLabel,
                  tag,
                })
              : await nextBlendLotCode(tx, { vintage: parent.vintageYear ?? null, token: tag });
            const created = await tx.lot.create({
              data: {
                code: childCode,
                form: (f.form ?? childForm) as LotForm,
                afState: "NONE",
                mlfState: "NONE",
                originVineyardId: parent.originVineyardId,
                originVarietyId: parent.originVarietyId,
                originBlockId: parent.originBlockId,
                vintageYear: parent.vintageYear,
                provenanceComplete: parent.provenanceComplete,
              },
              select: { id: true, code: true },
            });
            childLotId = created.id;
            newChildIds.push(childLotId);
          }

          lotCodes.set(childLotId, childCode);
          fractionDraws.push({ childLotId, destVesselId: f.destVesselId, volumeL: round2(f.volumeL) });
          fractionResults.push({
            lotId: childLotId,
            code: childCode,
            label: f.label,
            volumeL: round2(f.volumeL),
            estimated: !!f.estimated,
            merged,
          });
        }

        const plan = planPress(input.parentLotId, input.sourceVesselId, available, fractionDraws, input.lossL ?? 0);

        const capacityByVessel = new Map(vessels.map((v) => [v.id, Number(v.capacityL)]));
        const vesselCodes = new Map(vessels.map((v) => [v.id, v.code]));

        const metadata = {
          op,
          parentLotId: input.parentLotId,
          drawnL: plan.drawnL,
          lossL: plan.lossL,
          childForm,
          fractions: fractionResults,
        };

        const summary =
          op === "SAIGNEE"
            ? `Bled ${plan.fractionTotalL} L juice off ${parent.code} (saignée)`
            : `Pressed ${plan.drawnL} L from ${parent.code} into ${fractionResults.length} fraction(s)${plan.lossL > 0 ? ` (${plan.lossL} L lees)` : ""}`;

        const opId = await writeLotOperation(tx, {
          type: op,
          lines: plan.lines,
          actorUserId: actor.actorUserId,
          enteredBy: actor.actorEmail,
          captureMethod: input.captureMethod,
          note: input.note?.trim() || summary,
          commandId: input.commandId ?? null,
          lotCodes,
          vesselCodes,
          capacityByVessel,
        });
        await tx.lotOperation.update({ where: { id: opId }, data: { metadata } });

        // SPLIT lineage edge per DISTINCT child (fraction = child's share of the moved volume),
        // and copy the parent's source-vineyard set onto each NEW child (provenance carries over).
        const grossByChild = new Map<string, number>();
        for (const f of fractionDraws) grossByChild.set(f.childLotId, round2((grossByChild.get(f.childLotId) ?? 0) + f.volumeL));
        const denom = [...grossByChild.values()].reduce((a, v) => a + v, 0);
        for (const [childLotId, gross] of grossByChild) {
          const fraction = denom > 0 ? Math.min(0.99999, round5(gross / denom)) : null;
          await tx.lotLineage.upsert({
            where: { parentLotId_childLotId: { parentLotId: input.parentLotId, childLotId } },
            create: { parentLotId: input.parentLotId, childLotId, kind: "SPLIT", fraction },
            update: { fraction, kind: "SPLIT" },
          });
        }
        if (parent.sourceVineyards.length > 0 && newChildIds.length > 0) {
          await tx.lotVineyard.createMany({
            data: newChildIds.flatMap((lotId) =>
              parent.sourceVineyards.map((sv) => ({ lotId, vineyardId: sv.vineyardId })),
            ),
            skipDuplicates: true,
          });
        }

        await writeAudit(tx, {
          ...actor,
          action: "STOCK_MOVEMENT",
          entityType: "LotOperation",
          entityId: String(opId),
          summary,
        });

        return {
          operationId: opId,
          op,
          parentLotId: input.parentLotId,
          drawnL: plan.drawnL,
          lossL: plan.lossL,
          fractions: fractionResults,
          duplicate: false,
          message: `${summary}.`,
        } satisfies PressLotResult;
      });
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
