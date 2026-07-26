// Spray Intelligence S3a — the DTO vocabulary for the spray family. PURE: no Prisma imports;
// every core in src/lib/spray/ declares row shapes with Decimals pre-coerced to number | null
// (the src/lib/weather/read-core.ts pattern), so pure cores never touch @prisma/client.
//
// Instants are JS Dates (UTC). Date-only values (plannedDate) cross EVERY boundary as ISO
// "YYYY-MM-DD" strings (KD-13 / council C6) — never a JS Date.

// ── enum unions (mirror prisma/schema.prisma — string unions so cores stay Prisma-free) ──

export type SprayApplicationMethod = "AIRBLAST" | "BOOM" | "HANDGUN" | "BACKPACK" | "CHEMIGATION" | "AERIAL" | "OTHER";
export type SprayRecordStatus = "ACTIVE" | "SUPERSEDED" | "VOIDED";
export type SprayCorrectionKind = "AMENDMENT" | "VOID";
export type SprayMaterialRole = "PESTICIDE" | "ADJUVANT" | "FERTILIZER" | "OTHER";
export type SprayAdjuvantClass =
  | "NONIONIC_SURFACTANT"
  | "ORGANOSILICONE_PENETRANT"
  | "CROP_OIL_CONCENTRATE"
  | "METHYLATED_SEED_OIL"
  | "STICKER_SPREADER"
  | "BUFFER_ACIDIFIER"
  | "WATER_CONDITIONER"
  | "DEFOAMER"
  | "OTHER";
export type SprayQuantityUnit = "GAL" | "QT" | "PT" | "FLOZ" | "LB" | "OZ" | "L" | "ML" | "KG" | "G";
export type SprayQuantityDimension = "VOLUME" | "MASS";
export type SprayQuantityBasis = "TOTAL_IN_TANK" | "PER_AREA" | "PER_CARRIER_VOLUME";
export type SprayMobilityClass = "CONTACT_PROTECTANT" | "TRANSLAMINAR" | "LOCALLY_SYSTEMIC" | "MOBILE_SYSTEMIC";
export type SprayFactsCompleteness = "KNOWN" | "PARTIAL" | "UNKNOWN";
export type SprayFactsSource = "NONE" | "REGISTRY" | "TENANT_DEFINED";
export type SprayProductIdentitySource = "EPA_REGISTRY" | "TENANT_DEFINED" | "LEGACY_NAME_ONLY" | "UNKNOWN";
export type SprayRateBasis = "MEASURED" | "HEADER_VOLUME" | "UNKNOWN";
export type SprayAreaSource = "DERIVED_FROM_SPACING" | "OPERATOR_ENTERED" | "SURVEYED";
export type SprayDepositionMethod = "WATER_SENSITIVE_CARD" | "DYE" | "VISUAL" | "OTHER";
export type SprayRowPattern = "EVERY_ROW" | "ALTERNATE_ROW";
export type SprayDilutionMode = "DILUTE" | "CONCENTRATE";
export type SprayWeatherSource = "OPERATOR_OBSERVED" | "STATION" | "GRID_ESTIMATE";
export type SprayWindDirection =
  | "N" | "NNE" | "NE" | "ENE" | "E" | "ESE" | "SE" | "SSE"
  | "S" | "SSW" | "SW" | "WSW" | "W" | "WNW" | "NW" | "NNW"
  | "CALM" | "VARIABLE";
export type SprayDriedBasis = "NO_RAIN_IN_WINDOW" | "HOURLY_PRECIP" | "INSUFFICIENT_DATA";
export type PlannedHarvestStatus = "ACTIVE" | "SUPERSEDED" | "RETRACTED";
export type LegacySprayMappingStatus = "SUGGESTED" | "CONFIRMED" | "REJECTED";

/** The per-area denominator captured at entry for a PER_AREA quantity (KD-5). The entered number
 * stays as filed; quantityCanonical is normalized to PER HECTARE. Required at entry — never
 * defaulted (rule §3.5.. a guess is an order-of-magnitude dose error, council G3). */
export type SprayPerAreaUnit = "ACRE" | "HECTARE";

/** Rule §3.6 — unknown is a first-class value. Never an empty list, never a silent zero. */
export type UnknownValue = { unknown: true; reason: string };

// ── row DTOs (what the read cores consume — Decimals pre-coerced) ──

export interface SprayApplicationRow {
  id: string;
  vineyardId: string;
  status: SprayRecordStatus;
  revision: number;
  supersedesApplicationId: string | null;
  supersededByApplicationId: string | null;
  correctionKind: SprayCorrectionKind | null;
  applicationMethod: SprayApplicationMethod;
  startedAt: Date;
  finishedAt: Date | null;
  sprayVolumePerHaL: number | null;
  carrierWaterVolumeL: number | null;
  tankVolumeL: number | null;
}

export interface SprayMaterialLineRow {
  id: string;
  applicationId: string;
  lineNo: number;
  productName: string;
  epaRegistrationNumber: string | null;
  tenantProductRef: string | null;
  productIdentitySource: SprayProductIdentitySource;
  materialRole: SprayMaterialRole;
  adjuvantClass: SprayAdjuvantClass | null;
  quantityEntered: number;
  quantityUnit: SprayQuantityUnit;
  quantityBasis: SprayQuantityBasis;
  quantityCanonical: number;
  quantityDimension: SprayQuantityDimension;
  enteredReiHours: number | null;
  enteredPhiDays: number | null;
  snapshotPhiDays: number | null;
  snapshotReiHours: number | null;
  snapshotRainfastHours: number | null;
  snapshotMobilityClass: SprayMobilityClass | null;
  snapshotResistanceGroups: string[];
  resistanceGroupsKnown: boolean;
  snapshotActiveIngredientKeys: string[];
  activeIngredientsKnown: boolean;
  factsPublishedRevisionId: string | null;
  factsApprilAsOf: Date | null;
  factsCdprAsOf: Date | null;
  factsResistanceArtifactSha256: string | null;
  factsAsOf: Date | null;
  factsSource: SprayFactsSource;
  factsCompleteness: SprayFactsCompleteness;
}

export interface SprayBlockLineRow {
  id: string;
  applicationId: string;
  blockId: string;
  segmentNo: number;
  blockLabelSnapshot: string;
  treatedAreaHa: number;
  treatedAreaSource: SprayAreaSource;
  startedAt: Date | null;
  finishedAt: Date | null;
  volumeUsedL: number | null;
  computedVolumePerHaL: number | null;
  rateBasis: SprayRateBasis;
  depositionMethod: SprayDepositionMethod | null;
  depositionAdequate: boolean | null;
  driedBeforeRainDerived: boolean | null;
  driedBeforeRainBasis: SprayDriedBasis | null;
}

export interface SprayDryingOverrideRow {
  id: string;
  blockLineId: string;
  value: boolean;
  reason: string;
  observedAt: Date;
  enteredById: string | null;
  enteredByEmail: string;
  enteredAt: Date;
}

// ── write-side input DTOs ──

export interface SprayActor {
  userId: string | null;
  email: string;
}

export interface SprayMaterialLineInput {
  productName: string;
  epaRegistrationNumber?: string | null;
  tenantProductRef?: string | null;
  /** Omitted → derived: EPA number set → EPA_REGISTRY, else UNKNOWN. */
  productIdentitySource?: SprayProductIdentitySource;
  materialRole: SprayMaterialRole;
  adjuvantClass?: SprayAdjuvantClass | null;
  quantityEntered: number;
  quantityUnit: SprayQuantityUnit;
  quantityBasis: SprayQuantityBasis;
  /** REQUIRED when quantityBasis = PER_AREA — the denominator the operator wrote (never guessed). */
  perAreaUnit?: SprayPerAreaUnit | null;
  /** REQUIRED when quantityBasis = PER_CARRIER_VOLUME — e.g. "per 100 GAL" = { value: 100, unit: "GAL" }. */
  perCarrierVolume?: { value: number; unit: SprayQuantityUnit } | null;
  enteredReiHours?: number | null;
  enteredPhiDays?: number | null;
  enteredActiveIngredient?: string | null;
}

export interface SprayMixOrderLineInput {
  sequence: number;
  materialDescription: string;
  amountPerTankEntered?: number | null;
  amountPerTankUnit?: SprayQuantityUnit | null;
  /** 1-based index into the materialLines array (resolved to the created line id) — null for water/compat agents. */
  materialLineNo?: number | null;
}

export interface SprayBlockLineInput {
  blockId: string;
  segmentNo?: number;
  /** Operator override of the derived area — recorded as OPERATOR_ENTERED (council CQ2). */
  treatedAreaHa?: number | null;
  treatedAreaSource?: SprayAreaSource;
  treatedAreaNote?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  tankBatchRef?: string | null;
  estTanks?: number | null;
  tanksUsed?: number | null;
  volumeUsedL?: number | null;
  depositionMethod?: SprayDepositionMethod | null;
  depositionAdequate?: boolean | null;
  depositionCheckedAt?: Date | null;
  depositionNote?: string | null;
}

export interface RecordSprayInput {
  /** Primary site; omitted → defaulted from the first block line's vineyard (KD-12). */
  vineyardId?: string | null;
  applicatorName: string;
  applicatorLicense?: string | null;
  operatorIdNumber?: string | null;
  countyPermitNumber?: string | null;
  applicationMethod: SprayApplicationMethod;
  startedAt: Date;
  finishedAt?: Date | null;
  targetPest?: string | null;
  rowPattern?: SprayRowPattern | null;
  dilutionMode?: SprayDilutionMode | null;
  sprayVolumePerHaL?: number | null;
  groundSpeedKph?: number | null;
  tankVolumeL?: number | null;
  carrierWaterVolumeL?: number | null;
  sprayWaterPh?: number | null;
  airTempC?: number | null;
  windSpeedKph?: number | null;
  windDirection?: SprayWindDirection | null;
  relHumidityPct?: number | null;
  weatherObservedAt?: Date | null;
  weatherSource?: SprayWeatherSource | null;
  sprayRigName?: string | null;
  tractorName?: string | null;
  gearSetting?: string | null;
  notes?: string | null;
  commandId?: string | null;
  materialLines: SprayMaterialLineInput[];
  mixOrderLines?: SprayMixOrderLineInput[];
  blockLines: SprayBlockLineInput[];
}

export type SprayWarningCode = "SEGMENT_GAP_OVER_24H" | "MISSING_CARRIER_VOLUME_FOR_BASIS";

export interface SprayWarning {
  code: SprayWarningCode;
  message: string;
}
