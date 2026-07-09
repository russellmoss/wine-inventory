import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { resolveVessel, resolveLotTarget } from "@/lib/assistant/scope";
import { listMaterials, materialDisplayName } from "@/lib/cellar/materials";
import { categoryOf, isDoseableCategory, type MaterialCategory } from "@/lib/cellar/material-taxonomy";
import { computeDoseTotal, resolveDoseUnit } from "@/lib/cellar/additions-math";
import { materialScopeForTask } from "@/lib/cellar/material-taxonomy";
import { evaluateAtp, advisoryWarning } from "@/lib/work-orders/atp";
import type { TaskBuild } from "@/lib/work-orders/template-vocabulary";
import {
  canonicalizeNlWorkOrderDraft,
  normalizeDoseUnit,
  NL_WORK_ORDER_SCHEMA_VERSION,
  type NlWorkOrderDraft,
  type ProposalCostLine,
  type ProposalDiffRow,
  type ProposalWarning,
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

type CostEstimate = {
  qty: number | null;
  unit: string | null;
  estimatedCost: number | null;
  method: ProposalCostLine["method"];
  reason?: string;
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

async function activeReservationQty(where: Prisma.ReservationWhereInput): Promise<number> {
  const agg = await prisma.reservation.aggregate({ where: { ...where, status: "ACTIVE" }, _sum: { qty: true } });
  return num(agg._sum.qty);
}

function pushWarning(warnings: ProposalWarning[], severity: ProposalWarning["severity"], code: string, message: string | null | undefined) {
  if (message) warnings.push({ severity, code, message });
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

async function estimateMaterialCost(material: CellarMaterialDTO, qty: number | null, unit: string | null): Promise<CostEstimate> {
  if (!material.isStockTracked) return { qty, unit, estimatedCost: null, method: "untracked", reason: "Material is not stock-tracked." };
  if (qty == null || !unit || !material.stockUnit || unit !== material.stockUnit) {
    return { qty, unit, estimatedCost: null, method: "unknown", reason: "Dose unit cannot be converted to the material stock unit." };
  }
  const lots = await prisma.supplyLot.findMany({
    where: { materialId: material.id, qtyRemaining: { gt: 0 } },
    select: { qtyRemaining: true, unitCost: true, currency: true },
  });
  if (lots.length === 0) return { qty, unit, estimatedCost: null, method: "unknown", reason: "No open supply lots." };
  if (lots.some((lot) => lot.unitCost == null)) {
    return { qty, unit, estimatedCost: null, method: "unknown", reason: "At least one open supply lot has unknown cost." };
  }
  const totalQty = lots.reduce((sum, lot) => sum + num(lot.qtyRemaining), 0);
  if (totalQty <= 0) return { qty, unit, estimatedCost: null, method: "unknown", reason: "No on-hand stock." };
  const totalCost = lots.reduce((sum, lot) => sum + num(lot.qtyRemaining) * num(lot.unitCost), 0);
  return { qty, unit, estimatedCost: ROUND((totalCost / totalQty) * qty), method: "weighted_average" };
}

async function currency(): Promise<string | null> {
  const settings = await prisma.appSettings.findFirst({ select: { currency: true } });
  return settings?.currency ?? null;
}

function fingerprintPayloadForTaskBuilds(taskBuilds: TaskBuild[]) {
  const vesselIds = new Set<string>();
  const lotIds = new Set<string>();
  const materialIds = new Set<string>();
  for (const task of taskBuilds) {
    const v = task.values;
    for (const key of ["fromVesselId", "toVesselId", "vesselId", "sourceVesselId", "destVesselId"]) {
      if (typeof v[key] === "string") vesselIds.add(v[key] as string);
    }
    if (typeof v.lotId === "string") lotIds.add(v.lotId);
    if (typeof v.materialId === "string") materialIds.add(v.materialId);
  }
  return { vesselIds: [...vesselIds].sort(), lotIds: [...lotIds].sort(), materialIds: [...materialIds].sort() };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function buildNlWorkOrderFingerprint(taskBuilds: TaskBuild[]): Promise<string> {
  const ids = fingerprintPayloadForTaskBuilds(taskBuilds);
  const [vessels, vesselLots, lots, materials, supplyLots] = await Promise.all([
    ids.vesselIds.length
      ? prisma.vessel.findMany({
          where: { id: { in: ids.vesselIds } },
          select: { id: true, code: true, type: true, capacityL: true, isActive: true, updatedAt: true },
          orderBy: { id: "asc" },
        })
      : Promise.resolve([]),
    ids.vesselIds.length
      ? prisma.vesselLot.findMany({
          where: { vesselId: { in: ids.vesselIds } },
          select: { vesselId: true, lotId: true, volumeL: true },
          orderBy: [{ vesselId: "asc" }, { lotId: "asc" }],
        })
      : Promise.resolve([]),
    ids.lotIds.length
      ? prisma.lot.findMany({
          where: { id: { in: ids.lotIds } },
          select: { id: true, code: true, status: true, updatedAt: true, taxAbvOverride: true },
          orderBy: { id: "asc" },
        })
      : Promise.resolve([]),
    ids.materialIds.length
      ? prisma.cellarMaterial.findMany({
          where: { id: { in: ids.materialIds } },
          select: { id: true, name: true, kind: true, category: true, isActive: true, isStockTracked: true, stockUnit: true },
          orderBy: { id: "asc" },
        })
      : Promise.resolve([]),
    ids.materialIds.length
      ? prisma.supplyLot.findMany({
          where: { materialId: { in: ids.materialIds }, qtyRemaining: { gt: 0 } },
          select: { id: true, materialId: true, qtyRemaining: true, stockUnit: true, unitCost: true, updatedAt: true },
          orderBy: { id: "asc" },
        })
      : Promise.resolve([]),
  ]);
  return stableJson({
    schemaVersion: NL_WORK_ORDER_SCHEMA_VERSION,
    taskCount: taskBuilds.length,
    tasks: taskBuilds.map((task) => ({ taskType: task.taskType, title: task.title ?? null, values: task.values })),
    vessels: vessels.map((v) => ({ ...v, capacityL: num(v.capacityL), updatedAt: v.updatedAt.toISOString() })),
    vesselLots: vesselLots.map((vl) => ({ vesselId: vl.vesselId, lotId: vl.lotId, volumeL: num(vl.volumeL) })),
    lots: lots.map((l) => ({ id: l.id, code: l.code, status: l.status, updatedAt: l.updatedAt.toISOString(), taxAbvOverride: l.taxAbvOverride == null ? null : Number(l.taxAbvOverride) })),
    materials,
    supplyLots: supplyLots.map((lot) => ({ ...lot, qtyRemaining: num(lot.qtyRemaining), unitCost: lot.unitCost == null ? null : num(lot.unitCost), updatedAt: lot.updatedAt.toISOString() })),
  });
}

async function buildInner(raw: unknown): Promise<WorkOrderProposal> {
  const draft = canonicalizeNlWorkOrderDraft(raw);
  validateNlWorkOrderMetadata(draft);

  const tasks: ProposedTask[] = [];
  const taskBuilds: TaskBuild[] = [];
  const warnings: ProposalWarning[] = [];
  const diffRows: ProposalDiffRow[] = [];
  const costLines: ProposalCostLine[] = [];
  const stateReadAt = new Date().toISOString();
  const plannedLotByVesselId = new Map<string, { id: string; code: string }>();
  const plannedVolumeDeltaByVesselId = new Map<string, number>();

  for (const [idx, intent] of draft.intents.entries()) {
    const seq = idx + 1;
    if (intent.kind === "RACK") {
      const [from, to] = await Promise.all([resolveVesselState(intent.from), resolveVesselState(intent.to)]);
      if (!from.isActive) warnings.push({ severity: "blocking", code: "inactive_source_vessel", message: `${from.label} is inactive.` });
      if (!to.isActive) warnings.push({ severity: "blocking", code: "inactive_destination_vessel", message: `${to.label} is inactive.` });
      const drawL = intent.drawL == null ? from.volumeL : intent.drawL;
      const lossL = intent.lossL ?? 0;
      const intoL = Math.max(0, drawL - lossL);
      plannedVolumeDeltaByVesselId.set(from.id, ROUND((plannedVolumeDeltaByVesselId.get(from.id) ?? 0) - drawL));
      plannedVolumeDeltaByVesselId.set(to.id, ROUND((plannedVolumeDeltaByVesselId.get(to.id) ?? 0) + intoL));
      const sourceReserved = await activeReservationQty({ kind: "LOT_VOLUME", lotId: { in: from.lots.map((lot) => lot.id) } });
      const destReserved = await activeReservationQty({ kind: "VESSEL_CAPACITY", vesselId: to.id });
      pushWarning(
        warnings,
        "confirmable",
        "source_volume_short",
        advisoryWarning(evaluateAtp({ kind: "LOT_VOLUME", targetLabel: from.label, supply: from.volumeL, alreadyReserved: sourceReserved, requested: drawL, unit: "L" })),
      );
      pushWarning(
        warnings,
        "confirmable",
        "destination_headroom_short",
        advisoryWarning(evaluateAtp({ kind: "VESSEL_CAPACITY", targetLabel: to.label, supply: to.capacityL - to.volumeL, alreadyReserved: destReserved, requested: intoL, unit: "L" })),
      );
      if (from.lots.length > 1) {
        warnings.push({ severity: "confirmable", code: "rack_blend_review", message: `${from.label} contains multiple lots; review compliance and lot allocation before completion.` });
      }
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
      taskBuilds.push({ taskType: "RACK", title: `Rack ${from.label} to ${to.label}`, values });
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
      diffRows.push({ kind: "vessel", label: from.label, before: `${from.volumeL} L`, after: `${ROUND(from.volumeL - drawL)} L planned` });
      diffRows.push({ kind: "vessel", label: to.label, before: `${to.volumeL} L`, after: `${ROUND(to.volumeL + intoL)} L planned` });
      continue;
    }

    if (intent.kind === "ADDITION" || intent.kind === "FINING") {
      const vessel = await resolveVesselState(intent.vessel);
      const effectiveVolumeL = ROUND(vessel.volumeL + (plannedVolumeDeltaByVesselId.get(vessel.id) ?? 0));
      if (!vessel.isActive) warnings.push({ severity: "blocking", code: "inactive_vessel", message: `${vessel.label} is inactive.` });
      const allMaterials = await listMaterials();
      const material = matchMaterial(allMaterials, intent.material);
      const materialLabel = materialDisplayName(material);
      const unit = normalizeDoseUnit(intent.unit);
      if (!resolveDoseUnit(unit)) warnings.push({ severity: "blocking", code: "unknown_dose_unit", message: `Unsupported dose unit "${intent.unit}".` });
      const total = computeDoseTotal(intent.amount, unit, effectiveVolumeL);
      if (effectiveVolumeL !== vessel.volumeL) {
        warnings.push({ severity: "completion_check", code: "dose_after_planned_rack", message: `${vessel.label} dose is estimated against ${effectiveVolumeL} L after earlier planned tasks in this work order.` });
      }
      const converted = convertDoseToStock(total, material.stockUnit);
      const cost = await estimateMaterialCost(material, converted?.qty ?? null, converted?.unit ?? null);
      if (cost.estimatedCost == null) {
        warnings.push({ severity: "confirmable", code: "unknown_cost", message: `${materialLabel} cost is unknown for this proposal (${cost.reason ?? "no usable cost"}).` });
      }
      if (converted && material.isStockTracked) {
        const onHand = await prisma.supplyLot.aggregate({ where: { materialId: material.id, qtyRemaining: { gt: 0 } }, _sum: { qtyRemaining: true } });
        const reserved = await activeReservationQty({ kind: "MATERIAL_QTY", materialId: material.id });
        pushWarning(
          warnings,
          "confirmable",
          "material_atp_short",
          advisoryWarning(evaluateAtp({ kind: "MATERIAL_QTY", targetLabel: materialLabel, supply: num(onHand._sum.qtyRemaining), alreadyReserved: reserved, requested: converted.qty, unit: converted.unit })),
        );
        diffRows.push({ kind: "material", label: materialLabel, before: `${num(onHand._sum.qtyRemaining)} ${converted.unit}`, after: `${ROUND(num(onHand._sum.qtyRemaining) - converted.qty)} ${converted.unit} planned ATP` });
      }
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
      taskBuilds.push({ taskType: intent.kind, title: `${intent.kind === "FINING" ? "Fine" : "Add"} ${materialLabel} to ${vessel.label}`, values });
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
      costLines.push({ taskSeq: seq, materialLabel, qty: cost.qty, unit: cost.unit, estimatedCost: cost.estimatedCost, method: cost.method, reason: cost.reason });
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
          const planned = plannedLotByVesselId.get(vessel.id)!;
          target = { lotId: planned.id, lotCode: planned.code };
          warnings.push({ severity: "completion_check", code: "panel_after_planned_rack", message: `${vessel.label} is empty now; the panel will attach to lot ${planned.code} planned to arrive from an earlier rack task.` });
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
      taskBuilds.push({ taskType: "PANEL", title: `Pull panel - ${target.lotCode}`, values });
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
      taskBuilds.push({ taskType: "NOTE", title: intent.title, values: { ...(intent.note ? { note: intent.note } : {}) } });
      tasks.push({ seq, kind: "NOTE", title: intent.title, summary: intent.note ?? intent.title, entities: [] });
      continue;
    }
  }

  const blockers = warnings.filter((w) => w.severity === "blocking");
  const status = blockers.length > 0 ? "blocked" : "ready";
  const totalKnown = costLines.some((line) => line.estimatedCost == null)
    ? null
    : ROUND(costLines.reduce((sum, line) => sum + (line.estimatedCost ?? 0), 0));
  const readyBuilds = status === "ready" ? taskBuilds : [];
  return {
    schemaVersion: 1,
    sourceText: draft.sourceText,
    title: draft.title,
    assigneeEmail: draft.assigneeEmail,
    dueDate: draft.dueDate,
    status,
    stateReadAt,
    tasks,
    unresolved: [],
    warnings,
    cost: { totalKnownCost: totalKnown, hasUnknownCost: costLines.some((line) => line.estimatedCost == null), currency: await currency(), lines: costLines },
    diff: { rows: diffRows },
    taskBuilds: readyBuilds,
    fingerprint: await buildNlWorkOrderFingerprint(readyBuilds),
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
    schemaVersion: 1,
    sourceText: proposal.sourceText,
    title: proposal.title,
    assigneeEmail: proposal.assigneeEmail,
    dueDate: proposal.dueDate,
    taskBuilds: proposal.taskBuilds,
    fingerprint: proposal.fingerprint,
  };
}

export async function assertFreshNlWorkOrderProposal(args: NlWorkOrderCommitArgs): Promise<void> {
  const current = await buildNlWorkOrderFingerprint(args.taskBuilds);
  if (current !== args.fingerprint) {
    throw new Error("This work-order proposal is stale. Regenerate it before confirming.");
  }
}

export function dueAtFromCommitArgs(args: Pick<NlWorkOrderCommitArgs, "dueDate">): Date | null {
  return dateOrNull(args.dueDate);
}
