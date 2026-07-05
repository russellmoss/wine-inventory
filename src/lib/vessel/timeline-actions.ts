"use server";

import { action } from "@/lib/actions";
import { getVesselTimeline, type VesselTimeline } from "@/lib/vessel/timeline-data";

/** Load the vessel's occupancy-scoped History feed (plan 045). Read-only; tenant auto-resolved. */
export const getVesselTimelineAction = action(
  async (_ctx, vesselId: string): Promise<VesselTimeline | null> => {
    return getVesselTimeline(vesselId);
  },
);
