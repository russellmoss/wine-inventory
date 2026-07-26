// Plan 097 Unit 4 — compose ONE vineyard-local day of hourly forecast for the modal, PURE.
// Council-C3 discipline carries over: the modal speaks in ONE provider — the highest-ranked one
// with rows for that day (NWS over Open-Meteo), never a mix. Threshold crossings are derived here
// (first hour at/below frost-warning, at/above heat-watch) — the same numbers that drive the
// chart's reference lines, so the copy and the picture can't disagree. A QPF bucket that spans
// past midnight is FLAGGED (spanningBucket), never silently truncated.

export interface ForecastHourRow {
  providerKey: string;
  hourStartUtc: string; // ISO
  localDate: string; // YYYY-MM-DD
  localHour: number;
  tempC: number | null;
  popPct: number | null;
  precipMm: number | null;
  precipDurationH: number;
  conditionCode: string;
  windKph: number | null;
}

export interface ForecastHourSlot {
  localHour: number;
  tempC: number | null;
  popPct: number | null;
  precipMm: number | null;
  precipDurationH: number;
  conditionCode: string;
  windKph: number | null;
  /** This slot's amount interval extends past the end of the day (rendered clipped + labeled). */
  spansPastMidnight: boolean;
}

export interface ForecastHourlyDay {
  targetDate: string;
  providerKey: string;
  slots: ForecastHourSlot[];
  summary: {
    minTempC: number | null;
    maxTempC: number | null;
    /** Sum of amounts whose interval STARTS this day (the timing view's assignment rule). */
    totalPrecipMm: number;
    /** First local hour at/below the frost-warning threshold, or null. */
    firstFrostHour: number | null;
    /** First local hour at/above the heat-watch threshold, or null. */
    firstHeatHour: number | null;
    hasSpanningBucket: boolean;
  };
}

const PROVIDER_RANK: Record<string, number> = { nws: 0, open_meteo: 1 };

/** Compose the modal's day from stored rows. Null when NO provider has slots for that day (honest). */
export function composeForecastHoursCore(
  rows: ForecastHourRow[],
  opts: { targetDate: string; frostWarnC?: number; heatWatchC?: number },
): ForecastHourlyDay | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.targetDate)) throw new Error("Invalid date.");
  const frostWarnC = opts.frostWarnC ?? 0;
  const heatWatchC = opts.heatWatchC ?? 35;

  const dayRows = rows.filter((r) => r.localDate === opts.targetDate);
  if (dayRows.length === 0) return null;
  const providers = [...new Set(dayRows.map((r) => r.providerKey))].sort(
    (a, b) => (PROVIDER_RANK[a] ?? 9) - (PROVIDER_RANK[b] ?? 9),
  );
  const providerKey = providers[0];
  const primary = dayRows.filter((r) => r.providerKey === providerKey).sort((a, b) => a.localHour - b.localHour);

  let minTempC: number | null = null;
  let maxTempC: number | null = null;
  let totalPrecipMm = 0;
  let firstFrostHour: number | null = null;
  let firstHeatHour: number | null = null;
  let hasSpanningBucket = false;

  const slots: ForecastHourSlot[] = primary.map((r) => {
    if (r.tempC !== null) {
      if (minTempC === null || r.tempC < minTempC) minTempC = r.tempC;
      if (maxTempC === null || r.tempC > maxTempC) maxTempC = r.tempC;
      if (firstFrostHour === null && r.tempC <= frostWarnC) firstFrostHour = r.localHour;
      if (firstHeatHour === null && r.tempC >= heatWatchC) firstHeatHour = r.localHour;
    }
    if (r.precipMm !== null) totalPrecipMm += r.precipMm;
    const spansPastMidnight = r.localHour + r.precipDurationH > 24 && r.precipMm !== null && r.precipMm > 0;
    if (spansPastMidnight) hasSpanningBucket = true;
    return {
      localHour: r.localHour,
      tempC: r.tempC,
      popPct: r.popPct,
      precipMm: r.precipMm,
      precipDurationH: r.precipDurationH,
      conditionCode: r.conditionCode,
      windKph: r.windKph,
      spansPastMidnight,
    };
  });

  return {
    targetDate: opts.targetDate,
    providerKey,
    slots,
    summary: {
      minTempC,
      maxTempC,
      totalPrecipMm: Math.round(totalPrecipMm * 100) / 100,
      firstFrostHour,
      firstHeatHour,
      hasSpanningBucket,
    },
  };
}
