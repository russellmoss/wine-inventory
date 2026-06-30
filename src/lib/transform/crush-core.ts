import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { planCrush, type CrushPickDraw } from "@/lib/ledger/math";
import { nextLotCode, isUniqueViolation } from "@/lib/lot/generate";
import type { CaptureMethod } from "@/lib/ledger/vocabulary";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Script-safe core for the CRUSH transform (Phase 6 Unit 3). Consumes harvest picks (in part
// or full) and ORIGINATES a must lot at MEASURED liters (D8 — kg is op metadata, never a
// ledger line). Two modes: NEW (mint a single-origin MUST lot) and ADD (sequential fill — an
// existing must lot in the vessel ABSORBS the crush, keeping its identity). The pick→lot link
// is LotHarvestSource (picks aren't lots, so there's no LotLineage edge); it is the single
// source of truth for pick consumption (council S8). No "use server": actions.ts wraps it with
// block-access auth; scripts/tests call it directly.

export type CrushPickInput = { pickId: string; consumedKg: number };

export type CrushTarget =
  | { mode: "NEW"; varietyId?: string | null; vintage: number; wholeClusterPct?: number | null }
  | { mode: "ADD"; lotId: string };

export type CrushLotInput = {
  commandId?: string | null;
  picks: CrushPickInput[];
  destVesselId: string;
  outputVolumeL: number;
  target: CrushTarget;
  destemmed?: boolean;
  mustTempC?: number | null;
  note?: string | null;
  captureMethod?: CaptureMethod;
};

export type CrushLotResult = {
  operationId: number;
  lotId: string;
  lotCode: string;
  mode: "NEW" | "ADD";
  outputVolumeL: number;
  totalConsumedKg: number;
  yieldLPerKg: number;
  yieldLPerTonne: number;
  duplicate: boolean; // true when commandId already ran (idempotent no-op success)
  message: string;
};

function isCommandConflict(e: unknown): boolean {
  // P2002 specifically on the LotOperation.commandId unique index.
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "P2002" &&
    JSON.stringify((e as { meta?: unknown }).meta ?? "").includes("commandId")
  );
}

/** Reconstruct the success result of an already-committed crush command (idempotency). */
async function findByCommandId(commandId: string): Promise<CrushLotResult | null> {
  const op = await prisma.lotOperation.findUnique({
    where: { commandId },
    select: { id: true, type: true, metadata: true },
  });
  if (!op || op.type !== "CRUSH") return null;
  const m = (op.metadata ?? {}) as Record<string, unknown>;
  return {
    operationId: op.id,
    lotId: String(m.lotId ?? ""),
    lotCode: String(m.lotCode ?? ""),
    mode: (m.mode as "NEW" | "ADD") ?? "NEW",
    outputVolumeL: Number(m.outputVolumeL ?? 0),
    totalConsumedKg: Number(m.totalConsumedKg ?? 0),
    yieldLPerKg: Number(m.yieldLPerKg ?? 0),
    yieldLPerTonne: Number(m.yieldLPerTonne ?? 0),
    duplicate: true,
    message: `Crush already recorded (operation #${op.id}).`,
  };
}

export async function crushLotCore(actor: LedgerActor, input: CrushLotInput): Promise<CrushLotResult> {
  if (!input.picks || input.picks.length === 0) throw new ActionError("Select at least one harvest pick to crush.");
  if (!(input.outputVolumeL > 0)) throw new ActionError("Enter the measured must volume (liters).");

  // Idempotency: a committed command is a no-op success (council S4).
  if (input.commandId) {
    const prior = await findByCommandId(input.commandId);
    if (prior) return prior;
  }

  const vessel = await prisma.vessel.findUnique({ where: { id: input.destVesselId } });
  if (!vessel || !vessel.isActive) throw new ActionError("Destination vessel not found or inactive.");

  // Load the picks with their block/vineyard/variety + total weight, and how much of each is
  // already consumed (Σ LotHarvestSource.consumedKg) — the partial-pick guard's live denominator.
  const pickIds = [...new Set(input.picks.map((p) => p.pickId))];
  if (pickIds.length !== input.picks.length) throw new ActionError("A pick was listed twice.");
  const picks = await prisma.harvestPick.findMany({
    where: { id: { in: pickIds } },
    select: {
      id: true,
      weightKg: true,
      harvestRecord: {
        select: {
          vintageYear: true,
          vineyardId: true,
          block: { select: { id: true, code: true, blockLabel: true, varietyId: true } },
        },
      },
    },
  });
  if (picks.length !== pickIds.length) throw new ActionError("A selected pick no longer exists.");
  const pickById = new Map(picks.map((p) => [p.id, p]));

  const consumedAgg = await prisma.lotHarvestSource.groupBy({
    by: ["harvestPickId"],
    where: { harvestPickId: { in: pickIds } },
    _sum: { consumedKg: true },
  });
  const alreadyByPick = new Map(consumedAgg.map((r) => [r.harvestPickId, Number(r._sum.consumedKg ?? 0)]));

  const draws: CrushPickDraw[] = input.picks.map((p) => {
    const pk = pickById.get(p.pickId)!;
    return {
      pickId: p.pickId,
      consumedKg: p.consumedKg,
      weightKg: Number(pk.weightKg),
      alreadyConsumedKg: alreadyByPick.get(p.pickId) ?? 0,
    };
  });

  // Resolve the target lot's identity + origin.
  let mode: "NEW" | "ADD";
  let originBlockId: string | null = null;
  let originVineyardId: string | null = null;
  let originVarietyId: string | null = null;
  let vintage: number | null = null;
  let existingLotId: string | null = null;

  if (input.target.mode === "ADD") {
    mode = "ADD";
    const lot = await prisma.lot.findUnique({
      where: { id: input.target.lotId },
      select: { id: true, code: true, form: true, status: true },
    });
    if (!lot) throw new ActionError("The must lot to add into was not found.");
    if (lot.status !== "ACTIVE") throw new ActionError("Can't add fruit to an inactive lot.");
    if (lot.form !== "MUST" && lot.form !== "JUICE") {
      throw new ActionError(`Sequential fill needs a MUST/JUICE lot — lot ${lot.code} is ${lot.form}.`);
    }
    existingLotId = lot.id;
  } else {
    mode = "NEW";
    vintage = input.target.vintage;
    // A single-origin must lot needs one block of origin; picks spanning blocks → that's a blend.
    const blocks = new Set(picks.map((p) => p.harvestRecord.block?.id ?? "").filter(Boolean));
    if (blocks.size !== 1) {
      throw new ActionError("A new must lot must come from picks of a single block (mix blocks via a blend).");
    }
    const block = picks[0].harvestRecord.block!;
    originBlockId = block.id;
    originVineyardId = picks[0].harvestRecord.vineyardId;
    originVarietyId = input.target.varietyId ?? block.varietyId ?? null;
    if (!originVarietyId) {
      throw new ActionError("Set the block's variety (or pass one) before crushing a new lot.");
    }
  }

  // For a NEW lot we need abbreviations to build a readable code.
  let codeParts: { vineyardAbbr: string; varietyAbbr: string; blockCode?: string; blockLabel?: string } | null = null;
  if (mode === "NEW") {
    const [variety, vineyard, block] = await Promise.all([
      prisma.variety.findUnique({ where: { id: originVarietyId! }, select: { name: true, abbreviation: true } }),
      prisma.vineyard.findUnique({ where: { id: originVineyardId! }, select: { name: true, abbreviation: true } }),
      prisma.vineyardBlock.findUnique({ where: { id: originBlockId! }, select: { code: true, blockLabel: true } }),
    ]);
    if (!variety?.abbreviation) throw new ActionError(`Set an abbreviation for variety "${variety?.name ?? originVarietyId}".`);
    if (!vineyard?.abbreviation) throw new ActionError(`Set an abbreviation for vineyard "${vineyard?.name ?? originVineyardId}".`);
    codeParts = {
      vineyardAbbr: vineyard.abbreviation,
      varietyAbbr: variety.abbreviation,
      blockCode: block?.code ?? undefined,
      blockLabel: block?.blockLabel ?? undefined,
    };
  }

  const MAX_CODE_RETRIES = 5;
  for (let attempt = 1; ; attempt++) {
    try {
      return await runLedgerWrite(async (tx) => {
        // Resolve / mint the must lot.
        let lotId: string;
        let lotCode: string;
        if (mode === "NEW") {
          lotCode = await nextLotCode(tx, {
            vintage: vintage!,
            vineyardAbbr: codeParts!.vineyardAbbr,
            varietyAbbr: codeParts!.varietyAbbr,
            blockCode: codeParts!.blockCode,
            blockLabel: codeParts!.blockLabel,
          });
          const created = await tx.lot.create({
            data: {
              code: lotCode,
              form: "MUST",
              afState: "NONE",
              mlfState: "NONE",
              originVarietyId,
              originVineyardId,
              originBlockId,
              vintageYear: vintage,
            },
            select: { id: true, code: true },
          });
          lotId = created.id;
        } else {
          const lot = await tx.lot.findUniqueOrThrow({ where: { id: existingLotId! }, select: { id: true, code: true } });
          lotId = lot.id;
          lotCode = lot.code;
        }

        const plan = planCrush(draws, input.destVesselId, lotId, input.outputVolumeL);

        const metadata = {
          mode,
          lotId,
          lotCode,
          outputVolumeL: plan.outputVolumeL,
          totalConsumedKg: plan.totalConsumedKg,
          yieldLPerKg: plan.yieldLPerKg,
          yieldLPerTonne: plan.yieldLPerTonne,
          destemmed: input.destemmed ?? null,
          mustTempC: input.mustTempC ?? null,
          wholeClusterPct: input.target.mode === "NEW" ? (input.target.wholeClusterPct ?? null) : null,
          picks: draws.map((d) => ({ pickId: d.pickId, consumedKg: d.consumedKg })),
        };

        const summary =
          mode === "NEW"
            ? `Crushed ${plan.totalConsumedKg} kg → ${plan.outputVolumeL} L must into ${vessel.code} (lot ${lotCode}, ${plan.yieldLPerTonne} L/t)`
            : `Crushed ${plan.totalConsumedKg} kg → +${plan.outputVolumeL} L into must lot ${lotCode} (${vessel.code})`;

        const opId = await writeLotOperation(tx, {
          type: "CRUSH",
          lines: plan.lines,
          actorUserId: actor.actorUserId,
          enteredBy: actor.actorEmail,
          captureMethod: input.captureMethod,
          note: input.note?.trim() || summary,
          commandId: input.commandId ?? null,
          lotCodes: new Map([[lotId, lotCode]]),
          vesselCodes: new Map([[input.destVesselId, vessel.code]]),
          capacityByVessel: new Map([[input.destVesselId, Number(vessel.capacityL)]]),
        });
        // Stamp the metadata (writeLotOperation doesn't take it; set it on the row we own).
        await tx.lotOperation.update({ where: { id: opId }, data: { metadata } });

        // The pick→lot link (single source of truth for consumption). One row per pick.
        await tx.lotHarvestSource.createMany({
          data: draws.map((d) => ({ lotId, harvestPickId: d.pickId, consumedKg: d.consumedKg })),
        });

        // A NEW single-origin lot carries its source-vineyard set (Phase 5 scoping) + complete provenance.
        if (mode === "NEW" && originVineyardId) {
          await tx.lotVineyard.createMany({
            data: [{ lotId, vineyardId: originVineyardId }],
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
          lotId,
          lotCode,
          mode,
          outputVolumeL: plan.outputVolumeL,
          totalConsumedKg: plan.totalConsumedKg,
          yieldLPerKg: plan.yieldLPerKg,
          yieldLPerTonne: plan.yieldLPerTonne,
          duplicate: false,
          message: `${summary}.`,
        } satisfies CrushLotResult;
      });
    } catch (e) {
      // A racing duplicate command committed first → treat as success (idempotency).
      if (input.commandId && isCommandConflict(e)) {
        const prior = await findByCommandId(input.commandId);
        if (prior) return prior;
      }
      if (isUniqueViolation(e) && attempt < MAX_CODE_RETRIES) continue; // lot-code race → regenerate
      throw e;
    }
  }
}
