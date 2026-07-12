import type { TaskTypeDef } from "@/lib/work-orders/template-vocabulary";

// Plan 053 C12: per-tenant DISPLAY overlays on BUILT-IN task types (hide / relabel / reorder fields).
// Pure + client-safe (no server imports) so the admin editor + resolver share it. The safety property: an
// overlay may hide ONLY fields on the per-type HIDEABLE allowlist, and can NEVER change kind/opType — so a
// governed core never loses a field it reads. Anything not on the allowlist is un-hideable by construction.

export type OverlayRow = { baseTaskType: string; hiddenFields: string[]; relabels: Record<string, string>; fieldOrder: string[] };

// Whitelist of hideable fields per built-in task-type key. Unlisted type → nothing hideable (safe default).
// Only clearly-optional / display fields are here; the fields a governed core requires are deliberately absent.
export const HIDEABLE_FIELDS_BY_TASK_TYPE: Record<string, readonly string[]> = {
  RACK: ["drawL", "lossL", "rackType", "note"],
  GROUP_RACK: ["note"],
  ADDITION: ["note"],
  FINING: ["note"],
  TOPPING: ["note"],
  FILTRATION: ["micron", "actualOutputL", "note"],
  CAP_MGMT: ["durationMin", "note"],
  BRIX: ["note"],
  PANEL: ["note"],
  SAMPLE_PULL: ["lab", "note"],
  TEMP_SETPOINT: ["achievedValue", "note"],
  CLEAN: ["materialId", "amount", "note"],
  SANITIZE: ["materialId", "amount", "note"],
  STEAM: ["note"],
  GAS: ["materialId", "amount", "note"],
  OZONE: ["note"],
  SO2: ["materialId", "amount", "note"],
  WET_STORAGE: ["note"],
  CRUSH: ["note"],
  PRESS: ["note"],
  HARVEST_WEIGH_IN: ["note"],
  NOTE: [],
};

export function hideableFieldsFor(baseTaskType: string): readonly string[] {
  return HIDEABLE_FIELDS_BY_TASK_TYPE[baseTaskType] ?? [];
}

/** Throw if an overlay tries to hide a field that isn't on the base type's hideable allowlist. */
export function assertOverlaySafe(baseTaskType: string, hiddenFields: string[]): void {
  const allowed = new Set(hideableFieldsFor(baseTaskType));
  for (const f of hiddenFields) {
    if (!allowed.has(f)) throw new Error(`Field "${f}" can't be hidden on ${baseTaskType} — a governed step needs it.`);
  }
}

/** PURE: apply a tenant overlay to a BUILT-IN def (hide → reorder → relabel). No-op for user-defined types.
 * Hiding is CLAMPED to the allowlist even here, so a stale/bad row can never strip a field a core requires. */
export function applyOverlay(def: TaskTypeDef, overlay: OverlayRow): TaskTypeDef {
  if (def.isUserDefined) return def;
  const allowed = new Set(hideableFieldsFor(overlay.baseTaskType));
  const hidden = new Set(overlay.hiddenFields.filter((f) => allowed.has(f)));
  const entries = Object.entries(def.fields).filter(([k]) => !hidden.has(k));
  const order = overlay.fieldOrder.filter((k) => entries.some(([ek]) => ek === k));
  entries.sort((a, b) => {
    const ia = order.indexOf(a[0]);
    const ib = order.indexOf(b[0]);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  const fields = Object.fromEntries(entries);
  const relabels = overlay.relabels ?? {};
  const fieldLabels = Object.keys(relabels).length ? { ...relabels } : undefined;
  return { ...def, fields, ...(fieldLabels ? { fieldLabels } : {}) };
}
