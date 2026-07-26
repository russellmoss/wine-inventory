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
  // Operation history (the cellar LEDGER read). Filed by the winemaker after asking what additions
  // had been made to Tank T2 and getting nothing: the assistant could WRITE every one of these
  // operations but could not read one back. The split these cases pin: what was DONE to the wine is
  // query_operations; what was MEASURED on it is query_measurements.
  {
    utterance: "What additions did we make to tank T2?",
    tool: "query_operations",
    args: { vessel: "tank T2", opTypes: ["additions"] },
    note: "the motivating bug — an ADDITION is a ledger operation, not a measurement and not a transfer",
  },
  {
    utterance: "When did we last punch down T5?",
    tool: "query_operations",
    args: { vessel: "T5", opTypes: ["punchdowns"] },
    note: "cap management is CAP_MGMT in the ledger; 'punch down' must not reach query_measurements",
  },
  {
    utterance: "Show me the racking history of barrel 14",
    tool: "query_operations",
    args: { vessel: "barrel 14", opTypes: ["racking"] },
  },
  {
    utterance: "What have we done to lot 2026-SY-2?",
    tool: "query_operations",
    args: { lot: "2026-SY-2" },
    note: "no opTypes = the whole feed; lot scope follows the wine across vessels",
  },
  {
    utterance: "Which tanks haven't been punched down in 3 days?",
    tool: "query_operations",
    args: { vesselType: "TANK", opTypes: ["punchdowns"], staleAfterDays: 3 },
    note: "recency sweep — the operations counterpart to a query_measurements ranking",
  },
  {
    utterance: "Has tank 3 been topped in the last month?",
    tool: "query_operations",
    args: { vessel: "tank 3", opTypes: ["toppings"], sinceDays: 30 },
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
  {
    utterance: "What planting areas does Russian River Ranch have?",
    tool: "describe_planting_structure",
    args: { vineyard: "Russian River Ranch" },
  },
  {
    utterance: "Are any blocks in Home Ranch unassigned to a planting area?",
    tool: "describe_planting_structure",
    args: { vineyard: "Home Ranch" },
  },
  // VI-P2 — NDVI (satellite vigour) READS. Distinct from process_ndvi (fetch a new scene = a write).
  {
    utterance: "What's the NDVI for Estate Vineyard?",
    tool: "query_ndvi_stats",
    args: { vineyard: "Estate Vineyard" },
    note: "reading stored vigour, not fetching a new scene",
  },
  {
    utterance: "How does the canopy vigour look on the Home Block right now?",
    tool: "query_ndvi_stats",
    args: { vineyard: "Home Block" },
  },
  {
    utterance: "Show me the satellite greenness for block 3 in Russian River Ranch",
    tool: "query_ndvi_stats",
    args: { vineyard: "Russian River Ranch", block: "3" },
  },
  // VI-P8 weather/climate — GDD-vs-last-year, warmer-than-last-year, frost-last-night, Winkler, summary.
  {
    utterance: "How do our GDDs compare to last year at Russian River Ranch?",
    tool: "query_climate",
    args: { vineyard: "Russian River Ranch" },
  },
  {
    utterance: "Was last night a frost at Russian River Ranch?",
    tool: "query_climate",
    args: { vineyard: "Russian River Ranch" },
    note: "frost-last-night resolves in the operating tz; the tool carries the freshness fallback",
  },
  {
    utterance: "What Winkler region is Oakville Estate this year?",
    tool: "query_climate",
    args: { vineyard: "Oakville Estate" },
  },
  {
    utterance: "Is this growing season warmer than last year?",
    tool: "query_climate",
    args: {},
    note: "no vineyard named — defaults to the manager's assigned vineyard",
  },
  // Plan 096 — the 7-DAY FORECAST + rolling rainfall now live in the SAME domain-composite tool
  // (query_climate carries `forecast` + `rainfallLast30Days`); forward-looking questions must not
  // strand on the retrospective framing or drift to query_ndvi_stats.
  {
    utterance: "Will it frost this week at Paro?",
    tool: "query_climate",
    args: { vineyard: "Paro" },
    note: "forward-looking frost = the forecast block (tiers) — R11: no rows → 'no forecast yet', never inferred",
  },
  {
    utterance: "What does the weather look like this week at Russian River Ranch?",
    tool: "query_climate",
    args: { vineyard: "Russian River Ranch" },
    note: "the 7-day outlook — carries issuedAt freshness and the days 6–7 lower-confidence note",
  },
  {
    utterance: "Is any rain coming for Madera in the next few days?",
    tool: "query_climate",
    args: { vineyard: "Madera" },
  },
  {
    utterance: "How much rain did we get in the last 30 days at Oakville Estate?",
    tool: "query_climate",
    args: { vineyard: "Oakville Estate" },
    note: "rolling recent rainfall — answerable YEAR-ROUND since the off-season ingest (plan 096 U6)",
  },
  // VI-P3 — NDVI date COMPARISON (change over time). Distinct from a single-date read (query_ndvi_stats).
  {
    utterance: "How has the NDVI changed in Estate Vineyard since last month?",
    tool: "compare_ndvi_dates",
    args: { vineyard: "Estate Vineyard" },
    note: "change-over-time is a comparison, not a single-date read",
  },
  {
    utterance: "Compare vine vigour in Home Block between 2026-06-01 and 2026-07-01",
    tool: "compare_ndvi_dates",
    args: { vineyard: "Home Block", fromDate: "2026-06-01", toDate: "2026-07-01" },
  },
  {
    utterance: "Is Russian River Ranch greening up compared to the last scene?",
    tool: "compare_ndvi_dates",
    args: { vineyard: "Russian River Ranch" },
  },
  // VI-P4 — NRCS soil composition READS. Distinct from NDVI (vigour) — this is the ground, not the canopy.
  {
    utterance: "What soil is the Home Block on?",
    tool: "query_block_soil",
    args: { block: "Home Block" },
    note: "soil series / composition read, not NDVI vigour",
  },
  {
    utterance: "What's the drainage and pH for the blocks in Estate Vineyard?",
    tool: "query_block_soil",
    args: { vineyard: "Estate Vineyard" },
  },
];
