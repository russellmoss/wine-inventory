// Pure gating logic for the assistant confirmation card. Lives outside the component so it can be
// unit-tested (the repo has no jsdom/RTL — assistant UI is otherwise manual-QA-only).
//
// Plan 081 U7. A card has two shapes:
//   READY — carries a signed commit token; Confirm applies it.
//   DRAFT — carries NO token. It renders (that is the whole point: the user gets the visual anchor
//     immediately) but it is not committable, and the card says exactly why.
//
// Note the gate is a CONSEQUENCE of the contract, not a second implementation of it: a Draft has no
// token, so there is physically nothing to POST. This function decides what the user is TOLD.

export type ProposalCardWarning = { severity: "blocking" | "confirmable" | "completion_check"; code: string; message: string };

export type ProposalCardInput = {
  token?: string;
  draft?: boolean;
  details?: { unresolved?: { label: string; reason: string }[]; warnings?: ProposalCardWarning[] } | undefined;
};

export type ProposalGate = {
  canConfirm: boolean;
  /** Why Confirm is unavailable — rendered on the card. Null when it is available. */
  reason: string | null;
  /** Count of unresolved required fields, for the card's summary line. */
  unresolvedCount: number;
  /** Count of blocking warnings — an operation the engine refuses outright. */
  blockingCount: number;
};

export function proposalGate(item: ProposalCardInput): ProposalGate {
  const unresolved = item.details?.unresolved ?? [];
  const blocking = (item.details?.warnings ?? []).filter((w) => w.severity === "blocking");
  const isDraft = item.draft === true || !item.token;

  if (!isDraft) {
    return { canConfirm: true, reason: null, unresolvedCount: unresolved.length, blockingCount: blocking.length };
  }

  // Blockers are reported before missing fields: a physically refused operation is not fixed by
  // filling in a field, and telling the user "add an assignee" when the rack itself is impossible
  // would send them down the wrong path.
  const reason =
    blocking.length > 0
      ? `This can't be issued as written — ${blocking.length === 1 ? "one blocker" : `${blocking.length} blockers`} below must be resolved first.`
      : unresolved.length > 0
        ? `This draft still needs ${unresolved.length === 1 ? "one detail" : `${unresolved.length} details`}. Reply with ${unresolved.length === 1 ? "it" : "them"} and the card will be rebuilt.`
        : "This draft isn't ready to issue yet.";

  return { canConfirm: false, reason, unresolvedCount: unresolved.length, blockingCount: blocking.length };
}

/**
 * What voice mode says about a Draft (plan 081 U8). Reads the untyped `details` defensively — it comes
 * off the wire and any write tool may produce it — and returns just enough to speak one sentence.
 *
 * Voice deliberately does NOT resolve draft fields by dictation: an email address or a lot code
 * through STT is exactly where a wrong value gets committed, and a draft is where that is likeliest.
 * It reads the gaps aloud and defers to the visual card.
 */
export function readDraftGaps(details: unknown): { unresolved: number; blocking: number; labels: string[] } {
  const d = (details ?? {}) as { unresolved?: unknown; warnings?: unknown };
  const unresolved = Array.isArray(d.unresolved) ? d.unresolved : [];
  const warnings = Array.isArray(d.warnings) ? d.warnings : [];
  const labels = unresolved
    .map((u) => (u && typeof u === "object" ? (u as { label?: unknown }).label : null))
    .filter((l): l is string => typeof l === "string" && !!l)
    .slice(0, 3) // one spoken sentence, not a recital
    .map((l) => l.toLowerCase());
  const blocking = warnings.filter(
    (w) => w && typeof w === "object" && (w as { severity?: unknown }).severity === "blocking",
  ).length;
  return { unresolved: unresolved.length, blocking, labels };
}
