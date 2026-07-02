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
];
