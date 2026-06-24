// Pure pre-population logic for a new weekly report. Council C5 (user-confirmed):
// carry forward SLOW-CHANGING block phenology/canopy ONLY. Sprays, fertilizers,
// weather, and per-block disease/photos start BLANK every week, so a manager can
// never forget to uncheck a carried spray and create a phantom weekly record.
//
// Block-drift (council S1): intersect carried keys with the CURRENT active blocks
// — drop blocks removed since last week, initialize newly-added blocks blank.

import {
  type BlockStatus,
  type InputApplication,
  type WeatherData,
  EMPTY_BLOCK_STATUS,
} from "@/lib/fieldnotes/types";

export type PrepopulatedForm = {
  weatherData: WeatherData;
  spraysApplied: InputApplication[];
  fertilizersApplied: InputApplication[];
  blockLevelStatuses: Record<string, BlockStatus>;
  generalNotes: string;
};

const BLANK_WEATHER: WeatherData = { rainfallMm: null, maxTempC: null, minTempC: null };

/** Carry a block's slow-changing fields forward; always blank disease + photos. */
function carryForward(prev: BlockStatus): BlockStatus {
  return {
    phenoStage: prev.phenoStage,
    shootTip: prev.shootTip,
    canopyDensity: prev.canopyDensity,
    waterStress: prev.waterStress,
    weedPressure: prev.weedPressure,
    leafConditions: [...prev.leafConditions],
    // point-in-time observations never carry across weeks:
    diseasePestSpotted: false,
    diseaseDescription: null,
    photoUrls: [],
  };
}

/**
 * Seed a new report's form state from the previous week's block statuses.
 * Everything but block phenology/canopy is blank. Block keys are reconciled
 * against the current active blocks so the form always matches reality.
 */
export function buildPrepopulationDefaults(
  prevStatuses: Record<string, BlockStatus> | null,
  currentActiveBlockIds: string[],
): PrepopulatedForm {
  const blockLevelStatuses: Record<string, BlockStatus> = {};
  for (const blockId of currentActiveBlockIds) {
    const prev = prevStatuses?.[blockId];
    blockLevelStatuses[blockId] = prev ? carryForward(prev) : { ...EMPTY_BLOCK_STATUS };
  }
  return {
    weatherData: { ...BLANK_WEATHER },
    spraysApplied: [],
    fertilizersApplied: [],
    blockLevelStatuses,
    generalNotes: "",
  };
}
