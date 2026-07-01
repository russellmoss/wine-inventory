import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { ANALYTES } from "@/lib/chemistry/analytes";

// Phase 6 Unit 6/12: SCRIPT-SAFE core for the idempotent offline-panel submit. No "use server" /
// server-only / next/cache — round-actions.ts wraps this with auth + revalidation, and
// scripts/verify-ferment.ts drives it directly. One atomic CaptureSet → an AnalysisPanel + its
// AnalysisReading rows (reuses Phase 4 so the Round feeds the same trend curve + stuck detector).

type Actor = { actorUserId: string | null; actorEmail: string };

export type SubmitReading = { captureId: string; analyte: string; value: number; unit: string };

export type SubmitPanelInput = {
  panelId: string;
  commandId: string;
  vesselId: string;
  lotId: string;
  occupancyToken: string;
  deviceObservedAt: string; // ISO
  readings: SubmitReading[];
  note?: string | null;
};

export type SubmitPanelResult =
  | { ok: true; duplicate: boolean; panelId: string }
  | { ok: false; retryable: boolean; error: string };

export async function submitPanelCore(actor: Actor, input: SubmitPanelInput): Promise<SubmitPanelResult> {
  try {
    if (!input.readings || input.readings.length === 0) return { ok: false, retryable: false, error: "VALIDATION" };
    for (const r of input.readings) {
      if (!ANALYTES[r.analyte]) return { ok: false, retryable: false, error: "VALIDATION" };
      if (typeof r.value !== "number" || !Number.isFinite(r.value)) return { ok: false, retryable: false, error: "VALIDATION" };
    }

    // Idempotency: a committed panel (by id OR commandId) is a no-op success.
    const existing = await prisma.analysisPanel.findFirst({
      where: { OR: [{ id: input.panelId }, { clientRequestId: input.commandId }] },
      select: { id: true },
    });
    if (existing) return { ok: true, duplicate: true, panelId: existing.id };

    // As-of occupancy: the captured (vessel, lot) must still be a current ledger position. If not,
    // the vessel changed since capture — DON'T guess; route to needs-attention (STALE_OCCUPANCY).
    const [lot, residency] = await Promise.all([
      prisma.lot.findUnique({ where: { id: input.lotId }, select: { id: true, status: true } }),
      prisma.vesselLot.findFirst({ where: { vesselId: input.vesselId, lotId: input.lotId }, select: { id: true } }),
    ]);
    if (!lot || lot.status !== "ACTIVE") return { ok: false, retryable: false, error: "LOT_NOT_FOUND" };
    if (!residency) return { ok: false, retryable: false, error: "STALE_OCCUPANCY" };

    const observedAt = new Date(input.deviceObservedAt);
    if (Number.isNaN(observedAt.getTime())) return { ok: false, retryable: false, error: "VALIDATION" };

    await runInTenantTx(async (tx) => {
      await tx.analysisPanel.create({
        data: {
          id: input.panelId,
          lotId: input.lotId,
          vesselId: input.vesselId,
          observedAt,
          enteredById: actor.actorUserId,
          enteredByEmail: actor.actorEmail,
          captureMethod: "MANUAL",
          note: input.note?.trim() || null,
          clientRequestId: input.commandId,
          deviceObservedAt: observedAt,
          serverReceivedAt: new Date(),
          occupancyToken: input.occupancyToken,
        },
      });
      await tx.analysisReading.createMany({
        data: input.readings.map((r) => ({
          panelId: input.panelId,
          analyte: r.analyte,
          value: new Prisma.Decimal(r.value),
          unit: r.unit,
          captureId: r.captureId,
        })),
        skipDuplicates: true, // captureId / (panelId,analyte) UNIQUE → idempotent
      });
    });

    return { ok: true, duplicate: false, panelId: input.panelId };
  } catch (e) {
    // A unique-violation race (two devices, same commandId/captureId) = the other won = success.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: true, duplicate: true, panelId: input.panelId };
    }
    // Anything else (DB down, timeout) is retryable — keep it in the outbox.
    return { ok: false, retryable: true, error: e instanceof Error ? e.message : "SERVER" };
  }
}
