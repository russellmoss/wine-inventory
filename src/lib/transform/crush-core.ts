import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { planCrush, planCrushSplit, type CrushPickDraw } from "@/lib/ledger/math";
import { nextLotCode, isUniqueViolation } from "@/lib/lot/generate";
import type { CaptureMethod, LotForm, OperationType } from "@/lib/ledger/vocabulary";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Script-safe core for the CRUSH transform (Phase 6 Unit 3). Consumes harvest picks (in part
// or full) and ORIGINATES a must lot at MEASURED liters (D8 — kg is op metadata, never a
// ledger line). Two modes: NEW (mint a single-origin MUST lot) and ADD (sequential fill — an
// existing must lot in the vessel ABSORBS the crush, keeping its identity). The pick→lot link
// is LotHarvestSource (picks aren't lots, so there's no LotLineage edge); it is the single
// source of truth for pick consumption (council S8). No "use server": actions.ts wraps it with
// block-access auth; scripts/tests call it directly.
//
// Plan 035: split into a tx-form (crushLotTx, runs inside a caller's transaction — used by the
// work-order execution lane) + the crushLotCore wrapper (owns the runLedgerWrite tx, the commandId
// idempotency pre-check, and the lot-code-collision retry) for the standalone /ferment path.

export type CrushPickInput = { pickId: string; consumedKg: number };

export type CrushTarget =
  | { mode: "NEW"; varietyId?: string | null; vintage: number; wholeClusterPct?: number | null }
  | { mode: "ADD"; lotId: string };

export type CrushLotInput = {
  commandId?: string | null;
  picks: CrushPickInput[];
  destVesselId: string;
  outputVolumeL: number;
  // Whole-cluster press can split the originated juice across SEVERAL vessels (one lot, N tanks).
  // When present (NEW mode), these override destVesselId/outputVolumeL; outputVolumeL = Σ volumes.
  destinations?: { vesselId: string; volumeL: number }[];
  target: CrushTarget;
  destemmed?: boolean;
  // De-stem capture: were the crusher rollers engaged, and over what % of the lot? (They can
  // destem whole-berry with rollers OFF, or crush part of the lot and run the rest whole.)
  crusherOn?: boolean;
  crushedPct?: number; // 0–100; meaningful when crusherOn (defaults to 100 in the UI)
  mustTempC?: number | null;
  note?: string | null;
  captureMethod?: CaptureMethod;
  // Whole-cluster press skips crush: it presses whole fruit straight to JUICE (op PRESS), reusing
  // this same picks→measured-liters origination. NEW mode only. Defaults: MUST originated by CRUSH.
  outputForm?: LotForm; // the originated lot's form (MUST for a destem/crush, JUICE for whole-cluster)
  opType?: OperationType; // CRUSH (default) or PRESS (whole-cluster)
  pressCycle?: string | null; // optional named press program (whole-cluster press only)
  // Phase 8 (Unit 7): fruit/grape cost entering the lot's basis at origination — OPTIONAL (physical
  // tracking is unaffected if absent; a lot with no fruit cost reads as UNKNOWN, never $0 — D14).
  // Give a lump sum OR a per-kg rate (per-kg wins if both are set; total = rate × consumed kg).
  fruitCostTotal?: number | null;
  fruitCostPerKg?: number | null;
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
  if (!op || (op.type !== "CRUSH" && op.type !== "PRESS")) return null;
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

/**
 * The CRUSH transform as a tx-form (plan 035): runs the full crush inside a caller-provided
 * transaction, so it composes into the work-order execution lane's single ledger tx. Every read uses
 * `tx`. It does NOT do the commandId idempotency pre-check or lot-code retry — those live in
 * crushLotCore (the standalone wrapper). A lot-code collision inside a caller's tx surfaces as a
 * unique violation for the caller to handle (the WO lane leans on the rarity + the worker re-tap).
 */
export async function crushLotTx(tx: Prisma.TransactionClient, actor: LedgerActor, input: CrushLotInput): Promise<CrushLotResult> {
  if (!input.picks || input.picks.length === 0) throw new ActionError("Select at least one harvest pick to crush.");

  // Normalize to a destination list (single dest = one entry). Multi-dest is NEW-mode only.
  const dests =
    input.destinations && input.destinations.length > 0
      ? input.destinations
      : [{ vesselId: input.destVesselId, volumeL: input.outputVolumeL }];
  const totalOut = Math.round(dests.reduce((a, d) => a + (d.volumeL || 0), 0) * 100) / 100;
  if (!(totalOut > 0)) throw new ActionError("Enter the measured volume (liters).");
  if (input.destinations && input.destinations.length > 0 && input.target.mode === "ADD") {
    throw new ActionError("Adding into an existing lot can't split across vessels.");
  }

  const destVesselIds = [...new Set(dests.map((d) => d.vesselId))];
  const vessels = await tx.vessel.findMany({ where: { id: { in: destVesselIds } } });
  const vesselById = new Map(vessels.map((v) => [v.id, v]));
  if (vesselById.size !== destVesselIds.length) throw new ActionError("A destination vessel was not found.");
  for (const v of vessels) if (!v.isActive) throw new ActionError(`${v.code} is inactive.`);
  const vessel = vesselById.get(dests[0].vesselId)!; // the primary dest (labels / ADD target)

  // Load the picks with their block/vineyard/variety + total weight, and how much of each is
  // already consumed (Σ LotHarvestSource.consumedKg) — the partial-pick guard's live denominator.
  const pickIds = [...new Set(input.picks.map((p) => p.pickId))];
  if (pickIds.length !== input.picks.length) throw new ActionError("A pick was listed twice.");
  const picks = await tx.harvestPick.findMany({
    where: { id: { in: pickIds } },
    select: {
      id: true,
      weightKg: true,
      weighTagLineId: true, // Plan 093 Unit 10: the pick's owner/grower source
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

  // Plan 093 Unit 10: resolve each consuming pick's OWNER via its weigh-tag line (Unit 9). A line still
  // flagged needsOwnerAssignment is a HARD STOP at CRUSH — you cannot originate a titled lot from fruit of
  // unknown title — but only here (a resolvable desk decision), NEVER at the scale (the wet-hands receipt).
  const wtlIds = [...new Set(picks.map((p) => p.weighTagLineId).filter((x): x is string => !!x))];
  const wtLines = wtlIds.length
    ? await tx.weighTagLine.findMany({ where: { id: { in: wtlIds } }, select: { id: true, ownerId: true, needsOwnerAssignment: true } })
    : [];
  const wtLineById = new Map(wtLines.map((l) => [l.id, l]));
  const ownerOfPick = (pickId: string): string | null => {
    const wtlId = pickById.get(pickId)?.weighTagLineId;
    return wtlId ? (wtLineById.get(wtlId)?.ownerId ?? null) : null; // no line = legacy/estate
  };
  for (const p of input.picks) {
    const wtlId = pickById.get(p.pickId)?.weighTagLineId;
    if (wtlId && wtLineById.get(wtlId)?.needsOwnerAssignment) {
      throw new ActionError("A bin on this fruit still needs an owner assigned before it can be crushed. Assign it on the weigh-tag first.", "CONFLICT");
    }
  }
  // The originated lot's owner = the DOMINANT owner of the consuming picks, weighted by consumed kg (a
  // co-fermented cuvée of mixed-owner fruit is legitimate — not refused). Minority-owner fruit billing is
  // deferred to Phase 20 (fruit contracts / per-ton pricing) — the wine-volume BillableWineConsumed model
  // does not fit fruit kg, so it is NOT emitted here.
  const kgByOwner = new Map<string | null, number>();
  for (const p of input.picks) {
    const oid = ownerOfPick(p.pickId);
    kgByOwner.set(oid, (kgByOwner.get(oid) ?? 0) + p.consumedKg);
  }
  let originatedOwnerId: string | null = null;
  let maxKg = -1;
  for (const [oid, kg] of kgByOwner) {
    if (kg > maxKg) { maxKg = kg; originatedOwnerId = oid; }
  }

  const consumedAgg = await tx.lotHarvestSource.groupBy({
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

  // LEDGER-12: a vessel holds one cohesive liquid, so crushing into a vessel that already holds
  // wine ABSORBS into that lot rather than adding a second resident — InnoVint's "combine with
  // existing lot", and the co-ferment case (Syrah + Viognier into one fermenter) is the NORMAL
  // path here, not an error. `mode: "ADD"` is the primitive that already does this (plan 088,
  // Unit 8). A multi-vessel NEW crush (whole-cluster press) needs every destination empty: one
  // new lot cannot absorb into several different residents.
  let effectiveTarget: CrushTarget = input.target;
  if (input.target.mode === "NEW") {
    const occupancy = await tx.vesselLot.findMany({
      where: { vesselId: { in: destVesselIds } },
      select: { vesselId: true, lotId: true, lot: { select: { code: true } } },
    });
    if (occupancy.length > 0) {
      if (destVesselIds.length > 1) {
        const codes = [...new Set(occupancy.map((o) => o.lot.code))].join(", ");
        throw new ActionError(
          `Splitting a new lot across several vessels needs them all empty — ${codes} is already in one of them. ` +
            `Press into empty vessels, or crush into ${codes} on its own.`,
          "CONFLICT",
        );
      }
      const residentIds = [...new Set(occupancy.map((o) => o.lotId))];
      if (residentIds.length > 1) {
        throw new ActionError(
          `${vessel.code} is recorded as holding ${residentIds.length} separate wines. Sort out what's ` +
            `actually in it before crushing into it.`,
          "CONFLICT",
        );
      }
      effectiveTarget = { mode: "ADD", lotId: residentIds[0] };
    }
  }

  // Resolve the target lot's identity + origin.
  let mode: "NEW" | "ADD";
  let originBlockId: string | null = null;
  let originVineyardId: string | null = null;
  let originVarietyId: string | null = null;
  let vintage: number | null = null;
  let existingLotId: string | null = null;

  if (effectiveTarget.mode === "ADD") {
    mode = "ADD";
    const lot = await tx.lot.findUnique({
      where: { id: effectiveTarget.lotId },
      select: { id: true, code: true, form: true, status: true },
    });
    if (!lot) throw new ActionError("The must lot to add into was not found.");
    if (lot.status !== "ACTIVE") throw new ActionError("Can't add fruit to an inactive lot.");
    if (lot.form !== "MUST" && lot.form !== "JUICE") {
      // Reached both when the winemaker picked the lot AND when crushing into an occupied vessel
      // re-targeted onto its resident — you cannot crush fruit into finished wine either way.
      throw new ActionError(`Sequential fill needs a MUST/JUICE lot — lot ${lot.code} is ${lot.form}.`);
    }
    existingLotId = lot.id;
  } else {
    mode = "NEW";
    vintage = effectiveTarget.vintage;
    // A single-origin must lot needs one block of origin; picks spanning blocks → that's a blend.
    const blocks = new Set(picks.map((p) => p.harvestRecord.block?.id ?? "").filter(Boolean));
    if (blocks.size !== 1) {
      throw new ActionError("A new must lot must come from picks of a single block (mix blocks via a blend).");
    }
    const block = picks[0].harvestRecord.block!;
    originBlockId = block.id;
    originVineyardId = picks[0].harvestRecord.vineyardId;
    originVarietyId = effectiveTarget.varietyId ?? block.varietyId ?? null;
    if (!originVarietyId) {
      throw new ActionError("Set the block's variety (or pass one) before crushing a new lot.");
    }
  }

  // For a NEW lot we need abbreviations to build a readable code.
  let codeParts: { vineyardAbbr: string; varietyAbbr: string; blockCode?: string; blockLabel?: string } | null = null;
  if (mode === "NEW") {
    const [variety, vineyard, block] = await Promise.all([
      tx.variety.findUnique({ where: { id: originVarietyId! }, select: { name: true, abbreviation: true } }),
      tx.vineyard.findUnique({ where: { id: originVineyardId! }, select: { name: true, abbreviation: true } }),
      tx.vineyardBlock.findUnique({ where: { id: originBlockId! }, select: { code: true, blockLabel: true } }),
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
        form: input.outputForm ?? "MUST",
        afState: "NONE",
        mlfState: "NONE",
        originVarietyId,
        originVineyardId,
        originBlockId,
        vintageYear: vintage,
        ownerId: originatedOwnerId, // Plan 093 Unit 10: dominant owner of the consuming picks (via their weigh-tag lines). NULL = Estate.
      },
      select: { id: true, code: true },
    });
    lotId = created.id;
  } else {
    const lot = await tx.lot.findUniqueOrThrow({ where: { id: existingLotId! }, select: { id: true, code: true } });
    lotId = lot.id;
    lotCode = lot.code;
  }

  const plan = dests.length > 1 ? planCrushSplit(draws, dests, lotId) : planCrush(draws, dests[0].vesselId, lotId, dests[0].volumeL);

  const metadata = {
    mode,
    lotId,
    lotCode,
    outputVolumeL: plan.outputVolumeL,
    totalConsumedKg: plan.totalConsumedKg,
    yieldLPerKg: plan.yieldLPerKg,
    yieldLPerTonne: plan.yieldLPerTonne,
    destemmed: input.destemmed ?? null,
    crusherOn: input.crusherOn ?? null,
    crushedPct: input.crusherOn ? (input.crushedPct ?? 100) : null,
    mustTempC: input.mustTempC ?? null,
    wholeClusterPct: input.target.mode === "NEW" ? (input.target.wholeClusterPct ?? null) : null,
    pressCycle: input.pressCycle?.trim() || null,
    picks: draws.map((d) => ({ pickId: d.pickId, consumedKg: d.consumedKg })),
  };

  const opType: OperationType = input.opType ?? "CRUSH";
  const verb = opType === "PRESS" ? "Pressed" : "De-stemmed";
  const liquid = (input.outputForm ?? "MUST").toLowerCase();
  // Direct fruit press records what went into the press: whole cluster (100), destemmed (0),
  // or a partial mix. Fold that into the summary so a destemmed press doesn't read "whole-cluster".
  const wcPct = metadata.wholeClusterPct;
  const compo =
    opType !== "PRESS"
      ? null
      : wcPct == null || wcPct >= 100
        ? "whole-cluster"
        : wcPct <= 0
          ? "destemmed"
          : `${wcPct}% whole-cluster`;
  const compoClause = compo ? ` (${compo})` : "";
  const cycleClause = opType === "PRESS" && metadata.pressCycle ? ` [cycle: ${metadata.pressCycle}]` : "";
  const summary =
    (mode === "NEW"
      ? `${verb} ${plan.totalConsumedKg} kg → ${plan.outputVolumeL} L ${liquid} into ${vessel.code} (lot ${lotCode}, ${plan.yieldLPerTonne} L/t)`
      : `${verb} ${plan.totalConsumedKg} kg → +${plan.outputVolumeL} L into ${liquid} lot ${lotCode} (${vessel.code})`) +
    compoClause +
    cycleClause;

  const opId = await writeLotOperation(tx, {
    type: opType,
    lines: plan.lines,
    actorUserId: actor.actorUserId,
    enteredBy: actor.actorEmail,
    captureMethod: input.captureMethod,
    note: input.note?.trim() || summary,
    commandId: input.commandId ?? null,
    lotCodes: new Map([[lotId, lotCode]]),
    vesselCodes: new Map(vessels.map((v) => [v.id, v.code])),
    capacityByVessel: new Map(vessels.map((v) => [v.id, Number(v.capacityL)])),
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

  // Phase 8 (Unit 7): capture fruit cost as a FRUIT CostLine on the crush op (optional). A per-kg
  // rate multiplies the measured consumed kg; else a lump sum. Reversal negates it (transform
  // family, Unit 11). Absent → the lot's basis stays UNKNOWN (never a phantom $0, D14).
  const fruitCost =
    input.fruitCostPerKg != null && input.fruitCostPerKg > 0
      ? Math.round(input.fruitCostPerKg * plan.totalConsumedKg * 1e8) / 1e8
      : input.fruitCostTotal != null && input.fruitCostTotal > 0
        ? input.fruitCostTotal
        : null;
  if (fruitCost != null) {
    const cs = await tx.appSettings.findFirst({ select: { currency: true, costingPolicyVersion: true } });
    await tx.costLine.create({
      data: {
        operationId: opId,
        lotId,
        component: "FRUIT",
        amount: fruitCost,
        currency: cs?.currency ?? "USD",
        basisCompleteness: "KNOWN",
        policyVersion: cs?.costingPolicyVersion ?? 1,
      },
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
}

/** Standalone crush (the /ferment path): owns the ledger tx + the commandId idempotency pre-check +
 * the lot-code-collision retry, delegating the actual work to crushLotTx. */
export async function crushLotCore(actor: LedgerActor, input: CrushLotInput): Promise<CrushLotResult> {
  // Idempotency: a committed command is a no-op success (council S4).
  if (input.commandId) {
    const prior = await findByCommandId(input.commandId);
    if (prior) return prior;
  }

  const MAX_CODE_RETRIES = 5;
  for (let attempt = 1; ; attempt++) {
    try {
      return await runLedgerWrite((tx) => crushLotTx(tx, actor, input));
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
