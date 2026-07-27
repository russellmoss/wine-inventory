import { describe, expect, it } from "vitest";
import { averageCurve, cumulativeCurve, perYearSeasonGdd, winklerNormal } from "@/lib/weather/normals-core";
import type { LocalDailyRecord } from "@/lib/weather/obs-time-core";

// Build a full NH growing season (Apr 1–Oct 31) with constant temps → constant daily GDD.
function season(year: number, tmaxC: number, tminC: number): LocalDailyRecord[] {
  const out: LocalDailyRecord[] = [];
  const d = new Date(`${year}-04-01T00:00:00Z`);
  const end = new Date(`${year}-10-31T00:00:00Z`);
  while (d <= end) {
    out.push({ localDate: d.toISOString().slice(0, 10), tmaxC, tminC, precipMm: 0, rhMaxPct: null, rhMinPct: null });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe("normals-core", () => {
  it("per-year full-season GDD in °C and °F", () => {
    const recs = season(2024, 30, 10); // daily GDD = (30+10)/2 − 10 = 10 °C; 214 days
    const per = perYearSeasonGdd(recs, 38.5);
    const y = per.find((p) => p.seasonYear === 2024)!;
    expect(y.daysCounted).toBe(214);
    expect(y.gddC).toBe(2140);
    expect(y.gddF).toBe(Math.round(2140 * 1.8)); // 3852
    expect(y.complete).toBe(true);
  });

  it("Winkler normal averages full COMPLETE past seasons (excludes current)", () => {
    const recs = [...season(2022, 26, 12), ...season(2023, 30, 10), ...season(2024, 28, 12)];
    // 2022: 9/day→1926, 2023: 10/day→2140, 2024: 10/day→2140. avg over 10-yr window (3 complete) = 2068.67 °C.
    const per = perYearSeasonGdd(recs, 38.5);
    const n = winklerNormal(per, 10, 2025)!;
    expect(n.yearsUsed).toBe(3);
    expect(n.avgGddC).toBeCloseTo((1926 + 2140 + 2140) / 3, 0);
    // ~2069 °C → °F ~3724 → Winkler Region IV (1944–2222 °C).
    expect(n.region).toBe("IV");
    expect(n.years).toEqual([2022, 2023, 2024]);
  });

  it("cumulative curve is monotonic and averages across years", () => {
    const c2023 = cumulativeCurve(season(2023, 30, 10), 38.5, 2023);
    const c2024 = cumulativeCurve(season(2024, 28, 12), 38.5, 2024);
    expect(c2023[0].cumF).toBeLessThan(c2023[c2023.length - 1].cumF); // increasing
    const avg = averageCurve([c2023, c2024]);
    // both have 9–10 °C/day; the average at the last day sits between the two.
    const last = avg[avg.length - 1].cumF;
    expect(last).toBeGreaterThan(Math.min(c2023.at(-1)!.cumF, c2024.at(-1)!.cumF) - 1);
    expect(last).toBeLessThan(Math.max(c2023.at(-1)!.cumF, c2024.at(-1)!.cumF) + 1);
  });
});
