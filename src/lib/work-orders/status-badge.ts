// Client-safe (no prisma / no server imports) mapping from a work-order or work-order-task status
// string to a Badge tone + a human label. Extracted verbatim from the two duplicated STATUS_TONE
// maps in WorkOrderDetailClient.tsx / WorkOrdersClient.tsx so History, the WO pages, and the timeline
// engine all share ONE color language (plan 045 Unit 1). Reused by src/lib/lot/timeline.ts — keep it
// prisma-free.

/** The six Badge tones. */
export type BadgeTone = "neutral" | "gold" | "green" | "blue" | "maroon" | "red";

/**
 * The canonical status→tone map (WorkOrderStatus ∪ WorkOrderTaskStatus). ISSUED→blue,
 * IN_PROGRESS→gold, PENDING_APPROVAL→maroon, APPROVED/DONE→green, REJECTED→red,
 * DRAFT/CANCELLED/PENDING/SKIPPED→neutral. Unknown keys fall back to neutral (via statusTone).
 */
export const STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: "neutral",
  ISSUED: "blue",
  IN_PROGRESS: "gold",
  PENDING_APPROVAL: "maroon",
  APPROVED: "green",
  CANCELLED: "neutral",
  PENDING: "neutral",
  REJECTED: "red",
  DONE: "green",
  SKIPPED: "neutral",
};

/** Badge tone for a WO/task status; unknown → "neutral" (fail-soft, matches the old `?? "neutral"`). */
export function statusTone(status: string): BadgeTone {
  return STATUS_TONE[status] ?? "neutral";
}

/** Human label: underscores → spaces, sentence-case ("PENDING_APPROVAL" → "Pending approval"). */
export function statusLabel(status: string): string {
  const words = status.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
