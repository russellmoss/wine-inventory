/**
 * MUST_PROPOSE golden cases — plan 081 U9.
 *
 * These are utterances where the user asked for a WRITE. Whatever else happens, a card must reach the
 * screen: Ready if everything resolves, Draft if it does not. Prose is a failure, because prose is what
 * the user sees instead of the thing they asked for.
 *
 * This is the inverse of `assistant-tools.eval.test.ts`, which sends `tool_choice: {type:"any"}` — that
 * FORCES a tool call and then asks which tool, so it structurally cannot observe "the model called no
 * tool at all". That blindness is why a 2-in-7 card-emission rate shipped past 99 golden cases.
 */

export type MustProposeCase = {
  /** Short stable id, used in the reported per-case rates. */
  id: string;
  utterance: string;
  /** The tool that must be called. Anything else is a wrong-tool result. */
  tool: string;
  /**
   * Arg keys that a FULLY-resolved (Ready) call would carry. All present → we score the run "complete";
   * some absent → "partial", i.e. the call the Draft path exists to accept. Both count as a card; the
   * split is reported so a regression toward under-specified calls is visible.
   *
   * NOTE this is a PROXY. The eval does not execute the tool (that needs tenant DB state), so it cannot
   * observe the real ready/draft status the readiness engine would return. What it can observe — and
   * what actually regressed — is whether a tool was called at all.
   */
  readyRequires: string[];
  /**
   * Fields the model CANNOT know from this utterance alone. If any appears in the args, the model
   * fabricated it — the exact failure mode that killed the forced-`tool_choice` architecture (council
   * C1). Any occurrence fails the case outright, regardless of pass rate.
   */
  unknowable?: string[];
  /** Why this case is here. */
  note: string;
  /** Measured pre-fix emission rate, where one exists. Reported alongside the observed rate. */
  baseline?: string;
  /**
   * FIXTURE STATE this case assumes, as stubbed results for the READ tools the model calls on its way
   * to the write. The eval is a multi-turn exchange, not a single call: the assistant is instructed
   * (prompt rule 31) to read current cellar state BEFORE proposing, so a one-shot eval would score
   * every correct read as "no tool called" — measured, and it does.
   *
   * Any read tool without an entry here returns DEFAULT_EMPTY_RESULT. That is deliberate for the
   * repro: the model looking up "Mike" finds nothing, so his email stays genuinely unknowable, which
   * is the exact condition of the live failure.
   */
  fixture?: Record<string, string>;
  /**
   * A case the fix does NOT yet cover, with the reason. Its rate is measured and REPORTED but not
   * asserted, so a known boundary is documented rather than either silently dropped (which would let
   * it regress unnoticed) or left failing (which would wedge the nightly and train people to ignore it).
   * Removing this field is how the follow-up gets closed.
   */
  knownGap?: string;
};

/** What an unstubbed read tool returns. Honest "I have no data for that" — never invented rows. */
export const DEFAULT_EMPTY_RESULT = "No matching records.";

export const MUST_PROPOSE_GOLDEN: MustProposeCase[] = [
  {
    id: "wo-rack-assignee-unknown",
    // THE repro. Reproduced live 2026-07-19 against Demo Winery, 7 fresh chats, NDJSON tapped:
    // a `proposal` event was emitted 2 times. In the other 5 the model answered in prose — correctly
    // (it did not know Mike's email, and the source was must on skins) but invisibly.
    utterance: "issue a work order to Mike to rack all the wine from T3 to T4",
    tool: "propose_work_order",
    readyRequires: ["sourceText", "tasks"],
    unknowable: ["assigneeEmail"],
    note: "Names a person whose email the model cannot know. It must call the tool anyway and omit the email — not invent one, and not ask in prose.",
    baseline: "2/7 emitted a proposal before the Draft Card",
    fixture: {
      query_cellar_contents:
        'Tank T3: lot 24-CS-01 (Cabernet Sauvignon 2024), form MUST, 4200 L, AF active, on skins. Tank T4: empty, capacity 5000 L.',
      // db_find for "Mike" is intentionally left to the default empty result — his email must stay
      // genuinely unknowable, exactly as in the live repro.
    },
  },
  {
    id: "wo-rack-fully-specified",
    utterance:
      "create a work order for mike@demowinery.test to rack tank T3 to tank T4 tomorrow, then clean T3",
    tool: "propose_work_order",
    readyRequires: ["sourceText", "tasks", "assigneeEmail"],
    note: "Control: everything is present, so this must still produce a card in one shot, exactly as before the Draft work.",
    fixture: {
      query_cellar_contents:
        'Tank T3: lot 24-CS-01 (Cabernet Sauvignon 2024), form WINE, 4200 L, AF dry. Tank T4: empty, capacity 5000 L.',
    },
  },
  {
    id: "wo-crush-atypical",
    utterance: "issue a work order to crush the Chardonnay whole-cluster into T7",
    tool: "propose_work_order",
    readyRequires: ["sourceText", "tasks"],
    note: "Atypical (a white being crushed, whole-cluster). Old prompt rule 45 told the model to ask ONE clarifying question FIRST — which produced no card. It must now call the tool and ask alongside the card.",
    fixture: {
      query_cellar_contents: 'Tank T7: empty, capacity 3000 L.',
      query_recent_harvests: 'Chardonnay, Block 2, 4.2 t picked 2026-07-18.',
    },
  },
  {
    id: "wo-vague-target",
    utterance: "put in a work order to top up the barrels that need it",
    tool: "propose_work_order",
    readyRequires: ["sourceText", "tasks"],
    note: "Genuinely under-specified. A Draft naming what it needs is the right outcome; silence is not.",
    // MEASURED 0/3 after Units 4-8 (every other case went to 3/3). Not a prompt problem — the tool
    // genuinely cannot represent this draft: canonicalizeRawIntents (nl-proposal.ts) THROWS
    // "A topping task needs both a source and a destination vessel" before the readiness engine ever
    // runs, so there is no proposal object to attach `unresolved` to. Unit 5 converted the
    // readiness-stage prose blocker; the canonicalizer-stage THROWS are still prose. That is the next
    // increment of this plan, not a defect in what shipped.
    knownGap:
      "canonicalizeRawIntents throws on a task missing its required vessels, before a draft proposal can be built",
    fixture: {
      query_cellar_contents:
        'Barrel B101: lot 24-PN-03, 220 L of 228 L. Barrel B102: lot 24-PN-03, 215 L of 228 L. Barrel B103: lot 24-PN-04, 226 L of 228 L.',
    },
  },
  {
    id: "brix-write",
    utterance: "log 24.2 brix for Block 3",
    tool: "log_brix",
    readyRequires: ["brixValue"],
    note: "A different write family, to prove the eval measures card emission generally and not one tool's quirk.",
    fixture: {
      db_find: 'VineyardBlock: 1 match — "Block 3" (Estate Vineyard, Merlot), id blk_3.',
      query_vineyard_status: 'Estate Vineyard: Block 3 (Merlot) at veraison.',
    },
  },
];

/**
 * Read-intent controls. These use write VERBS ("rack", "bottle") but ask a QUESTION — the exact false
 * positives that killed the regex write-intent classifier (council C5). The model must NOT propose a
 * write for any of them. Proposing here is a worse failure than not proposing above.
 */
export const MUST_NOT_PROPOSE_GOLDEN: { id: string; utterance: string; note: string }[] = [
  {
    id: "read-when-racked",
    utterance: "when did we last rack T4?",
    note: "Contains 'rack'. A write proposal here is a work order the user never asked for.",
  },
  {
    id: "read-ready-to-bottle",
    utterance: "are we ready to bottle the 2024 Cab?",
    note: "Contains 'bottle'. Must stay a read.",
  },
];
