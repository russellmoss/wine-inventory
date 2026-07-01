import type { SampleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import type { CaptureMethod } from "@/lib/ledger/vocabulary";
import { resolveVesselLot } from "@/lib/chemistry/resolve-lot";
import { insertPanelTx, type ReadingInput } from "@/lib/chemistry/measurements";
import { validateMeasurement, getAnalyte } from "@/lib/chemistry/analytes";

// The sample lifecycle (Phase 4): pull → (send) → (pending) → result returned → attached,
// plus cancelled. Transitions go through GUARDED cores that set status + the matching
// timestamp TOGETHER and reject invalid states. A returned result is an AnalysisPanel linked
// to the sample, with the sample's CAPTURED lotId inherited (never re-resolved from the
// current vessel). NOT a ledger op.

export const NON_TERMINAL_STATUSES: SampleStatus[] = ["PULLED", "SENT", "PENDING", "RESULT_RETURNED"];

// Allowed forward transitions. ATTACHED + CANCELLED are terminal.
const TRANSITIONS: Record<SampleStatus, SampleStatus[]> = {
  PULLED: ["SENT", "PENDING", "RESULT_RETURNED", "ATTACHED", "CANCELLED"],
  SENT: ["PENDING", "RESULT_RETURNED", "ATTACHED", "CANCELLED"],
  PENDING: ["RESULT_RETURNED", "ATTACHED", "CANCELLED"],
  RESULT_RETURNED: ["ATTACHED", "CANCELLED"],
  ATTACHED: [],
  CANCELLED: [],
};

function assertTransition(from: SampleStatus, to: SampleStatus) {
  if (!TRANSITIONS[from].includes(to)) {
    throw new ActionError(`A ${from.toLowerCase().replace(/_/g, " ")} sample can't move to ${to.toLowerCase().replace(/_/g, " ")}.`, "CONFLICT");
  }
}

export type PullSampleInput = {
  lotId?: string;
  vesselId?: string;
  source?: string;
  lab?: string;
  /** Mark it sent to a lab at pull time (skips a separate "send" step). */
  sendNow?: boolean;
  expectedAt?: Date | string | null;
  note?: string;
  captureMethod?: CaptureMethod;
  clientRequestId?: string;
};

export type SampleResult = { sampleId: string; lotId: string; status: SampleStatus };

function toDate(d: Date | string | null | undefined): Date | null {
  if (d == null) return null;
  return typeof d === "string" ? new Date(d) : d;
}

/** Pull a sample off a vessel's lot. Optionally mark it sent in the same step. */
export async function pullSampleCore(actor: LedgerActor, input: PullSampleInput): Promise<SampleResult> {
  if (input.clientRequestId) {
    const existing = await prisma.sample.findUnique({ where: { clientRequestId: input.clientRequestId } });
    if (existing) return { sampleId: existing.id, lotId: existing.lotId, status: existing.status };
  }

  let lotId: string;
  if (input.vesselId) lotId = await resolveVesselLot(input.vesselId, input.lotId);
  else if (input.lotId) lotId = input.lotId;
  else throw new ActionError("A lot or a vessel is required to pull a sample.");

  const now = new Date();
  const status: SampleStatus = input.sendNow ? "SENT" : "PULLED";
  const created = await runInTenantTx(async (tx) => {
    const row = await tx.sample.create({
      data: {
        lotId,
        vesselId: input.vesselId ?? null,
        status,
        source: input.source?.trim() || null,
        lab: input.lab?.trim() || null,
        pulledAt: now,
        sentAt: input.sendNow ? now : null,
        expectedAt: toDate(input.expectedAt),
        enteredById: actor.actorUserId,
        enteredByEmail: actor.actorEmail,
        captureMethod: input.captureMethod ?? "MANUAL",
        note: input.note?.trim() || null,
        clientRequestId: input.clientRequestId ?? null,
      },
      select: { id: true },
    });
    await writeAudit(tx, {
      ...actor,
      action: "SAMPLE_PULLED",
      entityType: "Sample",
      entityId: row.id,
      summary: `Pulled a sample${input.source ? ` from ${input.source.trim()}` : ""}${input.sendNow ? " (sent)" : ""}`,
    });
    return row;
  });
  return { sampleId: created.id, lotId, status };
}

/** Mark a pulled sample as sent to a lab (sets sentAt). */
export async function markSampleSentCore(
  actor: LedgerActor,
  input: { sampleId: string; lab?: string; expectedAt?: Date | string | null },
): Promise<SampleResult> {
  const sample = await prisma.sample.findUnique({ where: { id: input.sampleId } });
  if (!sample) throw new ActionError("That sample no longer exists.");
  assertTransition(sample.status, "SENT");
  const updated = await runInTenantTx(async (tx) => {
    const row = await tx.sample.update({
      where: { id: input.sampleId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        lab: input.lab?.trim() || sample.lab,
        expectedAt: input.expectedAt !== undefined ? toDate(input.expectedAt) : sample.expectedAt,
      },
      select: { id: true, lotId: true, status: true },
    });
    await writeAudit(tx, {
      ...actor,
      action: "SAMPLE_SENT",
      entityType: "Sample",
      entityId: row.id,
      summary: `Sent a sample to the lab${input.lab ? ` (${input.lab.trim()})` : ""}`,
    });
    return row;
  });
  return { sampleId: updated.id, lotId: updated.lotId, status: updated.status };
}

export type AttachSampleResultsInput = {
  sampleId: string;
  readings: ReadingInput[];
  observedAt?: Date | string;
  note?: string;
  captureMethod?: CaptureMethod;
  clientRequestId?: string;
};

/**
 * Attach a returned lab result: create a panel linked to the sample (lotId INHERITED from the
 * sample, observedAt defaulting to the pull time), then flip the sample to ATTACHED — both in
 * one transaction so status never drifts from the panel.
 */
export async function attachSampleResultsCore(
  actor: LedgerActor,
  input: AttachSampleResultsInput,
): Promise<{ sampleId: string; panelId: string; lotId: string; status: SampleStatus }> {
  const sample = await prisma.sample.findUnique({ where: { id: input.sampleId } });
  if (!sample) throw new ActionError("That sample no longer exists.");
  assertTransition(sample.status, "ATTACHED");
  if (!input.readings || input.readings.length === 0) {
    throw new ActionError("Add at least one returned reading to attach.");
  }
  // Validate the returned readings through the same registry guard the bench path uses.
  const readings: ReadingInput[] = input.readings.map((r) => {
    const unit = r.unit || getAnalyte(r.analyte)?.defaultUnit || "";
    const v = validateMeasurement(r.analyte, r.value, unit);
    if (!v.ok) throw new ActionError(v.error);
    return { analyte: r.analyte, value: r.value, unit };
  });

  const now = new Date();
  const observedAt = input.observedAt ? (typeof input.observedAt === "string" ? new Date(input.observedAt) : input.observedAt) : sample.pulledAt;

  const result = await runInTenantTx(async (tx) => {
    const { panelId } = await insertPanelTx(tx, actor, {
      lotId: sample.lotId, // inherited — never re-resolved from the current vessel
      vesselId: sample.vesselId,
      sampleId: sample.id,
      observedAt,
      readings,
      captureMethod: input.captureMethod,
      note: input.note,
      clientRequestId: input.clientRequestId,
    });
    const updated = await tx.sample.update({
      where: { id: sample.id },
      data: { status: "ATTACHED", resultedAt: sample.resultedAt ?? now, attachedAt: now },
      select: { status: true },
    });
    await writeAudit(tx, {
      ...actor,
      action: "SAMPLE_ATTACHED",
      entityType: "Sample",
      entityId: sample.id,
      summary: `Attached ${readings.length} returned reading${readings.length === 1 ? "" : "s"} to the lot`,
    });
    return { panelId, status: updated.status };
  });
  return { sampleId: sample.id, panelId: result.panelId, lotId: sample.lotId, status: result.status };
}

/** Cancel a non-terminal sample (e.g. lost, mislabeled). */
export async function cancelSampleCore(actor: LedgerActor, input: { sampleId: string }): Promise<SampleResult> {
  const sample = await prisma.sample.findUnique({ where: { id: input.sampleId } });
  if (!sample) throw new ActionError("That sample no longer exists.");
  assertTransition(sample.status, "CANCELLED");
  const updated = await runInTenantTx(async (tx) => {
    const row = await tx.sample.update({
      where: { id: input.sampleId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
      select: { id: true, lotId: true, status: true },
    });
    await writeAudit(tx, {
      ...actor,
      action: "SAMPLE_CANCELLED",
      entityType: "Sample",
      entityId: row.id,
      summary: `Cancelled a sample`,
    });
    return row;
  });
  return { sampleId: updated.id, lotId: updated.lotId, status: updated.status };
}
