import "server-only";
import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { resolveVessel, resolveLotTarget } from "@/lib/assistant/scope";
import { expandVesselRange, resolveGroupByName } from "@/lib/vessels/range";
import { listMaterials, materialDisplayName } from "@/lib/cellar/materials";
import { categoryOf, isDoseableCategory, materialScopeForTask, type MaterialCategory } from "@/lib/cellar/material-taxonomy";
import { computeDoseTotal, convertDoseToStock } from "@/lib/cellar/additions-math";
import { guessPackagingFactor, theoreticalConsumption, type PackagingPlanLine } from "@/lib/bottling/packaging-bom";
import { TASK_VOCABULARY, type TaskBuild, type ResolvedTaskVocabulary } from "@/lib/work-orders/template-vocabulary";
import { resolveTaskVocabulary } from "@/lib/work-orders/vocabulary-resolver";
import { buildWorkOrderReadiness, assertFreshReadiness } from "@/lib/work-orders/proposal-readiness";
import { isPressableLotState } from "@/lib/ferment/press-data";
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
  lot: { id: string; code: string; form: string; status: string; updatedAt: Date; taxAbvOverride: Prisma.Decimal | null };
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
  lots: { id: string; code: string; form: string; status: string; volumeL: number; updatedAt: string; taxAbvOverride: number | null }[];
};

const ROUND = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

/** Short verbs for the maintenance-lane task titles/summaries (display only). */
const TASK_LABELS: Record<string, string> = {
  CLEAN: "Clean",
  SANITIZE: "Sanitize",
  STEAM: "Steam",
  OZONE: "Ozone-treat",
  GAS: "Gas",
  SO2: "SO₂-treat",
  WET_STORAGE: "Wet-storage",
};

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
  return loadVesselStateById(resolved.id);
}

async function loadVesselStateById(id: string): Promise<ResolvedVesselState> {
  const vessel = (await prisma.vessel.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      type: true,
      capacityL: true,
      isActive: true,
      updatedAt: true,
      vesselLots: {
        include: { lot: { select: { id: true, code: true, form: true, status: true, updatedAt: true, taxAbvOverride: true } } },
        orderBy: { lot: { code: "asc" } },
      },
    },
  })) as (VesselLite & { vesselLots: VesselContentsRow[] }) | null;
  if (!vessel) throw new Error("That vessel no longer exists.");
  const lots = vessel.vesselLots.map((vl) => ({
    id: vl.lot.id,
    code: vl.lot.code,
    form: vl.lot.form,
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

const sortByLabel = (xs: ResolvedVesselState[]): ResolvedVesselState[] =>
  [...xs].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

/**
 * Phase 9.4a: resolve a group expression to an ordered, deduped member set — a range ("B101-B110"), a
 * saved VesselGroup name, or a comma/and-separated list. Throws a relayable message when it can't
 * (empty / single / ambiguous group), so the proposal stays honest rather than faking a group.
 */
async function resolveGroupMembers(expr: string): Promise<ResolvedVesselState[]> {
  const range = expandVesselRange(expr); // throws on inverted/oversized
  let members: ResolvedVesselState[];
  if (range) {
    members = await Promise.all(range.map((code) => resolveVesselState(code)));
  } else {
    const g = await resolveGroupByName(expr);
    if (g.kind === "many") throw new Error(`Several groups match "${expr}": ${g.names.join(", ")}. Name one.`);
    if (g.kind === "one") {
      members = await Promise.all(g.members.map((m) => loadVesselStateById(m.id)));
    } else {
      const parts = expr.split(/\s*(?:,|\band\b)\s*/i).map((s) => s.trim()).filter(Boolean);
      if (parts.length < 2) {
        throw new Error(`Couldn't resolve "${expr}" to a barrel group. Use a range like B101-B110, a saved group name, or a comma-separated list.`);
      }
      members = await Promise.all(parts.map((p) => resolveVesselState(p)));
    }
  }
  const byId = new Map(members.map((m) => [m.id, m]));
  return sortByLabel([...byId.values()]);
}

async function resolvePressSource(intent: { sourceVessel?: string; sourceLot?: string }): Promise<{
  lotId: string;
  lotCode: string;
  vesselId: string;
  vesselLabel: string;
  volumeL: number;
} | null> {
  if (intent.sourceLot) {
    const lot = await resolveLotTarget({ lot: intent.sourceLot });
    const positions = await prisma.vesselLot.findMany({
      where: { lotId: lot.lotId, lot: { status: "ACTIVE" } },
      select: {
        vesselId: true,
        volumeL: true,
        vessel: { select: { code: true, type: true } },
        lot: { select: { id: true, code: true, form: true, status: true } },
      },
      orderBy: { vessel: { code: "asc" } },
    });
    const pressable = positions.filter((p) => isPressableLotState(p.lot));
    if (pressable.length === 1) {
      const p = pressable[0];
      return { lotId: p.lot.id, lotCode: p.lot.code, vesselId: p.vesselId, vesselLabel: vesselLabel({ type: p.vessel.type, code: p.vessel.code }), volumeL: num(p.volumeL) };
    }
    if (pressable.length > 1) {
      throw new Error(`Lot ${lot.lotCode} is split across multiple pressable vessels: ${pressable.map((p) => vesselLabel({ type: p.vessel.type, code: p.vessel.code })).join(", ")}. Which vessel should be pressed?`);
    }
    throw new Error(`Lot ${lot.lotCode} is not currently an active MUST lot in a vessel, so it cannot be pressed from a work order.`);
  }

  if (intent.sourceVessel) {
    const vessel = await resolveVesselState(intent.sourceVessel);
    const pressable = vessel.lots.filter((lot) => isPressableLotState(lot));
    if (pressable.length === 1) {
      const lot = pressable[0];
      return { lotId: lot.id, lotCode: lot.code, vesselId: vessel.id, vesselLabel: vessel.label, volumeL: lot.volumeL };
    }
    if (pressable.length > 1) {
      throw new Error(`${vessel.label} holds multiple pressable MUST lots: ${pressable.map((lot) => `${lot.code} (${lot.volumeL} L)`).join(", ")}. Which lot should be pressed?`);
    }
    const current = vessel.lots.length
      ? vessel.lots.map((lot) => `${lot.code} (${lot.form}, ${lot.status}, ${lot.volumeL} L)`).join(", ")
      : "it is empty";
    throw new Error(`${vessel.label} has no active MUST lot to press right now; current contents: ${current}.`);
  }

  return null;
}

// Plan 055a (J2): the read-side packaging estimate — "how many corks/bottles for 500 cases?". Pure over
// the shipped factor math + on-hand; no write. Named items resolve individually; else this SKU's last-run
// BoM; else nothing (with a note). Exported for the estimate_packaging_needs assistant read tool.
export type PackagingEstimateLine = { label: string; materialId: string; per: "bottle" | "case"; factor: number; needed: number; onHand: number | null; shortfall: number };
export type PackagingEstimate = { bottles: number; cases: number; lines: PackagingEstimateLine[]; note?: string };

export async function estimatePackagingNeeds(
  input: { skuName?: string; cases?: number; bottles?: number; packaging?: string[] },
  opts?: { tenantId?: string },
): Promise<PackagingEstimate> {
  const run = async (): Promise<PackagingEstimate> => {
    const bottles = input.cases != null && input.cases > 0 ? Math.round(input.cases * 12) : input.bottles != null && input.bottles > 0 ? Math.round(input.bottles) : 0;
    const all = await listMaterials();
    let base: { materialId: string; per: "bottle" | "case"; factor: number }[] = [];
    if (input.packaging && input.packaging.length > 0) {
      base = input.packaging.map((ref) => {
        const m = matchPackaging(all, ref);
        const g = guessPackagingFactor(materialDisplayName(m), m.kind);
        return { materialId: m.id, per: g.per, factor: g.factor };
      });
    } else if (input.skuName) {
      base = await lastRunPackagingForSku(input.skuName);
    }
    const byId = new Map(all.map((m) => [m.id, m]));
    const lines: PackagingEstimateLine[] = base.map((l) => {
      const m = byId.get(l.materialId);
      const needed = theoreticalConsumption(l, bottles);
      const onHand = m && m.onHand != null ? Number(m.onHand) : null;
      return { label: m ? materialDisplayName(m) : l.materialId, materialId: l.materialId, per: l.per, factor: l.factor, needed, onHand, shortfall: onHand != null ? Math.max(0, needed - onHand) : 0 };
    });
    return {
      bottles,
      cases: Math.ceil(bottles / 12),
      lines,
      ...(base.length === 0 ? { note: "Name the packaging (e.g. glass, cork, capsule, labels, case box), or bottle this SKU once so its packaging can be reused." } : {}),
    };
  };
  return opts?.tenantId ? runAsTenant(opts.tenantId, run) : run();
}

function categoryOfMaterial(m: CellarMaterialDTO): MaterialCategory {
  return (m.category ?? categoryOf(m.kind)) as MaterialCategory;
}

/** Resolve a material by ref within a task's scope. `doseableOnly` enforces WORKORDER-3 for additions
 * (cleaning/packaging can never be dosed into wine); maintenance supplies pass their overhead scope. */
function matchMaterialByRef(all: CellarMaterialDTO[], ref: string, opts: { scope?: MaterialCategory[]; doseableOnly?: boolean }): CellarMaterialDTO {
  const raw = ref.trim();
  const idToken = raw.match(/#\s*([0-9a-z-]{8,})/i)?.[1] ?? (raw.startsWith("#") ? raw.slice(1) : null);
  if (idToken) {
    const normalized = idToken.replace(/-/g, "").toLowerCase();
    const pinned = all.find((m) => m.id.replace(/-/g, "").toLowerCase() === normalized);
    if (!pinned) throw new Error("That material is not in the catalog anymore.");
    // Honor the scope/doseable contract even for an id-pinned material (WORKORDER-3 defense-in-depth, so
    // it isn't solely dependent on the downstream readiness recheck).
    const category = categoryOfMaterial(pinned);
    const cat = category.toLowerCase().replace(/_/g, " ");
    if (opts.doseableOnly && !isDoseableCategory(category)) throw new Error(`"${materialDisplayName(pinned)}" is a ${cat} material - it cannot be dosed into wine.`);
    if (opts.scope && !opts.scope.includes(category)) throw new Error(`"${materialDisplayName(pinned)}" (${cat}) is not a valid supply for this task.`);
    return pinned;
  }
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const needle = norm(raw);
  const names = (m: CellarMaterialDTO) =>
    [materialDisplayName(m), m.name, m.genericName, m.brandName, m.brand].filter(Boolean).map((v) => norm(String(v)));
  const exact = all.filter((m) => names(m).includes(needle));
  const fuzzy = all.filter((m) => names(m).some((h) => h && (h.includes(needle) || needle.includes(h))));
  const matches = exact.length ? exact : fuzzy;
  if (matches.length === 0) throw new Error(`No material matches "${ref}". Add it to the expendables catalog first, or check the name.`);
  const inScope = matches.filter((m) => {
    const category = categoryOfMaterial(m);
    if (opts.doseableOnly && !isDoseableCategory(category)) return false;
    return !opts.scope || opts.scope.includes(category);
  });
  if (inScope.length === 0) {
    const m = matches[0];
    const cat = categoryOfMaterial(m).toLowerCase().replace(/_/g, " ");
    throw new Error(
      opts.doseableOnly
        ? `"${materialDisplayName(m)}" is a ${cat} material - it cannot be dosed into wine.`
        : `"${materialDisplayName(m)}" (${cat}) is not a valid supply for this task.`,
    );
  }
  if (inScope.length > 1) {
    throw new Error(`Several materials match "${ref}": ${inScope.map((m) => `${materialDisplayName(m)} (${m.id.slice(0, 6)})`).join(", ")}.`);
  }
  return inScope[0];
}

/** Additions/fining: doseable additives only (WORKORDER-3). */
function matchMaterial(all: CellarMaterialDTO[], ref: string): CellarMaterialDTO {
  return matchMaterialByRef(all, ref, { scope: materialScopeForTask({ opType: "ADDITION" }), doseableOnly: true });
}

/** Plan 055a: packaging materials for a BOTTLE task — PACKAGING (+ generic OTHER) scope, never dosed. */
function matchPackaging(all: CellarMaterialDTO[], ref: string): CellarMaterialDTO {
  return matchMaterialByRef(all, ref, { scope: materialScopeForTask({ opType: "BOTTLE" }) });
}

/** Plan 055a: "our standard packaging" → the packaging BoM (materialId + per + factor) from THIS SKU's
 * most-recent bottling WO task. Returns [] when no prior run exists (→ the assistant authors the bottling
 * task with no packaging and tells the user to set it in the builder). qty is re-derived by the caller. */
async function lastRunPackagingForSku(skuName: string): Promise<Omit<PackagingPlanLine, "qty">[]> {
  const key = skuName.trim().toLowerCase();
  if (!key) return [];
  const recent = await prisma.workOrderTask.findMany({
    where: { opType: "BOTTLE" },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { plannedPayload: true },
  });
  for (const t of recent) {
    const p = (t.plannedPayload ?? {}) as { skuName?: unknown; packaging?: unknown };
    if (typeof p.skuName !== "string" || p.skuName.trim().toLowerCase() !== key) continue;
    if (!Array.isArray(p.packaging) || p.packaging.length === 0) continue;
    const lines = (p.packaging as Record<string, unknown>[])
      .map((l) => ({
        materialId: typeof l.materialId === "string" ? l.materialId : "",
        per: l.per === "case" ? ("case" as const) : ("bottle" as const),
        factor: typeof l.factor === "number" && l.factor > 0 ? l.factor : 1,
      }))
      .filter((l) => l.materialId);
    if (lines.length) return lines;
  }
  return [];
}

/** Map a natural-language select value onto a task type's controlled vocabulary (case/diacritic-
 * insensitive) so "14 C" -> "°C" and "argon" -> "Argon". Falls back to the raw value when nothing matches
 * (the readiness core then blocks it, surfacing the mismatch). */
function matchSelectValue(taskType: string, field: string, raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const options = TASK_VOCABULARY[taskType]?.fieldOptions?.[field];
  if (!options) return raw;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const n = norm(raw);
  return (options as readonly string[]).find((o) => norm(o) === n) ?? raw;
}

/** D14: match a NOTE title against the tenant's record-only Custom Logs. Returns the user task-type code
 * when the title equals the code or label, or the label appears as a whole substring of the title
 * ("log a barrel weigh on T1" -> BARREL_WEIGH). Conservative on purpose: only user-defined (NOTE-shaped)
 * types are candidates, so a match can never author a governed op. */
function matchUserTaskType(vocab: ResolvedTaskVocabulary, title: string): string | null {
  const t = title.trim().toLowerCase();
  if (!t) return null;
  for (const [code, def] of Object.entries(vocab)) {
    if (!def.isUserDefined) continue;
    const label = def.label.trim().toLowerCase();
    if (t === code.toLowerCase() || t === label || (label.length >= 3 && t.includes(label))) return code;
  }
  return null;
}

type ObservationTarget = { lotId: string; lotCode: string; vesselId?: string; vesselLabel?: string };

/** Resolve a lot/vessel observation target (shared by PANEL + BRIX). A blended or empty vessel throws so
 * the model asks for one lot; an empty vessel that an earlier rack fills binds to that planned lot. */
async function resolveObservationTarget(
  intent: { lot?: string; vessel?: string },
  plannedLotByVesselId: Map<string, { id: string; code: string }>,
  label: string,
): Promise<ObservationTarget> {
  if (intent.lot) {
    const t = await resolveLotTarget({ lot: intent.lot });
    return { lotId: t.lotId, lotCode: t.lotCode };
  }
  if (intent.vessel) {
    const vessel = await resolveVesselState(intent.vessel);
    if (vessel.lots.length === 1) return { lotId: vessel.lots[0].id, lotCode: vessel.lots[0].code, vesselId: vessel.id, vesselLabel: vessel.label };
    if (vessel.lots.length === 0 && plannedLotByVesselId.has(vessel.id)) {
      const planned = plannedLotByVesselId.get(vessel.id)!;
      return { lotId: planned.id, lotCode: planned.code, vesselId: vessel.id, vesselLabel: vessel.label };
    }
    if (vessel.lots.length > 1) throw new Error(`${vessel.label} holds a blend (${vessel.lots.map((l) => l.code).join(", ")}) - which lot is this ${label} for?`);
    throw new Error(`${vessel.label} is empty - there is no lot to attach this ${label} to.`);
  }
  throw new Error(`This ${label} needs a lot or vessel.`);
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
  // D14: resolve the tenant vocabulary once (only if a NOTE intent might name a Custom Log) so the assistant
  // can author a tenant's record-only Custom Log by name. Skipped entirely when there are no NOTE intents.
  const userVocab = draft.intents.some((i) => i.kind === "NOTE") ? await resolveTaskVocabulary() : null;

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
        ...(intent.rackType ? { rackType: matchSelectValue("RACK", "rackType", intent.rackType) } : {}),
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

    if (intent.kind === "BARREL_DOWN") {
      const src = await resolveVesselState(intent.from);
      const members = (await resolveGroupMembers(intent.toGroup)).filter((m) => m.id !== src.id);
      if (members.length === 0) throw new Error("A barrel-down needs at least one destination barrel.");
      const lossL = intent.lossL ?? 0;
      const groupRack = {
        direction: "BARREL_DOWN" as const,
        sourceVesselId: src.id,
        destVesselIds: members.map((m) => m.id),
        ...(intent.drawL != null ? { drawL: intent.drawL } : {}),
        ...(lossL > 0 ? { lossL } : {}),
        memberCodes: members.map((m) => m.code),
      };
      const values = { sourceVesselId: src.id, groupRack, ...(intent.note ? { note: intent.note } : {}) };
      taskBuilds.push({ taskType: "GROUP_RACK", title: `Barrel down ${src.label} to ${members.length} ${members.length === 1 ? "barrel" : "barrels"}`, values, taskKey: randomUUID() });
      tasks.push({
        seq,
        kind: "BARREL_DOWN",
        title: `Barrel down ${src.label}`,
        summary: `${src.label} → ${members.length} ${members.length === 1 ? "barrel" : "barrels"} (${members[0].code}…${members.at(-1)!.code})${lossL > 0 ? `, ${lossL} L loss` : ""}`,
        entities: [{ role: "source", label: src.label, id: src.id }],
        members: members.map((m) => ({ id: m.id, label: m.label, detail: `${m.volumeL}/${m.capacityL} L` })),
      });
      continue;
    }

    if (intent.kind === "RACK_TO_TANK") {
      const dest = await resolveVesselState(intent.to);
      const members = (await resolveGroupMembers(intent.fromGroup)).filter((m) => m.id !== dest.id);
      if (members.length === 0) throw new Error("Racking barrels to a tank needs at least one source barrel.");
      const lossL = intent.lossL ?? 0;
      const groupRack = {
        direction: "RACK_TO_TANK" as const,
        destVesselId: dest.id,
        sourceVesselIds: members.map((m) => m.id),
        ...(lossL > 0 ? { lossL } : {}),
        memberCodes: members.map((m) => m.code),
      };
      const values = { destVesselId: dest.id, groupRack, ...(intent.note ? { note: intent.note } : {}) };
      taskBuilds.push({ taskType: "GROUP_RACK", title: `Rack ${members.length} ${members.length === 1 ? "barrel" : "barrels"} to ${dest.label}`, values, taskKey: randomUUID() });
      tasks.push({
        seq,
        kind: "RACK_TO_TANK",
        title: `Rack barrels to ${dest.label}`,
        summary: `${members.length} ${members.length === 1 ? "barrel" : "barrels"} (${members[0].code}…${members.at(-1)!.code}) → ${dest.label}${lossL > 0 ? `, ${lossL} L loss` : ""}`,
        entities: [{ role: "destination", label: dest.label, id: dest.id }],
        members: members.map((m) => ({ id: m.id, label: m.label, detail: `${m.volumeL} L` })),
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

    if (intent.kind === "PANEL" || intent.kind === "BRIX" || intent.kind === "SAMPLE_PULL") {
      const noun = intent.kind === "PANEL" ? "panel" : intent.kind === "SAMPLE_PULL" ? "sample" : "Brix reading";
      const target = await resolveObservationTarget(intent, plannedLotByVesselId, noun);
      const values: Record<string, unknown> = { lotId: target.lotId, ...(target.vesselId ? { vesselId: target.vesselId } : {}), ...(intent.note ? { note: intent.note } : {}) };
      if (intent.kind === "SAMPLE_PULL") {
        if (intent.lab) values.lab = intent.lab;
        if (intent.sendNow) values.sendNow = true;
      }
      const title = intent.kind === "PANEL" ? `Pull panel - ${target.lotCode}` : intent.kind === "SAMPLE_PULL" ? `Pull sample - ${target.lotCode}` : `Brix - ${target.lotCode}`;
      const displayTitle = intent.kind === "PANEL" ? intent.panelName ?? "Chem panel" : intent.kind === "SAMPLE_PULL" ? `Pull${intent.sendNow ? "/send" : ""} sample` : "Brix reading";
      taskBuilds.push({ taskType: intent.kind, title, values, taskKey: randomUUID() });
      tasks.push({
        seq,
        kind: intent.kind,
        title: displayTitle,
        summary: `${displayTitle} for lot ${target.lotCode}${intent.kind === "SAMPLE_PULL" && intent.lab ? ` (${intent.lab})` : ""}`,
        entities: [
          { role: "lot", label: target.lotCode, id: target.lotId },
          ...(target.vesselId && target.vesselLabel ? [{ role: "vessel", label: target.vesselLabel, id: target.vesselId }] : []),
        ],
      });
      continue;
    }

    if (intent.kind === "TOPPING") {
      const [from, to] = await Promise.all([resolveVesselState(intent.from), resolveVesselState(intent.to)]);
      if (intent.volumeL != null) {
        plannedVolumeDeltaByVesselId.set(from.id, ROUND((plannedVolumeDeltaByVesselId.get(from.id) ?? 0) - intent.volumeL));
        plannedVolumeDeltaByVesselId.set(to.id, ROUND((plannedVolumeDeltaByVesselId.get(to.id) ?? 0) + intent.volumeL));
      }
      const values = { fromVesselId: from.id, toVesselId: to.id, ...(intent.volumeL != null ? { volumeL: intent.volumeL } : {}), ...(intent.note ? { note: intent.note } : {}) };
      taskBuilds.push({ taskType: "TOPPING", title: `Top ${to.label} from ${from.label}`, values, taskKey: randomUUID() });
      tasks.push({ seq, kind: "TOPPING", title: `Top ${to.label}`, summary: `${intent.volumeL != null ? `${intent.volumeL} L ` : ""}from ${from.label} to ${to.label}`, entities: [{ role: "from", label: from.label, id: from.id }, { role: "to", label: to.label, id: to.id }] });
      continue;
    }

    if (intent.kind === "FILTRATION") {
      const vessel = await resolveVesselState(intent.vessel);
      const values = { vesselId: vessel.id, ...(intent.filterType ? { filterType: matchSelectValue("FILTRATION", "filterType", intent.filterType) } : {}), ...(intent.micron != null ? { micron: intent.micron } : {}), ...(intent.note ? { note: intent.note } : {}) };
      taskBuilds.push({ taskType: "FILTRATION", title: `Filter ${vessel.label}`, values, taskKey: randomUUID() });
      tasks.push({ seq, kind: "FILTRATION", title: `Filter ${vessel.label}`, summary: `Filter ${vessel.label}${intent.filterType ? ` through ${intent.filterType}` : ""}${intent.micron != null ? ` (${intent.micron} µm)` : ""}`, entities: [{ role: "vessel", label: vessel.label, id: vessel.id }] });
      continue;
    }

    if (intent.kind === "CAP_MGMT") {
      const vessel = await resolveVesselState(intent.vessel);
      const values = { vesselId: vessel.id, ...(intent.technique ? { technique: matchSelectValue("CAP_MGMT", "technique", intent.technique) } : {}), ...(intent.durationMin != null ? { durationMin: intent.durationMin } : {}), ...(intent.note ? { note: intent.note } : {}) };
      taskBuilds.push({ taskType: "CAP_MGMT", title: `Cap work on ${vessel.label}`, values, taskKey: randomUUID() });
      tasks.push({ seq, kind: "CAP_MGMT", title: `Cap management`, summary: `${intent.technique ?? "Cap work"} on ${vessel.label}${intent.durationMin != null ? ` for ${intent.durationMin} min` : ""}`, entities: [{ role: "vessel", label: vessel.label, id: vessel.id }] });
      continue;
    }

    if (intent.kind === "TEMP_SETPOINT") {
      const vessel = await resolveVesselState(intent.vessel);
      const values = { vesselId: vessel.id, ...(intent.targetValue != null ? { targetValue: intent.targetValue } : {}), ...(intent.targetUnit ? { targetUnit: matchSelectValue("TEMP_SETPOINT", "targetUnit", intent.targetUnit) } : {}), ...(intent.note ? { note: intent.note } : {}) };
      taskBuilds.push({ taskType: "TEMP_SETPOINT", title: `Set ${vessel.label} temperature`, values, taskKey: randomUUID() });
      tasks.push({ seq, kind: "TEMP_SETPOINT", title: `Temperature setpoint`, summary: `Set ${vessel.label}${intent.targetValue != null ? ` to ${intent.targetValue}${intent.targetUnit ?? ""}` : ""}`, entities: [{ role: "vessel", label: vessel.label, id: vessel.id }] });
      continue;
    }

    if (intent.kind === "CLEAN" || intent.kind === "SANITIZE" || intent.kind === "STEAM" || intent.kind === "OZONE" || intent.kind === "GAS" || intent.kind === "SO2" || intent.kind === "WET_STORAGE") {
      const vessel = await resolveVesselState(intent.vessel);
      // Only keep fields this maintenance type actually declares — STEAM has no material/amount, OZONE only
      // duration, etc. Prevents leaking an unsupported (and un-costed) materialId into the task payload.
      const fields = TASK_VOCABULARY[intent.kind].fields;
      let material: CellarMaterialDTO | null = null;
      if (intent.material && "materialId" in fields) {
        material = matchMaterialByRef(await listMaterials(), intent.material, { scope: materialScopeForTask({ activityType: intent.kind }) });
      }
      const candidate: Record<string, unknown> = {
        vesselId: vessel.id,
        ...(material ? { materialId: material.id } : {}),
        ...(intent.amount != null ? { amount: intent.amount } : {}),
        ...(intent.gasType ? { gasType: matchSelectValue(intent.kind, "gasType", intent.gasType) } : {}),
        ...(intent.so2Method ? { so2Method: matchSelectValue(intent.kind, "so2Method", intent.so2Method) } : {}),
        ...(intent.durationMin != null ? { durationMin: intent.durationMin } : {}),
        ...(intent.note ? { note: intent.note } : {}),
      };
      const values = Object.fromEntries(Object.entries(candidate).filter(([k]) => k in fields));
      const verb = TASK_LABELS[intent.kind];
      taskBuilds.push({ taskType: intent.kind, title: `${verb} ${vessel.label}`, values, taskKey: randomUUID() });
      tasks.push({
        seq,
        kind: intent.kind,
        title: verb,
        summary: `${verb} ${vessel.label}${material ? ` with ${materialDisplayName(material)}` : ""}`,
        entities: [{ role: "vessel", label: vessel.label, id: vessel.id }, ...(material ? [{ role: "supply", label: materialDisplayName(material), id: material.id }] : [])],
      });
      continue;
    }

    if (intent.kind === "CRUSH") {
      let destVesselId: string | undefined;
      let destLabel: string | null = null;
      if (intent.destVessel) {
        const v = await resolveVesselState(intent.destVessel);
        destVesselId = v.id;
        destLabel = v.label;
      }
      // Thread the template-settable process defaults (captured by canonicalizeRawIntents) into
      // plannedPayload so CrushTaskForm prefills them — this is what makes "50% crushed" land in the
      // % crushed field instead of the form's 100% default. Run-time inputs (picks, measured volume)
      // are still floor-entered. plannedPayload is a direct pass-through of these values (see the
      // "without a field whitelist" note in actions.ts), and the keys match TASK_VOCABULARY.CRUSH.
      // CRUSH has no formal block binding (the block→pick→lot is chosen on the execute form at run time),
      // so a named lot/block only stamps the title + instructions to tell the crew which fruit to pull.
      const block = intent.block?.trim() || null;
      const title = block ? `De-stem / crush — ${block}` : "De-stem / crush";
      const noteWithBlock = block
        ? `Fruit: ${block}.${intent.note ? ` ${intent.note}` : ""}`
        : intent.note;
      const values = {
        ...(destVesselId ? { destVesselId } : {}),
        ...(intent.destemmed != null ? { destemmed: intent.destemmed } : {}),
        ...(intent.crusherOn != null ? { crusherOn: intent.crusherOn } : {}),
        ...(intent.crushedPct != null ? { crushedPct: intent.crushedPct } : {}),
        ...(intent.mustTempC != null ? { mustTempC: intent.mustTempC } : {}),
        ...(intent.pressCycle ? { pressCycle: intent.pressCycle } : {}),
        ...(noteWithBlock ? { note: noteWithBlock } : {}),
      };
      taskBuilds.push({ taskType: "CRUSH", title, values, taskKey: randomUUID() });
      tasks.push({ seq, kind: "CRUSH", title, summary: `Crush${block ? ` ${block}` : ""}${destLabel ? ` to ${destLabel}` : ""}; picks and measured volume entered on the floor`, entities: destVesselId && destLabel ? [{ role: "destination", label: destLabel, id: destVesselId }] : [] });
      continue;
    }

    if (intent.kind === "PRESS") {
      const op = matchSelectValue("PRESS", "op", intent.op);
      const source = await resolvePressSource(intent);
      let plannedDest: { id: string; label: string } | null = null;
      if (intent.destVessel) {
        const dest = await resolveVesselState(intent.destVessel);
        plannedDest = { id: dest.id, label: dest.label };
      }
      const values = {
        ...(source ? { parentLotId: source.lotId, sourceVesselId: source.vesselId } : {}),
        ...(source ? { plannedSourceVesselLabel: source.vesselLabel, plannedSourceLotCode: source.lotCode } : {}),
        ...(plannedDest ? { plannedDestVesselId: plannedDest.id, plannedDestVesselLabel: plannedDest.label } : {}),
        ...(op ? { op } : {}),
        ...(intent.pressCycle ? { pressCycle: intent.pressCycle } : {}),
        ...(intent.note ? { note: intent.note } : {}),
      };
      const title = op === "SAIGNEE" ? "Saignee" : "Press";
      taskBuilds.push({ taskType: "PRESS", title, values, taskKey: randomUUID() });
      tasks.push({
        seq,
        kind: "PRESS",
        title,
        summary: source
          ? `${title} ${source.lotCode} from ${source.vesselLabel}${plannedDest ? `; destination hint ${plannedDest.label}` : ""}; fractions and volumes entered on the floor`
          : "Must lot, source vessel and press fractions entered on the floor",
        entities: [
          ...(source ? [{ role: "source", label: source.vesselLabel, id: source.vesselId }, { role: "lot", label: source.lotCode, id: source.lotId }] : []),
          ...(plannedDest ? [{ role: "planned destination", label: plannedDest.label, id: plannedDest.id }] : []),
        ],
      });
      continue;
    }

    if (intent.kind === "HARVEST_WEIGH_IN") {
      // A resolved blockId (pinned by the tool layer) flows to WorkOrderTask.blockId via canonicalColumns
      // and prefills the weigh-in execute screen's block picker. Weights + confirmation are still
      // floor-entered; blockId is a runtime field so it never blocks readiness (proposal-readiness.ts).
      const values = {
        ...(intent.blockId ? { blockId: intent.blockId } : {}),
        ...(intent.note ? { note: intent.note } : {}),
      };
      taskBuilds.push({ taskType: "HARVEST_WEIGH_IN", title: "Fruit intake / weigh-in", values, taskKey: randomUUID() });
      tasks.push({ seq, kind: "HARVEST_WEIGH_IN", title: "Fruit intake / weigh-in", summary: `Weigh in fruit${intent.block ? ` (${intent.block})` : ""}; block${intent.blockId ? " prefilled," : " and"} weights entered on the floor`, entities: [] });
      continue;
    }

    if (intent.kind === "BOTTLE") {
      // Author-only (BOTTLE is TASK_COVERAGE "runtime"): source vessels, final bottle count, measured ABV,
      // and destination are floor-entered on BottlingTaskForm. A named vessel is a display hint for the
      // summary only. The packaging BoM + planned bottle count are captured here (Plan 055a / 056).
      const skuName = intent.skuName?.trim() || null;
      const skuVintage = intent.skuVintage;
      const plannedBottles = intent.cases != null ? Math.round(intent.cases * 12) : intent.bottles != null ? Math.round(intent.bottles) : null;

      // Resolve the packaging lines per J1: named items → resolve each (PACKAGING/OTHER scope, `#id` pins
      // survive from a choice-token); else "standard" → copy this SKU's last run; else none. qty derives
      // from the planned bottle count × factor (0 when the count is unknown — the floor enters actuals).
      let packagingLines: { materialId: string; per: "bottle" | "case"; factor: number }[] = [];
      const packagingEntities: { role: string; label: string; id: string }[] = [];
      if (intent.packaging && intent.packaging.length > 0) {
        const all = await listMaterials();
        for (const ref of intent.packaging) {
          const m = matchPackaging(all, ref);
          const g = guessPackagingFactor(materialDisplayName(m), m.kind);
          packagingLines.push({ materialId: m.id, per: g.per, factor: g.factor });
          packagingEntities.push({ role: "packaging", label: materialDisplayName(m), id: m.id });
        }
      } else if (intent.standardPackaging && skuName) {
        packagingLines = await lastRunPackagingForSku(skuName);
      }
      const packaging = packagingLines.map((l) => ({ ...l, qty: plannedBottles != null ? theoreticalConsumption(l, plannedBottles) : 0 }));

      const skuLabel = skuName ? `${skuName}${skuVintage != null ? ` ${skuVintage}` : ""}` : "the finished wine";
      const title = skuName ? `Bottle ${skuLabel}` : "Bottling";
      const values = {
        ...(skuName ? { skuName } : {}),
        ...(skuVintage != null ? { skuVintage } : {}),
        ...(plannedBottles != null ? { packagingBottles: plannedBottles } : {}),
        ...(packaging.length ? { packaging } : {}),
        ...(intent.note ? { note: intent.note } : {}),
      };
      taskBuilds.push({ taskType: "BOTTLE", title, values, taskKey: randomUUID() });
      const caseText = plannedBottles != null ? ` ~${Math.ceil(plannedBottles / 12)} cases (${plannedBottles} bottles)` : "";
      const pkgText = packaging.length
        ? `; packaging: ${packagingEntities.length ? packagingEntities.map((e) => e.label).join(", ") : `${packaging.length} line(s) from the last run`}`
        : intent.standardPackaging
          ? "; no prior run to copy packaging from — add it in the builder"
          : "";
      tasks.push({
        seq,
        kind: "BOTTLE",
        title,
        summary: `Bottle ${skuLabel}${caseText}${intent.vessel ? ` from ${intent.vessel}` : ""}${pkgText}. Source vessels, final count, ABV and destination entered on the floor.`,
        entities: packagingEntities,
      });
      continue;
    }

    if (intent.kind === "NOTE") {
      // D14 custom-type fluency: if the note names one of the tenant's record-only Custom Logs, author THAT
      // type. resolveTaskVocabulary re-asserts user types stay NOTE-shaped (never a governed op), so this can
      // never let the assistant author a ledger/observation task from a user type. Otherwise a plain NOTE.
      const userType = userVocab ? matchUserTaskType(userVocab, intent.title) : null;
      const taskType = userType ?? "NOTE";
      taskBuilds.push({ taskType, title: intent.title, values: { ...(intent.note ? { note: intent.note } : {}) }, taskKey: randomUUID() });
      tasks.push({ seq, kind: "NOTE", title: intent.title, summary: intent.note ?? intent.title, entities: [] });
      continue;
    }
  }
  return { tasks, taskBuilds };
}

// Shared compute: resolve the NL draft to canonical builds + run the readiness engine ONCE. Callers decide
// whether to gate the signed taskBuilds (the assistant commit path) or hand them back raw (the builder draft
// path). `rawTaskBuilds` is the un-gated resolved set — safe to hydrate into the builder for editing because
// createWorkOrderFromBuildsAction re-instantiates and re-runs the readiness gate server-side before persist.
async function computeNlProposal(raw: unknown): Promise<{ proposal: WorkOrderProposal; rawTaskBuilds: TaskBuild[] }> {
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
  const proposal: WorkOrderProposal = {
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
  return { proposal, rawTaskBuilds: taskBuilds };
}

async function buildInner(raw: unknown): Promise<WorkOrderProposal> {
  return (await computeNlProposal(raw)).proposal;
}

export async function buildNlWorkOrderProposal(raw: unknown, opts?: { tenantId?: string }): Promise<WorkOrderProposal> {
  if (opts?.tenantId) return runAsTenant(opts.tenantId, () => buildInner(raw));
  return buildInner(raw);
}

/** D14 draft-into-builder contract: resolve NL text to editable taskBuilds + readiness diagnostics WITHOUT
 * the commit gate. Returns the raw resolved builds (even when the proposal isn't fully ready) so the builder
 * can hydrate them as an editable draft; the user fixes anything unresolved and the create action re-runs the
 * shared readiness gate. Vocabulary is tenant-resolved, so a named Custom Log resolves to its NOTE type. */
export type NlBuilderDraft = {
  status: WorkOrderProposal["status"];
  title: string;
  taskBuilds: TaskBuild[];
  unresolved: WorkOrderProposal["unresolved"];
  warnings: WorkOrderProposal["warnings"];
};
export async function draftNlWorkOrderForBuilder(raw: unknown, opts?: { tenantId?: string }): Promise<NlBuilderDraft> {
  const run = async (): Promise<NlBuilderDraft> => {
    const { proposal, rawTaskBuilds } = await computeNlProposal(raw);
    return {
      status: proposal.status,
      title: proposal.title,
      taskBuilds: rawTaskBuilds,
      unresolved: proposal.unresolved,
      warnings: proposal.warnings,
    };
  };
  if (opts?.tenantId) return runAsTenant(opts.tenantId, run);
  return run();
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
  await assertPinnedPressSourcesFresh(args.taskBuilds);
}

async function assertPinnedPressSourcesFresh(taskBuilds: TaskBuild[]): Promise<void> {
  for (const task of taskBuilds) {
    if (task.taskType !== "PRESS") continue;
    const parentLotId = typeof task.values.parentLotId === "string" ? task.values.parentLotId : null;
    const sourceVesselId = typeof task.values.sourceVesselId === "string" ? task.values.sourceVesselId : null;
    if (!parentLotId || !sourceVesselId) continue;
    const row = await prisma.vesselLot.findFirst({
      where: { lotId: parentLotId, vesselId: sourceVesselId },
      select: { lot: { select: { code: true, form: true, status: true } }, vessel: { select: { code: true, type: true } } },
    });
    if (!row || !isPressableLotState(row.lot)) {
      const vessel = row ? vesselLabel({ type: row.vessel.type, code: row.vessel.code }) : "that source vessel";
      throw new Error(`This press work-order proposal is stale: ${vessel} no longer holds the pinned active MUST lot. Regenerate it from current cellar contents.`);
    }
  }
}

export function dueAtFromCommitArgs(args: Pick<NlWorkOrderCommitArgs, "dueDate">): Date | null {
  return dateOrNull(args.dueDate);
}
