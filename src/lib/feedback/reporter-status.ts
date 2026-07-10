/**
 * Reporter-facing status mapping.
 *
 * Turns the INTERNAL feedback lifecycle status (FeedbackTicket uses the
 * `FeedbackItemStatus` enum NEW|TRIAGED|IN_PROGRESS|RESOLVED|DISMISSED; AssistantFeedback
 * stores a plain String NEW|TRIAGED|RESOLVED|DISMISSED with no IN_PROGRESS) into a plain
 * badge a customer understands. Both outcomes must read clearly: "we made the change"
 * (Resolved) AND "we looked and won't change it" (Reviewed, no change).
 *
 * Pure + isomorphic — no imports, unit-tested in test/reporter-status.test.ts.
 */

// Subset of the Badge component's tone union (src/components/ui/Badge.tsx) that this
// mapping uses. Kept local so the mapping stays pure/importable in tests.
export type ReporterTone = "neutral" | "blue" | "gold" | "green" | "maroon";

export type ReporterBadge = { label: string; tone: ReporterTone };

export function reporterStatus(status: string | null | undefined): ReporterBadge {
  switch (status) {
    case "NEW":
      return { label: "Open", tone: "neutral" };
    case "TRIAGED":
      return { label: "Reviewing", tone: "blue" };
    case "IN_PROGRESS":
      return { label: "In progress", tone: "gold" };
    case "RESOLVED":
      return { label: "Resolved", tone: "green" };
    case "DISMISSED":
      return { label: "Reviewed, no change", tone: "maroon" };
    default:
      // Fail-safe: never render blank. An unknown/absent status reads as still-open.
      return { label: "Open", tone: "neutral" };
  }
}
