// Did the USER explicitly ask for the work order to be ISSUED, or only to be created?
//
// Phase 9 (plan 105) makes DRAFT the default outcome of "Review & create":
// `03-interaction-spec.md:179` — "A WorkOrder in DRAFT. Never ISSUED." Issuing publishes the
// order to the cellar floor, takes reservations and notifies the assignee, so it is a second,
// deliberate act. But when the user's own words already said "issue it", forcing them through a
// draft costs a press and buys nothing: the human press on the card IS the gate.
//
// SO: this decides the card's primary action — "Review & create" (draft) vs "Review & issue".
//
// THREE RULES THAT MAKE THIS SAFE, and none of them are optional:
//
//   1. It reads the USER's own last message (`ToolContext.lastUserMessage`), never model output.
//      Same discipline as tools/navigate.ts's EXPLICIT_NAV: the model does not get to decide that
//      the user wanted a publish.
//   2. It runs at PROPOSE time and its result is SIGNED INTO THE PROPOSAL TOKEN, so it cannot be
//      re-derived, swapped or tampered with at commit time.
//   3. It is deliberately NARROW. "Issue" is the winery term of art for putting work on the floor;
//      "create", "make", "draft", "set up" are not. A false negative costs one press. A false
//      positive puts unvetted work in front of a cellar hand. When in doubt, draft.
//
// NOT the write-intent classifier plan 081 killed. That one tried to decide *whether to write at
// all* from free text, where the write verbs are also the query verbs ("when did we last RACK
// T4?"). By the time this runs we are already inside a write proposal the user asked for, and the
// user still has to read a card that says "Review & issue" and press it. The blast radius of a
// misread is one visible label, not an unrequested write.

/**
 * Explicit publish verbs. Narrow on purpose — see rule 3 above.
 * `issue` covers issue/issues/issued/issuing; the floor/dispatch/release phrasings are the other
 * ways a winemaker says the same thing.
 */
const EXPLICIT_ISSUE =
  /\b(issue[sd]?|issuing|dispatch(?:es|ed|ing)?|release(?:s|d)?)\b|\bon(?:to)? the floor\b/i;

/**
 * Negations that turn an explicit verb into its opposite: "draft it, don't issue it yet".
 * Checked BEFORE the positive match, so a negated sentence can never publish.
 */
const NEGATED_ISSUE =
  /\b(?:do\s*n[o']?t|don't|dont|never|without|no\s+need\s+to|hold\s+off\s+on|not)\s+(?:\w+\s+){0,3}?(?:issue|issuing|dispatch|release)/i;

/**
 * Interrogative openers. A question about issuing is not an instruction to issue.
 * ("Should I issue this?", "when did we issue #12?", "do we issue these on Fridays?")
 */
const INTERROGATIVE =
  /^\s*(?:should|shall|can|could|would|will|do|does|did|is|are|was|were|when|what|why|how|who|which|where)\b/i;

/** Keep the scan bounded — `lastUserMessage` is user-supplied and otherwise unbounded. */
const MAX_SCAN = 2000;

/**
 * True when the user explicitly asked for the work order to go out, not merely to be created.
 * Everything else — including an absent message — is a draft.
 */
export function detectIssueIntent(lastUserMessage?: string | null): boolean {
  if (typeof lastUserMessage !== "string") return false;
  const text = lastUserMessage.slice(0, MAX_SCAN).trim();
  if (!text) return false;

  // "Draft it, don't issue it yet" — the negation wins outright.
  if (NEGATED_ISSUE.test(text)) return false;

  // A question about issuing is not an instruction. Only bail when the question mark is the whole
  // message's shape; "Issue it to Mike. Which barrels?" is still an instruction.
  if (INTERROGATIVE.test(text) && text.endsWith("?")) return false;

  return EXPLICIT_ISSUE.test(text);
}

/**
 * The card's primary action label, driven by the signed intent.
 * Approved copy: `05-design-system-v2.md:438` (B32) for the draft case.
 */
export function primaryActionLabel(issueOnConfirm: boolean): string {
  return issueOnConfirm ? "Review & issue" : "Review & create";
}

/**
 * Read the signed flag back off the commit args. Strict `=== true`: a coerced or tampered
 * truthy value ("true", 1, {}) must not publish.
 */
export function issueOnConfirmFromArgs(rawArgs: Record<string, unknown>): boolean {
  return rawArgs.issueOnConfirm === true;
}

/**
 * Was this token minted under the issue-intent contract at all?
 *
 * The deploy hazard (council C2): a card minted BEFORE this change said "Create and issue", and its
 * signed args carry no `issueOnConfirm` key. Confirmed after the deploy it would quietly draft —
 * the user pressed one thing and got another. Every token minted after the change carries the key
 * explicitly (true OR false), so ABSENCE is an exact, unambiguous marker for the old contract.
 *
 * Preferred over bumping NL_WORK_ORDER_SCHEMA_VERSION, which is shared with the draft/resume token
 * shapes and would needlessly invalidate every in-flight picker selection too.
 */
export function hasIssueIntentContract(rawArgs: Record<string, unknown>): boolean {
  return typeof rawArgs.issueOnConfirm === "boolean";
}
