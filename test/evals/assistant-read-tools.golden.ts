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
];
