/**
 * Reporter-facing status mapping.
 *
 * Turns the INTERNAL feedback lifecycle status (FeedbackTicket uses the
 * `FeedbackItemStatus` enum NEW|TRIAGED|IN_PROGRESS|RESOLVED|DISMISSED; AssistantFeedback
 * stores a plain String NEW|TRIAGED|RESOLVED|DISMISSED with no IN_PROGRESS) into a plain
 * badge a customer understands. Both outcomes must read clearly: "we made the change"
 * (Resolved) AND "we looked and won't change it" (Reviewed, no change).
 *
 * Pure + isomorphic — unit-tested in test/reporter-status.test.ts.
 */

import type { StatusVariant } from "@/components/ui/status-variants";

/** Re-exported under the old name so existing importers keep compiling. */
export type ReporterTone = StatusVariant;

export type ReporterBadge = { label: string; tone: StatusVariant };

export function reporterStatus(status: string | null | undefined): ReporterBadge {
  switch (status) {
    case "NEW":
      return { label: "Open", tone: "neutral" };
    // TRIAGED means "assessed and queued to be worked", not "awaiting a further
    // decision" — so it carries the same visual weight as a fresh ticket, not
    // `review` (owner-decided 2026-07-28).
    case "TRIAGED":
      return { label: "Reviewing", tone: "neutral" };
    case "IN_PROGRESS":
      return { label: "In progress", tone: "active" };
    case "RESOLVED":
      return { label: "Resolved", tone: "done" };
    // A dismissed ticket is CLOSED. `review` (◇) signals "a decision is owed",
    // which would leave reporters thinking they still have a pending task.
    case "DISMISSED":
      return { label: "Reviewed, no change", tone: "neutral" };
    default:
      // Fail-safe: never render blank. An unknown/absent status reads as still-open.
      return { label: "Open", tone: "neutral" };
  }
}
