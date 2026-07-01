import { Prisma, type SparklingMethod, type DosageStyle } from "@prisma/client";
import { prisma } from "../prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "../audit";
import { ActionError } from "../action-error";
import { computeProportionalDraw, consumedForBottles, casesAndLoose, round2 } from "./draw";
import { writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import { nextLotCode } from "@/lib/lot/generate";
import { materializeFinishedGoods, type MaterializeSource } from "@/lib/bottling/materialize";

export type BottlingInput = {
  vesselIds: string[];
  destinationLocationId: string;
  skuName: string;
  skuVintage: number;
  bottlesProduced: number;
  date: Date;
  // Phase 7: tank-method (Charmat) bottles a bulk WINE lot straight to a finished SKU tagged
  // method=TANK (+ optional style from the tank RS). Omitted ⇒ still wine (method null).
  method?: SparklingMethod;
  dosageStyle?: DosageStyle;
};

export type Actor = { actorUserId: string | null; actorEmail: string };

const SERIAL = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 } as const;

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined;
      if (code === "P2034" && i < attempts) continue;
      throw e;
    }
  }
}

/** Apply a bottling run within an existing transaction. Returns the new run id. */
async function applyBottling(tx: Prisma.TransactionClient, input: BottlingInput, actor: Actor): Promise<string> {
  const { vesselIds, destinationLocationId, skuName, skuVintage, bottlesProduced, date, method, dosageStyle } = input;
  if (bottlesProduced < 1) throw new ActionError("Bottles produced must be at least 1.");
  if (!skuName) throw new ActionError("Give the bottled wine a name.");
  const ids = [...new Set(vesselIds)].filter(Boolean);
  if (ids.length === 0) throw new ActionError("Pick at least one vessel.");

  const location = await tx.location.findUnique({ where: { id: destinationLocationId } });
  if (!location || !location.isActive) throw new ActionError("Pick an active destination location.");

  const consumedL = consumedForBottles(bottlesProduced);
  const vessels = await tx.vessel.findMany({ where: { id: { in: ids } } });
  if (vessels.length !== ids.length) throw new ActionError("A selected vessel was not found.");
  const vesselCodes = new Map(vessels.map((v) => [v.id, v.code]));

  // Draw from the ledger projection (vessel_lot), carrying each lot's origin for provenance.
  const lotRows = await tx.vesselLot.findMany({ where: { vesselId: { in: ids } }, include: { lot: true } });
  const total = round2(lotRows.reduce((a, r) => a + Number(r.volumeL), 0));
  if (total <= 0) throw new ActionError("The selected vessels are empty.");
  if (consumedL > total + 1e-9) {
    throw new ActionError(
      `Not enough wine: ${bottlesProduced} bottles need ${consumedL} L but only ${total} L available across the selected vessels.`,
      "CONFLICT",
    );
  }

  const draws = computeProportionalDraw(
    lotRows.map((r) => ({ id: r.id, volumeL: Number(r.volumeL) })),
    consumedL,
  );
  const drawById = new Map(draws.map((d) => [d.id, d]));

  // Build the BOTTLE ledger-op lines + the finished-goods provenance sources from the draws.
  const lines: LedgerLine[] = [];
  const lotCodes = new Map<string, string>();
  const sources: MaterializeSource[] = [];
  for (const r of lotRows) {
    const d = drawById.get(r.id)!;
    if (d.deduct <= 0) continue;
    lotCodes.set(r.lotId, r.lot.code);
    lines.push({ lotId: r.lotId, vesselId: r.vesselId, deltaL: round2(-d.deduct) });
    lines.push({ lotId: r.lotId, vesselId: null, deltaL: round2(d.deduct), reason: "bottle" });
    sources.push({
      lotId: r.lotId,
      vesselId: r.vesselId,
      varietyId: r.lot.originVarietyId, // K13: null origin is honest (was `?? ""` — an invalid FK)
      vineyardId: r.lot.originVineyardId,
      vintage: r.lot.vintageYear ?? skuVintage,
      volumeConsumedL: d.deduct,
    });
  }

  // Finished-goods hand-off through the shared materialization core (still wine is vintaged,
  // 750 mL, no sparkling metadata).
  const { runId } = await materializeFinishedGoods(tx, {
    skuName,
    vintage: skuVintage,
    isNonVintage: false,
    method: method ?? null,
    dosageStyle: dosageStyle ?? null,
    bottleSizeMl: 750,
    bottlesProduced,
    volumeConsumedL: consumedL,
    sources,
    destinationLocationId,
    date,
    actor,
  });

  await writeLotOperation(tx, {
    type: "BOTTLE",
    lines,
    actorUserId: actor.actorUserId,
    enteredBy: actor.actorEmail,
    note: `Bottling run ${runId}`,
    lotCodes,
    vesselCodes,
    capacityByVessel: new Map(), // removal never overfills
  });

  const { cases, loose } = casesAndLoose(bottlesProduced);
  const codes = vessels.map((v) => v.code).join(", ");
  await writeAudit(tx, { ...actor, action: "BOTTLING", entityType: "BottlingRun", entityId: runId, summary: `Bottled ${bottlesProduced} bottles (${cases}c + ${loose}) of "${skuName} ${skuVintage}" from ${codes} into ${location.name}` });
  return runId;
}

/** Reverse a bottling run within a transaction: restore bulk via the ledger, remove the bottles, delete the run. */
async function reverseBottlingTx(tx: Prisma.TransactionClient, runId: string, actor: Actor): Promise<void> {
  const run = await tx.bottlingRun.findUnique({
    where: { id: runId },
    include: { sources: true, wineSku: { select: { name: true, vintage: true } }, destinationLocation: { select: { name: true } } },
  });
  if (!run) throw new ActionError("Bottling run not found.");

  // Remove the bottles it produced from the destination (must still be on hand).
  const dec = await tx.bottledInventory.updateMany({
    where: { wineSkuId: run.wineSkuId, locationId: run.destinationLocationId, totalBottles: { gte: run.bottlesProduced } },
    data: { totalBottles: { decrement: run.bottlesProduced } },
  });
  if (dec.count === 0) {
    throw new ActionError("Can't delete: those bottles are no longer on hand at the destination (moved or sold). Adjust stock first.", "CONFLICT");
  }

  // Capacity guard: a vessel refilled since bottling must not overflow on restore.
  // Phase 7: BottlingSource.vesselId is now nullable — a finalized SPARKLING run has no source
  // vessel (its reversal reopens the bottle lot instead, Unit 11). This still-wine reverse path
  // only restores vessel-backed sources; a null-vessel source is skipped here.
  const restoreByVessel = new Map<string, number>();
  for (const s of run.sources) {
    if (!s.vesselId) continue;
    restoreByVessel.set(s.vesselId, round2((restoreByVessel.get(s.vesselId) ?? 0) + Number(s.volumeConsumedL)));
  }
  const capacityByVessel = new Map<string, number>();
  const vesselCodes = new Map<string, string>();
  for (const [vesselId, restoreL] of restoreByVessel) {
    const vessel = await tx.vessel.findUnique({ where: { id: vesselId }, include: { vesselLots: { select: { volumeL: true } } } });
    if (!vessel) throw new ActionError("Can't restore wine: the source vessel no longer exists.", "CONFLICT");
    const current = vessel.vesselLots.reduce((a, c) => a + Number(c.volumeL), 0);
    if (current + restoreL > Number(vessel.capacityL) + 1e-9) {
      throw new ActionError(`Can't restore ${restoreL} L into ${vessel.code}: it would exceed the ${Number(vessel.capacityL)} L capacity (now holds ${round2(current)} L). Empty it first.`, "CONFLICT");
    }
    capacityByVessel.set(vesselId, Number(vessel.capacityL));
    vesselCodes.set(vesselId, vessel.code);
  }

  // Restore consumed wine back into its lots via a ledger op (re-entry from external).
  const lines: LedgerLine[] = [];
  const lotCodes = new Map<string, string>();
  for (const s of run.sources) {
    if (!s.vesselId) continue; // null-vessel (sparkling finalize) sources aren't restored here
    const vol = round2(Number(s.volumeConsumedL));
    if (vol <= 0) continue;
    let lotId = s.lotId;
    if (!lotId) {
      // Pre-cutover run with no lot link: mint a lot from the recorded tuple so the
      // restore stays ledger-backed. Use a readable code when abbreviations exist; fall
      // back to a random code so this recovery path never blocks on missing reference data.
      const [variety, vineyard] = await Promise.all([
        s.varietyId ? tx.variety.findUnique({ where: { id: s.varietyId }, select: { abbreviation: true } }) : null,
        s.vineyardId ? tx.vineyard.findUnique({ where: { id: s.vineyardId }, select: { abbreviation: true } }) : null,
      ]);
      const code =
        variety?.abbreviation && vineyard?.abbreviation && s.vintage != null
          ? await nextLotCode(tx, { vintage: s.vintage, vineyardAbbr: vineyard.abbreviation, varietyAbbr: variety.abbreviation })
          : `LOT-${s.vintage ?? "NV"}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const lot = await tx.lot.create({
        data: { code, form: "WINE", originVarietyId: s.varietyId, originVineyardId: s.vineyardId, vintageYear: s.vintage },
        select: { id: true, code: true },
      });
      lotId = lot.id;
      lotCodes.set(lot.id, lot.code);
    } else {
      const lot = await tx.lot.findUnique({ where: { id: lotId }, select: { code: true } });
      lotCodes.set(lotId, lot?.code ?? lotId);
    }
    lines.push({ lotId, vesselId: s.vesselId, deltaL: vol });
    lines.push({ lotId, vesselId: null, deltaL: round2(-vol), reason: "seed" });
  }
  if (lines.length > 0) {
    await writeLotOperation(tx, {
      type: "SEED",
      lines,
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      note: `Restored wine from reversed bottling run ${runId}`,
      lotCodes,
      vesselCodes,
      capacityByVessel,
    });
  }

  await tx.stockMovement.deleteMany({ where: { bottlingRunId: runId } });
  await tx.bottlingRun.delete({ where: { id: runId } }); // cascades sources

  await writeAudit(tx, {
    ...actor,
    action: "DELETE",
    entityType: "BottlingRun",
    entityId: runId,
    summary: `Reversed bottling of ${run.bottlesProduced} bottles of "${run.wineSku.name} ${run.wineSku.vintage}" (wine restored, bottles removed from ${run.destinationLocation.name})`,
  });
}

export async function executeBottling(input: BottlingInput, actor: Actor): Promise<void> {
  await withRetry(() => runInTenantTx((tx) => applyBottling(tx, input, actor), SERIAL));
}

export async function deleteBottling(runId: string, actor: Actor): Promise<void> {
  await withRetry(() => runInTenantTx((tx) => reverseBottlingTx(tx, runId, actor), SERIAL));
}

export async function editBottling(runId: string, input: BottlingInput, actor: Actor): Promise<void> {
  await withRetry(() =>
    runInTenantTx(async (tx) => {
      await reverseBottlingTx(tx, runId, actor);
      await applyBottling(tx, input, actor);
    }, SERIAL),
  );
}
