// Pure, prisma-free view helpers for the vessel History feed (plan 045 Unit 7). Maps a TimelineItem
// to (a) a filter bucket for the chip row and (b) a short per-kind type-chip label. Factored out of
// VesselTimeline.tsx so the mapping is unit-tested without a React harness (vitest is node-env).

import type { TimelineItem } from "@/lib/lot/timeline";
import { CAP_LABELS, isCapKind } from "@/lib/cellar/cap-vocab";

/** The filter buckets shown as chips above the feed. "all" is the do-nothing default. */
export type TimelineBucket =
  | "all"
  | "additions"
  | "capMgmt"
  | "movements"
  | "analyses"
  | "maintenance"
  | "workOrders";

/** One filter chip: its bucket key + human label. Order = display order. */
export const TIMELINE_FILTERS: { bucket: TimelineBucket; label: string }[] = [
  { bucket: "all", label: "All" },
  { bucket: "additions", label: "Additions" },
  { bucket: "capMgmt", label: "Cap mgmt" },
  { bucket: "movements", label: "Movements" },
  { bucket: "analyses", label: "Analyses" },
  { bucket: "maintenance", label: "Maintenance" },
  { bucket: "workOrders", label: "Work orders" },
];

/**
 * The filter bucket for one timeline item — used to narrow the feed client-side. OP items branch on
 * op.type: ADDITION/FINING → additions, CAP_MGMT → capMgmt, else the movement bucket. Non-op items
 * map by kind. A CORRECTION rides with its family (movements) so undoing history stays visible.
 */
export function bucketOf(item: TimelineItem): Exclude<TimelineBucket, "all"> {
  switch (item.kind) {
    case "OP": {
      if (item.type === "ADDITION" || item.type === "FINING") return "additions";
      if (item.type === "CAP_MGMT") return "capMgmt";
      return "movements";
    }
    case "MEASUREMENT":
    case "TASTING":
    case "SAMPLE":
      return "analyses";
    case "VESSEL_ACTIVITY":
      return "maintenance";
    case "WORK_ORDER":
      return "workOrders";
    case "LEGACY_OPERATION":
    case "MIGRATION_CUTOVER":
      return "movements";
  }
}

/** Does an item belong in the selected filter bucket? "all" always matches. */
export function matchesFilter(item: TimelineItem, bucket: TimelineBucket): boolean {
  return bucket === "all" || bucketOf(item) === bucket;
}

/**
 * The short type-chip label shown on each row (sentence-case). For OP items this reads the specific
 * technique where it matters (cap-management kind, e.g. "Pump-over" / "Bâtonnage"; "Addition" vs
 * "Fining"), else a friendly op-type label. Non-op items get a fixed kind label.
 */
export function chipLabel(item: TimelineItem): string {
  switch (item.kind) {
    case "OP":
      return opChipLabel(item.type, item.treatments[0]?.kind ?? null);
    case "MEASUREMENT":
      return "Analysis";
    case "TASTING":
      return "Tasting";
    case "SAMPLE":
      return "Sample";
    case "VESSEL_ACTIVITY":
      return "Maintenance";
    case "WORK_ORDER":
      return "Work order";
    case "LEGACY_OPERATION":
      return "Imported history";
    case "MIGRATION_CUTOVER":
      return "Cutover";
  }
}

const OP_CHIP_LABEL: Record<string, string> = {
  SEED: "Fill",
  RACK: "Rack",
  TOPPING: "Topping",
  FILTRATION: "Filtration",
  LOSS: "Dump",
  DEPLETE: "Deplete",
  ADJUST: "Adjust",
  CORRECTION: "Correction",
  ADDITION: "Addition",
  FINING: "Fining",
  CRUSH: "De-stem/crush",
  PRESS: "Press",
  SAIGNEE: "Saignée",
  BOTTLE: "Bottling",
  TIRAGE: "Tirage",
  RIDDLING: "Riddling",
  DISGORGEMENT: "Disgorgement",
  DOSAGE: "Dosage",
  FINISH: "Finish",
};

/** Type-chip label for a ledger op. CAP_MGMT resolves the specific technique from its treatment. */
export function opChipLabel(type: string, capKind: string | null): string {
  if (type === "CAP_MGMT") {
    if (capKind && isCapKind(capKind)) return CAP_LABELS[capKind];
    return "Cap mgmt";
  }
  return OP_CHIP_LABEL[type] ?? sentenceCase(type);
}

function sentenceCase(raw: string): string {
  const words = raw.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Group items (already newest-first) by their dateLabel, preserving order. */
export function groupByDay(items: TimelineItem[]): { dateLabel: string; items: TimelineItem[] }[] {
  const out: { dateLabel: string; items: TimelineItem[] }[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last && last.dateLabel === item.dateLabel) last.items.push(item);
    else out.push({ dateLabel: item.dateLabel, items: [item] });
  }
  return out;
}
