// Pure cap-management vocabulary (no server/prisma imports) so it's safe to import from client-reachable
// modules (e.g. work-order template-vocabulary → TemplateEditorClient). Mirrors filtration-vocab.ts /
// additions-math.ts. treatments.ts re-exports these for its server callers.
//
// Phase 6: cold soak + extended maceration are non-volumetric cap-work too — they reuse the CAP_MGMT op +
// LotTreatment row (kind is a validated string, NOT a DB enum — no migration).
// Plan 043: PULSE_AIR (pulsed compressed-air injection under the cap) is another volume-neutral cap-work
// technique — same treatment, no migration, no reverse/correct/edit wiring.
export type CapKind = "PUMPOVER" | "PUNCHDOWN" | "COLD_SOAK" | "MACERATION" | "PULSE_AIR";

export const CAP_KINDS: readonly CapKind[] = ["PUMPOVER", "PUNCHDOWN", "COLD_SOAK", "MACERATION", "PULSE_AIR"] as const;

export function isCapKind(v: unknown): v is CapKind {
  return typeof v === "string" && (CAP_KINDS as readonly string[]).includes(v);
}

export const CAP_LABELS: Record<CapKind, string> = {
  PUMPOVER: "Pump-over",
  PUNCHDOWN: "Punch-down",
  COLD_SOAK: "Cold soak",
  MACERATION: "Maceration",
  PULSE_AIR: "Pulse-air",
};
