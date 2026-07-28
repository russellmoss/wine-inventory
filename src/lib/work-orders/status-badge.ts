// Client-safe (no prisma / no server imports) mapping from a work-order or work-order-task status
// string to a StatusChip variant + a human label. Extracted verbatim from the two duplicated
// STATUS_TONE maps in WorkOrderDetailClient.tsx / WorkOrdersClient.tsx so History, the WO pages, and
// the timeline engine all share ONE color language (plan 045 Unit 1). Reused by
// src/lib/lot/timeline.ts — keep it prisma-free.
//
// v2 §A4: the six Badge tones became the six-value status ramp. The old map spent three separate
// tones (blue, gold, maroon) on "someone is working on it" and rendered IN_PROGRESS in wine, so on
// the busiest screen in the product PENDING, IN_PROGRESS and REJECTED were indistinguishable.

import type { StatusVariant } from "@/components/ui/status-variants";

export type { StatusVariant };

/**
 * The canonical status→variant map (WorkOrderStatus ∪ WorkOrderTaskStatus).
 *
 * DRAFT/PENDING/CANCELLED/SKIPPED → neutral (nothing is asked of anyone)
 * ISSUED/IN_PROGRESS             → active  (work is live)
 * APPROVED/DONE                  → done
 * REJECTED                       → attention
 * PENDING_APPROVAL               → review  (a human decision is owed)
 *
 * Unknown keys fall back to neutral (via statusTone).
 */
export const STATUS_TONE: Record<string, StatusVariant> = {
  DRAFT: "neutral",
  ISSUED: "active",
  IN_PROGRESS: "active",
  PENDING_APPROVAL: "review",
  APPROVED: "done",
  CANCELLED: "neutral",
  PENDING: "neutral",
  REJECTED: "attention",
  DONE: "done",
  SKIPPED: "neutral",
};

/** StatusChip variant for a WO/task status; unknown → "neutral" (fail-soft). */
export function statusTone(status: string): StatusVariant {
  return STATUS_TONE[status] ?? "neutral";
}

/** Human label: underscores → spaces, sentence-case ("PENDING_APPROVAL" → "Pending approval"). */
export function statusLabel(status: string): string {
  const words = status.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
