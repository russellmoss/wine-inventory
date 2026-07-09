import type { LotForm } from "@/lib/ledger/vocabulary";

export const MIGRATION_BATCH_STATUSES = [
  "DRAFT",
  "PREFLIGHT_BLOCKED",
  "READY_FOR_REVIEW",
  "SIGNED_OFF",
  "PUBLISHED",
  "DISCARDED",
] as const;
export type MigrationBatchStatus = (typeof MIGRATION_BATCH_STATUSES)[number];

export const RECONCILIATION_KINDS = [
  "VESSEL_VOLUME",
  "LOT_VOLUME",
  "LOT_COST",
  "FINISHED_GOODS",
  "TTB_TOTAL",
  "CHEMISTRY_COUNT",
  "UNMAPPED_ENTITY",
  "PARTIAL_LINEAGE",
  "PARSE_DIAGNOSTIC",
] as const;
export type ReconciliationKind = (typeof RECONCILIATION_KINDS)[number];

export type ReconciliationSeverity = "INFO" | "WARNING" | "BLOCKER";
export type ReconciliationStatus = "OPEN" | "RESOLVED" | "ACCEPTED";
export type CostCompleteness = "KNOWN" | "PARTIAL" | "UNKNOWN";

export type NormalizedSeedLot = {
  sourceLotKey: string;
  sourceSystemId?: string | null;
  code: string;
  displayName?: string | null;
  form: LotForm;
  productType?: "WINE" | "HARD_CIDER" | null;
  carbonation?: "NONE" | "NATURAL" | "ARTIFICIAL" | null;
  declaredTaxClass?: string | null;
  vintageYear?: number | null;
  originVineyardName?: string | null;
  originBlockName?: string | null;
  originVarietyName?: string | null;
  legacySnapshot?: Record<string, unknown> | null;
};

export type NormalizedSeedPosition = {
  sourcePositionKey: string;
  sourceLotKey: string;
  sourceVesselKey: string;
  vesselCode: string;
  accountType: "VESSEL";
  volumeL: number;
  bondKey?: string | null;
  costAmount?: number | null;
  costCurrency?: string | null;
  costCompleteness: CostCompleteness;
};

export type NormalizedLegacyOperation = {
  sourceDataset?: string | null;
  sourceObjectType?: string | null;
  sourceActionId: string;
  sourceActionType: string;
  subjectType?: string | null;
  occurredAt?: Date | null;
  sourceLotKey?: string | null;
  lotCode?: string | null;
  sourceVesselKey?: string | null;
  vesselCode?: string | null;
  volume?: number | null;
  volumeUnit?: string | null;
  canonicalVolumeL?: number | null;
  costAmount?: number | null;
  costCurrency?: string | null;
  actorName?: string | null;
  note?: string | null;
  evidenceRef?: string | null;
  normalizedPayload?: Record<string, unknown> | null;
  rawEvidence?: Record<string, unknown> | null;
};

export type NormalizedAnalysisReading = {
  sourcePanelKey: string;
  sourceReadingKey?: string | null;
  sourceLotKey: string;
  sourceVesselKey?: string | null;
  observedAt: Date;
  enteredByEmail?: string | null;
  note?: string | null;
  analyte: string;
  value: number;
  unit: string;
};

export type MappingSuggestion = {
  sourceDataset: string;
  sourceObjectType: string;
  sourceField: string;
  targetField: string;
  confidence: number;
};

export type ParseDiagnostic = {
  kind: ReconciliationKind;
  subjectType: string;
  subjectKey: string;
  label: string;
  severity: ReconciliationSeverity;
  message: string;
  expectedValue?: number | null;
  actualValue?: number | null;
  deltaValue?: number | null;
  unit?: string | null;
};

export type GenericFixtureBundle = {
  manifest: Record<string, unknown>;
  lots: NormalizedSeedLot[];
  positions: NormalizedSeedPosition[];
  legacyOperations: NormalizedLegacyOperation[];
  analysisReadings: NormalizedAnalysisReading[];
  diagnostics: ParseDiagnostic[];
  suggestions: MappingSuggestion[];
  expectedFieldMappings: { sourceDataset: string; sourceObjectType: string; sourceField: string; targetField: string }[];
};
