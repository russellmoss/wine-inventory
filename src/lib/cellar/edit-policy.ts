export const OPERATION_METADATA_EDIT_ALLOWED_FIELDS = ["supplementalNote"] as const;

export const OPERATION_METADATA_EDIT_FORBIDDEN_FIELDS = [
  "observedAt",
  "volumeL",
  "deltaL",
  "vesselId",
  "vesselIds",
  "lotId",
  "lotIds",
  "taxClass",
  "bondId",
  "sourceBondId",
  "destBondId",
  "materialName",
  "materialKind",
  "materialId",
  "rateValue",
  "rateBasis",
  "computedTotal",
  "durationMin",
  "bucket",
  "reason",
  "captureMethod",
  "type",
  "operationType",
  "cost",
  "costLines",
  "metadata",
  "lines",
  "treatments",
] as const;

const FORBIDDEN = new Set<string>(OPERATION_METADATA_EDIT_FORBIDDEN_FIELDS);
const ALLOWED = new Set<string>(["operationId", ...OPERATION_METADATA_EDIT_ALLOWED_FIELDS]);

export type OperationMetadataEditInput = {
  operationId: number;
  supplementalNote?: string | null;
};

export type OperationMetadataEditDecision =
  | { ok: true; supplementalNote: string | null }
  | { ok: false; field: string; reason: string };

export function operationSupplementalNote(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).supplementalNote;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeSupplementalNote(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 1000) : null;
}

export function validateOperationMetadataEdit(input: Record<string, unknown>): OperationMetadataEditDecision {
  for (const key of Object.keys(input)) {
    if (ALLOWED.has(key)) continue;
    if (FORBIDDEN.has(key)) {
      return { ok: false, field: key, reason: `${key} changes posting, fold, cost, compliance, or provenance data. Void and re-enter the operation instead.` };
    }
    return { ok: false, field: key, reason: `${key} is not a whitelisted metadata edit field.` };
  }

  if (!Object.prototype.hasOwnProperty.call(input, "supplementalNote")) {
    return { ok: false, field: "supplementalNote", reason: "Choose a whitelisted metadata field to edit." };
  }
  return { ok: true, supplementalNote: normalizeSupplementalNote(input.supplementalNote) };
}

export function withSupplementalNote(metadata: unknown, supplementalNote: string | null): Record<string, unknown> {
  const base = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {};
  if (supplementalNote) base.supplementalNote = supplementalNote;
  else delete base.supplementalNote;
  return base;
}
