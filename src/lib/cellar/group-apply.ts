import { randomUUID } from "crypto";
import { ActionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";
import type { CaptureMethod } from "@/lib/ledger/vocabulary";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import type { RateBasis } from "@/lib/cellar/additions-math";
import { addAdditionCore, addFiningCore, type CellarBaseResult } from "@/lib/cellar/addition";
import { capManagementCore, filterVesselCore, type CapKind } from "@/lib/cellar/treatments";
import { recordLossCore } from "@/lib/cellar/loss";
import { topVesselCore } from "@/lib/cellar/topping";

// Group fan-out engine (Phase 3, Unit 7, D13). One logical action → ONE op per member
// vessel, all sharing a generated batchId. Each member op is its own SERIALIZABLE
// transaction (the cores call runLedgerWrite), so a member that fails — empty vessel,
// over capacity, etc. — is recorded as an exception and NEVER aborts the batch. Returns a
// per-member result summary ("58/60 applied · 2 skipped" + reasons).

export type GroupOpSpec =
  | {
      op: "ADDITION" | "FINING";
      materialId?: string;
      materialName?: string;
      materialKind?: string;
      rateValue: number;
      rateBasis: RateBasis;
      note?: string;
    }
  | { op: "FILTRATION"; lossL: number; medium?: string; micron?: number | null; note?: string }
  | { op: "CAP_MGMT"; kind: CapKind; durationMin?: number | null; note?: string }
  | { op: "LOSS"; lossL: number; note?: string }
  | { op: "TOPPING"; fromVesselId: string; volumeL: number; note?: string };

export type MemberOutcome = {
  vesselId: string;
  vesselCode: string;
  label: string;
  status: "applied" | "skipped" | "error";
  message: string;
  operationId?: number;
};

export type GroupApplyResult = {
  batchId: string;
  opType: GroupOpSpec["op"];
  total: number;
  applied: number;
  skipped: number;
  errored: number;
  outcomes: MemberOutcome[];
};

export type GroupTarget = { groupId?: string; vesselIds?: string[] };

function vesselLabel(v: { type: string; code: string }): string {
  return v.type === "BARREL" ? `Barrel ${v.code}` : `Tank ${v.code}`;
}

/** Resolve the member vessels for a saved group or an ad-hoc multi-select. */
async function resolveMembers(target: GroupTarget) {
  let vesselIds: string[];
  if (target.groupId) {
    const members = await prisma.vesselGroupMember.findMany({
      where: { groupId: target.groupId },
      select: { vesselId: true },
    });
    vesselIds = members.map((m) => m.vesselId);
  } else {
    vesselIds = [...new Set(target.vesselIds ?? [])];
  }
  if (vesselIds.length === 0) throw new ActionError("That group has no member vessels.");
  const vessels = await prisma.vessel.findMany({
    where: { id: { in: vesselIds } },
    select: { id: true, code: true, type: true },
  });
  type MemberVessel = (typeof vessels)[number];
  const byId = new Map(vessels.map((v) => [v.id, v]));
  // Preserve the requested order; drop ids that no longer exist.
  return vesselIds.map((id) => byId.get(id)).filter((v): v is MemberVessel => !!v);
}

/** Dispatch one op against one member vessel, injecting the shared batchId. */
function applyOne(
  actor: LedgerActor,
  spec: GroupOpSpec,
  vesselId: string,
  batchId: string,
  captureMethod?: CaptureMethod,
): Promise<CellarBaseResult> {
  switch (spec.op) {
    case "ADDITION":
      return addAdditionCore(actor, { ...spec, vesselId, batchId, captureMethod });
    case "FINING":
      return addFiningCore(actor, { ...spec, vesselId, batchId, captureMethod });
    case "FILTRATION":
      return filterVesselCore(actor, { vesselId, lossL: spec.lossL, medium: spec.medium, micron: spec.micron, note: spec.note, batchId, captureMethod });
    case "CAP_MGMT":
      return capManagementCore(actor, { vesselId, kind: spec.kind, durationMin: spec.durationMin, note: spec.note, batchId, captureMethod });
    case "LOSS":
      return recordLossCore(actor, { vesselId, lossL: spec.lossL, note: spec.note, batchId, captureMethod });
    case "TOPPING":
      return topVesselCore(actor, { toVesselId: vesselId, fromVesselId: spec.fromVesselId, volumeL: spec.volumeL, note: spec.note, batchId, captureMethod });
  }
}

/**
 * Fan one cellar operation out across a group's members. One op per member, shared
 * batchId; per-member capacity/empty checks happen inside each core. Exceptions are
 * caught and recorded per vessel (ActionError → "skipped" with its reason; anything
 * unexpected → "error"); the batch always completes and a summary is returned.
 */
export async function applyToGroup(
  actor: LedgerActor,
  target: GroupTarget,
  spec: GroupOpSpec,
  opts: { captureMethod?: CaptureMethod } = {},
): Promise<GroupApplyResult> {
  const members = await resolveMembers(target);
  const batchId = randomUUID();
  const outcomes: MemberOutcome[] = [];

  for (const v of members) {
    const label = vesselLabel(v);
    // Topping a vessel from itself is nonsensical — skip the source if it's a member.
    if (spec.op === "TOPPING" && spec.fromVesselId === v.id) {
      outcomes.push({ vesselId: v.id, vesselCode: v.code, label, status: "skipped", message: "is the topping source" });
      continue;
    }
    try {
      const res = await applyOne(actor, spec, v.id, batchId, opts.captureMethod);
      outcomes.push({ vesselId: v.id, vesselCode: v.code, label, status: "applied", message: res.message, operationId: res.operationId });
    } catch (e) {
      if (e instanceof ActionError) {
        outcomes.push({ vesselId: v.id, vesselCode: v.code, label, status: "skipped", message: e.message });
      } else {
        outcomes.push({ vesselId: v.id, vesselCode: v.code, label, status: "error", message: e instanceof Error ? e.message : "Unexpected error" });
      }
    }
  }

  const applied = outcomes.filter((o) => o.status === "applied").length;
  const skipped = outcomes.filter((o) => o.status === "skipped").length;
  const errored = outcomes.filter((o) => o.status === "error").length;
  return { batchId, opType: spec.op, total: members.length, applied, skipped, errored, outcomes };
}
