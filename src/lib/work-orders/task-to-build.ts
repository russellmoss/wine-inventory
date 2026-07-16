// Plan 071: the inverse of instantiateTaskBuilds — turn stored WorkOrderTask rows back into the builder's
// TaskBuild shape so the palette builder can reopen an existing work order for editing. The stored row does
// NOT keep the taskType key, so we reconstruct it from (kind, opType|observationType|activityType) via a
// reverse index over the resolved vocabulary, with two tiebreaks (RACK vs GROUP_RACK; plain NOTE vs a
// tenant Custom Log). Pure: takes rows + a resolved vocabulary + a per-task equipment map.

import type { ResolvedTaskVocabulary } from "@/lib/work-orders/template-vocabulary";
import { RESERVED_PAYLOAD_KEYS } from "@/lib/work-orders/payload-guard";
import { parseGroupActivityPayload } from "@/lib/work-orders/group-activity";
import type { CustomLogFieldSpec } from "@/lib/work-orders/custom-log-fields";

export type TaskRenderMode = "fields" | "group-form";

/** The minimal stored-task shape the reverse-mapper reads (structural — matches WorkOrderTaskView). */
export type StoredTaskLite = {
  id: string;
  seq: number;
  groupSeq: number;
  kind: string;
  status: string;
  title: string;
  opType: string | null;
  observationType: string | null;
  activityType: string | null;
  assigneeId: string | null;
  plannedPayload: unknown;
};

/** A builder task hydrated from an existing WO, plus the edit-mode metadata the builder/editor needs. */
export type EditableTaskBuild = {
  key: string; // stable client key — we use the existing task id
  existingTaskId: string;
  taskType: string;
  title: string;
  values: Record<string, unknown>;
  assigneeId: string; // "" when unassigned (builder convention)
  equipmentIds: string[];
  renderMode: TaskRenderMode;
  locked: boolean;
  lockReason: string | null;
};

export type EditableWorkOrderBuilds = {
  groups: EditableTaskBuild[][];
  anyLocked: boolean;
};

const discriminator = (kind: string, opType: string | null, obs: string | null, act: string | null) =>
  `${kind}|${opType ?? ""}|${obs ?? ""}|${act ?? ""}`;

/** Build a reverse index: discriminator string → the taskType keys that produce it. Most are 1:1; the two
 * known collisions are RACK/GROUP_RACK (OPERATION|RACK) and NOTE + every tenant Custom Log (NOTE|||). */
export function buildReverseTaskTypeIndex(vocab: ResolvedTaskVocabulary): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const [key, def] of Object.entries(vocab)) {
    const disc = discriminator(def.kind, def.opType ?? null, def.observationType ?? null, def.activityType ?? null);
    index.set(disc, [...(index.get(disc) ?? []), key]);
  }
  return index;
}

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Resolve a stored task back to its taskType key, or null when it can't be resolved (→ locked). */
export function resolveTaskType(task: StoredTaskLite, vocab: ResolvedTaskVocabulary, index: Map<string, string[]>): string | null {
  const payload = asRecord(task.plannedPayload);
  const candidates = index.get(discriminator(task.kind, task.opType, task.observationType, task.activityType)) ?? [];
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Collision 1: RACK vs GROUP_RACK — a group rack carries a `groupRack` payload block.
  if (candidates.includes("GROUP_RACK") || candidates.includes("RACK")) {
    return "groupRack" in payload && payload.groupRack ? "GROUP_RACK" : "RACK";
  }

  // Collision 2: plain NOTE vs a tenant Custom Log (all kind=NOTE, no discriminator). A Custom Log task
  // carries the framework-injected __fieldSchema snapshot; match its field keys to a Custom Log def.
  const schema = payload.__fieldSchema;
  if (Array.isArray(schema)) {
    const storedKeys = new Set((schema as CustomLogFieldSpec[]).map((f) => f?.key).filter(Boolean));
    const matches = candidates.filter((key) => {
      const def = vocab[key];
      if (!def?.isUserDefined || !def.customFields) return false;
      const defKeys = def.customFields.map((f) => f.key);
      return defKeys.length === storedKeys.size && defKeys.every((k) => storedKeys.has(k));
    });
    if (matches.length === 1) return matches[0];
  }
  // Ambiguous / plain note → the built-in NOTE (still fully editable; values round-trip).
  return candidates.includes("NOTE") ? "NOTE" : candidates[0];
}

/** values ≈ plannedPayload minus framework-owned keys (the builder never authored those). */
export function valuesFromPayload(plannedPayload: unknown): Record<string, unknown> {
  const payload = asRecord(plannedPayload);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (RESERVED_PAYLOAD_KEYS.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

/** A group barrel-down/rack (groupRack payload) or a consolidated group maintenance (member set) renders
 * via its own authoring form, not the generic field list. */
export function renderModeFor(taskType: string, plannedPayload: unknown): TaskRenderMode {
  const payload = asRecord(plannedPayload);
  if (taskType === "GROUP_RACK" || ("groupRack" in payload && payload.groupRack)) return "group-form";
  if (parseGroupActivityPayload(plannedPayload)) return "group-form";
  return "fields";
}

/** A task is editable ONLY while PENDING — any other status means it has been executed (wrote or owns a
 * ledger op / attempt) and its plan is immutable (WORKORDER-1). Reverse it to edit. */
export function isTaskEditable(task: StoredTaskLite): boolean {
  return task.status === "PENDING";
}

/** Convert a WO's stored tasks into grouped builder tasks + edit metadata. `equipmentByTask` maps a task id
 * to its advisory equipment ids (from WorkOrderTaskEquipment). Rows are grouped by groupSeq, ordered by seq. */
export function workOrderTasksToBuilds(
  tasks: StoredTaskLite[],
  vocab: ResolvedTaskVocabulary,
  equipmentByTask: Map<string, string[]>,
): EditableWorkOrderBuilds {
  const index = buildReverseTaskTypeIndex(vocab);
  const ordered = [...tasks].sort((a, b) => a.groupSeq - b.groupSeq || a.seq - b.seq);
  const byGroup = new Map<number, EditableTaskBuild[]>();
  let anyLocked = false;

  for (const task of ordered) {
    const taskType = resolveTaskType(task, vocab, index);
    const renderMode: TaskRenderMode = taskType ? renderModeFor(taskType, task.plannedPayload) : "fields";
    const editableStatus = isTaskEditable(task);
    let locked = false;
    let lockReason: string | null = null;
    if (!taskType) {
      locked = true;
      lockReason = "This task's type couldn't be resolved for editing.";
    } else if (!editableStatus) {
      locked = true;
      lockReason = "Already recorded — reverse it in the lot timeline to edit.";
    } else if (renderMode === "group-form") {
      // Group barrel-down/rack + multi-vessel maintenance carry a member-set payload the palette builder
      // can't author. Lock them so the member set is preserved untouched; recreate/reverse to change it.
      locked = true;
      lockReason = "Group tasks (barrel-down/rack, multi-vessel maintenance) can't be edited in the builder yet — recreate or reverse to change the member set.";
    }
    if (locked) anyLocked = true;

    const build: EditableTaskBuild = {
      key: task.id,
      existingTaskId: task.id,
      taskType: taskType ?? "NOTE",
      title: task.title,
      values: valuesFromPayload(task.plannedPayload),
      assigneeId: task.assigneeId ?? "",
      equipmentIds: equipmentByTask.get(task.id) ?? [],
      renderMode,
      locked,
      lockReason,
    };
    byGroup.set(task.groupSeq, [...(byGroup.get(task.groupSeq) ?? []), build]);
  }

  const groups = [...byGroup.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g);
  return { groups: groups.length ? groups : [[]], anyLocked };
}
