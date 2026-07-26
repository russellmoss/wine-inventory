import { describe, expect, it } from "vitest";
import { addDaysIso, mapRecordsToLocalDaily } from "@/lib/weather/obs-time-core";
import type { DailyRecord } from "@/lib/weather/providers/types";

function rec(sourceDate: string, tmaxC: number | null, tminC: number | null, precipMm: number | null = 0): DailyRecord {
  return { sourceDate, tmaxC, tminC, precipMm, rhMaxPct: null, rhMinPct: null };
}

describe("addDaysIso", () => {
  it("adds and subtracts civil days without tz drift, across month boundaries", () => {
    expect(addDaysIso("2026-04-11", -1)).toBe("2026-04-10");
    expect(addDaysIso("2026-05-01", -1)).toBe("2026-04-30");
    expect(addDaysIso("2026-02-28", 1)).toBe("2026-03-01"); // 2026 not a leap year
    expect(addDaysIso("2024-02-28", 1)).toBe("2024-02-29"); // 2024 leap year
  });
});

describe("obs-time AM_LST met shift (the Y-FLIP of weather)", () => {
  // A morning-obs station: value stamped date D covers the PRIOR 24h → Tmax+precip → D−1, Tmin → D.
  const records = [rec("2026-04-10", 20, 5, 3), rec("2026-04-11", 22, 2, 0)];
  const local = mapRecordsToLocalDaily(records, "AM_LST");
  const byDate = Object.fromEntries(local.map((r) => [r.localDate, r]));

  it("assigns Tmax and prior-24h precip to date−1", () => {
    expect(byDate["2026-04-09"].tmaxC).toBe(20);
    expect(byDate["2026-04-09"].precipMm).toBe(3);
    expect(byDate["2026-04-10"].tmaxC).toBe(22);
    expect(byDate["2026-04-10"].precipMm).toBe(0);
  });

  it("assigns Tmin to the observation date", () => {
    expect(byDate["2026-04-10"].tminC).toBe(5);
    expect(byDate["2026-04-11"].tminC).toBe(2);
  });

  it("a frost measured at the 04-11 morning obs lands on local 04-11, not 04-10", () => {
    // This is the exact off-by-one the shift prevents.
    expect(byDate["2026-04-11"].tminC).toBe(2);
    expect(byDate["2026-04-10"].tminC).toBe(5);
  });
});

describe("obs-time grid pass-through", () => {
  it("MIDNIGHT_LOCAL keeps the source day as the local day", () => {
    const local = mapRecordsToLocalDaily([rec("2026-07-01", 30, 15, 0)], "MIDNIGHT_LOCAL");
    expect(local).toHaveLength(1);
    expect(local[0]).toMatchObject({ localDate: "2026-07-01", tmaxC: 30, tminC: 15 });
  });
});
