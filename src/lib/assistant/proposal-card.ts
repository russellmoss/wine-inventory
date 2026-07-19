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
