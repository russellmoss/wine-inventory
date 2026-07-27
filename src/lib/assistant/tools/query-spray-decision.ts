import "server-only";
import type { AssistantTool } from "../registry";
import { resolveVineyards } from "../scope";
import { loadVineyardInfectionStatus } from "@/lib/spray/infection-read";
import { POWDERY_INDEX_UNAVAILABLE_REASON, SCOUTING_CANNOT_CLEAR_REASON, LATENT_INTERVAL_REASON } from "@/lib/spray/infection-read-core";

// Spray Intelligence S5a — `query_spray_decision`, landed THIN and HARD-REFUSING (runbook §5,
// council C3). This is the tool every later phase enriches rather than duplicates, so it lands now
// even though it can barely answer anything.
//
// WHAT IT MUST REFUSE, AND WHY THE REFUSAL IS THE FEATURE: a spray decision needs legality and
// rotation (S7a), the composed decision record (S9), and weather interlocks (S7b). NONE of those
// exist. Answering "should I spray sulfur tomorrow?" from an infection ledger alone would be
// guessing about a legally-regulated action, and a wrong legality answer is an illegal
// application. The refusal copy below is canonical — render it verbatim, never paraphrase a
// safety statement.

/**
 * The canonical refusal. Exported so the golden tests assert on the SAME string the model is given,
 * rather than a copy that can drift.
 */
export const SPRAY_DECISION_REFUSAL =
  "I can't tell you whether to spray, or what to spray. That decision needs the product's legal " +
  "registration for your state and crop, the re-entry and pre-harvest intervals, your resistance-" +
  "rotation history, and the weather window — none of which I can check yet. Ask your PCA or " +
  "farm advisor, and check the product label, which is the legal authority. What I CAN tell you is " +
  "what infections are currently being tracked on your blocks.";

/** Exported for the payload test — verify:ai-native proves a tool IMPORTS a seam, not that it SERIALIZES anything. */
export function summarizeInfectionStatus(dto: Awaited<ReturnType<typeof loadVineyardInfectionStatus>>, vineyardName: string) {
  return {
    vineyard: vineyardName,
    today: dto.today,
    canRecommendASpray: false,
    refusal: SPRAY_DECISION_REFUSAL,
    openInfectionCount: dto.totalOpen,
    blocks: dto.blocks.map((b) => ({
      block: b.blockLabel ?? b.blockId,
      openEvents: b.openEvents.map((e) => ({
        pathogen: e.pathogen,
        tissue: e.hostOrgan,
        infectionDate: e.infectionOccurredOn,
        // Tri-state on purpose: true / false / null. null is NOT "no".
        possiblyInfectious: e.infectious,
        state: e.plainState,
      })),
      weCouldNotDetermine: b.undeterminedCount,
    })),
    whatWeDoNotKnow: {
      powderyRiskIndex: POWDERY_INDEX_UNAVAILABLE_REASON,
      scoutingCannotClear: SCOUTING_CANNOT_CLEAR_REASON,
      latentPeriodIsAnInterval: LATENT_INTERVAL_REASON,
      // This tracker only watches model-driven, incubating powdery mildew. A disease or pest a
      // scout SAW and logged in a weekly field report does not appear here at all — so a zero
      // count is NEVER proof that no disease was recorded anywhere.
      scoutedObservationsAreElsewhere:
        "This tracker only covers model-driven incubating powdery mildew. Diseases/pests observed by a scout are recorded in the weekly field reports (query_field_reports), not here. A zero count here does NOT mean no disease was recorded.",
      ...(dto.honesty.notes.length ? { notes: dto.honesty.notes } : {}),
    },
  };
}

export const querySprayDecisionTool: AssistantTool = {
  name: "query_spray_decision",
  description:
    "Report which latent (incubating) disease infections are currently being tracked on a vineyard's blocks, " +
    "when each may become infectious, and what is NOT known. Call this for questions about incubating or latent " +
    "infections, whether a block is a source of inoculum, or powdery-mildew disease pressure. " +
    "NOTE: this tool only sees model-driven incubating powdery mildew — it does NOT see diseases or pests a scout " +
    "observed and logged in a weekly field report; for those (and for any 'have we recorded/seen any disease' " +
    "question) also call query_field_reports. " +
    "IMPORTANT: this tool CANNOT recommend a spray, a product, or a spray timing, and will refuse to — " +
    "legality, re-entry/pre-harvest intervals and resistance rotation are not available yet. " +
    "For weather, forecast, GDD or frost use query_climate instead; for label or extension guidance use " +
    "search_knowledge_base.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      vineyard: {
        type: "string",
        description: "Vineyard name (partial match). Optional for a manager — defaults to their assigned vineyard.",
      },
    },
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as { vineyard?: string };
    const vineyards = await resolveVineyards(ctx.user, input.vineyard);
    if (vineyards.length === 0) {
      return {
        canRecommendASpray: false,
        refusal: SPRAY_DECISION_REFUSAL,
        error: "No vineyard matched. Tell me which vineyard you mean.",
      };
    }

    const results = [];
    for (const v of vineyards) {
      const dto = await loadVineyardInfectionStatus(v.id, { viewerTimeZone: ctx.timeZone ?? null });
      results.push(summarizeInfectionStatus(dto, v.name));
    }
    return results.length === 1 ? results[0] : { vineyards: results, canRecommendASpray: false, refusal: SPRAY_DECISION_REFUSAL };
  },
};
