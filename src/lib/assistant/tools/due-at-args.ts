import "server-only";
import { combineDateAndTime, formatDueAt, normalizeTimeZone, parseDueAt } from "@/lib/work-orders/due-at";

// Shared `dueDate` + `dueTime` handling for the work-order write tools (ticket cmrwkmapf: cellar work
// planned to a time of day, "issue the T7 pumpover for tomorrow at 9am").
//
// The wall clock is resolved to an INSTANT here, at propose time, and the instant is what gets signed
// into the confirmation token — so the committer needs no timezone of its own and cannot re-resolve it
// differently. `ctx.timeZone` is the viewer's zone; the server is UTC, so resolving there would silently
// shift a 9am request by the offset.

/** The two schema properties every WO-authoring tool exposes. Kept identical across tools so the model
 *  learns one shape — a per-tool wording drift is how "9am" ends up dropped on one path and not another. */
export const DUE_AT_SCHEMA_PROPERTIES = {
  dueDate: {
    type: "string",
    description: "Due date as YYYY-MM-DD (resolve relative dates like 'tomorrow' to a date). Optional.",
  },
  dueTime: {
    type: "string",
    description:
      "Requested TIME of day on that date, 24-hour HH:mm (e.g. '09:00' for 9am, '14:30'). Optional — omit it when the user only gave a day, and the work order stays date-only. Requires dueDate.",
  },
} as const;

export type SignedDueAt = {
  /** The resolved instant, ISO. Signed into the proposal; the committer just `new Date(...)`s it. */
  dueAtIso: string;
  dueAtHasTime: boolean;
};

/** What a tool signs + how it words the preview. Null when no usable due date was given. */
export type ResolvedDueAt = SignedDueAt & {
  /** Human wording for the confirm card / spoken preview, e.g. "2026-07-23 at 9:00 AM". */
  text: string;
};

/**
 * Resolve a model-supplied `dueDate` (+ optional `dueTime`) against the viewer's timezone.
 *
 * Lenient by design: an unusable date yields null (the work order is simply unscheduled, as before) and
 * an unparseable TIME degrades to date-only rather than discarding the date too. Nothing here throws —
 * a due date is never worth failing an otherwise-valid work order over.
 */
export function resolveDueAt(dueDate: unknown, dueTime: unknown, timeZone: string | undefined): ResolvedDueAt | null {
  const tz = normalizeTimeZone(timeZone);
  const date = typeof dueDate === "string" ? dueDate : null;
  const time = typeof dueTime === "string" ? dueTime : null;
  const due = parseDueAt(combineDateAndTime(date, time), tz);
  if (!due) return null;
  return { dueAtIso: due.at.toISOString(), dueAtHasTime: due.hasTime, text: formatDueAt(due.at, due.hasTime, tz) };
}

/** The `, due …` fragment tools append to their preview sentence. Empty when unscheduled. */
export function dueClause(due: ResolvedDueAt | null): string {
  return due ? `, due ${due.text}` : "";
}

/** The signed-token fields, spread into signProposal args. Empty when unscheduled. */
export function dueProposalArgs(due: ResolvedDueAt | null): Partial<SignedDueAt> {
  return due ? { dueAtIso: due.dueAtIso, dueAtHasTime: due.dueAtHasTime } : {};
}

/**
 * Read back what was signed, for the committer. Accepts the legacy date-only `dueDate` shape so a
 * confirmation card minted just before a deploy still commits instead of erroring on the user.
 */
export function dueFromCommitArgs(args: Record<string, unknown>): { dueAt: Date | null; dueAtHasTime: boolean } {
  if (typeof args.dueAtIso === "string") {
    const at = new Date(args.dueAtIso);
    if (!Number.isNaN(at.getTime())) return { dueAt: at, dueAtHasTime: args.dueAtHasTime === true };
  }
  if (typeof args.dueDate === "string") {
    const legacy = parseDueAt(args.dueDate, "UTC");
    if (legacy) return { dueAt: legacy.at, dueAtHasTime: legacy.hasTime };
  }
  return { dueAt: null, dueAtHasTime: false };
}
