"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { action } from "@/lib/actions";
import { ANALYTES } from "@/lib/chemistry/analytes";

// Phase 6 Unit 6: the idempotent server endpoint for an offline-captured Round panel. Called by
// the foreground drain (useSync). One atomic CaptureSet → an AnalysisPanel + its AnalysisReading
// rows (Brix/temp), reusing Phase 4's measurement store so the Round feeds the SAME trend curve
// + stuck detector. Council offline-correctness:
//  - Idempotency (S1/S4): the panel's clientRequestId = commandId is UNIQUE; readings carry a
//    UNIQUE captureId; a duplicate submit is SUCCESS (duplicate:true), never an error.
//  - As-of occupancy (S5): the reading attaches to the lotId the tablet RESOLVED at capture
//    (immutable — the reading is OF that lot). If that (vessel, lot) pair is no longer current,
//    we REJECT as STALE_OCCUPANCY → the client's needs-attention tray, never force-attach.
//  - Clocks (S6): deviceObservedAt (tablet) + serverReceivedAt = now().

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

export const submitPanelAction = action(
  async ({ actor }, input: SubmitPanelInput): Promise<SubmitPanelResult> => {
    try {
      if (!input.readings || input.readings.length === 0) {
        return { ok: false, retryable: false, error: "VALIDATION" };
      }
      for (const r of input.readings) {
        if (!ANALYTES[r.analyte]) return { ok: false, retryable: false, error: "VALIDATION" };
        if (typeof r.value !== "number" || !Number.isFinite(r.value)) {
          return { ok: false, retryable: false, error: "VALIDATION" };
        }
      }

      // Idempotency: a committed panel (by id OR commandId) is a no-op success.
      const existing = await prisma.analysisPanel.findFirst({
        where: { OR: [{ id: input.panelId }, { clientRequestId: input.commandId }] },
        select: { id: true },
      });
      if (existing) return { ok: true, duplicate: true, panelId: existing.id };

      // As-of occupancy: the captured (vessel, lot) must still be a current ledger position.
      // If it isn't, the vessel changed since capture — DON'T guess; route to needs-attention.
      const [lot, residency] = await Promise.all([
        prisma.lot.findUnique({ where: { id: input.lotId }, select: { id: true, status: true } }),
        prisma.vesselLot.findUnique({
          where: { vesselId_lotId: { vesselId: input.vesselId, lotId: input.lotId } },
          select: { id: true },
        }),
      ]);
      if (!lot || lot.status !== "ACTIVE") return { ok: false, retryable: false, error: "LOT_NOT_FOUND" };
      if (!residency) return { ok: false, retryable: false, error: "STALE_OCCUPANCY" };

      const observedAt = new Date(input.deviceObservedAt);
      if (Number.isNaN(observedAt.getTime())) return { ok: false, retryable: false, error: "VALIDATION" };

      await prisma.$transaction(async (tx) => {
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

      revalidatePath(`/lots/${input.lotId}`);
      revalidatePath("/ferment/round");
      return { ok: true, duplicate: false, panelId: input.panelId };
    } catch (e) {
      // A unique-violation race (two devices, same commandId/captureId) = the other won = success.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return { ok: true, duplicate: true, panelId: input.panelId };
      }
      // Anything else (DB down, timeout) is retryable — keep it in the outbox.
      return { ok: false, retryable: true, error: e instanceof Error ? e.message : "SERVER" };
    }
  },
);
