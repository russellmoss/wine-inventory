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
    // The TOOL-side gap is now CLOSED and the case still fails — the cause was misdiagnosed.
    //
    // Previously recorded as "canonicalizeRawIntents throws before a draft proposal can be built". That
    // throw was real and is fixed: the canonicalizer now emits a PARTIAL carrying its own unresolved
    // item. Proven end-to-end against Demo with the exact input below, which used to throw:
    //     proposal.status = needs_input
    //     proposal.unresolved = [{ key: "partial-1-topping", label: "Topping",
    //                              reason: "Needs both a source and a destination vessel." }]
    //     taskBuilds = 0, fingerprint = ""   -> not committable
    // So if the model calls propose_work_order with {kind:"TOPPING"}, it now gets a Draft card.
    //
    // But it still measures 0/3, and the eval buckets say **no-tool 3**: the model makes ZERO write-tool
    // calls for this utterance. It never reaches the canonicalizer at all. The remaining cause is model
    // tool-choice — "top up the barrels that need it" names no target, and the model treats picking the
    // barrels as a prerequisite rather than something a Draft can ask for. That is prompt/U6 territory
    // (or a `needs_input`-shaped affordance the model can see in the tool description), NOT a defect in
    // the canonicalizer path.
    //
    // Kept as a knownGap with the corrected cause rather than deleted (which would hide a real product
    // gap) or left failing (which trains people to ignore the nightly).
    // UPDATE (n=5, after the log_brix fix): the picture is clearer and the expected tool here is
    // probably WRONG. Live, this utterance DOES produce a card — it routes to `issue_operation_wo`,
    // which this case scores as "wrong-tool" because it asserts `propose_work_order`. In the eval the
    // model mostly enumerates the barrels and asks which need topping ("I don't have a reliable
    // 'needs topping' flag — I'm inferring from ullage"), which is a fair question about a genuinely
    // target-less request. Next step is to decide whether issue_operation_wo is an acceptable answer
    // here and widen `tool`, rather than to keep scoring it as a failure.
    knownGap:
      "target-less utterance: model enumerates and asks rather than writing; when it DOES write it uses issue_operation_wo, which this case mis-scores as wrong-tool (expected tool likely needs widening)",
    fixture: {
      query_cellar_contents:
        'Barrel B101: lot 24-PN-03, 220 L of 228 L. Barrel B102: lot 24-PN-03, 215 L of 228 L. Barrel B103: lot 24-PN-04, 226 L of 228 L.',
    },
  },
  {
    id: "delete-ambiguous-block",
    // Observed in PRODUCTION 2026-07-20 (Demo Winery, "delete Block 1"): the model enumerated all seven
    // matching blocks IN PROSE and asked the user to type which one. No db_delete call, so no picker —
    // the tool's picker (PR #385) is correct but never ran. Same meta-pattern as the original bug: the
    // tool behaves when called, and the model sometimes does not call it.
    //
    // The db_find fixture below DELIBERATELY hands back all seven candidates, reproducing the production
    // conditions that let the model answer from its own read instead of delegating. Give it an empty
    // read and the case proves nothing.
    //
    // NOTE on scoring: this case does NOT need a new "choice" outcome. The eval never EXECUTES the tool,
    // so it cannot observe a picker coming back — only whether a write tool was CALLED, which is exactly
    // what regressed. `entity` + `query` is a complete call; the picker is then the server's job.
    utterance: "delete Block 1",
    tool: "db_delete",
    readyRequires: ["entity", "query"],
    note: "Ambiguous target. It must call db_delete anyway and let the picker resolve it — listing the candidates in prose leaves the user nothing to click, and identical labels cannot be disambiguated by name.",
    baseline: "prose list, no tool call, observed live 2026-07-20",
    fixture: {
      db_find:
        'VineyardBlock: 7 matches — "Block 1 — Cabernet" (QBO Demo Vineyard zhmfs); "Block 1" (Ojai, Sauvignon Blanc); "Block 1" (Madera, Cabernet Sauvignon); "Block 1 — Pinot" (Russian River Ranch); "Block 1 — Cabernet" (QBO Demo Vineyard); "Block 1 — Cabernet" (QBO Demo Vineyard pt0sk); "Block 1 — Cabernet" (Oakville Estate).',
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
  {
    id: "tasting-note-vessel",
    // Reported live 2026-07-20 (feedback cmrsrs02, Demo Winery): asked for a tasting note on a tank, the
    // model called NOTHING and told the user it had logged one. The overclaim guard caught the lie after
    // the fact, but the note was never written. record_tasting_note was registered and working the whole
    // time — the system prompt simply never mentioned it, so the model did not reach for it. Third
    // instance of this meta-pattern (see wo-rack-assignee-unknown, delete-ambiguous-block): the tool
    // behaves when called, and the model sometimes does not call it.
    //
    // This case belongs HERE and not only in the fleet/write goldens: those send tool_choice:{type:"any"},
    // which FORCES a call and so structurally cannot observe the failure that was actually reported.
    //
    // ⚠️ MEASURED, AND IT DOES NOT REPRODUCE. Against the pre-fix prompt + tool description (origin/main
    // at 503b9515), on the production model, this case emits a card 10/10 — no-tool 0, wrong-tool 0. The
    // PR #391 premise ("the prompt never mentions record_tasting_note, so the model doesn't reach for it")
    // therefore is NOT supported by measurement: the model already reached for it every time. So this
    // case does NOT discriminate the fix; it is a REGRESSION GUARD over behavior that already worked,
    // and the live root cause remains unexplained. Whatever triggered it live is not in this harness —
    // candidates not yet ruled out: prior conversation history (every run here starts cold), a real
    // multi-lot resolution against live data, or genuine rare stochasticity below a 1-in-10 rate.
    // Do NOT read a pass here as proof the reported bug is fixed.
    utterance: "log a tasting note on T5 that it smells like rotten eggs",
    tool: "record_tasting_note",
    readyRequires: ["vessel", "aroma"],
    note: "Sensory prose on a VESSEL. It must call record_tasting_note (not record_measurement — 'smells like' is not an analyte) and must never narrate a saved note in prose; the note exists only once a card comes back.",
    baseline: "no tool call + a false 'logged it' claim, observed live 2026-07-20 — NOT reproduced here (10/10 pre-fix)",
    // The tank DELIBERATELY holds three co-resident lots, reproducing the reporter's real tank. The model
    // must still pass the VESSEL and let resolveLotTargetOrChoice return the picker — enumerating the
    // three lots in prose is the dead-end this case exists to catch. (Not listed under `unknowable`:
    // naming a lot read from this fixture would be wrong routing, not a fabrication, and the two failure
    // modes are worth keeping distinct.)
    fixture: {
      query_cellar_contents:
        'Tank T5: 3 co-resident lots — 24-CS-01 (Cabernet Sauvignon 2024, 1800 L), 24-ME-02 (Merlot 2024, 1200 L), 24-CF-01 (Cabernet Franc 2024, 900 L). Total 3900 L of 4000 L, AF dry.',
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
