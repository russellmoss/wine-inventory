// S5a Unit 0 probe — genuine station hourly observations (ASOS/METAR) via the Iowa Environmental
// Mesonet archive. Council C2: the oracle must be OBSERVATION, not reanalysis. ERA5 is a model, and
// validating a reconstruction against it produces an agreement statistic between two models
// presented as empirical fidelity.
//
// Responses are cached on disk — the probe is re-run many times while the report is written, and
// hammering a public archive for data that cannot change is rude and slow.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = join(process.cwd(), ".probe-cache");

export interface StationObs {
  localDate: string; // YYYY-MM-DD in the SITE's timezone
  hour: number; // 0..23 local
  minute: number;
  tempC: number;
  /** METAR sky cover of the lowest layer: CLR/FEW/SCT/BKN/OVC/VV — drives the clear-vs-overcast split. */
  skyc: string | null;
}

function cachePath(key: string) {
  return join(CACHE_DIR, `${key}.csv`);
}

/**
 * Pull hourly observations for one station over an inclusive date range.
 * `tz` is an IANA zone — IEM returns `valid` already converted, which is what we want since the
 * Felber equations and the index both work in site-local hours.
 */
export async function fetchStationHourly(opts: {
  station: string;
  network: string;
  tz: string;
  startIso: string;
  endIso: string;
}): Promise<StationObs[]> {
  const key = `${opts.network}_${opts.station}_${opts.startIso}_${opts.endIso}`.replace(/[^\w.-]/g, "_");
  mkdirSync(CACHE_DIR, { recursive: true });
  const path = cachePath(key);

  let csv: string;
  if (existsSync(path)) {
    csv = readFileSync(path, "utf8");
  } else {
    const [y1, m1, d1] = opts.startIso.split("-");
    const [y2, m2, d2] = opts.endIso.split("-");
    const url =
      `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=${encodeURIComponent(opts.station)}` +
      `&data=tmpc&data=skyc1` +
      `&year1=${y1}&month1=${Number(m1)}&day1=${Number(d1)}` +
      `&year2=${y2}&month2=${Number(m2)}&day2=${Number(d2)}` +
      `&tz=${encodeURIComponent(opts.tz)}&format=onlycomma&missing=empty&trace=empty&report_type=3`;
    const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
    if (!res.ok) throw new Error(`IEM ${opts.station}: HTTP ${res.status}`);
    csv = await res.text();
    writeFileSync(path, csv, "utf8");
  }

  const out: StationObs[] = [];
  const lines = csv.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length < 3) continue;
    const valid = parts[1]; // "YYYY-MM-DD HH:MM"
    const tmpc = parts[2];
    const skyc = parts[3] ?? "";
    if (!tmpc) continue;
    const t = Number(tmpc);
    if (!Number.isFinite(t)) continue;
    // Reject physically impossible values rather than let a sentinel poison the oracle.
    if (t < -70 || t > 60) continue;
    const localDate = valid.slice(0, 10);
    const hour = Number(valid.slice(11, 13));
    const minute = Number(valid.slice(14, 16));
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue;
    out.push({ localDate, hour, minute, tempC: t, skyc: skyc || null });
  }
  return out;
}

/**
 * Bucket raw METAR to ONE value per local clock hour: the observation closest to the hour top.
 * Routine METAR lands at ~:53, i.e. 7 minutes before the NEXT hour, so it is assigned to the hour
 * it is nearest — the same convention the reconstruction is sampled on, which is what keeps the
 * comparison fair.
 */
export function bucketToHours(obs: StationObs[]): Map<string, Map<number, number>> {
  const best = new Map<string, Map<number, { dist: number; t: number }>>();
  for (const o of obs) {
    // Nearest hour top, carrying into the next day when :53 rounds up past 23.
    let hour = o.minute >= 30 ? o.hour + 1 : o.hour;
    let date = o.localDate;
    const dist = o.minute >= 30 ? 60 - o.minute : o.minute;
    if (hour === 24) {
      hour = 0;
      date = addDays(o.localDate, 1);
    }
    let day = best.get(date);
    if (!day) {
      day = new Map();
      best.set(date, day);
    }
    const cur = day.get(hour);
    if (!cur || dist < cur.dist) day.set(hour, { dist, t: o.tempC });
  }
  const out = new Map<string, Map<number, number>>();
  for (const [date, day] of best) {
    const m = new Map<number, number>();
    for (const [h, v] of day) m.set(h, v.t);
    out.set(date, m);
  }
  return out;
}

/** Fraction of DAYTIME observations reporting a broken/overcast lowest layer. */
export function skyFractionByDay(obs: StationObs[]): Map<string, number | null> {
  const counts = new Map<string, { cloudy: number; total: number }>();
  for (const o of obs) {
    if (o.hour < 8 || o.hour > 18) continue;
    if (!o.skyc) continue;
    let c = counts.get(o.localDate);
    if (!c) {
      c = { cloudy: 0, total: 0 };
      counts.set(o.localDate, c);
    }
    c.total += 1;
    if (o.skyc === "BKN" || o.skyc === "OVC" || o.skyc === "VV") c.cloudy += 1;
  }
  const out = new Map<string, number | null>();
  for (const [d, c] of counts) out.set(d, c.total >= 4 ? c.cloudy / c.total : null);
  return out;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** The site's UTC offset in hours on a given local date (DST-aware). */
export function utcOffsetHours(iso: string, timeZone: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(probe).map((p) => [p.type, p.value]));
  const asLocal = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
  );
  return (asLocal - probe.getTime()) / 3600000;
}
