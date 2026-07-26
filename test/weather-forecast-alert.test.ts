import { describe, expect, it } from "vitest";
import {
  classifyForecastAlertsCore,
  escalationAction,
  nightSpanLabel,
  weatherAlertDigest,
  weatherAllClearDigest,
  type ForecastDayInput,
} from "@/lib/weather/alert-core";

// Plan 096 U20 — tiered forecast classification. Council C5 (full-series detection, sustained heat
// beyond the 72 h horizon), the dormant-window modifier (badge always, notify never out-of-window),
// the escalation state machine incl. cleared transitions (C2/C6), and the S5 night phrasing.

const LAT = 38.5; // NH — vulnerable window Apr 1 – Jun 15
const day = (targetDate: string, tminC: number | null, tmaxC: number | null): ForecastDayInput => ({ targetDate, tminC, tmaxC });

describe("classifyForecastAlertsCore — frost tiers", () => {
  const today = "2026-04-10"; // inside the vulnerable window
  it("tier boundaries: 2 °C watch, 0 °C warning, −2 °C hard freeze (highest wins)", () => {
    const out = classifyForecastAlertsCore(
      [day("2026-04-10", 2, 15), day("2026-04-11", 0, 15), day("2026-04-12", -2, 15), day("2026-04-13", 2.1, 15)],
      { latitude: LAT, todayIso: today },
    );
    const frost = out.filter((c) => c.alertType === "FROST");
    expect(frost.map((c) => c.tier)).toEqual(["FROST_WATCH", "FROST_WARNING", "HARD_FREEZE"]);
    expect(frost.map((c) => c.rank)).toEqual([1, 2, 3]);
  });
  it("notify floor: WATCH badges but never notifies; WARNING+ notifies within the 72 h horizon", () => {
    const out = classifyForecastAlertsCore(
      [day("2026-04-10", 1, 15), day("2026-04-11", -1, 15), day("2026-04-16", -5, 15)], // last is beyond horizon
      { latitude: LAT, todayIso: today },
    );
    const [watch, warn, farFreeze] = out.filter((c) => c.alertType === "FROST");
    expect(watch.notifyEligible).toBe(false); // watch = badge only
    expect(warn.notifyEligible).toBe(true);
    expect(farFreeze.notifyEligible).toBe(false); // hard freeze but 6 days out — badge now, notify when it enters the horizon
  });
  it("dormant-season modifier: out-of-window frost BADGES but never notifies", () => {
    const out = classifyForecastAlertsCore([day("2026-11-10", -3, 8)], { latitude: LAT, todayIso: "2026-11-09" });
    expect(out[0]).toMatchObject({ tier: "HARD_FREEZE", withinVulnerableWindow: false, notifyEligible: false });
  });
  it("custom thresholds override the defaults", () => {
    const out = classifyForecastAlertsCore([day("2026-04-10", 3, 15)], {
      latitude: LAT,
      todayIso: today,
      thresholds: { frostWatchC: 4 },
    });
    expect(out[0]?.tier).toBe("FROST_WATCH"); // 3 ≤ 4 with the custom watch line
  });
});

describe("classifyForecastAlertsCore — heat tiers + sustained heat", () => {
  const today = "2026-07-27";
  it("heat: 35 watch / 38 extreme; notifies from WATCH within the horizon", () => {
    const out = classifyForecastAlertsCore([day("2026-07-27", 18, 35), day("2026-07-28", 18, 38)], { latitude: LAT, todayIso: today });
    const heat = out.filter((c) => c.alertType === "HEAT");
    expect(heat.map((c) => c.tier)).toEqual(["HEAT_WATCH", "EXTREME_HEAT"]);
    expect(heat.every((c) => c.notifyEligible)).toBe(true);
  });
  it("sustained: 2 consecutive days do NOT trigger; 3 do — keyed at the run's FIRST day", () => {
    const two = classifyForecastAlertsCore([day("2026-07-27", 18, 36), day("2026-07-28", 18, 36), day("2026-07-29", 18, 30)], { latitude: LAT, todayIso: today });
    expect(two.filter((c) => c.alertType === "SUSTAINED_HEAT")).toHaveLength(0);
    const three = classifyForecastAlertsCore(
      [day("2026-07-27", 18, 30), day("2026-07-28", 18, 36), day("2026-07-29", 18, 37), day("2026-07-30", 18, 39)],
      { latitude: LAT, todayIso: today },
    );
    const s = three.find((c) => c.alertType === "SUSTAINED_HEAT");
    expect(s).toMatchObject({ targetDate: "2026-07-28", runEndDate: "2026-07-30", valueC: 39, notifyEligible: true });
  });
  it("a cool day RESETS the run; council C5 — a run starting at day 5 is still detected (beyond 72 h)", () => {
    const out = classifyForecastAlertsCore(
      [
        day("2026-07-27", 18, 36),
        day("2026-07-28", 18, 30), // reset
        day("2026-07-31", 18, 36), // day 5
        day("2026-08-01", 18, 36),
        day("2026-08-02", 18, 36),
      ],
      { latitude: LAT, todayIso: today },
    );
    const s = out.find((c) => c.alertType === "SUSTAINED_HEAT");
    expect(s).toMatchObject({ targetDate: "2026-07-31", notifyEligible: true }); // detected AND notify-eligible past the horizon
  });
});

describe("escalationAction — the C2/C6 state machine", () => {
  it("first alert, escalation, repetition, de-escalation, all-clear, re-escalation after clear", () => {
    expect(escalationAction(2, { notifiedRank: 0, cleared: false })).toBe("notify"); // first
    expect(escalationAction(3, { notifiedRank: 2, cleared: false })).toBe("notify"); // escalation
    expect(escalationAction(2, { notifiedRank: 2, cleared: false })).toBe("silent"); // repetition — the 6-hourly cron stays quiet
    expect(escalationAction(1, { notifiedRank: 3, cleared: false })).toBe("silent"); // partial de-escalation (still above watch floor) — no spam
    expect(escalationAction(0, { notifiedRank: 3, cleared: false })).toBe("clear"); // WARNING+ dropped below watch → ONE all-clear
    expect(escalationAction(0, { notifiedRank: 3, cleared: true })).toBe("silent"); // already cleared — no flapping
    expect(escalationAction(0, { notifiedRank: 1, cleared: false })).toBe("silent"); // a watch fading needs no stand-down
    expect(escalationAction(2, { notifiedRank: 0, cleared: true })).toBe("notify"); // re-crossing after a clear escalates fresh
  });
});

describe("copy — S5 night phrasing + digest shapes", () => {
  it("nightSpanLabel names BOTH civil dates", () => {
    expect(nightSpanLabel("2026-04-03")).toBe("night of Fri, Apr 3 → Sat, Apr 4");
  });
  it("frost digest: one notification, night-span phrasing, vineyard list, risk framing", () => {
    const d = weatherAlertDigest({ tier: "HARD_FREEZE", targetDate: "2026-04-03", vineyardNames: ["Paro", "Pinsa", "Yusipang"], worstValueC: -3.2 });
    expect(d.title).toContain("Hard freeze warning");
    expect(d.title).toContain("night of Fri, Apr 3 → Sat, Apr 4");
    expect(d.title).toContain("3 vineyards");
    expect(d.snippet).toContain("Paro, Pinsa, Yusipang");
    expect(d.snippet).toContain("not a damage report");
  });
  it("sustained-heat digest carries the run span; all-clear reads as a stand-down", () => {
    const d = weatherAlertDigest({ tier: "SUSTAINED_HEAT", targetDate: "2026-07-29", vineyardNames: ["Madera"], worstValueC: 41, runEndDate: "2026-08-01" });
    expect(d.title).toContain("2026-07-29 – 2026-08-01");
    const c = weatherAllClearDigest({ tier: "HARD_FREEZE", targetDate: "2026-04-03", vineyardNames: ["Paro"] });
    expect(c.title).toContain("Forecast improved");
    expect(c.snippet).toContain("no longer crosses");
  });
});
