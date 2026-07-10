import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { listMaterials, materialDisplayName } from "@/lib/cellar/materials";
import { categoryOf, isDoseableCategory, materialScopeForTask, type MaterialCategory } from "@/lib/cellar/material-taxonomy";
import { computeDoseTotal, resolveDoseUnit, convertDoseToStock } from "@/lib/cellar/additions-math";
import { evaluateAtp, advisoryWarning } from "@/lib/work-orders/atp";
import { TASK_VOCABULARY, type TaskBuild } from "@/lib/work-orders/template-vocabulary";
import { validateDependencyGraph, type TaskDependency } from "@/lib/work-orders/nl-dependencies";
import type {
  ProposalStatus,
  ProposalWarning,
  ProposalCostLine,
  ProposalCostSummary,
  ProposalDiffRow,
  ProposalDiff,
  UnresolvedItem,
} from "@/lib/work-orders/nl-proposal";
import type { CellarMaterialDTO } from "@/lib/cellar/materials-shared";

// ── Phase 9.3 Unit 1: the SHARED, source-agnostic work-order readiness engine ─────────────────────────
//
// Every work-order creation source (manual builder, vessel modal, template, assistant, voice, recurring)
// feeds the SAME deterministic read model here. Input is already-canonical TaskBuild[] (IDs resolved by
// the source); this core reads tenant state and emits warnings/cost/capacity/compliance/runtime-required
// fields/unresolved items/diff/fingerprint. It is STRICTLY READ-ONLY — no ledger op, no stock movement,
// no Sample, no VesselActivityEvent, no reservation, no work-order write.
//
// Architecture: `computeWorkOrderReadiness` is PURE (takes injected `ReadinessLoadedState`) so cost /
// supply / capacity / compliance / readiness are unit-testable with no DB. `buildWorkOrderReadiness`
// batch-loads the state then calls the pure core.

export const READINESS_SCHEMA_VERSION = 1 as const;

export type WorkOrderReadinessSource = "manual" | "template" | "vessel_modal" | "assistant" | "voice" | "recurring";

/** A field deliberately left for the execute screen (press cuts, harvest weights, an achieved reading, a
 * dependent dose finalized against actual predecessor output). Non-blocking: "Later on floor". */
export type RuntimeInputRequirement = {
  taskSeq: number;
  taskType: string;
  field: string;
  label: string;
  reason: string;
};

/** Coverage classification for a TASK_VOCABULARY key (Unit 1 machine-readable coverage contract).
 *  - supported:    fully authorable + completable in 9.3.
 *  - runtime:      authorable, but its core planning inputs are captured on the execute screen.
 *  - unsupported:  cannot be authored in 9.3 (surfaced with reason, never faked).
 *  - future_phase: intentionally deferred to a later phase. */
export type TaskCoverageState = "supported" | "runtime" | "unsupported" | "future_phase";
export type TaskCoverageEntry = { state: TaskCoverageState; reason: string; runtimeFields?: string[] };

// One entry per TASK_VOCABULARY key. The exhaustiveness of this table is asserted in the unit tests, so a
// new task type cannot ship without an explicit coverage decision + reason.
export const TASK_COVERAGE: Record<string, TaskCoverageEntry> = {
  RACK: { state: "supported", reason: "Vessel-to-vessel transfer against resolved vessels." },
  ADDITION: { state: "supported", reason: "Dose an existing doseable material into a resolved vessel." },
  FINING: { state: "supported", reason: "Fine a resolved vessel with an existing doseable material." },
  TOPPING: { state: "supported", reason: "Top a resolved vessel from a source vessel." },
  FILTRATION: {
    state: "supported",
    reason: "Filter a resolved vessel; the measured output volume is entered at completion.",
    runtimeFields: ["actualOutputL"],
  },
  CAP_MGMT: { state: "supported", reason: "Volume-neutral cap work on a resolved vessel." },
  BRIX: { state: "supported", reason: "Brix reading against a resolved lot/vessel." },
  PANEL: { state: "supported", reason: "Chem panel against a resolved lot/vessel." },
  TEMP_SETPOINT: {
    state: "supported",
    reason: "Temperature setpoint on a resolved vessel; the achieved reading is entered at completion.",
    runtimeFields: ["achievedValue"],
  },
  CLEAN: { state: "supported", reason: "Vessel cleaning; any supply drains as overhead." },
  SANITIZE: { state: "supported", reason: "Vessel sanitizing; any supply drains as overhead." },
  STEAM: { state: "supported", reason: "Vessel steaming; no supply consumed by default." },
  GAS: { state: "supported", reason: "Gas/blanket a resolved vessel; any supply drains as overhead." },
  OZONE: { state: "supported", reason: "Ozone treatment on a resolved vessel." },
  SO2: { state: "supported", reason: "SO2 treatment on a resolved vessel; strips/discs drain as overhead." },
  WET_STORAGE: { state: "supported", reason: "Wet-storage solution change; reagents drain as overhead." },
  CRUSH: {
    state: "runtime",
    reason: "Harvest picks, destination vessel, and measured output volume are entered on the execute screen.",
    runtimeFields: ["destVesselId", "picks", "actualOutputL"],
  },
  PRESS: {
    state: "runtime",
    reason: "The must lot, source vessel, and press fractions are entered on the execute screen.",
    runtimeFields: ["parentLotId", "sourceVesselId", "fractions"],
  },
  HARVEST_WEIGH_IN: {
    state: "runtime",
    reason: "The vineyard block and fruit weights are entered on the execute screen.",
    runtimeFields: ["blockId", "weightKg"],
  },
  NOTE: { state: "supported", reason: "A checklist item; no inventory, ledger, or cost effect." },
};

export type { TaskDependency, TaskDependencyRef } from "@/lib/work-orders/nl-dependencies";

export type WorkOrderReadinessInput = {
  source: WorkOrderReadinessSource;
  title: string;
  assigneeEmail: string | null;
  dueDate: string | null;
  taskBuilds: TaskBuild[];
  dependencyGraph?: TaskDependency[];
};

export type WorkOrderReadinessProposal = {
  schemaVersion: typeof READINESS_SCHEMA_VERSION;
  source: WorkOrderReadinessSource;
  title: string;
  assigneeEmail: string | null;
  dueDate: string | null;
  status: ProposalStatus;
  taskBuilds: TaskBuild[];
  dependencyGraph: TaskDependency[];
  runtimeInputs: RuntimeInputRequirement[];
  unresolved: UnresolvedItem[];
  warnings: ProposalWarning[];
  cost: ProposalCostSummary;
  coverage: { taskSeq: number; taskType: string; state: TaskCoverageState; reason: string }[];
  diff: ProposalDiff;
  fingerprint: string;
  stateReadAt: string;
};

// ── Injected read state (loaded once by the wrapper; the pure core reads only from here) ──

export type ReadinessLotContents = {
  id: string;
  code: string;
  status: string;
  volumeL: number;
  updatedAt: string;
  taxAbvOverride: number | null;
};

export type ReadinessVesselState = {
  id: string;
  code: string;
  type: string;
  label: string;
  capacityL: number;
  volumeL: number;
  isActive: boolean;
  updatedAt: string;
  lots: ReadinessLotContents[];
  capacityReserved: number; // Σ ACTIVE VESSEL_CAPACITY holds
};

export type ReadinessMaterialState = {
  id: string;
  displayName: string;
  category: MaterialCategory;
  kind: string | null;
  isActive: boolean;
  isStockTracked: boolean;
  stockUnit: string | null;
  onHand: number;
  reserved: number; // Σ ACTIVE MATERIAL_QTY holds
  costPerStockUnit: number | null; // weighted-average cost per stock unit (null when unknown)
  costReason: string | null;
};

export type ReadinessLotState = {
  id: string;
  code: string;
  status: string;
  updatedAt: string;
  taxAbvOverride: number | null;
};

export type ReadinessLoadedState = {
  vesselsById: Map<string, ReadinessVesselState>;
  materialsById: Map<string, ReadinessMaterialState>;
  lotsById: Map<string, ReadinessLotState>;
  lotVolumeReservedById: Map<string, number>; // Σ ACTIVE LOT_VOLUME holds keyed by lotId
  currency: string | null;
  stateReadAt: string;
  fingerprint: string;
};

const ROUND = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

function num(v: unknown): number {
  return v == null ? 0 : typeof v === "number" ? v : Number(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

type Ctx = {
  warnings: ProposalWarning[];
  unresolved: UnresolvedItem[];
  costLines: ProposalCostLine[];
  diffRows: ProposalDiffRow[];
  runtimeInputs: RuntimeInputRequirement[];
  plannedLotByVesselId: Map<string, { id: string; code: string }>;
  plannedVolumeDeltaByVesselId: Map<string, number>;
};

function blocking(ctx: Ctx, code: string, message: string) {
  ctx.warnings.push({ severity: "blocking", code, message });
}
function confirmable(ctx: Ctx, code: string, message: string | null | undefined) {
  if (message) ctx.warnings.push({ severity: "confirmable", code, message });
}
function completionCheck(ctx: Ctx, code: string, message: string) {
  ctx.warnings.push({ severity: "completion_check", code, message });
}
function unresolved(ctx: Ctx, key: string, label: string, reason: string) {
  ctx.unresolved.push({ key, label, reason });
}
function runtime(ctx: Ctx, seq: number, taskType: string, field: string, label: string, reason: string) {
  ctx.runtimeInputs.push({ taskSeq: seq, taskType, field, label, reason });
}

/** Resolve a vessel reference from loaded state; records a blocking "no longer exists" item if missing. */
function requireVessel(ctx: Ctx, state: ReadinessLoadedState, seq: number, id: string | null, role: string): ReadinessVesselState | null {
  if (!id) {
    unresolved(ctx, `task-${seq}-${role}`, role, `Task #${seq} is missing its ${role} vessel.`);
    return null;
  }
  const vessel = state.vesselsById.get(id);
  if (!vessel) {
    blocking(ctx, "missing_vessel", `A ${role} vessel in task #${seq} no longer exists.`);
    return null;
  }
  if (!vessel.isActive) blocking(ctx, "inactive_vessel", `${vessel.label} is inactive.`);
  return vessel;
}

/** Validate a `select` field value against its task-type vocabulary options. */
function validateSelect(ctx: Ctx, seq: number, taskType: string, field: string, value: unknown) {
  const def = TASK_VOCABULARY[taskType];
  const options = def?.fieldOptions?.[field];
  if (!options || value == null || value === "") return;
  if (!(options as readonly unknown[]).includes(value)) {
    blocking(ctx, "invalid_select", `Task #${seq} (${taskType}): "${String(value)}" is not a valid ${field}.`);
  }
}

function materialAtpAndCost(
  ctx: Ctx,
  seq: number,
  material: ReadinessMaterialState,
  converted: { qty: number; unit: string } | null,
  classification: "wine_cogs" | "overhead",
) {
  if (converted && material.isStockTracked) {
    confirmable(
      ctx,
      "material_atp_short",
      advisoryWarning(
        evaluateAtp({ kind: "MATERIAL_QTY", targetLabel: material.displayName, supply: material.onHand, alreadyReserved: material.reserved, requested: converted.qty, unit: converted.unit }),
      ),
    );
    ctx.diffRows.push({
      kind: "material",
      label: material.displayName,
      before: `${material.onHand} ${converted.unit}`,
      after: `${ROUND(material.onHand - converted.qty)} ${converted.unit} planned ATP`,
    });
  }
  // Cost: weighted-average per stock unit × converted qty. Unknown cost stays explicit (never $0).
  let estimatedCost: number | null = null;
  let method: ProposalCostLine["method"] = "unknown";
  let reason: string | undefined = material.costReason ?? "No usable cost.";
  if (!material.isStockTracked) {
    method = "untracked";
    reason = "Material is not stock-tracked.";
  } else if (converted && material.stockUnit && converted.unit === material.stockUnit && material.costPerStockUnit != null) {
    estimatedCost = ROUND(material.costPerStockUnit * converted.qty);
    method = "weighted_average";
    reason = undefined;
  } else if (!converted || (material.stockUnit && converted.unit !== material.stockUnit)) {
    reason = "Dose unit cannot be converted to the material stock unit.";
  }
  if (estimatedCost == null) {
    confirmable(ctx, "unknown_cost", `${material.displayName} cost is unknown for this proposal (${reason ?? "no usable cost"}).`);
  }
  ctx.costLines.push({
    taskSeq: seq,
    materialLabel: material.displayName,
    qty: converted?.qty ?? null,
    unit: converted?.unit ?? null,
    estimatedCost,
    method,
    reason,
    classification,
  });
}

/** Compute readiness for one already-resolved task. Pushes into `ctx`. */
function readTask(ctx: Ctx, state: ReadinessLoadedState, seq: number, task: TaskBuild) {
  const coverage = TASK_COVERAGE[task.taskType];
  if (!coverage) {
    blocking(ctx, "unknown_task_type", `Task #${seq}: unknown task type "${task.taskType}".`);
    return;
  }
  const v = task.values;

  switch (task.taskType) {
    case "RACK": {
      const from = requireVessel(ctx, state, seq, str(v.fromVesselId), "source");
      const to = requireVessel(ctx, state, seq, str(v.toVesselId), "destination");
      if (!from || !to) return;
      // Account for volume already moved by EARLIER tasks in this proposal (parity with the ADDITION path),
      // so chained racks warn against the planned state, not the raw DB volume. Advisory only.
      const priorFrom = ctx.plannedVolumeDeltaByVesselId.get(from.id) ?? 0;
      const priorTo = ctx.plannedVolumeDeltaByVesselId.get(to.id) ?? 0;
      const effFrom = ROUND(from.volumeL + priorFrom);
      const effTo = ROUND(to.volumeL + priorTo);
      const drawL = numOrNull(v.drawL) ?? effFrom;
      const lossL = numOrNull(v.lossL) ?? 0;
      const intoL = Math.max(0, drawL - lossL);
      ctx.plannedVolumeDeltaByVesselId.set(from.id, ROUND(priorFrom - drawL));
      ctx.plannedVolumeDeltaByVesselId.set(to.id, ROUND(priorTo + intoL));
      const sourceReserved = from.lots.reduce((sum, lot) => sum + (state.lotVolumeReservedById.get(lot.id) ?? 0), 0);
      confirmable(
        ctx,
        "source_volume_short",
        advisoryWarning(evaluateAtp({ kind: "LOT_VOLUME", targetLabel: from.label, supply: effFrom, alreadyReserved: sourceReserved, requested: drawL, unit: "L" })),
      );
      confirmable(
        ctx,
        "destination_headroom_short",
        advisoryWarning(evaluateAtp({ kind: "VESSEL_CAPACITY", targetLabel: to.label, supply: to.capacityL - effTo, alreadyReserved: to.capacityReserved, requested: intoL, unit: "L" })),
      );
      if (from.lots.length > 1) {
        confirmable(ctx, "rack_blend_review", `${from.label} contains multiple lots; review compliance and lot allocation before completion.`);
      }
      const singleLot = from.lots.length === 1 ? from.lots[0] : null;
      if (singleLot) ctx.plannedLotByVesselId.set(to.id, { id: singleLot.id, code: singleLot.code });
      ctx.diffRows.push({ kind: "vessel", label: from.label, before: `${effFrom} L`, after: `${ROUND(effFrom - drawL)} L planned` });
      ctx.diffRows.push({ kind: "vessel", label: to.label, before: `${effTo} L`, after: `${ROUND(effTo + intoL)} L planned` });
      return;
    }

    case "TOPPING": {
      const from = requireVessel(ctx, state, seq, str(v.fromVesselId), "source");
      const to = requireVessel(ctx, state, seq, str(v.toVesselId), "destination");
      if (!from || !to) return;
      const volumeL = numOrNull(v.volumeL);
      if (volumeL == null || volumeL <= 0) {
        runtime(ctx, seq, "TOPPING", "volumeL", "Top-up volume (L)", "The top-up volume is confirmed on the floor.");
      } else {
        const priorFrom = ctx.plannedVolumeDeltaByVesselId.get(from.id) ?? 0;
        const priorTo = ctx.plannedVolumeDeltaByVesselId.get(to.id) ?? 0;
        const effFrom = ROUND(from.volumeL + priorFrom);
        const effTo = ROUND(to.volumeL + priorTo);
        ctx.plannedVolumeDeltaByVesselId.set(from.id, ROUND(priorFrom - volumeL));
        ctx.plannedVolumeDeltaByVesselId.set(to.id, ROUND(priorTo + volumeL));
        const sourceReserved = from.lots.reduce((sum, lot) => sum + (state.lotVolumeReservedById.get(lot.id) ?? 0), 0);
        confirmable(
          ctx,
          "source_volume_short",
          advisoryWarning(evaluateAtp({ kind: "LOT_VOLUME", targetLabel: from.label, supply: effFrom, alreadyReserved: sourceReserved, requested: volumeL, unit: "L" })),
        );
        confirmable(
          ctx,
          "destination_headroom_short",
          advisoryWarning(evaluateAtp({ kind: "VESSEL_CAPACITY", targetLabel: to.label, supply: to.capacityL - effTo, alreadyReserved: to.capacityReserved, requested: volumeL, unit: "L" })),
        );
        ctx.diffRows.push({ kind: "vessel", label: to.label, before: `${effTo} L`, after: `${ROUND(effTo + volumeL)} L planned` });
      }
      return;
    }

    case "ADDITION":
    case "FINING": {
      const vessel = requireVessel(ctx, state, seq, str(v.vesselId), "target");
      if (!vessel) return;
      const effectiveVolumeL = ROUND(vessel.volumeL + (ctx.plannedVolumeDeltaByVesselId.get(vessel.id) ?? 0));
      const materialId = str(v.materialId);
      const material = materialId ? state.materialsById.get(materialId) : undefined;
      if (!material) {
        blocking(ctx, "missing_material", `The material in task #${seq} no longer exists in the catalog.`);
        return;
      }
      if (!material.isActive) blocking(ctx, "inactive_material", `${material.displayName} is no longer an active material.`);
      // WORKORDER-3: a non-doseable material can never be dosed into wine. Rechecked here (and again at
      // completion) so a stale/crafted materialId can't capitalize cleaning stock into wine COGS.
      const scoped = materialScopeForTask({ opType: task.taskType });
      if (!isDoseableCategory(material.category) || (scoped && !scoped.includes(material.category))) {
        blocking(ctx, "non_doseable_material", `${material.displayName} is a ${material.category.toLowerCase().replace(/_/g, " ")} material - it cannot be dosed into wine.`);
        return;
      }
      const amount = numOrNull(v.amount);
      const doseUnit = str(v.doseUnit) ?? str(v.unit);
      if (amount == null || amount <= 0 || !doseUnit || !resolveDoseUnit(doseUnit)) {
        blocking(ctx, "invalid_dose", `Task #${seq} needs a valid amount and dose unit.`);
        return;
      }
      const total = computeDoseTotal(amount, doseUnit, effectiveVolumeL);
      if (effectiveVolumeL !== vessel.volumeL) {
        completionCheck(ctx, "dose_after_planned_rack", `${vessel.label} dose is estimated against ${effectiveVolumeL} L after earlier planned tasks in this work order; the final dose is computed at completion against the actual volume.`);
      }
      const converted = convertDoseToStock(total, material.stockUnit);
      materialAtpAndCost(ctx, seq, material, converted, "wine_cogs");
      return;
    }

    case "BRIX":
    case "PANEL": {
      const lotId = str(v.lotId);
      if (lotId) {
        if (!state.lotsById.has(lotId) && !isLotInLoadedVessel(state, lotId)) {
          blocking(ctx, "missing_lot", `The lot in task #${seq} no longer exists.`);
        }
        return;
      }
      const vessel = requireVessel(ctx, state, seq, str(v.vesselId), "target");
      if (!vessel) return;
      if (vessel.lots.length === 1) return;
      if (vessel.lots.length === 0 && ctx.plannedLotByVesselId.has(vessel.id)) {
        const planned = ctx.plannedLotByVesselId.get(vessel.id)!;
        completionCheck(ctx, "observation_after_planned_rack", `${vessel.label} is empty now; this ${task.taskType === "PANEL" ? "panel" : "reading"} will attach to lot ${planned.code} planned to arrive from an earlier rack task.`);
        return;
      }
      if (vessel.lots.length > 1) {
        unresolved(ctx, `task-${seq}-lot`, `${task.taskType === "PANEL" ? "Panel" : "Brix"} lot`, `${vessel.label} holds a blend (${vessel.lots.map((l) => l.code).join(", ")}) - pick which lot this reading is for.`);
        return;
      }
      unresolved(ctx, `task-${seq}-lot`, "Lot", `${vessel.label} is empty - there is no lot to attach this reading to.`);
      return;
    }

    case "TEMP_SETPOINT": {
      const vessel = requireVessel(ctx, state, seq, str(v.vesselId), "target");
      if (!vessel) return;
      validateSelect(ctx, seq, "TEMP_SETPOINT", "targetUnit", v.targetUnit);
      if (numOrNull(v.targetValue) == null) unresolved(ctx, `task-${seq}-target`, "Target temperature", `Task #${seq} needs a target temperature.`);
      runtime(ctx, seq, "TEMP_SETPOINT", "achievedValue", "Achieved reading", "The achieved temperature is recorded at completion.");
      return;
    }

    case "FILTRATION": {
      const vessel = requireVessel(ctx, state, seq, str(v.vesselId), "target");
      if (!vessel) return;
      validateSelect(ctx, seq, "FILTRATION", "filterType", v.filterType);
      if (!str(v.filterType)) unresolved(ctx, `task-${seq}-media`, "Filter media", `Task #${seq} needs a filter medium.`);
      runtime(ctx, seq, "FILTRATION", "actualOutputL", "Output volume (L)", "The measured output volume (and resulting loss) is recorded at completion.");
      return;
    }

    case "CAP_MGMT": {
      const vessel = requireVessel(ctx, state, seq, str(v.vesselId), "target");
      if (!vessel) return;
      validateSelect(ctx, seq, "CAP_MGMT", "technique", v.technique);
      if (!str(v.technique)) unresolved(ctx, `task-${seq}-technique`, "Cap technique", `Task #${seq} needs a cap-management technique.`);
      return;
    }

    case "CLEAN":
    case "SANITIZE":
    case "GAS":
    case "SO2":
    case "WET_STORAGE": {
      const vessel = requireVessel(ctx, state, seq, str(v.vesselId), "target");
      if (!vessel) return;
      if (task.taskType === "GAS") validateSelect(ctx, seq, "GAS", "gasType", v.gasType);
      if (task.taskType === "SO2") validateSelect(ctx, seq, "SO2", "so2Method", v.so2Method);
      const materialId = str(v.materialId);
      if (materialId) {
        const material = state.materialsById.get(materialId);
        if (!material) {
          blocking(ctx, "missing_material", `The supply in task #${seq} no longer exists in the catalog.`);
          return;
        }
        // Cleaning/sanitizing/gas/wet-storage supply is OVERHEAD, never dosed into wine (WORKORDER-3).
        const scoped = materialScopeForTask({ activityType: task.taskType });
        if (scoped && !scoped.includes(material.category)) {
          blocking(ctx, "material_out_of_scope", `${material.displayName} (${material.category.toLowerCase().replace(/_/g, " ")}) is not a valid supply for a ${task.taskType.toLowerCase()} task.`);
          return;
        }
        const amount = numOrNull(v.amount);
        const converted = amount != null && amount > 0 && material.stockUnit ? { qty: amount, unit: material.stockUnit } : null;
        materialAtpAndCost(ctx, seq, material, converted, "overhead");
      }
      return;
    }

    case "STEAM":
    case "OZONE": {
      requireVessel(ctx, state, seq, str(v.vesselId), "target");
      return;
    }

    case "CRUSH": {
      runtime(ctx, seq, "CRUSH", "picks", "Harvest picks", "Harvest picks (with kg) are entered on the execute screen.");
      runtime(ctx, seq, "CRUSH", "destVesselId", "Destination vessel", "The destination vessel and measured output volume are entered on the execute screen.");
      return;
    }
    case "PRESS": {
      validateSelect(ctx, seq, "PRESS", "op", v.op);
      runtime(ctx, seq, "PRESS", "fractions", "Press fractions", "The must lot, source vessel, and press fractions are entered on the execute screen.");
      return;
    }
    case "HARVEST_WEIGH_IN": {
      runtime(ctx, seq, "HARVEST_WEIGH_IN", "blockId", "Vineyard block", "The vineyard block is entered on the execute screen.");
      runtime(ctx, seq, "HARVEST_WEIGH_IN", "weightKg", "Fruit weight (kg)", "The fruit weight (with optional Brix/pH/TA) is entered on the execute screen.");
      return;
    }

    case "NOTE":
      return;

    default:
      // Coverage table has an entry (checked above) but no reader — treat as needs_input rather than crash.
      unresolved(ctx, `task-${seq}`, task.taskType, `Task #${seq} (${task.taskType}) cannot be validated yet.`);
      return;
  }
}

function isLotInLoadedVessel(state: ReadinessLoadedState, lotId: string): boolean {
  for (const vessel of state.vesselsById.values()) {
    if (vessel.lots.some((l) => l.id === lotId)) return true;
  }
  return false;
}

/**
 * PURE readiness computation over already-resolved TaskBuild[] + injected tenant state. No I/O — this is
 * the unit-tested heart of the shared engine (cost/supply/capacity/compliance/readiness).
 */
export function computeWorkOrderReadiness(input: WorkOrderReadinessInput, state: ReadinessLoadedState): WorkOrderReadinessProposal {
  const ctx: Ctx = {
    warnings: [],
    unresolved: [],
    costLines: [],
    diffRows: [],
    runtimeInputs: [],
    plannedLotByVesselId: new Map(),
    plannedVolumeDeltaByVesselId: new Map(),
  };
  const coverage: WorkOrderReadinessProposal["coverage"] = [];

  input.taskBuilds.forEach((task, idx) => {
    const seq = idx + 1;
    const cov = TASK_COVERAGE[task.taskType];
    coverage.push({ taskSeq: seq, taskType: task.taskType, state: cov?.state ?? "unsupported", reason: cov?.reason ?? `Unknown task type "${task.taskType}".` });
    readTask(ctx, state, seq, task);
  });

  // Dependency graph is a pure proposal-time gate: a bad graph (missing key, cycle, unknown output) is a
  // true blocker — a dependent task must never point at a missing/wrong predecessor.
  if (input.dependencyGraph && input.dependencyGraph.length > 0) {
    const dep = validateDependencyGraph(input.taskBuilds, input.dependencyGraph);
    for (const err of dep.errors) blocking(ctx, "invalid_dependency_graph", err);
  }

  const blockers = ctx.warnings.filter((w) => w.severity === "blocking");
  const status: ProposalStatus = blockers.length > 0 ? "blocked" : ctx.unresolved.length > 0 ? "needs_input" : "ready";

  const hasUnknownCost = ctx.costLines.some((line) => line.estimatedCost == null);
  const totalKnownCost = hasUnknownCost ? null : ROUND(ctx.costLines.reduce((sum, line) => sum + (line.estimatedCost ?? 0), 0));
  const cost: ProposalCostSummary = { totalKnownCost, hasUnknownCost, currency: state.currency, lines: ctx.costLines };

  return {
    schemaVersion: READINESS_SCHEMA_VERSION,
    source: input.source,
    title: input.title,
    assigneeEmail: input.assigneeEmail,
    dueDate: input.dueDate,
    status,
    taskBuilds: input.taskBuilds,
    dependencyGraph: input.dependencyGraph ?? [],
    runtimeInputs: ctx.runtimeInputs,
    unresolved: ctx.unresolved,
    warnings: ctx.warnings,
    cost,
    coverage,
    diff: { rows: ctx.diffRows },
    fingerprint: state.fingerprint,
    stateReadAt: state.stateReadAt,
  };
}

// ── DB loading (the only I/O in this module) ──────────────────────────────────────────────────────────

function collectIds(taskBuilds: TaskBuild[]): { vesselIds: string[]; lotIds: string[]; materialIds: string[] } {
  const vesselIds = new Set<string>();
  const lotIds = new Set<string>();
  const materialIds = new Set<string>();
  for (const task of taskBuilds) {
    const v = task.values;
    for (const key of ["fromVesselId", "toVesselId", "vesselId", "sourceVesselId", "destVesselId"]) {
      const id = str(v[key]);
      if (id) vesselIds.add(id);
    }
    const lotId = str(v.lotId);
    if (lotId) lotIds.add(lotId);
    const materialId = str(v.materialId);
    if (materialId) materialIds.add(materialId);
  }
  return { vesselIds: [...vesselIds].sort(), lotIds: [...lotIds].sort(), materialIds: [...materialIds].sort() };
}

function vesselLabel(type: string, code: string): string {
  return `${type === "BARREL" ? "Barrel" : "Tank"} ${code}`;
}

function categoryOfDto(m: CellarMaterialDTO): MaterialCategory {
  return (m.category ?? categoryOf(m.kind)) as MaterialCategory;
}

async function loadState(taskBuilds: TaskBuild[]): Promise<ReadinessLoadedState> {
  const ids = collectIds(taskBuilds);
  const [vesselRows, lotRows, materials, appSettings] = await Promise.all([
    ids.vesselIds.length
      ? prisma.vessel.findMany({
          where: { id: { in: ids.vesselIds } },
          select: {
            id: true, code: true, type: true, capacityL: true, isActive: true, updatedAt: true,
            vesselLots: { select: { lotId: true, volumeL: true, lot: { select: { id: true, code: true, status: true, updatedAt: true, taxAbvOverride: true } } }, orderBy: { lot: { code: "asc" } } },
          },
        })
      : Promise.resolve([]),
    ids.lotIds.length
      ? prisma.lot.findMany({ where: { id: { in: ids.lotIds } }, select: { id: true, code: true, status: true, updatedAt: true, taxAbvOverride: true } })
      : Promise.resolve([]),
    ids.materialIds.length ? listMaterials() : Promise.resolve([] as CellarMaterialDTO[]),
    prisma.appSettings.findFirst({ select: { currency: true } }),
  ]);

  const allLotIds = new Set<string>(ids.lotIds);
  for (const vr of vesselRows) for (const vl of vr.vesselLots) allLotIds.add(vl.lotId);

  const [capacityHolds, lotHolds, materialHolds, supplyLots] = await Promise.all([
    ids.vesselIds.length
      ? prisma.reservation.groupBy({ by: ["vesselId"], where: { kind: "VESSEL_CAPACITY", status: "ACTIVE", vesselId: { in: ids.vesselIds } }, _sum: { qty: true } })
      : Promise.resolve([] as { vesselId: string | null; _sum: { qty: Prisma.Decimal | null } }[]),
    allLotIds.size
      ? prisma.reservation.groupBy({ by: ["lotId"], where: { kind: "LOT_VOLUME", status: "ACTIVE", lotId: { in: [...allLotIds] } }, _sum: { qty: true } })
      : Promise.resolve([] as { lotId: string | null; _sum: { qty: Prisma.Decimal | null } }[]),
    ids.materialIds.length
      ? prisma.reservation.groupBy({ by: ["materialId"], where: { kind: "MATERIAL_QTY", status: "ACTIVE", materialId: { in: ids.materialIds } }, _sum: { qty: true } })
      : Promise.resolve([] as { materialId: string | null; _sum: { qty: Prisma.Decimal | null } }[]),
    ids.materialIds.length
      ? prisma.supplyLot.findMany({ where: { materialId: { in: ids.materialIds }, qtyRemaining: { gt: 0 } }, select: { materialId: true, qtyRemaining: true, unitCost: true, stockUnit: true } })
      : Promise.resolve([] as { materialId: string; qtyRemaining: Prisma.Decimal | number; unitCost: Prisma.Decimal | null; stockUnit: string | null }[]),
  ]);

  const capacityReservedByVessel = new Map<string, number>();
  for (const row of capacityHolds) if (row.vesselId) capacityReservedByVessel.set(row.vesselId, num(row._sum.qty));
  const lotVolumeReservedById = new Map<string, number>();
  for (const row of lotHolds) if (row.lotId) lotVolumeReservedById.set(row.lotId, num(row._sum.qty));
  const materialReservedById = new Map<string, number>();
  for (const row of materialHolds) if (row.materialId) materialReservedById.set(row.materialId, num(row._sum.qty));

  // Weighted-average cost per stock unit + on-hand per material (from open supply lots).
  const supplyByMaterial = new Map<string, { onHand: number; costQty: number; costTotal: number; hasUnknownLotCost: boolean }>();
  for (const lot of supplyLots) {
    const agg = supplyByMaterial.get(lot.materialId) ?? { onHand: 0, costQty: 0, costTotal: 0, hasUnknownLotCost: false };
    const qty = num(lot.qtyRemaining);
    agg.onHand += qty;
    if (lot.unitCost == null) agg.hasUnknownLotCost = true;
    else {
      agg.costQty += qty;
      agg.costTotal += qty * num(lot.unitCost);
    }
    supplyByMaterial.set(lot.materialId, agg);
  }

  const vesselsById = new Map<string, ReadinessVesselState>();
  for (const vr of vesselRows) {
    const lots: ReadinessLotContents[] = vr.vesselLots.map((vl) => ({
      id: vl.lot.id,
      code: vl.lot.code,
      status: vl.lot.status,
      volumeL: num(vl.volumeL),
      updatedAt: vl.lot.updatedAt.toISOString(),
      taxAbvOverride: vl.lot.taxAbvOverride == null ? null : Number(vl.lot.taxAbvOverride),
    }));
    vesselsById.set(vr.id, {
      id: vr.id,
      code: vr.code,
      type: vr.type,
      label: vesselLabel(vr.type, vr.code),
      capacityL: num(vr.capacityL),
      volumeL: ROUND(lots.reduce((sum, l) => sum + l.volumeL, 0)),
      isActive: vr.isActive,
      updatedAt: vr.updatedAt.toISOString(),
      lots,
      capacityReserved: capacityReservedByVessel.get(vr.id) ?? 0,
    });
  }

  const materialsById = new Map<string, ReadinessMaterialState>();
  for (const m of materials) {
    if (!ids.materialIds.includes(m.id)) continue;
    const agg = supplyByMaterial.get(m.id);
    let costPerStockUnit: number | null = null;
    let costReason: string | null = null;
    if (!m.isStockTracked) costReason = "Material is not stock-tracked.";
    else if (!agg || agg.onHand <= 0) costReason = "No open supply lots.";
    else if (agg.hasUnknownLotCost) costReason = "At least one open supply lot has unknown cost.";
    else if (agg.costQty > 0) costPerStockUnit = agg.costTotal / agg.costQty;
    else costReason = "No on-hand stock with a known cost.";
    materialsById.set(m.id, {
      id: m.id,
      displayName: materialDisplayName(m),
      category: categoryOfDto(m),
      kind: m.kind ?? null,
      isActive: m.isActive !== false,
      isStockTracked: !!m.isStockTracked,
      stockUnit: m.stockUnit ?? null,
      onHand: agg?.onHand ?? num(m.onHand),
      reserved: materialReservedById.get(m.id) ?? 0,
      costPerStockUnit,
      costReason,
    });
  }

  const lotsById = new Map<string, ReadinessLotState>();
  for (const l of lotRows) {
    lotsById.set(l.id, { id: l.id, code: l.code, status: l.status, updatedAt: l.updatedAt.toISOString(), taxAbvOverride: l.taxAbvOverride == null ? null : Number(l.taxAbvOverride) });
  }

  return {
    vesselsById,
    materialsById,
    lotsById,
    lotVolumeReservedById,
    currency: appSettings?.currency ?? null,
    stateReadAt: new Date().toISOString(),
    fingerprint: await buildReadinessFingerprint(taskBuilds),
  };
}

// ── Freshness fingerprint (canonical; the committer revalidates against this before writing) ────────────

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, val]) => `${JSON.stringify(k)}:${stableJson(val)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function buildReadinessFingerprint(taskBuilds: TaskBuild[]): Promise<string> {
  const ids = collectIds(taskBuilds);
  const [vessels, vesselLots, lots, materials, supplyLots] = await Promise.all([
    ids.vesselIds.length
      ? prisma.vessel.findMany({ where: { id: { in: ids.vesselIds } }, select: { id: true, code: true, type: true, capacityL: true, isActive: true, updatedAt: true }, orderBy: { id: "asc" } })
      : Promise.resolve([]),
    ids.vesselIds.length
      ? prisma.vesselLot.findMany({ where: { vesselId: { in: ids.vesselIds } }, select: { vesselId: true, lotId: true, volumeL: true }, orderBy: [{ vesselId: "asc" }, { lotId: "asc" }] })
      : Promise.resolve([]),
    ids.lotIds.length
      ? prisma.lot.findMany({ where: { id: { in: ids.lotIds } }, select: { id: true, code: true, status: true, updatedAt: true, taxAbvOverride: true }, orderBy: { id: "asc" } })
      : Promise.resolve([]),
    ids.materialIds.length
      ? prisma.cellarMaterial.findMany({ where: { id: { in: ids.materialIds } }, select: { id: true, name: true, kind: true, category: true, isActive: true, isStockTracked: true, stockUnit: true }, orderBy: { id: "asc" } })
      : Promise.resolve([]),
    ids.materialIds.length
      ? prisma.supplyLot.findMany({ where: { materialId: { in: ids.materialIds }, qtyRemaining: { gt: 0 } }, select: { id: true, materialId: true, qtyRemaining: true, stockUnit: true, unitCost: true, updatedAt: true }, orderBy: { id: "asc" } })
      : Promise.resolve([]),
  ]);
  return stableJson({
    schemaVersion: READINESS_SCHEMA_VERSION,
    taskCount: taskBuilds.length,
    tasks: taskBuilds.map((task) => ({ taskType: task.taskType, title: task.title ?? null, values: task.values })),
    vessels: vessels.map((v) => ({ ...v, capacityL: num(v.capacityL), updatedAt: v.updatedAt.toISOString() })),
    vesselLots: vesselLots.map((vl) => ({ vesselId: vl.vesselId, lotId: vl.lotId, volumeL: num(vl.volumeL) })),
    lots: lots.map((l) => ({ id: l.id, code: l.code, status: l.status, updatedAt: l.updatedAt.toISOString(), taxAbvOverride: l.taxAbvOverride == null ? null : Number(l.taxAbvOverride) })),
    materials,
    supplyLots: supplyLots.map((lot) => ({ ...lot, qtyRemaining: num(lot.qtyRemaining), unitCost: lot.unitCost == null ? null : num(lot.unitCost), updatedAt: lot.updatedAt.toISOString() })),
  });
}

/** Load tenant state then compute readiness. Optionally scope to a tenant (scripts/tests/system callers). */
export async function buildWorkOrderReadiness(input: WorkOrderReadinessInput, opts?: { tenantId?: string }): Promise<WorkOrderReadinessProposal> {
  const run = async () => computeWorkOrderReadiness(input, await loadState(input.taskBuilds));
  return opts?.tenantId ? runAsTenant(opts.tenantId, run) : run();
}

/** Revalidate a proposal's freshness fingerprint before writing. Throws the friendly stale message. */
export async function assertFreshReadiness(taskBuilds: TaskBuild[], fingerprint: string): Promise<void> {
  const current = await buildReadinessFingerprint(taskBuilds);
  if (current !== fingerprint) throw new Error("This work-order proposal is stale. Regenerate it before confirming.");
}

/**
 * Server-side write gate (Unit 2): re-run readiness immediately before a create/issue writes. Refuse on a
 * true blocker (returns the refreshed reasons) or, when an expected fingerprint is supplied, on stale state.
 * `needs_input` does NOT block a manual create — those fields are resolved on the execute screen. Returns
 * the fresh proposal so the caller can surface reservation-style warnings.
 */
export async function gateWorkOrderReadinessForWrite(
  taskBuilds: TaskBuild[],
  meta: { source: WorkOrderReadinessSource; title: string; assigneeEmail: string | null; dueDate: string | null },
  expectedFingerprint?: string | null,
): Promise<WorkOrderReadinessProposal> {
  const proposal = await buildWorkOrderReadiness({ ...meta, taskBuilds });
  if (expectedFingerprint && proposal.fingerprint !== expectedFingerprint) {
    throw new Error("This work-order proposal is stale. Regenerate it before confirming.");
  }
  const blockers = proposal.warnings.filter((w) => w.severity === "blocking");
  if (blockers.length > 0) {
    throw new Error(`This work order can't be created yet: ${blockers.map((b) => b.message).join(" ")}`);
  }
  return proposal;
}
