// Canonical TypeScript shapes for the JSON columns on FieldNote, plus lightweight
// runtime validators. Prisma `Json` is `JsonValue`, not a domain type — so we
// validate on write and parse on read, and carry a `schemaVersion` on the row so
// the shape can evolve. No server-only imports (kept unit-testable).

import { toISODateUTC } from "@/lib/fieldnotes/week";

/** Bump when the stored JSON shape changes; persisted on FieldNote.schemaVersion. */
export const SCHEMA_VERSION = 1;

// ───────────────────────── Enum option arrays ─────────────────────────
// Arrays (not TS enums) so the form can map over them and tests can assert on them.

export const PHENO_STAGES = [
  "DORMANT",
  "BUD_BREAK",
  "FLOWERING",
  "FRUIT_SET",
  "VERAISON",
  "RIPENING",
  "HARVEST",
  "POST_HARVEST",
] as const;
export type PhenoStage = (typeof PHENO_STAGES)[number];

export const SHOOT_TIP_STATES = ["ACTIVE", "STAGNANT"] as const;
export type ShootTip = (typeof SHOOT_TIP_STATES)[number];

export const CANOPY_DENSITIES = ["SPARSE", "MODERATE", "DENSE"] as const;
export type CanopyDensity = (typeof CANOPY_DENSITIES)[number];

export const WATER_STRESS_LEVELS = ["NONE", "MILD", "MODERATE", "SEVERE"] as const;
export type WaterStress = (typeof WATER_STRESS_LEVELS)[number];

export const WEED_PRESSURE_LEVELS = ["NONE", "LOW", "MODERATE", "HIGH"] as const;
export type WeedPressure = (typeof WEED_PRESSURE_LEVELS)[number];

export const LEAF_CONDITIONS = [
  "EDGE_BURN",
  "YELLOWING",
  "REDDENING",
  "CHEMICAL_BURN",
  "PHYSICAL_DAMAGE",
] as const;
export type LeafCondition = (typeof LEAF_CONDITIONS)[number];

export const INPUT_TYPES = ["SPRAY", "FERTILIZER"] as const;
export type InputType = (typeof INPUT_TYPES)[number];

// Progress reading (% complete) for the stages where it's meaningful.
export const PHENO_PCT_OPTIONS = [5, 25, 50, 75, 100] as const;
export type PhenoPct = (typeof PHENO_PCT_OPTIONS)[number];
export const PHENO_PCT_STAGES = ["BUD_BREAK", "FLOWERING", "VERAISON"] as const;
/** Does this phenological stage take a % progress reading? */
export function phenoStageUsesPct(stage: PhenoStage | null): boolean {
  return stage != null && (PHENO_PCT_STAGES as readonly string[]).includes(stage);
}

// ───────────────────────── Payload shapes ─────────────────────────

export type WeatherData = {
  rainfallMm: number | null;
  maxTempC: number | null;
  minTempC: number | null;
};

export type InputScope = "WHOLE" | "BLOCKS";

export type InputApplication = {
  name: string; // display name, already cleaned UPPERCASE
  scope: InputScope; // WHOLE vineyard or specific BLOCKS
  blockIds: string[]; // populated only when scope === "BLOCKS"
};

export type BlockStatus = {
  phenoStage: PhenoStage | null;
  phenoStagePct: number | null; // % progress, only for PHENO_PCT_STAGES
  shootTip: ShootTip | null;
  canopyDensity: CanopyDensity | null;
  waterStress: WaterStress | null;
  weedPressure: WeedPressure | null;
  leafConditions: LeafCondition[]; // empty array = healthy leaves
  diseasePestSpotted: boolean;
  diseaseDescription: string | null;
  photoUrls: string[];
};

/** A fully blank status — used to initialize a newly-added block (manager must fill). */
export const EMPTY_BLOCK_STATUS: BlockStatus = {
  phenoStage: null,
  phenoStagePct: null,
  shootTip: null,
  canopyDensity: null,
  waterStress: null,
  weedPressure: null,
  leafConditions: [],
  diseasePestSpotted: false,
  diseaseDescription: null,
  photoUrls: [],
};

/** Baseline a manager can stamp onto untouched blocks via "mark remaining healthy". */
export const DEFAULT_HEALTHY_BLOCK_STATUS: BlockStatus = {
  phenoStage: null, // varies by season; manager sets it
  phenoStagePct: null,
  shootTip: "ACTIVE",
  canopyDensity: "MODERATE",
  waterStress: "NONE",
  weedPressure: "NONE",
  leafConditions: [],
  diseasePestSpotted: false,
  diseaseDescription: null,
  photoUrls: [],
};

// ───────────────────────── Runtime validators ─────────────────────────
// Lightweight, no-zod, house-style. Each parses an `unknown` (a Prisma JsonValue)
// into the typed shape and THROWS loudly on a malformed payload. Used by actions
// on write (reject bad client input) and on read (fail loud, never silent).

export class FieldNoteParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldNoteParseError";
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Number-or-null field. Accepts finite numbers and null/undefined; rejects NaN/strings/etc. */
function parseNullableNumber(v: unknown, field: string): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  throw new FieldNoteParseError(`Expected a number or null for "${field}".`);
}

function parseEnum<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
  throw new FieldNoteParseError(`Invalid value for "${field}": ${JSON.stringify(v)}.`);
}

function parseNullableEnum<T extends string>(
  v: unknown,
  allowed: readonly T[],
  field: string,
): T | null {
  if (v === null || v === undefined) return null;
  return parseEnum(v, allowed, field);
}

function parseStringArray(v: unknown, field: string): string[] {
  if (!Array.isArray(v)) throw new FieldNoteParseError(`Expected an array for "${field}".`);
  return v.map((item, i) => {
    if (typeof item !== "string") {
      throw new FieldNoteParseError(`Expected a string at "${field}[${i}]".`);
    }
    return item;
  });
}

export function parseWeatherData(raw: unknown): WeatherData {
  if (!isObject(raw)) throw new FieldNoteParseError("weatherData must be an object.");
  return {
    rainfallMm: parseNullableNumber(raw.rainfallMm, "weatherData.rainfallMm"),
    maxTempC: parseNullableNumber(raw.maxTempC, "weatherData.maxTempC"),
    minTempC: parseNullableNumber(raw.minTempC, "weatherData.minTempC"),
  };
}

export function parseInputApplication(raw: unknown): InputApplication {
  if (!isObject(raw)) throw new FieldNoteParseError("Input application must be an object.");
  if (typeof raw.name !== "string" || !raw.name.trim()) {
    throw new FieldNoteParseError("Input application is missing a name.");
  }
  const scope = parseEnum<InputScope>(raw.scope, ["WHOLE", "BLOCKS"], "scope");
  const blockIds = raw.blockIds === undefined ? [] : parseStringArray(raw.blockIds, "blockIds");
  return { name: raw.name, scope, blockIds: scope === "BLOCKS" ? blockIds : [] };
}

export function parseInputApplications(raw: unknown): InputApplication[] {
  if (!Array.isArray(raw)) throw new FieldNoteParseError("Expected an array of input applications.");
  return raw.map(parseInputApplication);
}

/** Phenology % — one of PHENO_PCT_OPTIONS, or null. Tolerates legacy rows (undefined → null). */
function parsePhenoPct(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && (PHENO_PCT_OPTIONS as readonly number[]).includes(v)) return v;
  throw new FieldNoteParseError(`Invalid phenoStagePct: ${JSON.stringify(v)}.`);
}

export function parseBlockStatus(raw: unknown): BlockStatus {
  if (!isObject(raw)) throw new FieldNoteParseError("Block status must be an object.");
  const leafConditions = (
    raw.leafConditions === undefined ? [] : parseStringArray(raw.leafConditions, "leafConditions")
  ).map((c) => parseEnum<LeafCondition>(c, LEAF_CONDITIONS, "leafConditions[]"));
  return {
    phenoStage: parseNullableEnum(raw.phenoStage, PHENO_STAGES, "phenoStage"),
    phenoStagePct: parsePhenoPct(raw.phenoStagePct),
    shootTip: parseNullableEnum(raw.shootTip, SHOOT_TIP_STATES, "shootTip"),
    canopyDensity: parseNullableEnum(raw.canopyDensity, CANOPY_DENSITIES, "canopyDensity"),
    waterStress: parseNullableEnum(raw.waterStress, WATER_STRESS_LEVELS, "waterStress"),
    weedPressure: parseNullableEnum(raw.weedPressure, WEED_PRESSURE_LEVELS, "weedPressure"),
    leafConditions,
    diseasePestSpotted: raw.diseasePestSpotted === true,
    diseaseDescription:
      raw.diseaseDescription == null ? null : String(raw.diseaseDescription),
    photoUrls: raw.photoUrls === undefined ? [] : parseStringArray(raw.photoUrls, "photoUrls"),
  };
}

export function parseBlockStatuses(raw: unknown): Record<string, BlockStatus> {
  if (!isObject(raw)) throw new FieldNoteParseError("blockLevelStatuses must be an object.");
  const out: Record<string, BlockStatus> = {};
  for (const [blockId, status] of Object.entries(raw)) {
    out[blockId] = parseBlockStatus(status);
  }
  return out;
}

// ───────────────────────── Read DTO (parsed) ─────────────────────────
// One canonical parsed shape for a stored FieldNote. All JSON columns are
// validated, all Dates are mapped to strings (no Date/Decimal crosses to the
// client). Used by the manager view, admin dashboard, and the AI generator.

export type ParsedFieldNote = {
  id: string;
  vineyardId: string;
  userId: string | null;
  userEmail: string;
  weekOf: string; // "YYYY-MM-DD"
  weatherData: WeatherData;
  spraysApplied: InputApplication[];
  fertilizersApplied: InputApplication[];
  blockLevelStatuses: Record<string, BlockStatus>;
  generalNotes: string | null;
  aiSummary: string | null;
  aiSummaryStatus: string;
  aiSummaryAt: string | null;
  schemaVersion: number;
  createdAt: string;
};

/** Payload the manager form submits to createFieldNote. */
export type CreateFieldNoteInput = {
  vineyardId: string;
  weekOf: string; // "YYYY-MM-DD"
  weatherData: WeatherData;
  spraysApplied: InputApplication[];
  fertilizersApplied: InputApplication[];
  blockLevelStatuses: Record<string, BlockStatus>;
  generalNotes?: string | null;
};

/** Structural subset of a Prisma FieldNote row needed to parse it. */
export type FieldNoteRowLike = {
  id: string;
  vineyardId: string;
  userId: string | null;
  userEmail: string;
  weekOf: Date;
  weatherData: unknown;
  spraysApplied: unknown;
  fertilizersApplied: unknown;
  blockLevelStatuses: unknown;
  generalNotes: string | null;
  aiSummary: string | null;
  aiSummaryStatus: string;
  aiSummaryAt: Date | null;
  schemaVersion: number;
  createdAt: Date;
};

/** Validate + map a stored row into the parsed DTO. Throws on malformed JSON. */
export function parseFieldNoteRow(row: FieldNoteRowLike): ParsedFieldNote {
  return {
    id: row.id,
    vineyardId: row.vineyardId,
    userId: row.userId,
    userEmail: row.userEmail,
    weekOf: toISODateUTC(row.weekOf),
    weatherData: parseWeatherData(row.weatherData),
    spraysApplied: parseInputApplications(row.spraysApplied),
    fertilizersApplied: parseInputApplications(row.fertilizersApplied),
    blockLevelStatuses: parseBlockStatuses(row.blockLevelStatuses),
    generalNotes: row.generalNotes,
    aiSummary: row.aiSummary,
    aiSummaryStatus: row.aiSummaryStatus,
    aiSummaryAt: row.aiSummaryAt ? row.aiSummaryAt.toISOString() : null,
    schemaVersion: row.schemaVersion,
    createdAt: row.createdAt.toISOString(),
  };
}
