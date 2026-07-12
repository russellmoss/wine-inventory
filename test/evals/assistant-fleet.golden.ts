/**
 * Assistant FLEET eval dataset — the second eval axis (see docs/architecture/assistant-coverage.md).
 *
 * The per-tool write golden (assistant-write-tools.golden.ts) proves each tool is REACHABLE. This proves
 * the model picks the RIGHT tool (and the right OPERATION within a multi-op tool) once the FULL tool set
 * is loaded, and honors the read-vs-write boundary — the failure mode that grows as the MCP passes ~30–40
 * tools. Seeded here with the calculator vs. add_addition boundary (the canonical calculate-vs-dose case).
 *
 * Consumed by assistant-fleet.eval.test.ts:
 *  • DEFAULT (deterministic): each case references a real tool of the expected kind; an `op` is a real
 *    member of that tool's `operation` enum.
 *  • GATED (ASSISTANT_EVAL=1): the full tool set is offered to the model; it must select `tool` (and, for
 *    a multi-op tool, `operation === op`), which also asserts read-vs-write discipline.
 *
 * NOT YET measured here: call-count economy (over-calling). tool_choice:"any" forces exactly one call, so
 * economy needs the full run loop — the next fleet layer. `maxToolCalls` is recorded for when it lands.
 */
export type FleetCase = {
  utterance: string;
  tool: string;
  kind: "read" | "write";
  op?: string; // for multi-operation tools (calc_*): expected `operation` enum value
  maxToolCalls?: number; // economy budget — asserted once the run-loop layer exists
  note?: string;
};

export const ASSISTANT_FLEET: FleetCase[] = [
  {
    utterance: "What is in tank 5?",
    tool: "query_cellar_contents",
    kind: "read",
    maxToolCalls: 1,
    note: "current vessel contents are a cellar-state read, not navigation or db_find",
  },
  {
    utterance: "What tanks have Cabernet Sauvignon?",
    tool: "query_cellar_contents",
    kind: "read",
    maxToolCalls: 1,
  },
  {
    utterance: "What tank is holding QBO Demo Vineyard fruit?",
    tool: "query_cellar_contents",
    kind: "read",
    maxToolCalls: 1,
    note: "vineyard/source fruit reverse search uses current lot source-vineyard membership",
  },
  // ── The calculate-vs-dose boundary (read vs write) ──
  {
    utterance: "Add 30 g/hL KMBS to tank 5",
    tool: "add_addition",
    kind: "write",
    maxToolCalls: 1,
    note: "a concrete product dose is a WRITE — never the calculator",
  },
  {
    utterance: "Fine tank 7 with 48 g/hL bentonite",
    tool: "add_addition",
    kind: "write",
    maxToolCalls: 1,
    note: "fining is still the write dose tool",
  },
  {
    utterance: "Add 200 g of grape tannin to tank 3",
    tool: "add_addition",
    kind: "write",
    maxToolCalls: 1,
    note: "an ABSOLUTE weighed total is still a recorded dose (write) — not a calculation",
  },
  {
    utterance: "Pitch 25 g/hL of EC-1118 into tank 5",
    tool: "add_addition",
    kind: "write",
    maxToolCalls: 1,
    note: "pitching yeast (a doseable additive) records an addition — NOT the calculator",
  },
  {
    utterance: "How much sugar to raise tank 3 from 22 to 24 Brix in 1000 L?",
    tool: "calc_sugar",
    kind: "read",
    op: "chaptalization",
    maxToolCalls: 1,
    note: "a sugar-to-target-Brix TARGET question computes (read) — the chaptalization op, not add_addition",
  },
  {
    utterance: "How many grams of EC-1118 do I need for 25 g/hL in 5000 L?",
    tool: "calc_sugar",
    kind: "read",
    op: "yeast-dose",
    maxToolCalls: 1,
    note: "a 'how many grams' dose CALCULATION is a read (calc_sugar yeast-dose), distinct from recording a pitch",
  },
  {
    utterance: "I want to get to 0.8 molecular SO₂ at pH 3.4, I have 20 free now, 1000 gallons, 10% solution — how much do I add?",
    tool: "calc_so2",
    kind: "read",
    op: "so2-addition-plan",
    maxToolCalls: 1,
    note: "a TARGET question computes (read), it does NOT dose — and within calc_so2 it's the planner op",
  },
  // ── Within-tool operation selection (calc_so2 has 5 operations) ──
  {
    utterance: "How many grams of KMBS for +30 ppm in 1000 gallons?",
    tool: "calc_so2",
    kind: "read",
    op: "so2-kmbs",
    maxToolCalls: 1,
  },
  {
    utterance: "What's the free SO₂ target for 0.8 molecular at pH 3.4?",
    tool: "calc_so2",
    kind: "read",
    op: "so2-molecular",
    maxToolCalls: 1,
  },
  // ── Discrimination among the calc family ──
  {
    utterance: "Convert 50 gallons to liters",
    tool: "calc_convert",
    kind: "read",
    maxToolCalls: 1,
  },
  // ── Chem panel vs block-ripeness Brix (a classic confusable) + tasting ──
  {
    utterance: "Log pH 3.4 and TA 6.2 on lot 24-CS-A",
    tool: "record_measurement",
    kind: "write",
    maxToolCalls: 1,
    note: "a LOT chem panel is record_measurement (write)",
  },
  {
    utterance: "Log 24 Brix on Block 3",
    tool: "log_brix",
    kind: "write",
    maxToolCalls: 1,
    note: "block RIPENESS Brix is log_brix — NOT record_measurement (the confusable this guards)",
  },
  {
    utterance: "Tasting note on lot 24-CS-A: bright cherry, grippy tannins, 92 points",
    tool: "record_tasting_note",
    kind: "write",
    maxToolCalls: 1,
  },
  // ── Issue an instance vs author a template (a real confusable) ──
  {
    utterance: "Issue the weekly barrel-care work order for tomorrow",
    tool: "create_work_order",
    kind: "write",
    maxToolCalls: 1,
    note: "create+issue a work-order INSTANCE from a template",
  },
  {
    utterance: "Rack T12 to T15, add 30 ppm SO2, pull a juice panel.",
    tool: "propose_work_order",
    kind: "write",
    maxToolCalls: 1,
    note: "multi-intent WO authoring must route to propose_work_order, not rack_wine/add_addition/create_work_order",
  },
  {
    utterance: "Rack T12 to T15 as a work order",
    tool: "propose_work_order",
    kind: "write",
    maxToolCalls: 1,
    note: "planned two-vessel rack work order is authoring, not an immediate rack_wine ledger operation",
  },
  {
    utterance: "Make a work order to blend T1 and T2",
    tool: "propose_work_order",
    kind: "write",
    maxToolCalls: 1,
    note: "unsupported blend authoring should be refused by the proposal tool, not misrouted to blend_lots",
  },
  {
    utterance: "Make a weekly barrel-care template: rack off the lees then add 30 g/hL KMBS",
    tool: "create_template",
    kind: "write",
    maxToolCalls: 1,
    note: "authoring a TEMPLATE — not issuing an instance (the confusable this guards)",
  },
  {
    utterance: "Mark the SO₂ addition on WO 142 done",
    tool: "complete_task",
    kind: "write",
    maxToolCalls: 1,
  },
  {
    utterance: "Complete the crush on WO 150 — Block 3, 2000 kg into tank 5, got 1400 L",
    tool: "complete_task",
    kind: "write",
    maxToolCalls: 1,
    note: "simple crush completion routes through complete_task (deep-links the form only when complex)",
  },
  // ── Review verbs vs completion (confusable) ──
  {
    utterance: "Approve WO 142",
    tool: "review_task",
    kind: "write",
    maxToolCalls: 1,
    note: "manager review (approve) — not complete_task",
  },
  {
    utterance: "Reject task 2 on WO 142, wrong tank",
    tool: "review_task",
    kind: "write",
    maxToolCalls: 1,
    note: "reject reverses the ledger op",
  },
  {
    utterance: "Cancel WO 142",
    tool: "manage_work_order",
    kind: "write",
    maxToolCalls: 1,
  },
  // ── Simple cellar ops — distinct from rack/addition ──
  {
    utterance: "Top the 2023 Grenache barrel with 3 L from keg 4",
    tool: "top_up",
    kind: "write",
    maxToolCalls: 1,
    note: "topping (from→to + volume) — not a rack",
  },
  {
    utterance: "Cross-flow filter tank 5 at 0.45 micron",
    tool: "filter_vessel",
    kind: "write",
    maxToolCalls: 1,
  },
  {
    utterance: "Punched down the Syrah tank for 20 minutes",
    tool: "log_cap_management",
    kind: "write",
    maxToolCalls: 1,
  },
  {
    utterance: "Blend 300 L of the Cab from tank 1 and 300 L of the Merlot from tank 2 into tank 3, tag RES",
    tool: "blend_lots",
    kind: "write",
    maxToolCalls: 1,
    note: "multi-source blend — distinct from a two-vessel rack",
  },
  {
    utterance: "Lot 24-CS-A is dry",
    tool: "transition_lot_state",
    kind: "write",
    maxToolCalls: 1,
    note: "ferment-state change — not a Brix reading or a measurement",
  },
  {
    utterance: "Undo the last addition on tank 5",
    tool: "undo_operation",
    kind: "write",
    maxToolCalls: 1,
    note: "general reversal — revert_transfer is rack-specific; undo_operation covers the rest",
  },
  // ── Issue-a-WO vs. a single logged op (plan 043) ──
  {
    utterance: "Punch down tanks 3, 4, and 5 this afternoon",
    tool: "issue_cap_management_wo",
    kind: "write",
    maxToolCalls: 1,
    note: "ASSIGNING cap work to the crew is issuing a WORK ORDER — not logging one op, not the calculator",
  },
  // ── Materials (Wave 3): create-new vs restock-existing vs dose (the confusables) ──
  {
    utterance: "Add a new tannin to the catalog called Grape Tannin VR Supra",
    tool: "create_material",
    kind: "write",
    maxToolCalls: 1,
    note: "CREATE a catalog material — not receiving stock and not dosing a vessel",
  },
  {
    utterance: "Received 10 kg of tartaric at $8/kg",
    tool: "receive_supply",
    kind: "write",
    maxToolCalls: 1,
    note: "RESTOCK an existing material (supply intake) — distinct from create_material and from add_addition",
  },
  {
    utterance: "Retire the old ZZCOST KMBS supply",
    tool: "set_material_active",
    kind: "write",
    maxToolCalls: 1,
    note: "catalog activate/deactivate — not a delete, not a dose",
  },
  // ── Lab samples (Wave 3): pull vs attach-returned-results vs the record_measurement confusable ──
  {
    utterance: "Pull a sample from tank 5 and send it to ETS",
    tool: "pull_sample",
    kind: "write",
    maxToolCalls: 1,
    note: "start the sample lifecycle — not a chem panel, not a calc",
  },
  {
    utterance: "The lab results for tank 5 came back — free SO₂ 28, TA 6.1",
    tool: "record_sample_results",
    kind: "write",
    maxToolCalls: 1,
    note: "results RETURNED → attach to the pending sample (record_sample_results), NOT a fresh bench panel (record_measurement)",
  },
  {
    utterance: "Cancel the sample on lot 24-CS-A",
    tool: "manage_sample",
    kind: "write",
    maxToolCalls: 1,
    note: "sample lifecycle admin — distinct from pulling or recording results",
  },
  // ── Compliance removals (Wave 3): tax event vs rack vs plain inventory adjust ──
  {
    utterance: "Remove 800 L taxpaid from tank 5",
    tool: "remove_bulk_wine",
    kind: "write",
    maxToolCalls: 1,
    note: "a tax-determination REMOVAL (wine leaves bond) — NOT a rack (wine-to-wine transfer)",
  },
  {
    utterance: "Remove 12 bottles of Marp Reserve for tasting",
    tool: "remove_bottled_wine",
    kind: "write",
    maxToolCalls: 1,
    note: "a §B bottled removal WITH a disposition (tasting) → compliance-accurate, not a bare adjust_inventory correction",
  },
  // ── Sparkling (Wave 3): tirage vs bottling, riddling vs cap-management, disgorge ──
  {
    utterance: "Tirage tank 6 into 500 bottles at 24 g/L sugar",
    tool: "sparkling_tirage",
    kind: "write",
    maxToolCalls: 1,
    note: "second fermentation in bottle — NOT an ordinary bottling run and NOT a dose to a tank",
  },
  {
    utterance: "Riddled lot 24-BdB on the gyropalette",
    tool: "log_riddling",
    kind: "write",
    maxToolCalls: 1,
    note: "remuage — sparkling-specific, not generic cap management (punchdown/pumpover)",
  },
  {
    utterance: "Disgorge 200 bottles of lot 24-BdB",
    tool: "sparkling_disgorge",
    kind: "write",
    maxToolCalls: 1,
    note: "eject the lees plug; dose/finish is a deep-link, not a guess",
  },
  // ── Cost (Wave 3): bulk-wine cost node vs material/supply receipt ──
  {
    utterance: "The bulk Cab in tank 4 cost $5,000",
    tool: "record_bulk_wine_cost",
    kind: "write",
    maxToolCalls: 1,
    note: "a bulk-WINE cost node (D20) — NOT receive_supply (a material/expendable receipt) and NOT a calc",
  },
  // ── Plan 055a: bottling authoring vs packaging-estimate read ──
  {
    utterance: "Make a work order to bottle tank 6 into 500 cases of the 2024 Estate Cab with our standard packaging",
    tool: "propose_work_order",
    kind: "write",
    maxToolCalls: 1,
    note: "authoring a bottling WO (with packaging) is propose_work_order — NOT rack_wine/add_addition/remove_bottled_wine",
  },
  {
    utterance: "How many corks and bottles do I need to bottle the Estate Cab into 500 cases?",
    tool: "estimate_packaging_needs",
    kind: "read",
    maxToolCalls: 1,
    note: "a packaging-quantity question is a READ estimate — never propose_work_order (no work is authored)",
  },
  // ── Plan 055: equipment-service authoring vs group-rack batch completion vs review ──
  {
    utterance: "Make a work order to service the basket press and set it to maintenance",
    tool: "propose_work_order",
    kind: "write",
    maxToolCalls: 1,
    note: "authoring an equipment-service task is propose_work_order — NOT complete_task/manage_work_order",
  },
  {
    utterance: "Complete the barrel-down for B101-B104 on WO 210",
    tool: "group_rack_batch",
    kind: "write",
    maxToolCalls: 1,
    note: "progressive group-rack batch completion is group_rack_batch — NOT complete_task (which is one-shot/terminal for a group rack)",
  },
  {
    utterance: "Undo the last batch on WO 210",
    tool: "group_rack_batch",
    kind: "write",
    maxToolCalls: 1,
    note: "undo the last group-rack batch is group_rack_batch action:undo — NOT review_task/undo_operation",
  },
];
