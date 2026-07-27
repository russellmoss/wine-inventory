import { describe, expect, it } from "vitest";
import { alertMessage, detectWeatherAlertsCore } from "@/lib/weather/alert-core";
import type { LocalDailyRecord } from "@/lib/weather/obs-time-core";

function d(localDate: string, tmaxC: number | null, tminC: number | null): LocalDailyRecord {
  return { localDate, tmaxC, tminC, precipMm: 0, rhMaxPct: null, rhMinPct: null };
}

describe("weather alerts — crossing detection + dedup", () => {
  const series = [d("2026-04-20", 18, -1), d("2026-04-21", 22, 5), d("2026-07-10", 39, 20)];
  it("detects frost and heat crossings once", () => {
    const alerts = detectWeatherAlertsCore(series);
    expect(alerts).toEqual([
      { kind: "FROST", localDate: "2026-04-20", valueC: -1 },
      { kind: "HEAT", localDate: "2026-07-10", valueC: 39 },
    ]);
  });
  it("does not re-alert a date already alerted (idempotent)", () => {
    const alerts = detectWeatherAlertsCore(series, {}, new Set(["2026-04-20"]));
    expect(alerts.map((a) => a.localDate)).toEqual(["2026-07-10"]);
  });
  it("copy is risk-framed, never a damage claim", () => {
    const msg = alertMessage({ kind: "FROST", localDate: "2026-04-20", valueC: -3 }, "Home Block");
    expect(msg).toMatch(/Elevated risk/);
    expect(msg).toMatch(/not a damage report/);
    expect(msg).toMatch(/killing-range/);
  });
});
