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

/**
 * One replayed turn of PRIOR conversation, before the case's utterance.
 *
 * `toolCalls` is the part that matters. Plan 083 measured that a write request preceded by
 * assistant turns which *claim* a card but carry no tool evidence gets answered in prose 0/8 of the
 * time — the model completes the pattern it can see. Replaying the same history WITH the tool_use /
 * tool_result blocks restores it to 8/8. So a history turn without `toolCalls` is not a neutral
 * shorthand; it is the bug. State the calls a turn really made.
 */
export type HistoryTurn = {
  role: "user" | "assistant";
  content: string;
  /** Tools this assistant turn actually invoked, in order. Expanded into real blocks by the eval. */
  toolCalls?: Array<{ name: string; input: Record<string, unknown>; result: string }>;
};

export type MustProposeCase = {
  /** Short stable id, used in the reported per-case rates. */
  id: string;
  utterance: string;
  /**
   * PRIOR CONVERSATION replayed before `utterance`. Omit for a cold-start case.
   *
   * Every case was cold before plan 083, which is why the harness could not see the failure class it
   * exists to police: a cold chat emits a card 8/8 for an utterance that fails 0/8 with real history
   * in front of it. A case with no history measures the easy condition. Prefer `historyFixture` for
   * captured real conversations; use this for small synthetic ones.
   */
  history?: HistoryTurn[];
  /** Name of a captured transcript under `test/evals/fixtures/<name>.history.json`. */
  historyFixture?: string;
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
  // ── Plan 082: reference-data writes ──────────────────────────────────────────────────────────
  // These three capabilities did not exist before plan 082 — db_update rejected the field names
  // outright ("Unknown field \"gpsLat\"…"), so a pre-change baseline would be 0/N by construction
  // rather than by model behavior. That is why none of them carries a `baseline`: there was nothing
  // to measure, only something to build. What these cases guard is the OTHER half — that the model
  // reaches for db_update at all rather than answering in prose, which is the failure this repo has
  // shipped twice (#328, #387).
  {
    id: "vineyard-gps-update",
    utterance: "set the GPS for Estate Vineyard to 38.29, -122.45",
    tool: "db_update",
    readyRequires: ["entity", "values"],
    note: "Unit 6. GPS lives on VineyardDetail, a table the assistant could not see at all — the answer used to be 'I can't do that'. Flattened onto the Vineyard entity, so the model should never need to know a second table exists.",
    fixture: {
      db_find: 'Vineyard: 1 match — "Estate Vineyard", id vy_estate.',
    },
  },
  {
    id: "block-spacing-update",
    utterance: "change the vine spacing on Block 3 to 5 feet",
    tool: "db_update",
    readyRequires: ["entity", "values"],
    note: "Unit 4, and the correctness hazard of the whole plan: vineCount was writable while the spacings were not, so the assistant could strand the derived planted acreage with no way to correct it. Also exercises the spoken unit ('feet') reaching an explicit spacingUnit.",
    fixture: {
      db_find: 'VineyardBlock: 1 match — "Block 3" (Estate Vineyard, Merlot), id blk_3.',
    },
  },
  {
    id: "block-variety-fix",
    utterance: "Block 3 is actually Merlot, not Cabernet",
    tool: "db_update",
    readyRequires: ["entity", "values"],
    note: "Unit 3, and the phrasing most likely to be answered in prose — it is a statement of fact, not an imperative, so nothing lexical marks it as a write. A mis-set variety used to be permanently unfixable by the assistant.",
    fixture: {
      db_find: 'VineyardBlock: 1 match — "Block 3" (Estate Vineyard, Cabernet Sauvignon), id blk_3.',
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
    // COLD CONTROL, and half of a matched pair. This case emits a card 10/10 even against the pre-fix
    // prompt — which is the finding, not a pass: PR #391's premise ("the prompt never mentions
    // record_tasting_note, so the model doesn't reach for it") is not supported, because the model
    // already reached for it every time.
    //
    // The cause was prior conversation history, now ruled IN: `tasting-note-vessel-history` below is
    // this exact utterance with the real transcript replayed in front of it, and measured 0/8 pre-fix
    // (plan 083). Keep BOTH. This one holding while that one moves is what isolates the failure to
    // history replay rather than to tool selection — either case alone is ambiguous.
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
  {
    id: "wo-rack-assignee-unknown-history",
    // Plan 081's seeded repro, re-run with conversation in front of it.
    //
    // That case recorded a 2/7 live baseline and was declared fixed at 3/3 — but every run of this
    // suite was COLD, so the fix was only ever measured in the condition that cannot exhibit this
    // failure. If the cold case holds while this one drops, plan 081's 2/7 was this mechanism, and its
    // "fixed" number was measuring the easy path. Measured rates are in the plan 083 write-up.
    //
    // NOT the cmrsrs02 transcript: that history already contains a T3→T4 work order for Mike, so the
    // model correctly asked whether to create a duplicate and the case scored a failure for behaving
    // well. The fixture's subject matter must not collide with the utterance.
    utterance: "issue a work order to Mike to rack all the wine from T3 to T4",
    historyFixture: "write-heavy",
    tool: "propose_work_order",
    readyRequires: ["sourceText", "tasks"],
    unknowable: ["assigneeEmail"],
    note: "The plan 081 repro under replayed history. Same contract as the cold case: call the tool, omit the email it cannot know, never invent one, never ask in prose instead.",
    baseline: "cold 3/3 after plan 081; this variant is what that number never covered",
    fixture: {
      query_cellar_contents:
        "Tank T3: lot 24-CS-01 (Cabernet Sauvignon 2024), form MUST, 4200 L, AF active, on skins. Tank T4: empty, capacity 5000 L.",
    },
  },
  {
    id: "tasting-note-vessel-history",
    // THE plan-083 repro, and the first case in this file that is not cold.
    //
    // Reported live 2026-07-20 (feedback cmrsrs02, Demo Winery): the model answered "I've logged a
    // tasting note on T5 — review and confirm the card to save it" and called nothing. The over-claim
    // guard caught the lie afterwards; the note was never written.
    //
    // The same utterance COLD emits a card 10/10, which is why PR #391 (a prompt + tool-description
    // change) measured identical before and after and fixed nothing. With the real transcript replayed
    // in front of it: 0/8. Every prior assistant turn in that transcript ends by pointing at a card,
    // and none of them carry tool evidence, because history.ts:16 keeps only string content. The model
    // completes the pattern it can see.
    //
    // NOTE ON MERGE: PR #391 adds a COLD sibling case `tasting-note-vessel` to this array. Both belong
    // here — the cold one passing while this one fails is what isolates the failure to replay rather
    // than to tool selection. Expect a trivial conflict in this array; keep both cases.
    utterance: "log a tasting note on T5 that it smells like rotten eggs right now",
    historyFixture: "cmrsrs02",
    tool: "record_tasting_note",
    readyRequires: ["vessel", "aroma"],
    note: "Sensory prose on a vessel, after five write turns whose replayed form claims cards but shows no tool calls. Must call record_tasting_note anyway. A multi-lot tank is the tool's picker to resolve, not the model's to enumerate in prose.",
    baseline: "0/8 with real history replayed; 10/10 cold — the gap IS the bug (plan 083 Unit 1)",
    fixture: {
      query_cellar_contents:
        "Tank T5: 3 co-resident lots — 24-CS-01 (Cabernet Sauvignon 2024, 1800 L), 24-ME-02 (Merlot 2024, 1200 L), 24-CF-01 (Cabernet Franc 2024, 900 L). Total 3900 L of 4000 L, AF dry.",
    },
  },
  {
    id: "brix-write-after-writes",
    // Synthetic, deliberately. If the only history case were the captured cmrsrs02 transcript, the axis
    // would prove one tool on one conversation. This is a different write family with hand-built
    // history, so a regression cannot hide behind "that one transcript is special".
    utterance: "log 24.2 brix for Block 3",
    // DEPTH IS LOAD-BEARING. At two prior write turns this case measured 5/5 even with today's
    // text-only replay — it had no teeth and would have passed identically before and after the fix.
    // Five card-claiming turns, matching the density of the real cmrsrs02 transcript, is what makes
    // the pattern dominate. If you trim this history, re-measure it in text-only mode before assuming
    // it still guards anything.
    history: [
      { role: "user", content: "rack tank T1 into barrel B7" },
      {
        role: "assistant",
        toolCalls: [
          {
            name: "rack_wine",
            input: { fromVessel: "tank T1", toVessel: "barrel B7" },
            result: "Ready proposal emitted. Signed commit token attached. Card is on screen awaiting confirmation.",
          },
        ],
        content: "The rack from **T1 → B7** is ready. Review and confirm the card to apply it.",
      },
      { role: "user", content: "we used 40 kg of bentonite out of the Winery store" },
      {
        role: "assistant",
        toolCalls: [
          {
            name: "adjust_inventory",
            input: { item: "bentonite", delta: -40, location: "Winery" },
            result: "Ready proposal emitted. Signed commit token attached. Card is on screen awaiting confirmation.",
          },
        ],
        content: "I've recorded 40 kg of bentonite off the Winery on-hand. Review and confirm the card to save it.",
      },
      { role: "user", content: "set the yield estimate for Block 7 to 3200 kg this year" },
      {
        role: "assistant",
        toolCalls: [
          {
            name: "set_yield_estimate",
            input: { block: "Block 7", estimateKg: 3200 },
            result: "Ready proposal emitted. Signed commit token attached. Card is on screen awaiting confirmation.",
          },
        ],
        content: "I've set Block 7 to an estimated **3,200 kg** for this vintage. Review and confirm the card to save it.",
      },
      { role: "user", content: "issue a work order to clean tank T1 tomorrow" },
      {
        role: "assistant",
        toolCalls: [
          {
            name: "propose_work_order",
            input: { sourceText: "clean tank T1 tomorrow" },
            result: "Ready proposal emitted. Signed commit token attached. Card is on screen awaiting confirmation.",
          },
        ],
        content: "The work order to clean **T1** tomorrow is drafted. Review and confirm the card to issue it.",
      },
      { role: "user", content: "free SO2 came in at 28 on tank T2" },
      {
        role: "assistant",
        toolCalls: [
          {
            name: "record_measurement",
            input: { vessel: "T2", freeSO2: 28 },
            result: "Ready proposal emitted. Signed commit token attached. Card is on screen awaiting confirmation.",
          },
        ],
        content: "I've logged free SO₂ of **28 ppm** on T2. Review and confirm the card to save it.",
      },
    ],
    tool: "log_brix",
    readyRequires: ["brixValue"],
    note: "Same utterance as `brix-write`, but preceded by two card-claiming write turns. Pairs with that cold case: if this one drifts while the cold one holds, the regression is in history replay, not in log_brix routing.",
    fixture: {
      db_find: 'VineyardBlock: 1 match — "Block 3" (Estate Vineyard, Merlot), id blk_3.',
      query_vineyard_status: "Estate Vineyard: Block 3 (Merlot) at veraison.",
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
