// Plan 053 B10: client-safe equipment vocabulary + display types. NO server imports (prisma/tenant/etc.)
// so client components (EquipmentClient, the builder) can import these constants without pulling the
// server bundle. The server cores + validators live in equipment.ts (which re-exports these).

export const EQUIPMENT_KINDS = ["press", "filter", "pump", "tank_accessory", "hose", "other"] as const;
export const EQUIPMENT_STATUSES = ["available", "in_use", "maintenance", "retired"] as const;
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export type EquipmentRow = {
  id: string;
  name: string;
  kind: string;
  status: string;
  locationId: string | null;
  notes: string | null;
  isActive: boolean;
  // Plan 080 U3/U9: acquisition cost surfaced on the registry. Serialized for the client — Decimal and Date
  // do not cross the RSC boundary, so the loader maps them to number / ISO string.
  purchaseCostBase?: number | null;
  currency?: string | null;
  purchaseDate?: string | null;
  vendorName?: string | null;
};

/** Human label for a kind/status string (e.g. "tank_accessory" → "Tank accessory", "in_use" → "In use"). */
export function equipmentKindLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}
