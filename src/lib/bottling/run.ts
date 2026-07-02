import { Prisma, type SparklingMethod, type DosageStyle } from "@prisma/client";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "../audit";
import { ActionError } from "../action-error";
import { computeProportionalDraw, consumedForBottles, casesAndLoose, round2 } from "./draw";
import { writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import { nextLotCode } from "@/lib/lot/generate";
import { materializeFinishedGoods, type MaterializeSource } from "@/lib/bottling/materialize";
import { computeConsumedLiquid, writeBottlingCostSnapshot } from "@/lib/cost/cogs-write";

export type BottlingInput = {
  vesselIds: string[];
  destinationLocationId: string;
  skuName: string;
  skuVintage: number;
  bottlesProduced: number;
  date: Date;
  // Phase 14 (Fork 1A): the finished wine's ABV (% v/v), REQUIRED at the still/tank bottling entry so
  // the tax class can be derived. Stamped onto BottlingRun.bottledAbv + the BOTTLE op metadata. (The
  // traditional/pét-nat sparkling path does NOT come through here — its ABV is resolved at FINISH.)
  abv: number;
  // Phase 7: tank-method (Charmat) bottles a bulk WINE lot straight to a finished SKU tagged
  // method=TANK (+ optional style from the tank RS). Omitted ⇒ still wine (method null).
  method?: SparklingMethod;
  dosageStyle?: DosageStyle;
};

export type Actor = { actorUserId: string | null; actorEmail: string };

// Env-overridable interactive-tx ceiling (default 15s unchanged for prod); a high-latency link
// (airplane wifi / Neon cold-start) can lift it so the bottling tx — which now also folds the COGS
// snapshot — doesn't expire mid-run. Mirrors runLedgerWrite's LEDGER_TX_TIMEOUT_MS.
const BOTTLING_TX_TIMEOUT_MS = Number(process.env.BOTTLING_TX_TIMEOUT_MS) || 15000;
// maxWait = time allowed to ACQUIRE a pool connection to start the tx (Prisma default 2s). Also
// env-overridable so a high-latency link doesn't fail with "Unable to start a transaction in time".
const BOTTLING_TX_MAX_WAIT_MS = Number(process.env.BOTTLING_TX_MAX_WAIT_MS) || 2000;
const SERIAL = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  timeout: BOTTLING_TX_TIMEOUT_MS,
  maxWait: BOTTLING_TX_MAX_WAIT_MS,
} as const;

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
  const { vesselIds, destinationLocationId, skuName, skuVintage, bottlesProduced, date, method, dosageStyle, abv } = input;
  if (bottlesProduced < 1) throw new ActionError("Bottles produced must be at least 1.");
  if (!skuName) throw new ActionError("Give the bottled wine a name.");
  // Phase 14 (Fork 1A / OV#6): ABV is required so the wine is classifiable for TTB. Reject ≤0;
  // >24% is allowed but the tax-class derivation flags it for review.
  if (!(abv > 0)) throw new ActionError("Enter the wine's alcohol by volume (%). ABV is required to classify the wine for TTB reporting.");
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
    bottledAbv: abv,
    sources,
    destinationLocationId,
    date,
    actor,
  });

  // Phase 8 (Unit 6): capture the consumed wine's cost NOW — BEFORE the BOTTLE op reduces the source
  // lots' volumes — so the frozen COGS snapshot uses the correct pre-op cost-per-L (D15). Cost is
  // additive: a lot with no basis yields an UNKNOWN-completeness $0 snapshot, never blocks bottling.
  const liquid = await computeConsumedLiquid(
    tx,
    sources.map((s) => ({ lotId: s.lotId ?? "", volumeConsumedL: s.volumeConsumedL })),
  );

  const bottleOpId = await writeLotOperation(tx, {
    type: "BOTTLE",
    lines,
    actorUserId: actor.actorUserId,
    enteredBy: actor.actorEmail,
    note: `Bottling run ${runId}`,
    lotCodes,
    vesselCodes,
    capacityByVessel: new Map(), // removal never overfills
  });
  // Stamp the run id on the BOTTLE op so a later timeline reversal resolves its finished-goods
  // run deterministically (no lot→run guessing), mirroring finalize-core's FINISH stamp. Additive
  // metadata; the ledger lines are unchanged.
  await tx.lotOperation.update({ where: { id: bottleOpId }, data: { metadata: { runId, abv } } });

  // Phase 8 (Unit 6): freeze the per-run COGS snapshot (liquid + dry goods later / good bottles, D15).
  const runRow = await tx.bottlingRun.findUnique({ where: { id: runId }, select: { wineSkuId: true } });
  if (runRow) {
    await writeBottlingCostSnapshot(tx, {
      runId,
      skuId: runRow.wineSkuId,
      bottleOpId,
      bottledAt: date,
      goodBottles: bottlesProduced,
      liquid,
    });
  }

  const { cases, loose } = casesAndLoose(bottlesProduced);
  const codes = vessels.map((v) => v.code).join(", ");
  await writeAudit(tx, { ...actor, action: "BOTTLING", entityType: "BottlingRun", entityId: runId, summary: `Bottled ${bottlesProduced} bottles (${cases}c + ${loose}) of "${skuName} ${skuVintage}" from ${codes} into ${location.name}` });
  return runId;
}

/** Reverse a bottling run within a transaction: restore bulk via the ledger, remove the bottles,
 * delete the run. When `opts.correctsOperationId` is given (the timeline-undo path), the restore
 * SEED op is stamped as the compensating correction of that BOTTLE op, so the ledger marks it
 * `corrected` (append-only — the BOTTLE op is never mutated) and it can't be reversed twice. */
async function reverseBottlingTx(tx: Prisma.TransactionClient, runId: string, actor: Actor, opts?: { correctsOperationId?: number }): Promise<void> {
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
      correctsOperationId: opts?.correctsOperationId ?? null,
      lotCodes,
      vesselCodes,
      capacityByVessel,
    });
  }

  // Phase 8 (Unit 6/11): a full bottling undo negates its cost artifacts — delete the frozen COGS
  // snapshot (its FK to the run is RESTRICT, so this must precede the run delete) and the op-level
  // VARIANCE residual line, leaving cost neutral after the reversal.
  const snaps = await tx.bottlingCostSnapshot.findMany({ where: { runId }, select: { costBasisAsOfOperationId: true } });
  const bottleOpIds = snaps.map((s) => s.costBasisAsOfOperationId).filter((x): x is number => x != null);
  if (bottleOpIds.length > 0) await tx.costLine.deleteMany({ where: { operationId: { in: bottleOpIds } } });
  await tx.bottlingCostSnapshot.deleteMany({ where: { runId } });

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

/**
 * Reverse a still-wine bottling run for the universal timeline-undo path. Same restore as
 * `deleteBottling`, but stamps the compensating SEED op with `correctsOperationId` so the BOTTLE
 * op is marked corrected on the timeline (and can't be reversed twice). Called by the ledger
 * reversal dispatcher after it resolves the run id from the BOTTLE op's metadata.
 */
export async function reverseBottlingRun(runId: string, actor: Actor, opts: { correctsOperationId: number }): Promise<void> {
  await withRetry(() => runInTenantTx((tx) => reverseBottlingTx(tx, runId, actor, opts), SERIAL));
}

export async function editBottling(runId: string, input: BottlingInput, actor: Actor): Promise<void> {
  await withRetry(() =>
    runInTenantTx(async (tx) => {
      await reverseBottlingTx(tx, runId, actor);
      await applyBottling(tx, input, actor);
    }, SERIAL),
  );
}
