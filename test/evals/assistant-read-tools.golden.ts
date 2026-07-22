export type ReadGoldenCase = {
  utterance: string;
  tool: string;
  args: Record<string, unknown>;
  note?: string;
};

export const ASSISTANT_READ_GOLDEN: ReadGoldenCase[] = [
  {
    utterance: "What is in tank 5?",
    tool: "query_cellar_contents",
    args: { vessel: "tank 5" },
  },
  {
    utterance: "What tanks have Cabernet Sauvignon?",
    tool: "query_cellar_contents",
    args: { variety: "Cabernet Sauvignon", vesselType: "TANK" },
  },
  {
    utterance: "What tank is holding QBO Demo Vineyard fruit?",
    tool: "query_cellar_contents",
    args: { vineyard: "QBO Demo Vineyard", vesselType: "TANK" },
    note: "source-vineyard reverse search belongs to cellar contents, not db_find",
  },
  {
    utterance: "Show pressable must lots",
    tool: "query_cellar_contents",
    args: { onlyPressable: true, form: "MUST" },
  },
  // Measurement/analysis history (the cellar chemistry read). The bug that motivated this tool:
  // asking for a tank's Brix reached for query_brix — the VINEYARD-BLOCK ripeness reading — found
  // nothing for a tank, and dead-ended in "open the lot page". These cases pin the split.
  {
    utterance: "What is tank T5's Brix right now?",
    tool: "query_measurements",
    args: { vessel: "tank T5", analyte: "BRIX" },
    note: "a TANK's sugar is cellar chemistry (query_measurements), NOT query_brix (grapes on the vine)",
  },
  {
    utterance: "Pull up the measurement history for lot 2026-SY-2",
    tool: "query_measurements",
    args: { lot: "2026-SY-2", history: true },
  },
  {
    utterance: "What is the pH of barrels 1 through 5?",
    tool: "query_measurements",
    args: { vessels: ["barrels 1 through 5"], analyte: "PH" },
    note: "enumeration — one value per barrel, never averaged into a single pH",
  },
  {
    utterance: "Which tank is closest to fully dry?",
    tool: "query_measurements",
    args: { vesselType: "TANK", analyte: "BRIX", rank: "lowest" },
    note: "superlative — ascending Brix, so a negative reading correctly beats zero",
  },
  {
    utterance: "Which barrel has the lowest free SO2?",
    tool: "query_measurements",
    args: { vesselType: "BARREL", analyte: "FREE_SO2", rank: "lowest" },
  },
  {
    utterance: "Show me the free SO2 and pH on tank 3 over the last 30 days",
    tool: "query_measurements",
    args: { vessel: "tank 3", analytes: ["FREE_SO2", "PH"], sinceDays: 30, history: true },
  },
  {
    utterance: "How much DAP do we have on hand?",
    tool: "query_materials",
    args: { search: "DAP" },
  },
  {
    utterance: "List our cleaning and sanitizing supplies",
    tool: "query_materials",
    args: { category: "CLEANING_SANITIZING" },
  },
  {
    utterance: "What expendables are we out of?",
    tool: "query_materials",
    args: { outOfStockOnly: true },
  },
  {
    utterance: "What consumables are we out of?",
    tool: "query_materials",
    args: { outOfStockOnly: true },
  },
  {
    utterance: "What vendors do we have?",
    tool: "query_vendors",
    args: {},
  },
  {
    utterance: "Show me Scott Labs' contact info and terms",
    tool: "query_vendors",
    args: { search: "Scott Labs" },
  },
  {
    utterance: "What custom units do we have?",
    tool: "query_custom_units",
    args: {},
  },
];
