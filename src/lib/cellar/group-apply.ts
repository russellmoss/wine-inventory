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
  status: "applied" | "skipped" | "blocked" | "error";
  message: string;
  operationId?: number;
};

export type GroupApplyResult = {
  batchId: string;
  opType: GroupOpSpec["op"];
  total: number;
  applied: number;
  skipped: number;
  blocked: number;
  errored: number;
  outcomes: MemberOutcome[];
};

export type GroupTarget = { groupId?: string; vesselIds?: string[] };

export type GroupPreviewMember = {
  vesselId: string;
  vesselCode: string;
  label: string;
  status: "ready" | "skipped" | "blocked";
  message: string;
  operation: string;
  totalL: number;
  capacityL: number;
};

export type GroupApplyPreview = {
  targetType: "saved-group" | "ad-hoc";
  targetName: string | null;
  opType: GroupOpSpec["op"];
  total: number;
  ready: number;
  skipped: number;
  blocked: number;
  members: GroupPreviewMember[];
};

function vesselLabel(v: { type: string; code: string }): string {
  return v.type === "BARREL" ? `Barrel ${v.code}` : `Tank ${v.code}`;
}

type MemberVessel = {
  id: string;
  code: string;
  type: string;
  isActive: boolean;
  capacityL: unknown;
  vesselLots: { volumeL: unknown }[];
};

function heldL(v: { vesselLots: { volumeL: unknown }[] }): number {
  return Math.round(v.vesselLots.reduce((sum, row) => sum + Number(row.volumeL), 0) * 100) / 100;
}

/** Resolve the member vessels for a saved group or an ad-hoc multi-select. */
async function resolveMembers(target: GroupTarget): Promise<{ targetType: "saved-group" | "ad-hoc"; targetName: string | null; members: MemberVessel[] }> {
  let vesselIds: string[];
  let targetName: string | null = null;
  if (target.groupId) {
    const group = await prisma.vesselGroup.findUnique({ where: { id: target.groupId }, select: { name: true, isActive: true } });
    if (!group) throw new ActionError("Group not found.");
    if (!group.isActive) throw new ActionError("That saved group is inactive.");
    targetName = group.name;
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
    select: { id: true, code: true, type: true, isActive: true, capacityL: true, vesselLots: { select: { volumeL: true } } },
  });
  const byId = new Map(vessels.map((v) => [v.id, v]));
  // Preserve the requested order; drop ids that no longer exist.
  const members: MemberVessel[] = [];
  for (const id of vesselIds) {
    const vessel = byId.get(id);
    if (vessel) members.push(vessel);
  }
  return {
    targetType: target.groupId ? "saved-group" : "ad-hoc",
    targetName,
    members,
  };
}

async function loadToppingSource(spec: GroupOpSpec): Promise<{ label: string; totalL: number; active: boolean } | { error: string } | null> {
  if (spec.op !== "TOPPING") return null;
  const source = await prisma.vessel.findUnique({
    where: { id: spec.fromVesselId },
    select: { code: true, type: true, isActive: true, vesselLots: { select: { volumeL: true } } },
  });
  if (!source) return { error: "Topping source not found." };
  return { label: vesselLabel(source), totalL: heldL(source), active: source.isActive };
}

function operationShape(spec: GroupOpSpec, sourceLabel: string | null): string {
  switch (spec.op) {
    case "ADDITION":
      return `Addition: ${spec.materialName ?? "material"} at ${spec.rateValue} ${spec.rateBasis}`;
    case "FINING":
      return `Fining: ${spec.materialName ?? "material"} at ${spec.rateValue} ${spec.rateBasis}`;
    case "FILTRATION":
      return `Filtration: ${spec.lossL} L loss`;
    case "CAP_MGMT":
      return `Cap management: ${spec.kind.toLowerCase().replace(/_/g, " ")}`;
    case "LOSS":
      return `Dump: ${spec.lossL} L`;
    case "TOPPING":
      return `Topping: ${spec.volumeL} L from ${sourceLabel ?? "source"}`;
  }
}

export async function previewGroupApply(target: GroupTarget, spec: GroupOpSpec): Promise<GroupApplyPreview> {
  const resolved = await resolveMembers(target);
  const source = await loadToppingSource(spec);
  const sourceError = source && "error" in source ? source.error : null;
  const sourceLabel = source && !("error" in source) ? source.label : null;
  const sourceTotal = source && !("error" in source) ? source.totalL : 0;
  const sourceActive = source && !("error" in source) ? source.active : false;
  const operation = operationShape(spec, sourceLabel);

  const members: GroupPreviewMember[] = resolved.members.map((v) => {
    const label = vesselLabel(v);
    const totalL = heldL(v);
    const capacityL = Number(v.capacityL);
    if (!v.isActive) {
      return { vesselId: v.id, vesselCode: v.code, label, status: "blocked", message: "vessel is inactive", operation, totalL, capacityL };
    }
    if (spec.op === "TOPPING") {
      if (spec.fromVesselId === v.id) {
        return { vesselId: v.id, vesselCode: v.code, label, status: "skipped", message: "is the topping source", operation, totalL, capacityL };
      }
      if (sourceError) return { vesselId: v.id, vesselCode: v.code, label, status: "blocked", message: sourceError, operation, totalL, capacityL };
      if (!sourceActive) return { vesselId: v.id, vesselCode: v.code, label, status: "blocked", message: "topping source is inactive", operation, totalL, capacityL };
      if (sourceTotal <= 0) return { vesselId: v.id, vesselCode: v.code, label, status: "blocked", message: "topping source is empty", operation, totalL, capacityL };
      if (spec.volumeL > sourceTotal + 1e-9) return { vesselId: v.id, vesselCode: v.code, label, status: "blocked", message: `source only holds ${sourceTotal} L`, operation, totalL, capacityL };
      if (totalL + spec.volumeL > capacityL + 1e-9) return { vesselId: v.id, vesselCode: v.code, label, status: "blocked", message: `capacity ${capacityL} L would be exceeded`, operation, totalL, capacityL };
      return { vesselId: v.id, vesselCode: v.code, label, status: "ready", message: `will add ${spec.volumeL} L`, operation, totalL, capacityL };
    }
    if (totalL <= 0) return { vesselId: v.id, vesselCode: v.code, label, status: "skipped", message: "empty vessel", operation, totalL, capacityL };
    if ((spec.op === "FILTRATION" || spec.op === "LOSS") && spec.lossL > totalL + 1e-9) {
      return { vesselId: v.id, vesselCode: v.code, label, status: "blocked", message: `only holds ${totalL} L`, operation, totalL, capacityL };
    }
    return { vesselId: v.id, vesselCode: v.code, label, status: "ready", message: operation, operation, totalL, capacityL };
  });

  return {
    targetType: resolved.targetType,
    targetName: resolved.targetName,
    opType: spec.op,
    total: members.length,
    ready: members.filter((m) => m.status === "ready").length,
    skipped: members.filter((m) => m.status === "skipped").length,
    blocked: members.filter((m) => m.status === "blocked").length,
    members,
  };
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
  const preview = await previewGroupApply(target, spec);
  const batchId = randomUUID();
  const outcomes: MemberOutcome[] = [];

  for (const member of preview.members) {
    if (member.status !== "ready") {
      outcomes.push({
        vesselId: member.vesselId,
        vesselCode: member.vesselCode,
        label: member.label,
        status: member.status === "blocked" ? "blocked" : "skipped",
        message: member.message,
      });
      continue;
    }
    const v = { id: member.vesselId, code: member.vesselCode };
    const label = member.label;
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
  const blocked = outcomes.filter((o) => o.status === "blocked").length;
  const errored = outcomes.filter((o) => o.status === "error").length;
  return { batchId, opType: spec.op, total: preview.total, applied, skipped, blocked, errored, outcomes };
}
