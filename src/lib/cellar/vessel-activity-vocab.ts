// Phase 9.1 (Unit 3): client-safe vocabularies for the vessel-activity (maintenance) lane. Consts only,
// NO server imports, so the template picker + execute renderer can import them. The kind mirrors the
// Prisma VesselActivityKind enum (validated as a String on WorkOrderTask.activityType, A3).

export const VESSEL_ACTIVITY_KINDS = ["TEMP_SETPOINT", "CLEAN", "SANITIZE", "STEAM", "GAS", "OZONE", "SO2", "WET_STORAGE", "OTHER"] as const;
export type VesselActivityKindT = (typeof VESSEL_ACTIVITY_KINDS)[number];

export function isVesselActivityKind(v: unknown): v is VesselActivityKindT {
  return typeof v === "string" && (VESSEL_ACTIVITY_KINDS as readonly string[]).includes(v);
}

export function coerceVesselActivityKind(v: unknown): VesselActivityKindT {
  return isVesselActivityKind(v) ? v : "OTHER";
}

/** Temperature-setpoint units. */
export const TEMP_UNITS = ["°C", "°F"] as const;
export type TempUnit = (typeof TEMP_UNITS)[number];

/** Inert gases / blanketing agents for the GAS subtype (dec 2). Stored on VesselActivityEvent.targetUnit. */
export const GAS_TYPES = ["Argon", "Nitrogen", "CO₂", "Dry ice"] as const;
export type GasType = (typeof GAS_TYPES)[number];

/** SO₂ delivery methods for the SO2 subtype (plan 044). Stored on VesselActivityEvent.targetUnit. */
export const SO2_METHODS = ["Burned sulfur strip", "Burned sulfur ring/disc", "SO₂ gas (cylinder)"] as const;
export type So2Method = (typeof SO2_METHODS)[number];
