/**
 * H8 / D26 — golden dataset for the assistant's WRITE tools (NL utterance → expected tool + args).
 *
 * This is the durable, model-agnostic asset: domain-correct cellar language paired with the structured
 * tool call it should produce. It grows every time we add an AI write surface (that's the D26 "from day
 * one" discipline — the coverage guard in assistant-tools.eval.test.ts fails if a new write tool ships
 * without a case here). Two consumers:
 *   1. the DEFAULT (cheap, deterministic) structural eval — validates each case against the REAL tool
 *      registry (tool exists, is a write, arg keys/required/types match its inputSchema);
 *   2. the GATED LLM eval (ASSISTANT_EVAL=1) — feeds each utterance to the model with the same tool
 *      schemas the assistant uses and asserts it selects the expected tool.
 *
 * `args` are the expected structured inputs (the resolver later maps names→ids; we assert the SHAPE the
 * model must produce, not resolved ids). Keep utterances in real winemaker phrasing.
 */
export type GoldenCase = {
  utterance: string;
  tool: string;
  args: Record<string, unknown>;
  note?: string;
};

export const ASSISTANT_WRITE_GOLDEN: GoldenCase[] = [
  {
    utterance: "Rack tank 1 into barrel 14",
    tool: "rack_wine",
    args: { fromVessel: "tank 1", toVessel: "barrel 14" },
    note: "whole-source rack, no volume given",
  },
  {
    utterance: "Move 200 liters from barrel 12 to tank 3, 2 liters lost to lees",
    tool: "rack_wine",
    args: { fromVessel: "barrel 12", toVessel: "tank 3", volumeL: 200, lossL: 2 },
    note: "partial volume + lees loss",
  },
  {
    utterance: "Log 24.5 brix on Block 3",
    tool: "log_brix",
    args: { brixValue: 24.5, block: "Block 3" },
  },
  {
    utterance: "Brix came in at 22 on the Grenache block today",
    tool: "log_brix",
    args: { brixValue: 22, variety: "Grenache" },
    note: "block disambiguated by variety; brixValue is the only required field",
  },
  {
    utterance: "Remove 6 bottles of Marp Reserve 2022 from the cellar",
    tool: "adjust_inventory",
    args: { item: "Marp Reserve", delta: -6, vintage: 2022, location: "cellar" },
    note: "removal is a negative delta",
  },
  {
    utterance: "Add 12 units of Sparkling Brut to inventory",
    tool: "adjust_inventory",
    args: { item: "Sparkling Brut", delta: 12 },
  },
  {
    utterance: "Estimate 3000 kg yield for Block 2 in 2024",
    tool: "set_yield_estimate",
    args: { estimate: 3000, vintageYear: 2024, block: "Block 2", unit: "kg" },
  },
  {
    utterance: "Weigh in 1200 kg from Block 1, 24 brix, pH 3.4, TA 6.2",
    tool: "log_harvest_pick",
    args: { weight: 1200, block: "Block 1", brix: 24, ph: 3.4, ta: 6.2 },
    note: "the fruit weigh-in stage; only weight is required, Brix/pH/TA are optional",
  },
  {
    utterance: "Delete the 24.5 brix reading on Block 3 from 2024-09-15",
    tool: "delete_brix",
    args: { block: "Block 3", brixValue: 24.5, recordedAt: "2024-09-15" },
  },
  {
    utterance: "Undo the last rack on barrel 16",
    tool: "revert_transfer",
    args: { vessel: "barrel 16" },
  },
  {
    utterance: "Undo the last rack",
    tool: "revert_transfer",
    args: {},
    note: "no vessel — reverts the most recent rack",
  },
  {
    utterance: "Make a weekly barrel-care template: rack off the lees, then add 30 g/hL KMBS, then a checklist to top up",
    tool: "create_template",
    args: { name: "Weekly barrel care", spec: { tasks: [{ taskType: "RACK", title: "Rack off lees" }, { taskType: "ADDITION", title: "Add SO₂", defaults: { material: "KMBS", amount: 30, doseUnit: "g/hL" } }, { taskType: "NOTE", title: "Top up the barrels" }] } },
    note: "material named under defaults.material — the tool resolves it to a real id in scope",
  },
  {
    utterance: "Replace the weekly barrel-care template's blocks with a rack off the lees then a brix reading",
    tool: "update_template_spec",
    args: { template: "Weekly barrel care", spec: { tasks: [{ taskType: "RACK", title: "Rack off lees" }, { taskType: "BRIX", title: "Brix reading" }] } },
    note: "coarse edit = full replace; utterance names the complete new block list (not a delta) so the golden doesn't encode silent block loss",
  },
  {
    utterance: "Clone the system barrel-topping template so I can customize it",
    tool: "clone_template",
    args: { template: "barrel topping" },
  },
  {
    utterance: "Archive the old weekly-topping template",
    tool: "archive_template",
    args: { template: "weekly topping" },
  },
  {
    utterance: "Add 30 g/hL KMBS to tank 5",
    tool: "add_addition",
    args: { vessel: "tank 5", material: "KMBS", amount: 30, unit: "g/hL" },
    note: "rate unit → total computed against the tank volume; whole-vessel dose (no lot arg)",
  },
  {
    utterance: "Dose 50 g/hL Fermaid-O in tank 3",
    tool: "add_addition",
    args: { vessel: "tank 3", material: "Fermaid-O", amount: 50, unit: "g/hL" },
  },
  {
    utterance: "Add 2 g/L tartaric to barrel 12",
    tool: "add_addition",
    args: { vessel: "barrel 12", material: "tartaric", amount: 2, unit: "g/L" },
  },
  {
    utterance: "Fine tank 7 with 48 g/hL bentonite",
    tool: "add_addition",
    args: { vessel: "tank 7", material: "bentonite", amount: 48, unit: "g/hL", fining: true },
    note: "fining=true routes to addFiningCore; still the write dose tool, not a calculator",
  },
  {
    utterance: "Add 200 g of grape tannin to tank 3",
    tool: "add_addition",
    args: { vessel: "tank 3", material: "grape tannin", amount: 200, unit: "g" },
    note: "ABSOLUTE total (flat grams), not a rate — the core takes amount+doseUnit for both",
  },
  {
    utterance: "Pitch 25 g/hL of EC-1118 into tank 5",
    tool: "add_addition",
    args: { vessel: "tank 5", material: "EC-1118", amount: 25, unit: "g/hL" },
    note: "yeast inoculation is a doseable ADDITIVE — 'pitch/inoculate' still routes to add_addition",
  },
  {
    utterance: "Log pH 3.4 and TA 6.2 g/L on lot 24-CS-A",
    tool: "record_measurement",
    args: { lot: "24-CS-A", pH: 3.4, ta: 6.2 },
    note: "lot chem panel — per-lot, attaches to exactly one lot",
  },
  {
    utterance: "Free SO₂ came in at 28 and total 95 on tank 5",
    tool: "record_measurement",
    args: { vessel: "tank 5", freeSO2: 28, totalSO2: 95 },
    note: "vessel → its lot; a blend would ask which",
  },
  {
    utterance: "Tasting note on lot 24-CS-A: bright cherry aroma, grippy tannins, 92 points",
    tool: "record_tasting_note",
    args: { lot: "24-CS-A", aroma: "bright cherry", tannin: 4, score: 92 },
  },
  {
    utterance: "Issue the weekly barrel-care work order for tomorrow",
    tool: "create_work_order",
    args: { template: "weekly barrel care", dueDate: "2026-07-06" },
    note: "create AND issue an instance from a template — not authoring a template (create_template)",
  },
  {
    utterance: "Create a work order from the spray template",
    tool: "create_work_order",
    args: { template: "spray" },
  },
  {
    utterance: "Mark the SO₂ addition on WO 142 done — only used 28 g",
    tool: "complete_task",
    args: { wo: 142, task: "SO₂ addition", amount: 28 },
    note: "amount is the stated actual; completing an OPERATION task auto-logs the ledger op",
  },
  {
    utterance: "WO 142 is done",
    tool: "complete_task",
    args: { wo: 142 },
    note: "single open task → no task needed",
  },
  {
    utterance: "Complete the crush on WO 150 — Block 3, 2000 kg into tank 5, got 1400 L",
    tool: "complete_task",
    args: { wo: 150, block: "Block 3", kg: 2000, destVessel: "tank 5", outputL: 1400 },
    note: "simple crush by chat; a multi-pick/complex one deep-links the execute form",
  },
  {
    utterance: "Approve WO 142",
    tool: "review_task",
    args: { wo: 142, decision: "approve" },
  },
  {
    utterance: "Reject task 2 on WO 142 — wrong tank",
    tool: "review_task",
    args: { wo: 142, task: "2", decision: "reject", reason: "wrong tank" },
    note: "reject reverses the ledger op (plan-024)",
  },
  {
    utterance: "Cancel WO 142",
    tool: "manage_work_order",
    args: { action: "cancel", wo: 142 },
  },
  {
    utterance: "Assign WO 142 to sam@winery.test",
    tool: "manage_work_order",
    args: { action: "assign", wo: 142, assigneeEmail: "sam@winery.test" },
  },
  {
    utterance: "Start task 2 on WO 142",
    tool: "manage_work_order",
    args: { action: "start", wo: 142, task: "2" },
  },
  {
    utterance: "Top the 2023 Grenache barrel with 3 L from keg 4",
    tool: "top_up",
    args: { toVessel: "2023 Grenache barrel", fromVessel: "keg 4", volumeL: 3 },
  },
  {
    utterance: "Cross-flow filter tank 5 at 0.45 micron",
    tool: "filter_vessel",
    args: { vessel: "tank 5", medium: "cross-flow", micron: 0.45 },
  },
  {
    utterance: "Punched down T5 for 15 minutes",
    tool: "log_cap_management",
    args: { vessel: "T5", kind: "PUNCHDOWN", durationMin: 15 },
  },
  {
    utterance: "Blend 300 L of the Cab from tank 1 and 300 L of the Merlot from tank 2 into tank 3, tag RES",
    tool: "blend_lots",
    args: { components: [{ vessel: "tank 1", drawL: 300 }, { vessel: "tank 2", drawL: 300 }], toVessel: "tank 3", tag: "RES" },
    note: "new blend lot in an empty destination; blended/complex sources deep-link the /blend builder",
  },
  {
    utterance: "Lot 24-CS-A is dry",
    tool: "transition_lot_state",
    args: { lot: "24-CS-A", stage: "AF", to: "DRY" },
  },
  {
    utterance: "MLF is complete on the Cab in tank 5",
    tool: "transition_lot_state",
    args: { vessel: "tank 5", stage: "MLF", to: "COMPLETE" },
  },
  {
    utterance: "Undo the last addition on tank 5",
    tool: "undo_operation",
    args: { vessel: "tank 5" },
    note: "resolves the most recent reversible op; the core fails closed if downstream/already-reversed",
  },
  {
    utterance: "Punch down tanks 3, 4, and 5 this afternoon",
    tool: "issue_cap_management_wo",
    args: { technique: "PUNCHDOWN", vessels: ["tank 3", "tank 4", "tank 5"] },
    note: "plan 043: ISSUE a cap-management WO across many tanks (one task per tank) — not a single logged op",
  },
  {
    utterance: "Issue a pumpover work order for tank 11, 20 minutes",
    tool: "issue_cap_management_wo",
    args: { technique: "PUMPOVER", vessels: ["tank 11"], durationMin: 20 },
    note: "single tank + duration; technique is the CapKind enum",
  },
  {
    utterance: "Make a punch-down work order on T4 and assign it to russellmoss87@gmail.com",
    tool: "issue_cap_management_wo",
    args: { technique: "PUNCHDOWN", vessels: ["T4"], assigneeEmail: "russellmoss87@gmail.com" },
    note: "assignee threads through to the WO's assigneeEmail (was silently dropped before this)",
  },
  {
    utterance: "Issue a topping work order for barrels 1 through 5, assigned to russellmoss87@gmail.com",
    tool: "issue_operation_wo",
    args: { operation: "TOPPING", vessels: ["barrel 1", "barrel 2", "barrel 3", "barrel 4", "barrel 5"], assigneeEmail: "russellmoss87@gmail.com" },
    note: "multi-vessel fan-out: ONE work order, one topping task per barrel — the template path can't do this",
  },
  {
    utterance: "I want a work order issued for russellmoss87@gmail.com, they are the assignee. It is for the topping of Barrel 1 through 5.",
    tool: "issue_operation_wo",
    args: { operation: "TOPPING", vessels: ["barrel 1", "barrel 2", "barrel 3", "barrel 4", "barrel 5"], assigneeEmail: "russellmoss87@gmail.com" },
    note: "regression: conversational phrasing (assignee first, 'topping' buried, no 'work order for barrels…' lead) mis-routed to create_work_order + the 'Top the barrels' template → a single vessel-less task. A named vessel list is a fan-out, never the template path.",
  },
  {
    utterance: "Add 30 g/hL KMBS to barrels 1 through 8 as a work order",
    tool: "issue_operation_wo",
    args: { operation: "ADDITION", vessels: ["barrel 1", "barrel 8"], material: "KMBS", amount: 30, unit: "g/hL" },
    note: "ADDITION variant needs material+amount+unit; the exact weigh-out is done per vessel on the floor",
  },
  {
    utterance: "Add a new tannin to the catalog called Grape Tannin VR Supra",
    tool: "create_material",
    args: { name: "Grape Tannin VR Supra", family: "Tannin" },
    note: "CREATE a brand-new catalog material (not restock) — family drives additive vs cleaning/packaging",
  },
  {
    utterance: "Create a Fermaid-O nutrient with 5 kg opening stock at $12/kg",
    tool: "create_material",
    args: { name: "Fermaid-O", family: "Nutrient", stockUnit: "kg", openingQty: 5, unitCost: 12 },
    note: "optional opening stock seeds a costed supply lot",
  },
  {
    utterance: "Received 10 kg of tartaric at $8/kg, lot A23",
    tool: "receive_supply",
    args: { material: "tartaric", qty: 10, unitCost: 8, lotCode: "A23" },
    note: "RESTOCK an existing material (supply lot) — distinct from create_material; qty in the stock unit",
  },
  {
    utterance: "Deactivate the old ZZCOST KMBS supply",
    tool: "set_material_active",
    args: { material: "ZZCOST KMBS", active: false },
    note: "catalog toggle, history-safe (never a hard delete); reactivate = active:true",
  },
  {
    utterance: "Pull a sample from tank 5 and send it to ETS",
    tool: "pull_sample",
    args: { vessel: "tank 5", lab: "ETS" },
    note: "pull + send in one step; a blend vessel asks which lot",
  },
  {
    utterance: "The ETS results for tank 5 came back — free SO₂ 28 and TA 6.1",
    tool: "record_sample_results",
    args: { vessel: "tank 5", freeSO2: 28, ta: 6.1 },
    note: "attach RETURNED lab results to the open sample (inherits its captured lot) — not a fresh bench panel",
  },
  {
    utterance: "Cancel the sample on lot 24-CS-A",
    tool: "manage_sample",
    args: { action: "cancel", lot: "24-CS-A" },
    note: "void a lost/mislabeled sample; 'send' is the other action",
  },
  {
    utterance: "Remove 800 L taxpaid from tank 5",
    tool: "remove_bulk_wine",
    args: { vessel: "tank 5", volumeL: 800, disposition: "TAXPAID" },
    note: "the §A tax-determination event (bulk); reversible via undo → Amended report if the period is filed",
  },
  {
    utterance: "Pull 20 L off tank 3 for tasting",
    tool: "remove_bulk_wine",
    args: { vessel: "tank 3", volumeL: 20, disposition: "TASTING" },
    note: "disposition drives the §A line; TASTING = used on-site (not a rack)",
  },
  {
    utterance: "Remove 12 bottles of Marp Reserve 2022 for tasting",
    tool: "remove_bottled_wine",
    args: { wine: "Marp Reserve", vintage: 2022, bottles: 12, disposition: "TASTING" },
    note: "§B bottled removal WITH a disposition — not a plain adjust_inventory correction",
  },
  {
    utterance: "Log 6 bottles of Sparkling Brut as breakage",
    tool: "remove_bottled_wine",
    args: { wine: "Sparkling Brut", bottles: 6, disposition: "BREAKAGE" },
    note: "breakage as a §B disposition (tags the movement → the right B-line)",
  },
  {
    utterance: "Tirage tank 6 into 500 bottles at 24 g/L sugar",
    tool: "sparkling_tirage",
    args: { vessel: "tank 6", bottleCount: 500, tirageSugarGpl: 24 },
    note: "start the 2nd fermentation in bottle from the source tank; sugar OR target pressure — not a bottling run",
  },
  {
    utterance: "Riddled lot 24-BdB on the gyropalette",
    tool: "log_riddling",
    args: { lot: "24-BdB", method: "gyropalette" },
    note: "remuage log on an en-tirage lot",
  },
  {
    utterance: "Disgorge 200 bottles of lot 24-BdB",
    tool: "sparkling_disgorge",
    args: { lot: "24-BdB", bottles: 200 },
    note: "disgorge-only by chat; dose + finish (finish:true) deep-links the En Tirage screen",
  },
  {
    utterance: "The bulk Cab in tank 4 cost $5,000",
    tool: "record_bulk_wine_cost",
    args: { vessel: "tank 4", totalCost: 5000 },
    note: "a mid-process MATERIAL cost node on a bulk WINE lot — not a material/supply receipt",
  },
  {
    utterance: "Record $2,400 purchase cost for lot 24-BULK-1",
    tool: "record_bulk_wine_cost",
    args: { lot: "24-BULK-1", totalCost: 2400 },
  },
];
