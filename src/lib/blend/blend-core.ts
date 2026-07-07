import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { planBlend, planBlendSplit, foldLines, balanceKey, type BlendComponentDraw, type BlendPlan, type VesselLotBalance } from "@/lib/ledger/math";
import { nextBlendLotCode, isUniqueViolation } from "@/lib/lot/generate";
import { resolveBondsForLots } from "@/lib/compliance/bond";
import type { CaptureMethod, LotForm } from "@/lib/ledger/vocabulary";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Script-safe core for the BLEND operation (Phase 5). A blend draws (partial or full) from N
// parent lots across vessels into ONE child lot, conserving volume through writeLotOperation
// (D2/D14), and records parent→child lineage + the child's source-vineyard set. Two modes:
//   NEW_LOT       — mint a fresh `[vintage]-BL-<TOKEN>` child in an (otherwise) empty destination;
//   GROW_EXISTING — the single resident lot of the destination ABSORBS the draws, keeping its
//                   code/identity and gaining lineage (generalizes Phase 3 topping to N sources).
// No "use server" / "server-only": actions.ts wraps it; scripts/tests call it directly.

const EPS = 1e-9;

/** Round to 5 dp for the Decimal(6,5) lineage fraction column. */
function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

export type BlendMode = "NEW_LOT" | "GROW_EXISTING";

export type BlendComponentInput = {
  vesselId: string;
  lotId: string;
  drawL: number; // litres to pull INTO the blend
  deplete?: boolean; // pull the whole position; write the heel (balance − drawL) off as loss (council S5)
};

/** One destination of a split blend: how much of the (single) new child lot lands here. */
export type BlendDestinationInput = { vesselId: string; volumeL: number };

export type BlendLotsInput = {
  mode: BlendMode;
  components: BlendComponentInput[];
  // Single destination (new-or-grow). Used for GROW_EXISTING and the rack-into-occupied path.
  toVesselId?: string;
  // OR: split the new child lot across MANY destination vessels (NEW_LOT only). One wine, N
  // vessels; volumes must sum to the net blended volume. Takes precedence over toVesselId.
  destinations?: BlendDestinationInput[];
  lossL?: number;
  // NEW_LOT only:
  token?: string; // 2–4 letter blend tag (required for NEW_LOT)
  vintage?: number | null; // null/absent → NV
  form?: LotForm; // default WINE
  note?: string;
  captureMethod?: CaptureMethod;
};

export type BlendLotsResult = {
  operationId: number;
  childLotId: string;
  childCode: string;
  mode: BlendMode;
  childTotalL: number;
  lossL: number;
  lineageEdges: number;
  provenanceComplete: boolean;
  message: string;
};

function vesselLabel(v: { type: string; code: string }): string {
  return v.type === "BARREL" ? `Barrel ${v.code}` : `Tank ${v.code}`;
}

export async function blendLotsCore(actor: LedgerActor, input: BlendLotsInput): Promise<BlendLotsResult> {
  const { mode } = input;
  if (!input.components || input.components.length === 0) {
    throw new ActionError("A blend needs at least one source.");
  }
  // A deliberate multi-source blend needs ≥2 sources; the rack-into-occupied path (Unit 8b)
  // calls with a single source, so we don't hard-require ≥2 here — the builder enforces it.

  // Destination: either ONE vessel (new-or-grow) or MANY (split a new child lot, NEW_LOT only).
  const splitDests = (input.destinations ?? []).filter((d) => d.vesselId);
  const useSplit = splitDests.length > 0;
  if (useSplit && mode !== "NEW_LOT") {
    throw new ActionError("Splitting a blend across multiple vessels is only available for a new blend lot.");
  }
  const destVesselIds = useSplit
    ? [...new Set(splitDests.map((d) => d.vesselId))]
    : input.toVesselId
      ? [input.toVesselId]
      : [];
  if (destVesselIds.length === 0) throw new ActionError("A destination vessel is required.");
  // For non-split paths a single destination drives mode + grow resolution below.
  const toVesselId = useSplit ? "" : input.toVesselId!;

  // Load every involved vessel (sources + destination(s)) with its current lots, once.
  const vesselIds = [...new Set([...destVesselIds, ...input.components.map((c) => c.vesselId)])];
  const vessels = await prisma.vessel.findMany({ where: { id: { in: vesselIds } } });
  const vesselById = new Map(vessels.map((v) => [v.id, v]));
  for (const dvId of destVesselIds) {
    const dv = vesselById.get(dvId);
    if (!dv) throw new ActionError("Destination vessel not found.");
    if (!dv.isActive) throw new ActionError(`${vesselLabel(dv)} is inactive.`);
  }
  for (const c of input.components) {
    const v = vesselById.get(c.vesselId);
    if (!v) throw new ActionError("A source vessel was not found.");
    if (!v.isActive) throw new ActionError(`${vesselLabel(v)} is inactive.`);
  }

  const residents = await prisma.vesselLot.findMany({
    where: { vesselId: { in: vesselIds } },
    include: { lot: { select: { id: true, code: true } } },
  });
  const balByKey = new Map(residents.map((r) => [balanceKey(r.vesselId, r.lotId), Number(r.volumeL)]));
  const lotCodeById = new Map(residents.map((r) => [r.lotId, r.lot.code]));

  // Resolve the child lot for GROW_EXISTING (single destination; a fresh lot is minted later
  // for NEW_LOT). Split blends are NEW_LOT-only, so grow only ever inspects one vessel.
  const destResidents = residents.filter((r) => r.vesselId === toVesselId);
  let growChildLotId: string | null = null;
  if (mode === "GROW_EXISTING") {
    if (destResidents.length !== 1) {
      throw new ActionError(
        `Grow-existing needs the destination to hold exactly one lot (it holds ${destResidents.length}).`,
        "CONFLICT",
      );
    }
    growChildLotId = destResidents[0].lotId;
  }

  // Build effective draws + total loss (deplete = pull the whole position, heel → loss).
  let totalLoss = round2(input.lossL ?? 0);
  if (totalLoss < 0) throw new ActionError("Loss can't be negative.");
  const effective: BlendComponentDraw[] = [];
  for (const c of input.components) {
    const have = balByKey.get(balanceKey(c.vesselId, c.lotId)) ?? 0;
    const wanted = round2(c.drawL);
    if (!(wanted > 0)) throw new ActionError("Each blend draw must be greater than 0.");
    if (c.deplete) {
      if (!(have > 0)) throw new ActionError("Can't deplete an empty position.");
      const into = Math.min(wanted, have);
      effective.push({ vesselId: c.vesselId, lotId: c.lotId, drawL: round2(have) });
      totalLoss = round2(totalLoss + (have - into));
    } else {
      if (wanted > have + EPS) {
        throw new ActionError(
          `Can't draw ${wanted} L — that lot holds ${round2(have)} L in ${vesselLabel(vesselById.get(c.vesselId)!)}.`,
          "CONFLICT",
        );
      }
      effective.push({ vesselId: c.vesselId, lotId: c.lotId, drawL: wanted });
    }
  }

  const sourceBalances: VesselLotBalance[] = residents.map((r) => ({
    vesselId: r.vesselId,
    lotId: r.lotId,
    volumeL: Number(r.volumeL),
  }));
  // Current residents of each destination vessel, keyed by vessel — drives the per-vessel
  // NEW_LOT post-op check (each destination must end holding only the child).
  const destBalancesByVessel = new Map<string, VesselLotBalance[]>(
    destVesselIds.map((dvId) => [
      dvId,
      residents
        .filter((r) => r.vesselId === dvId)
        .map((r) => ({ vesselId: r.vesselId, lotId: r.lotId, volumeL: Number(r.volumeL) })),
    ]),
  );

  // Provenance: distinct parent lots (excluding the grow-existing resident itself).
  const parentLotIds = [...new Set(effective.map((c) => c.lotId))].filter((id) => id !== growChildLotId);
  const parents = await prisma.lot.findMany({
    where: { id: { in: parentLotIds } },
    select: { id: true, provenanceComplete: true, sourceVineyards: { select: { vineyardId: true } } },
  });

  // Phase 2 (BOND-1 / CO-2, Gemini-CRIT3): a blend can't straddle two bonds — wine can't be in a
  // superposition of premises. All parents (and, for GROW_EXISTING, the resident child that absorbs
  // them) must resolve to ONE bond. If they differ, the operator TRANSFER_IN_BONDs a parent into the
  // other's bond first (a real transfer, never a phantom-vessel round-trip — ux-12).
  const bondCheckLots = [...parentLotIds, ...(growChildLotId ? [growChildLotId] : [])];
  const distinctBonds = new Set((await resolveBondsForLots(bondCheckLots, new Date())).values());
  if (distinctBonds.size > 1) {
    throw new ActionError(
      "These lots are on different bonds. Transfer one into the other's bond before blending them.",
      "CONFLICT",
    );
  }

  const capacityByVessel = new Map(vessels.map((v) => [v.id, Number(v.capacityL)]));
  const vesselCodes = new Map(vessels.map((v) => [v.id, v.code]));

  // P2002 retry (council C3): nextBlendLotCode can still race on the @unique code under
  // SERIALIZABLE; on a duplicate-code abort, RE-RUN the tx so the code is regenerated +
  // disambiguated afresh (P2034 is handled inside runLedgerWrite). Bounded so a real,
  // persistent unique violation surfaces instead of looping forever.
  const MAX_CODE_RETRIES = 5;
  let result: BlendLotsResult | null = null;
  for (let attempt = 1; ; attempt++) {
    try {
      result = await runLedgerWrite(async (tx) => {
      // Resolve / mint the child lot.
      let childLotId: string;
      let childCode: string;
      if (mode === "NEW_LOT") {
        if (!input.token) throw new ActionError("A 2–4 letter blend tag is required for a new blend lot.");
        childCode = await nextBlendLotCode(tx, { vintage: input.vintage ?? null, token: input.token });
        const created = await tx.lot.create({
          data: {
            code: childCode,
            form: (input.form ?? "WINE") as LotForm,
            vintageYear: input.vintage ?? null,
            // origin* stay NULL — a multi-source blend has no single origin.
          },
          select: { id: true, code: true },
        });
        childLotId = created.id;
      } else {
        childLotId = growChildLotId!;
        childCode = lotCodeById.get(childLotId) ?? childLotId;
      }

      const plan: BlendPlan = useSplit
        ? planBlendSplit(
            effective,
            splitDests.map((d) => ({ vesselId: d.vesselId, volumeL: round2(d.volumeL) })),
            childLotId,
            totalLoss,
            sourceBalances,
          )
        : planBlend(effective, toVesselId, childLotId, totalLoss, sourceBalances);

      // Destination post-op validation (council S4): for EACH destination vessel, fold its lines
      // onto its current residents; NEW_LOT must end holding exactly the child everywhere.
      if (mode === "NEW_LOT") {
        const strangers = destVesselIds.flatMap((dvId) => {
          const dvLines = plan.lines.filter((l) => l.vesselId === dvId);
          const post = foldLines(destBalancesByVessel.get(dvId) ?? [], dvLines);
          return post.filter((b) => b.lotId !== childLotId);
        });
        if (strangers.length > 0) {
          throw new ActionError(
            "A new-lot blend must land in an empty destination (or one whose wine is fully drawn into the blend).",
            "CONFLICT",
          );
        }
      }

      const lotCodes = new Map(lotCodeById);
      lotCodes.set(childLotId, childCode);

      const opId = await writeLotOperation(tx, {
        type: "BLEND",
        lines: plan.lines,
        actorUserId: actor.actorUserId,
        enteredBy: actor.actorEmail,
        captureMethod: input.captureMethod,
        note: input.note?.trim() || null,
        lotCodes,
        vesselCodes,
        capacityByVessel,
      });

      // Lineage: one aggregated edge per DISTINCT parent (skip a self-edge in grow mode).
      // Fraction = gross input share over the actual parents (council S1/C2).
      const parentGross = plan.parentGrossByLot.filter((p) => p.lotId !== childLotId);
      const grossDenom = parentGross.reduce((a, p) => a + p.grossL, 0);

      // (024b) GROW_EXISTING mutates a PRE-EXISTING lot's lineage + provenance in place. Snapshot
      // exactly what we're about to change so a reversal RESTORES it (never blind-deletes — MUST-FIX
      // #4): which parent edges already existed (+ their fraction), and the resident's prior
      // provenanceComplete + source-vineyard set.
      let growSelf: { provenanceComplete: boolean; vineyardIds: string[] } | null = null;
      let priorLineage: { parentLotId: string; existed: boolean; priorFraction: number | null }[] = [];
      if (mode === "GROW_EXISTING") {
        const self = await tx.lot.findUnique({
          where: { id: childLotId },
          select: { provenanceComplete: true, sourceVineyards: { select: { vineyardId: true } } },
        });
        growSelf = { provenanceComplete: self?.provenanceComplete ?? true, vineyardIds: self?.sourceVineyards.map((s) => s.vineyardId) ?? [] };
        const priors = await tx.lotLineage.findMany({
          where: { childLotId, parentLotId: { in: parentGross.map((p) => p.lotId) } },
          select: { parentLotId: true, fraction: true },
        });
        const priorByParent = new Map(priors.map((e) => [e.parentLotId, e.fraction == null ? null : Number(e.fraction)]));
        priorLineage = parentGross.map((p) => ({ parentLotId: p.lotId, existed: priorByParent.has(p.lotId), priorFraction: priorByParent.get(p.lotId) ?? null }));
      }

      let edges = 0;
      for (const p of parentGross) {
        const fraction = grossDenom > 0 ? Math.min(0.99999, round5(p.grossL / grossDenom)) : null;
        await tx.lotLineage.upsert({
          where: { parentLotId_childLotId: { parentLotId: p.lotId, childLotId } },
          create: { parentLotId: p.lotId, childLotId, kind: "BLEND", fraction },
          update: { fraction, kind: "BLEND" },
        });
        edges++;
      }

      // Child source-vineyard set = UNION of parents' FULL sets (+ the resident's own, in grow
      // mode). provenanceComplete is contagious: false if ANY parent's set is empty/incomplete
      // (council C6) — never silently union only the known rows.
      const childVineyardIds = new Set<string>();
      let provenanceComplete = true;
      if (mode === "GROW_EXISTING" && growSelf) {
        // Reuse the snapshot read above (no second round-trip).
        if (!growSelf.provenanceComplete) provenanceComplete = false;
        for (const vid of growSelf.vineyardIds) childVineyardIds.add(vid);
      }
      for (const p of parents) {
        if (!p.provenanceComplete || p.sourceVineyards.length === 0) provenanceComplete = false;
        for (const sv of p.sourceVineyards) childVineyardIds.add(sv.vineyardId);
      }
      if (childVineyardIds.size > 0) {
        // One batched insert (skipDuplicates) instead of N upserts — fewer round-trips, and the
        // @@unique([lotId,vineyardId]) makes re-runs idempotent.
        await tx.lotVineyard.createMany({
          data: [...childVineyardIds].map((vineyardId) => ({ lotId: childLotId, vineyardId })),
          skipDuplicates: true,
        });
      }
      await tx.lot.update({ where: { id: childLotId }, data: { provenanceComplete } });

      // Stamp the reversal metadata (writeLotOperation doesn't take it; set it on the row we own).
      // NEW_LOT only needs the mode + child; GROW_EXISTING carries the pre-op snapshot to restore.
      const metadata: Record<string, unknown> = { mode, childLotId };
      if (mode === "GROW_EXISTING") {
        metadata.lineageRestore = priorLineage;
        metadata.priorProvenanceComplete = growSelf?.provenanceComplete ?? true;
        metadata.priorVineyardIds = growSelf?.vineyardIds ?? [];
      }
      await tx.lotOperation.update({ where: { id: opId }, data: { metadata: metadata as Prisma.InputJsonValue } });

      const summary =
        mode === "NEW_LOT"
          ? `Blended ${parentGross.length} lot(s) into new lot ${childCode} (${plan.childTotalL} L)`
          : `Blended ${parentGross.length} lot(s) into ${childCode} (now grown by ${plan.childTotalL} L)`;
      await writeAudit(tx, {
        ...actor,
        action: "STOCK_MOVEMENT",
        entityType: "LotOperation",
        entityId: String(opId),
        summary,
      });

      return {
        operationId: opId,
        childLotId,
        childCode,
        mode,
        childTotalL: plan.childTotalL,
        lossL: plan.lossL,
        lineageEdges: edges,
        provenanceComplete,
        message: `${summary}.`,
      } satisfies BlendLotsResult;
      });
      break;
    } catch (e) {
      if (isUniqueViolation(e) && attempt < MAX_CODE_RETRIES) continue; // regenerate code, retry
      throw e;
    }
  }

  return result!;
}
