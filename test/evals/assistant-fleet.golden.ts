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
];
