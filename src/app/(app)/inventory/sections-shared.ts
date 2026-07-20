// Plan 080 U6 — the Inventory section vocabulary, shared by BOTH the server page and the client tabs.
//
// NO "use client" here, deliberately. These are pure values/functions that the server component calls
// (`coerceSection` on the incoming `?section=`) AND the client tab bar imports. If they live in the
// "use client" module, Next throws at RUNTIME — "Attempted to call coerceSection() from the server but
// coerceSection is on the client" — which neither `tsc` NOR `next build` catches. Same client-safe-shared
// split as materials-shared.ts and equipment/vocab.ts.

export const INVENTORY_SECTIONS = ["finished", "consumables", "equipment"] as const;
export type InventorySection = (typeof INVENTORY_SECTIONS)[number];

export const SECTION_LABELS: Record<InventorySection, string> = {
  finished: "Finished goods",
  consumables: "Consumables",
  equipment: "Equipment & parts",
};

/** Coerce an untrusted `?section=` into a real section (anything unknown → finished goods). */
export function coerceSection(raw: string | string[] | undefined): InventorySection {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (INVENTORY_SECTIONS as readonly string[]).includes(v ?? "") ? (v as InventorySection) : "finished";
}

/** Canonical href for a section — `finished` is the bare /inventory so the default URL stays clean. */
export function sectionHref(s: InventorySection): string {
  return s === "finished" ? "/inventory" : `/inventory?section=${s}`;
}
