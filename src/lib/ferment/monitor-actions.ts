"use server";

import { action } from "@/lib/actions";
import { loadFermentSeries, type FermentSeries } from "@/lib/ferment/monitor-data";

// Phase 6: read the fermentation-monitoring series for a lot (called by the per-vessel modal).
// Auth-gated like every action; the script-safe logic lives in monitor-data.ts.
export const getFermentSeriesAction = action(async (_ctx, lotId: string): Promise<FermentSeries | null> => {
  return loadFermentSeries(lotId);
});
