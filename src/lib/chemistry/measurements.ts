import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import type { CaptureMethod } from "@/lib/ledger/vocabulary";
import { validateMeasurement, getAnalyte } from "@/lib/chemistry/analytes";
import { resolveVesselLot, listResidentLots } from "@/lib/chemistry/resolve-lot";

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
  /** Plan 060 fan-out: ties the N single-lot panels of one physical vessel reading together. */
  vesselReadingGroupId?: string | null;
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
      vesselReadingGroupId: input.vesselReadingGroupId ?? null,
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

// ── Whole-tank reading ───────────────────────────────────────────────────────────────────
// A vessel holds ONE cohesive liquid (LEDGER-12), so naming a vessel names its wine: one reading,
// one panel, no picker and nothing to fan out to.
//
// This used to be plan 060's FAN-OUT: on a multi-lot vessel it wrote one panel per co-resident lot
// sharing a vesselReadingGroupId, so vessel views could show one row while each lot kept its own
// curve. That existed only because a tank could hold several lots. It cannot any more — the
// chokepoint refuses it and the DB unique makes it impossible — so the write path is gone.
//
// ⚠️ `vesselReadingGroupId` REMAINS on AnalysisPanel and the vessel-scoped read paths still collapse
// by it. FIVE readings in production were genuinely fanned out, across lots since merged; drop the
// grouping and each of those renders twice, forever (plan 088, Units 14/15). Nothing NEW ever mints
// a group id — the field is legacy, a record of how readings were captured before LEDGER-12.

export type RecordVesselReadingInput = {
  vesselId: string;
  observedAt?: Date | string;
  readings: ReadingInput[];
  captureMethod?: CaptureMethod;
  note?: string;
  /** Stable idempotency base for a retry / offline re-sync. */
  clientRequestId?: string;
};

export type RecordVesselReadingResult = {
  /** Always null now — kept so callers and stored client payloads keep type-checking. */
  vesselReadingGroupId: string | null;
  panels: { lotId: string; panelId: string; readingIds: string[] }[];
};

/**
 * Record ONE reading against a whole vessel. An empty vessel is a typed error; otherwise the
 * reading attaches to the vessel's single lot.
 */
export async function recordVesselReadingCore(
  actor: LedgerActor,
  input: RecordVesselReadingInput,
): Promise<RecordVesselReadingResult> {
  const residents = await listResidentLots(input.vesselId);
  if (residents.length === 0) {
    throw new ActionError("That vessel is empty — there's no wine to record a reading against.");
  }
  // LEDGER-12 guarantees at most one. If a legacy row somehow slipped through, the largest holding
  // is the wine in the vessel; listResidentLots orders by volume desc.
  const res = await recordMeasurementsCore(actor, {
    lotId: residents[0].lotId,
    vesselId: input.vesselId,
    observedAt: toDate(input.observedAt),
    readings: input.readings,
    captureMethod: input.captureMethod,
    note: input.note,
    clientRequestId: input.clientRequestId ?? randomUUID(),
  });
  return { vesselReadingGroupId: null, panels: [{ lotId: res.lotId, panelId: res.panelId, readingIds: res.readingIds }] };
}

/**
 * Soft-delete (void) a panel — the header carries the void, so all its readings drop atomically.
 * Plan 060: a fanned-out whole-tank reading voids as a GROUP (void one → void every lot's copy) so
 * the tank view and per-lot curves stay consistent. An ungrouped panel voids just itself.
 */
export async function voidPanelCore(
  actor: LedgerActor,
  input: { panelId: string },
): Promise<{ panelId: string; voidedPanelIds: string[] }> {
  const panel = await prisma.analysisPanel.findUnique({ where: { id: input.panelId } });
  if (!panel) throw new ActionError("That analysis panel no longer exists.");
  if (panel.voidedAt) throw new ActionError("That analysis panel was already removed.");
  const voidedPanelIds = await runInTenantTx(async (tx) => {
    const targets = panel.vesselReadingGroupId
      ? await tx.analysisPanel.findMany({
          where: { vesselReadingGroupId: panel.vesselReadingGroupId, voidedAt: null },
          select: { id: true },
        })
      : [{ id: input.panelId }];
    const now = new Date();
    for (const t of targets) {
      await tx.analysisPanel.update({
        where: { id: t.id },
        data: { voidedAt: now, voidedById: actor.actorUserId },
      });
      await writeAudit(tx, {
        ...actor,
        action: "DELETE",
        entityType: "AnalysisPanel",
        entityId: t.id,
        summary: panel.vesselReadingGroupId ? `Removed grouped vessel reading` : `Removed analysis panel`,
      });
    }
    return targets.map((t) => t.id);
  });
  return { panelId: input.panelId, voidedPanelIds };
}

/** Detect a Prisma unique-constraint violation (P2002) without importing the error class. */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
