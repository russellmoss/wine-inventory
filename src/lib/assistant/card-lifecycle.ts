// What happens to an assistant action card AFTER the user acts on it.
//
// A confirmation card used to be immortal. Confirm flipped it to the green "✓ applied"
// state and it then sat in the transcript at full height forever — preview, task table,
// cost lines and diff included. With TWO cards from one turn (feedback cmrwiky4p: a Day-1
// Fermaid-O and a Day-2 DAP nutrient work order) that is a dead end: the resolved card
// fills the dock panel, the still-pending card sits below the fold, and the flow reads as
// stuck on a card the user already confirmed.
//
// So a resolved card LINGERS just long enough to be read as success, then COLLAPSES to a
// one-line receipt, and the next actionable card is brought into view. Collapse, not
// delete: the receipt still carries the outcome message and the "View X →" link, which is
// the user's only pointer to what was just written.
//
// Pure and DOM-free so it is unit-testable — this repo runs vitest with
// `environment: "node"`, so the assistant components themselves are manual-QA-only.

export type CardStatus = "pending" | "applying" | "done" | "error";

/**
 * How long a successful card stays expanded before collapsing to its receipt.
 * Long enough to register as "that worked", short enough that a user working
 * through a queue of cards is never waiting on it.
 */
export const RESOLVED_CARD_LINGER_MS = 2200;

export type QueueCard = { kind: string; status?: CardStatus; collapsed?: boolean };

/** A card the user can still act on: rendered, with Confirm/Cancel still live. */
export function isActionableCard(card: QueueCard): boolean {
  return card.kind === "proposal" && (card.status === "pending" || card.status === "applying");
}

/**
 * Index of the card to surface next — the FIRST still-actionable one in transcript order.
 * First, not last: cards are worked in the order they were proposed (Day 1 before Day 2),
 * and jumping to the newest would silently skip one.
 */
export function nextActionableCardIndex(cards: QueueCard[]): number | null {
  if (!Array.isArray(cards)) return null;
  for (let i = 0; i < cards.length; i++) {
    if (cards[i] && isActionableCard(cards[i])) return i;
  }
  return null;
}

/**
 * Does resolving a card with this status auto-collapse it?
 *
 * Success only. A FAILED card stays expanded on purpose — the user has to read why it
 * failed, with the proposal it failed on still next to the message. A cancelled card is
 * collapsed at the call site instead, immediately: the user just said "get rid of this",
 * so making them watch a linger would be perverse.
 */
export function collapsesAfterLinger(status: CardStatus): boolean {
  return status === "done";
}

// ---------------------------------------------------------------------------
// Voice's single card slot
// ---------------------------------------------------------------------------
//
// The inline voice panel has room for exactly ONE card above the composer, so it can't
// just render a list the way the text transcript does. It used to hold that slot in a
// lone `proposal` state: a second proposal event in the same turn OVERWROTE the first, so
// a write the assistant had already told the user about became permanently unconfirmable.
// The slot is now a queue of one-visible-at-a-time.

export type ProposalSlot<T> = { current: T | null; queued: T[] };

export const EMPTY_SLOT: ProposalSlot<never> = { current: null, queued: [] };

/**
 * A new proposal arrives. If the visible card is still awaiting the user, the newcomer
 * QUEUES behind it rather than replacing it. Otherwise it takes the slot — a resolved
 * card has served its purpose and must not outrank live work.
 */
export function admitProposal<T extends { status: CardStatus }>(
  slot: ProposalSlot<T>,
  incoming: T,
): ProposalSlot<T> {
  if (slot.current && isActionableCard({ kind: "proposal", status: slot.current.status })) {
    return { current: slot.current, queued: [...slot.queued, incoming] };
  }
  return { current: incoming, queued: slot.queued };
}

/** The visible card is finished with; promote whatever was waiting behind it. */
export function releaseProposal<T extends { status: CardStatus }>(slot: ProposalSlot<T>): ProposalSlot<T> {
  const [next, ...rest] = slot.queued;
  return { current: next ?? null, queued: rest };
}
