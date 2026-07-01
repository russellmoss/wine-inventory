import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import type { CaptureMethod } from "@/lib/ledger/vocabulary";
import { validateMeasurement, getAnalyte } from "@/lib/chemistry/analytes";
import { resolveVesselLot } from "@/lib/chemistry/resolve-lot";

// Standalone analyte-panel records (Phase 4). A panel HEADER groups readings observed
// together; a single bench reading is a 1-child panel. NOT a ledger op — no
// writeLotOperation. Undo is a soft-delete of the header (voids the whole panel atomically).
// Mirrors src/lib/cellar/treatments.ts structure (script-safe cores + writeAudit) WITHOUT
// the ledger fold math. Decimals stay DB-side; loaders convert to number at the boundary.

export type ReadingInput = { analyte: string; value: number; unit: string };

export type RecordMeasurementsInput = {
  /** Explicit attach target (a multi-resident pick, or a direct lot). */
  lotId?: string;
  /** Capture context; resolves the lot when `lotId` is absent (auto for 1 resident). */
  vesselId?: string;
  /** Set when this panel is a returned lab result for a Sample. */
  sampleId?: string;
  observedAt?: Date | string;
  readings: ReadingInput[];
  captureMethod?: CaptureMethod;
  note?: string;
  /** Idempotency key (cuid from the form); a double-submit is a no-op. */
  clientRequestId?: string;
};

export type RecordMeasurementsResult = {
  panelId: string;
  readingIds: string[];
  lotId: string;
};

function toDate(d: Date | string | undefined): Date {
  if (d == null) return new Date();
  return typeof d === "string" ? new Date(d) : d;
}

/** Validate + normalize the reading rows (throws ActionError on the first bad row). */
function normalizeReadings(readings: ReadingInput[]): ReadingInput[] {
  if (!readings || readings.length === 0) throw new ActionError("Add at least one reading.");
  return readings.map((r) => {
    const analyte = r.analyte;
    const def = getAnalyte(analyte);
    const unit = r.unit || def?.defaultUnit || "";
    const v = validateMeasurement(analyte, r.value, unit);
    if (!v.ok) throw new ActionError(v.error);
    return { analyte, value: r.value, unit };
  });
}

export type InsertPanelInput = {
  lotId: string;
  vesselId?: string | null;
  sampleId?: string | null;
  observedAt: Date;
  readings: ReadingInput[];
  captureMethod?: CaptureMethod;
  note?: string | null;
  clientRequestId?: string | null;
};

/**
 * Insert one panel + its readings inside an existing transaction. Shared by the bench/lab
 * capture path and the sample-result attach path (which also flips sample status atomically).
 */
export async function insertPanelTx(
  tx: Prisma.TransactionClient,
  actor: LedgerActor,
  input: InsertPanelInput,
): Promise<{ panelId: string; readingIds: string[] }> {
  const panel = await tx.analysisPanel.create({
    data: {
      lotId: input.lotId,
      vesselId: input.vesselId ?? null,
      sampleId: input.sampleId ?? null,
      observedAt: input.observedAt,
      enteredById: actor.actorUserId,
      enteredByEmail: actor.actorEmail,
      captureMethod: input.captureMethod ?? "MANUAL",
      note: input.note?.trim() || null,
      clientRequestId: input.clientRequestId ?? null,
    },
    select: { id: true },
  });
  const readingIds: string[] = [];
  for (const r of input.readings) {
    const row = await tx.analysisReading.create({
      data: { panelId: panel.id, analyte: r.analyte, value: r.value, unit: r.unit },
      select: { id: true },
    });
    readingIds.push(row.id);
  }
  const summary = `Recorded ${input.readings.length} reading${input.readings.length === 1 ? "" : "s"} (${input.readings
    .map((r) => r.analyte)
    .join(", ")})`;
  await writeAudit(tx, { ...actor, action: "CREATE", entityType: "AnalysisPanel", entityId: panel.id, summary });
  return { panelId: panel.id, readingIds };
}

/** Record a bench/lab analysis panel against a lot (resolving the vessel's lot if needed). */
export async function recordMeasurementsCore(
  actor: LedgerActor,
  input: RecordMeasurementsInput,
): Promise<RecordMeasurementsResult> {
  const readings = normalizeReadings(input.readings);

  // Idempotency: a retried submit with the same key returns the original panel.
  if (input.clientRequestId) {
    const existing = await prisma.analysisPanel.findUnique({
      where: { clientRequestId: input.clientRequestId },
      include: { readings: { select: { id: true } } },
    });
    if (existing) {
      return { panelId: existing.id, readingIds: existing.readings.map((r) => r.id), lotId: existing.lotId };
    }
  }

  // Resolve the attach target. An explicit/with-vessel pick is validated against residents.
  let lotId: string;
  if (input.vesselId) {
    lotId = await resolveVesselLot(input.vesselId, input.lotId);
  } else if (input.lotId) {
    lotId = input.lotId;
  } else {
    throw new ActionError("A lot or a vessel is required to record an analysis.");
  }

  const observedAt = toDate(input.observedAt);
  try {
    const res = await runInTenantTx((tx) =>
      insertPanelTx(tx, actor, {
        lotId,
        vesselId: input.vesselId ?? null,
        sampleId: input.sampleId ?? null,
        observedAt,
        readings,
        captureMethod: input.captureMethod,
        note: input.note,
        clientRequestId: input.clientRequestId,
      }),
    );
    return { ...res, lotId };
  } catch (e) {
    // Lost the idempotency race — return the row the winner created.
    if (isUniqueViolation(e) && input.clientRequestId) {
      const existing = await prisma.analysisPanel.findUnique({
        where: { clientRequestId: input.clientRequestId },
        include: { readings: { select: { id: true } } },
      });
      if (existing) return { panelId: existing.id, readingIds: existing.readings.map((r) => r.id), lotId: existing.lotId };
    }
    throw e;
  }
}

/** Soft-delete (void) a panel — the header carries the void, so all its readings drop atomically. */
export async function voidPanelCore(actor: LedgerActor, input: { panelId: string }): Promise<{ panelId: string }> {
  const panel = await prisma.analysisPanel.findUnique({ where: { id: input.panelId } });
  if (!panel) throw new ActionError("That analysis panel no longer exists.");
  if (panel.voidedAt) throw new ActionError("That analysis panel was already removed.");
  await runInTenantTx(async (tx) => {
    await tx.analysisPanel.update({
      where: { id: input.panelId },
      data: { voidedAt: new Date(), voidedById: actor.actorUserId },
    });
    await writeAudit(tx, {
      ...actor,
      action: "DELETE",
      entityType: "AnalysisPanel",
      entityId: input.panelId,
      summary: `Removed analysis panel`,
    });
  });
  return { panelId: input.panelId };
}

/** Detect a Prisma unique-constraint violation (P2002) without importing the error class. */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
