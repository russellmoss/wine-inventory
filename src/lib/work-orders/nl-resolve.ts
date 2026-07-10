import "server-only";
import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { resolveVessel, resolveLotTarget } from "@/lib/assistant/scope";
import { listMaterials, materialDisplayName } from "@/lib/cellar/materials";
import { categoryOf, isDoseableCategory, materialScopeForTask, type MaterialCategory } from "@/lib/cellar/material-taxonomy";
import { computeDoseTotal } from "@/lib/cellar/additions-math";
import type { TaskBuild } from "@/lib/work-orders/template-vocabulary";
import {
  buildWorkOrderReadiness,
  buildReadinessFingerprint,
  assertFreshReadiness,
} from "@/lib/work-orders/proposal-readiness";
import {
  canonicalizeNlWorkOrderDraft,
  normalizeDoseUnit,
  type NlWorkOrderDraft,
  type ProposedTask,
  type WorkOrderProposal,
  type NlWorkOrderCommitArgs,
} from "@/lib/work-orders/nl-proposal";
import type { CellarMaterialDTO } from "@/lib/cellar/materials-shared";

type VesselLite = {
  id: string;
  code: string;
  type: string;
  capacityL: Prisma.Decimal | number;
  isActive: boolean;
  updatedAt: Date;
};

type VesselContentsRow = {
  lotId: string;
  volumeL: Prisma.Decimal | number;
  lot: { id: string; code: string; status: string; updatedAt: Date; taxAbvOverride: Prisma.Decimal | null };
};

type ResolvedVesselState = {
  id: string;
  label: string;
  code: string;
  type: string;
  capacityL: number;
  volumeL: number;
  isActive: boolean;
  updatedAt: string;
  lots: { id: string; code: string; status: string; volumeL: number; updatedAt: string; taxAbvOverride: number | null }[];
};

const ROUND = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

function num(v: unknown): number {
  return v == null ? 0 : typeof v === "number" ? v : Number(v);
}

function vesselLabel(v: Pick<ResolvedVesselState, "type" | "code">): string {
  return `${v.type === "BARREL" ? "Barrel" : "Tank"} ${v.code}`;
}

function dateOrNull(value: string | null): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Due date must be an ISO date (YYYY-MM-DD).");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Due date must be a real ISO date.");
  return date;
}

export function validateNlWorkOrderMetadata(draft: Pick<NlWorkOrderDraft, "assigneeEmail" | "dueDate">): void {
  if (draft.assigneeEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.assigneeEmail)) {
    throw new Error("Assignee must be an email address.");
  }
  dateOrNull(draft.dueDate);
}

async function resolveVesselState(ref: string): Promise<ResolvedVesselState> {
  const resolved = await resolveVessel(ref);
  const vessel = (await prisma.vessel.findUnique({
    where: { id: resolved.id },
    select: {
      id: true,
      code: true,
      type: true,
      capacityL: true,
      isActive: true,
      updatedAt: true,
      vesselLots: {
        include: { lot: { select: { id: true, code: true, status: true, updatedAt: true, taxAbvOverride: true } } },
        orderBy: { lot: { code: "asc" } },
      },
    },
  })) as (VesselLite & { vesselLots: VesselContentsRow[] }) | null;
  if (!vessel) throw new Error(`No vessel matches "${ref}".`);
  const lots = vessel.vesselLots.map((vl) => ({
    id: vl.lot.id,
    code: vl.lot.code,
    status: vl.lot.status,
    volumeL: num(vl.volumeL),
    updatedAt: vl.lot.updatedAt.toISOString(),
    taxAbvOverride: vl.lot.taxAbvOverride == null ? null : Number(vl.lot.taxAbvOverride),
  }));
  return {
    id: vessel.id,
    code: vessel.code,
    type: vessel.type,
    label: vesselLabel(vessel),
    capacityL: num(vessel.capacityL),
    volumeL: ROUND(lots.reduce((sum, lot) => sum + lot.volumeL, 0)),
    isActive: vessel.isActive,
    updatedAt: vessel.updatedAt.toISOString(),
    lots,
  };
}

function categoryOfMaterial(m: CellarMaterialDTO): MaterialCategory {
  return (m.category ?? categoryOf(m.kind)) as MaterialCategory;
}

function matchMaterial(all: CellarMaterialDTO[], ref: string): CellarMaterialDTO {
  const raw = ref.trim();
  const idToken = raw.match(/#\s*([0-9a-z-]{8,})/i)?.[1] ?? (raw.startsWith("#") ? raw.slice(1) : null);
  if (idToken) {
    const normalized = idToken.replace(/-/g, "").toLowerCase();
    const pinned = all.find((m) => m.id.replace(/-/g, "").toLowerCase() === normalized);
    if (!pinned) throw new Error("That material is not in the catalog anymore.");
    return pinned;
  }
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const needle = norm(raw);
  const names = (m: CellarMaterialDTO) =>
    [materialDisplayName(m), m.name, m.genericName, m.brandName, m.brand].filter(Boolean).map((v) => norm(String(v)));
  const exact = all.filter((m) => names(m).includes(needle));
  const fuzzy = all.filter((m) => names(m).some((h) => h && (h.includes(needle) || needle.includes(h))));
  const matches = exact.length ? exact : fuzzy;
  if (matches.length === 0) throw new Error(`No additive matches "${ref}". Add it to the expendables catalog first, or check the name.`);
  const scoped = materialScopeForTask({ opType: "ADDITION" });
  const doseable = matches.filter((m) => {
    const category = categoryOfMaterial(m);
    return isDoseableCategory(category) && (!scoped || scoped.includes(category));
  });
  if (doseable.length === 0) {
    const m = matches[0];
    throw new Error(`"${materialDisplayName(m)}" is a ${categoryOfMaterial(m).toLowerCase().replace(/_/g, " ")} material - it cannot be dosed into wine.`);
  }
  if (doseable.length > 1) {
    throw new Error(`Several additives match "${ref}": ${doseable.map((m) => `${materialDisplayName(m)} (${m.id.slice(0, 6)})`).join(", ")}.`);
  }
  return doseable[0];
}

function convertDoseToStock(total: { total: number; unit: "g" | "mL" } | null, stockUnit: string | null | undefined): { qty: number; unit: string } | null {
  if (!total || !stockUnit) return null;
  if (total.unit === "g") {
    if (stockUnit === "g") return { qty: total.total, unit: "g" };
    if (stockUnit === "kg") return { qty: ROUND(total.total / 1000), unit: "kg" };
    if (stockUnit === "mg") return { qty: ROUND(total.total * 1000), unit: "mg" };
  }
  if (total.unit === "mL") {
    if (stockUnit === "mL") return { qty: total.total, unit: "mL" };
    if (stockUnit === "L") return { qty: ROUND(total.total / 1000), unit: "L" };
  }
  return null;
}

/** @deprecated Phase 9.3: fingerprinting is unified on the shared readiness core. Kept as a thin alias so
 * callers stay on one hash across propose + commit. */
export async function buildNlWorkOrderFingerprint(taskBuilds: TaskBuild[]): Promise<string> {
  return buildReadinessFingerprint(taskBuilds);
}

// Phase 9.3 Unit 3: the assistant path now ONLY resolves NL intents to canonical TaskBuild[] (+ the
// display `tasks`), then delegates ALL warnings/cost/capacity/compliance/diff/status/fingerprint to the
// shared readiness engine. No parallel warning system lives here anymore.
type ResolvedDraft = { tasks: ProposedTask[]; taskBuilds: TaskBuild[] };

async function resolveDraftToTaskBuilds(draft: NlWorkOrderDraft): Promise<ResolvedDraft> {
  const tasks: ProposedTask[] = [];
  const taskBuilds: TaskBuild[] = [];
  const plannedLotByVesselId = new Map<string, { id: string; code: string }>();
  const plannedVolumeDeltaByVesselId = new Map<string, number>();

  for (const [idx, intent] of draft.intents.entries()) {
    const seq = idx + 1;
    if (intent.kind === "RACK") {
      const [from, to] = await Promise.all([resolveVesselState(intent.from), resolveVesselState(intent.to)]);
      const drawL = intent.drawL == null ? from.volumeL : intent.drawL;
      const lossL = intent.lossL ?? 0;
      const intoL = Math.max(0, drawL - lossL);
      plannedVolumeDeltaByVesselId.set(from.id, ROUND((plannedVolumeDeltaByVesselId.get(from.id) ?? 0) - drawL));
      plannedVolumeDeltaByVesselId.set(to.id, ROUND((plannedVolumeDeltaByVesselId.get(to.id) ?? 0) + intoL));
      const singleLot = from.lots.length === 1 ? from.lots[0] : null;
      if (singleLot) plannedLotByVesselId.set(to.id, { id: singleLot.id, code: singleLot.code });
      const values = {
        fromVesselId: from.id,
        toVesselId: to.id,
        ...(singleLot ? { lotId: singleLot.id } : {}),
        ...(drawL > 0 ? { drawL } : {}),
        ...(lossL > 0 ? { lossL } : {}),
        ...(intent.rackType ? { rackType: intent.rackType } : {}),
        ...(intent.note ? { note: intent.note } : {}),
      };
      taskBuilds.push({ taskType: "RACK", title: `Rack ${from.label} to ${to.label}`, values, taskKey: randomUUID() });
      tasks.push({
        seq,
        kind: "RACK",
        title: `Rack ${from.label} to ${to.label}`,
        summary: `${drawL} L from ${from.label} to ${to.label}${lossL > 0 ? `, ${lossL} L loss` : ""}`,
        entities: [
          { role: "from", label: from.label, id: from.id },
          { role: "to", label: to.label, id: to.id },
          ...(singleLot ? [{ role: "lot", label: singleLot.code, id: singleLot.id }] : []),
        ],
      });
      continue;
    }

    if (intent.kind === "ADDITION" || intent.kind === "FINING") {
      const vessel = await resolveVesselState(intent.vessel);
      const effectiveVolumeL = ROUND(vessel.volumeL + (plannedVolumeDeltaByVesselId.get(vessel.id) ?? 0));
      const allMaterials = await listMaterials();
      const material = matchMaterial(allMaterials, intent.material);
      const materialLabel = materialDisplayName(material);
      const unit = normalizeDoseUnit(intent.unit);
      // The advisory planned dose (reservation basis) is estimated against the vessel's current+planned
      // volume; the AUTHORITATIVE dose is recomputed at completion (readiness core owns capacity/cost).
      const total = computeDoseTotal(intent.amount, unit, effectiveVolumeL);
      const converted = convertDoseToStock(total, material.stockUnit);
      const singleLot = vessel.lots.length === 1 ? vessel.lots[0] : null;
      const values = {
        vesselId: vessel.id,
        ...(singleLot ? { lotId: singleLot.id } : {}),
        materialId: material.id,
        amount: intent.amount,
        doseUnit: unit,
        ...(converted ? { plannedAmount: converted.qty, plannedUnit: converted.unit } : {}),
        ...(intent.note ? { note: intent.note } : {}),
      };
      taskBuilds.push({ taskType: intent.kind, title: `${intent.kind === "FINING" ? "Fine" : "Add"} ${materialLabel} to ${vessel.label}`, values, taskKey: randomUUID() });
      tasks.push({
        seq,
        kind: intent.kind,
        title: `${intent.kind === "FINING" ? "Fine" : "Add"} ${materialLabel}`,
        summary: `${intent.amount} ${unit} ${materialLabel} to ${vessel.label}${total ? ` (about ${total.total} ${total.unit})` : ""}`,
        entities: [
          { role: "vessel", label: vessel.label, id: vessel.id },
          { role: "material", label: materialLabel, id: material.id },
          ...(vessel.lots.map((lot) => ({ role: "resident lot", label: lot.code, id: lot.id }))),
        ],
      });
      continue;
    }

    if (intent.kind === "PANEL") {
      let target: { lotId: string; lotCode: string };
      let vesselId: string | undefined;
      let vesselLabel: string | null = null;
      if (intent.lot) {
        target = await resolveLotTarget({ lot: intent.lot });
      } else if (intent.vessel) {
        const vessel = await resolveVesselState(intent.vessel);
        vesselId = vessel.id;
        vesselLabel = vessel.label;
        if (vessel.lots.length === 1) {
          target = { lotId: vessel.lots[0].id, lotCode: vessel.lots[0].code };
        } else if (vessel.lots.length === 0 && plannedLotByVesselId.has(vessel.id)) {
          // Bind the panel to the lot a prior rack in THIS work order will deliver (completion-time seam).
          const planned = plannedLotByVesselId.get(vessel.id)!;
          target = { lotId: planned.id, lotCode: planned.code };
        } else if (vessel.lots.length > 1) {
          throw new Error(`${vessel.label} holds a blend (${vessel.lots.map((lot) => lot.code).join(", ")}) - which lot is this panel for?`);
        } else {
          throw new Error(`${vessel.label} is empty - there is no lot to attach this panel to.`);
        }
      } else {
        throw new Error("A panel task needs a lot or vessel.");
      }
      const values = {
        lotId: target.lotId,
        ...(vesselId ? { vesselId } : {}),
        ...(intent.note ? { note: intent.note } : {}),
      };
      taskBuilds.push({ taskType: "PANEL", title: `Pull panel - ${target.lotCode}`, values, taskKey: randomUUID() });
      tasks.push({
        seq,
        kind: "PANEL",
        title: intent.panelName ?? "Chem panel",
        summary: `Pull ${intent.panelName ?? "chem panel"} for lot ${target.lotCode}`,
        entities: [
          { role: "lot", label: target.lotCode, id: target.lotId },
          ...(vesselId && vesselLabel ? [{ role: "vessel", label: vesselLabel, id: vesselId }] : []),
        ],
      });
      continue;
    }

    if (intent.kind === "NOTE") {
      taskBuilds.push({ taskType: "NOTE", title: intent.title, values: { ...(intent.note ? { note: intent.note } : {}) }, taskKey: randomUUID() });
      tasks.push({ seq, kind: "NOTE", title: intent.title, summary: intent.note ?? intent.title, entities: [] });
      continue;
    }
  }
  return { tasks, taskBuilds };
}

async function buildInner(raw: unknown): Promise<WorkOrderProposal> {
  const draft = canonicalizeNlWorkOrderDraft(raw);
  validateNlWorkOrderMetadata(draft);
  const { tasks, taskBuilds } = await resolveDraftToTaskBuilds(draft);

  // Delegate ALL warnings/cost/capacity/compliance/diff/status/fingerprint to the shared readiness engine
  // (P0: one warning system, not an assistant-owned parallel one). The assistant is just another source.
  const readiness = await buildWorkOrderReadiness({
    source: "assistant",
    title: draft.title,
    assigneeEmail: draft.assigneeEmail,
    dueDate: draft.dueDate,
    taskBuilds,
  });
  const ready = readiness.status === "ready";
  return {
    schemaVersion: 2,
    sourceText: draft.sourceText,
    title: draft.title,
    assigneeEmail: draft.assigneeEmail,
    dueDate: draft.dueDate,
    status: readiness.status,
    stateReadAt: readiness.stateReadAt,
    tasks,
    unresolved: readiness.unresolved,
    warnings: readiness.warnings,
    cost: readiness.cost,
    diff: readiness.diff,
    // Only sign task builds for a fully-committable proposal (existing gate); fingerprint matches commit.
    taskBuilds: ready ? taskBuilds : [],
    fingerprint: ready ? readiness.fingerprint : "",
  };
}

export async function buildNlWorkOrderProposal(raw: unknown, opts?: { tenantId?: string }): Promise<WorkOrderProposal> {
  if (opts?.tenantId) return runAsTenant(opts.tenantId, () => buildInner(raw));
  return buildInner(raw);
}

export function buildNlWorkOrderCommitArgs(proposal: WorkOrderProposal): NlWorkOrderCommitArgs {
  if (proposal.status !== "ready") throw new Error("This work-order proposal is not ready to confirm.");
  if (proposal.taskBuilds.length === 0) throw new Error("This work-order proposal has no tasks.");
  return {
    schemaVersion: 2,
    sourceText: proposal.sourceText,
    title: proposal.title,
    assigneeEmail: proposal.assigneeEmail,
    dueDate: proposal.dueDate,
    taskBuilds: proposal.taskBuilds,
    fingerprint: proposal.fingerprint,
  };
}

export async function assertFreshNlWorkOrderProposal(args: NlWorkOrderCommitArgs): Promise<void> {
  // Unified on the shared readiness fingerprint (same hash used to mint the proposal).
  await assertFreshReadiness(args.taskBuilds, args.fingerprint);
}

export function dueAtFromCommitArgs(args: Pick<NlWorkOrderCommitArgs, "dueDate">): Date | null {
  return dateOrNull(args.dueDate);
}
