"use server";

import { action } from "@/lib/actions";
import { loadTankDetail, type TankDetail } from "@/lib/vessels/tank-detail-data";

/**
 * The tank detail's Fermentation + Tasting feeds (plan 103). Read-only; tenant auto-resolved.
 * Mirrors `getVesselTimelineAction` — the modal fetches on open rather than loading every
 * vessel's readings with the board.
 */
export const tankDetailAction = action(async (_ctx, vesselId: string): Promise<TankDetail> => {
  return loadTankDetail(vesselId);
});
