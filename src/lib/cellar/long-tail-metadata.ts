import type { OperationType } from "@/lib/ledger/vocabulary";

export const LONG_TAIL_CANDIDATES = ["DRAIN", "DELESTAGE", "COLD_STAB", "CUSTOM"] as const;
export type LongTailCandidate = (typeof LONG_TAIL_CANDIDATES)[number];

export type LongTailRoute = OperationType | "WORK_ORDER" | "NO_LEDGER_OP";

export type LongTailDecision = {
  candidate: LongTailCandidate;
  defaultRoute: LongTailRoute;
  recordsLedgerOperation: boolean;
  decision: string;
  compliance: string;
};

export const LONG_TAIL_DECISIONS: readonly LongTailDecision[] = [
  {
    candidate: "DRAIN",
    defaultRoute: "LOSS",
    recordsLedgerOperation: true,
    decision: "Drain-to-waste records as LOSS with reason dump; drain-to-move remains RACK and drain-to-remove remains DEPLETE/removal.",
    compliance: "LOSS/dump maps through the existing loss form-map path; no new OperationType is needed.",
  },
  {
    candidate: "DELESTAGE",
    defaultRoute: "WORK_ORDER",
    recordsLedgerOperation: false,
    decision: "Delestage is a linked rack-out/rack-back workflow, not a single ledger op.",
    compliance: "Each rack remains internal/in-bond unless the real rack event records loss.",
  },
  {
    candidate: "COLD_STAB",
    defaultRoute: "WORK_ORDER",
    recordsLedgerOperation: false,
    decision: "Cold stabilization is a process/work-order step unless a measured loss, material addition, or filtration is recorded separately.",
    compliance: "The process step itself is non-reportable; any real loss/addition uses its existing op family.",
  },
  {
    candidate: "CUSTOM",
    defaultRoute: "LOSS",
    recordsLedgerOperation: true,
    decision: "Custom is a controlled label on a chosen existing balanced line shape; v1 supports the LOSS shape.",
    compliance: "The selected underlying operation owns compliance mapping; the custom label is display/search metadata only.",
  },
];

export type LongTailMetadataMarker = {
  candidate: LongTailCandidate;
  route: LongTailRoute;
  label: string;
  lineShape?: OperationType;
  decision: string;
};

function metadataObject(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {};
}

export function normalizeOperationLabel(value: unknown, field = "Label"): string {
  if (typeof value !== "string") throw new Error(`${field} is required.`);
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error(`${field} is required.`);
  return trimmed.slice(0, 80);
}

export function withLongTailMetadata(metadata: unknown, marker: LongTailMetadataMarker): Record<string, unknown> {
  const base = metadataObject(metadata);
  base.longTail = marker;
  if (marker.candidate === "CUSTOM") base.customLabel = marker.label;
  return base;
}

export function operationLongTailMarker(metadata: unknown): LongTailMetadataMarker | null {
  const base = metadataObject(metadata);
  const marker = base.longTail;
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) return null;
  const raw = marker as Record<string, unknown>;
  const candidate = raw.candidate;
  const route = raw.route;
  const label = raw.label;
  if (typeof candidate !== "string" || !(LONG_TAIL_CANDIDATES as readonly string[]).includes(candidate)) return null;
  if (typeof route !== "string") return null;
  if (typeof label !== "string" || !label.trim()) return null;
  return {
    candidate: candidate as LongTailCandidate,
    route: route as LongTailRoute,
    label: label.trim(),
    lineShape: typeof raw.lineShape === "string" ? (raw.lineShape as OperationType) : undefined,
    decision: typeof raw.decision === "string" ? raw.decision : "",
  };
}

export function operationCustomLabel(metadata: unknown): string | null {
  const base = metadataObject(metadata);
  const value = base.customLabel;
  if (typeof value === "string" && value.trim()) return value.trim();
  const marker = operationLongTailMarker(metadata);
  return marker?.candidate === "CUSTOM" ? marker.label : null;
}

export function operationDisplayLabel(metadata: unknown): string | null {
  return operationCustomLabel(metadata) ?? operationLongTailMarker(metadata)?.label ?? null;
}
