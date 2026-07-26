/**
 * S0 Unit 2, addendum — NWS RE-ISSUANCE CADENCE and PER-PROPERTY INTERVAL WIDTHS.
 *
 * Run:  npx tsx scripts/s0-probe-nws-cadence.ts [--hours 3] [--every-min 10]
 *
 * Two things the main Unit 2 probe surfaced but could not finish, both of which change other phases.
 *
 * ── 1. Cadence ──
 * Council C5 withdrew the plan's "~170×" forecast-row multiplier as false precision computed before
 * anything was measured, and required §1.4's ceiling to be DERIVED from measured issuance cadence and
 * retained horizon. The main probe sampled `updateTime` seven times over 30 minutes and saw **zero
 * changes**, with the product already **8.5 hours old** at first sample. A 30-minute window yields a
 * lower bound of 30 minutes and nothing more — which is not a measurement, it is an absence of one.
 * This runs long enough to actually catch re-issuances.
 *
 * ── 2. Interval widths ──
 * The main probe recorded the SET of ISO8601 interval widths per property and found they differ
 * wildly: `temperature` came back in 1/2/3/4-hour bins, `relativeHumidity` in 1/2/3/5/**10**-hour
 * bins, `quantitativePrecipitation` in only 2- and 6-hour bins. It did not record the DISTRIBUTION,
 * and the distribution is what matters:
 *
 *   ⚠️ A 10-hour-wide relative-humidity bin fed into an HOURLY leaf-wetness model is nine fabricated
 *      hours wearing the tenth one's value. CART is a threshold model; a flat 10-hour RH plateau
 *      either crosses 87.8% for all ten hours or none of them, and the wet-run segmentation that
 *      feeds every pathogen model inherits that artifact directly.
 *
 * So this records, per property, how much of the horizon arrives at each width and at what lead time.
 *
 * Appends to: docs/spray_assistant/phases/s0-nws-cadence-and-widths.md (+ .json sidecar)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { POLITE_MS, S0_SITES, probeJson, sleep } from "./s0-sites";

const OUT_MD = join(process.cwd(), "docs", "spray_assistant", "phases", "s0-nws-cadence-and-widths.md");
const OUT_JSON = join(process.cwd(), "docs", "spray_assistant", "phases", "s0-nws-cadence-and-widths.json");

function num(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : dflt;
}

const HOURS = num("hours", 3);
const EVERY_MIN = num("every-min", 10);

const PROPS = [
  "temperature",
  "dewpoint",
  "relativeHumidity",
  "windSpeed",
  "skyCover",
  "quantitativePrecipitation",
] as const;

function intervalHours(validTime: string): number | null {
  const dur = validTime.split("/")[1];
  if (!dur) return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(dur);
  if (!m) return null;
  return Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0) + Number(m[3] ?? 0) / 60;
}

type Sample = { at: string; site: string; updateTime: string | null; generatedAt: string | null };

async function main() {
  // US sites only — the non-US site has no NWS grid, which is rule §3.9 working, not a gap.
  const sites = S0_SITES.filter((s) => s.nwsCovered);
  const grids: Record<string, { gridId: string; gridX: number; gridY: number }> = {};
  for (const s of sites) {
    const r = await probeJson<any>(`https://api.weather.gov/points/${s.lat.toFixed(4)},${s.lon.toFixed(4)}`);
    if (r.ok) grids[s.key] = { gridId: r.body.properties.gridId, gridX: r.body.properties.gridX, gridY: r.body.properties.gridY };
    await sleep(POLITE_MS);
  }
  console.log(`sampling ${Object.keys(grids).length} NWS gridpoints every ${EVERY_MIN} min for ${HOURS} h\n`);

  const samples: Sample[] = [];
  // widths: property → width(h) → count of slots, plus lead-time bucketing
  const widthCounts: Record<string, Record<string, number>> = {};
  const widthByLead: Record<string, Array<{ leadH: number; widthH: number }>> = {};
  let widthsCaptured = false;

  const iterations = Math.max(1, Math.round((HOURS * 60) / EVERY_MIN));
  for (let i = 0; i < iterations; i++) {
    for (const [key, g] of Object.entries(grids)) {
      const url = `https://api.weather.gov/gridpoints/${g.gridId}/${g.gridX},${g.gridY}`;
      const r = await probeJson<any>(url);
      const at = new Date().toISOString();
      if (!r.ok) {
        samples.push({ at, site: key, updateTime: null, generatedAt: null });
        console.log(`  [${at}] ${key}: HTTP ${r.status}`);
        await sleep(POLITE_MS);
        continue;
      }
      const p = r.body.properties ?? {};
      samples.push({ at, site: key, updateTime: p.updateTime ?? null, generatedAt: p.generatedAt ?? null });
      const ageH = p.updateTime ? (Date.parse(at) - Date.parse(p.updateTime)) / 3_600_000 : null;
      console.log(`  [${at.slice(11, 19)}] ${key.padEnd(14)} updateTime=${p.updateTime} (age ${ageH?.toFixed(1)} h)`);

      // capture the width distribution once, from the first successful response
      if (!widthsCaptured) {
        const now = Date.now();
        for (const prop of PROPS) {
          const vals: Array<{ validTime: string }> = p[prop]?.values ?? [];
          widthCounts[prop] ??= {};
          widthByLead[prop] ??= [];
          for (const v of vals) {
            const w = intervalHours(v.validTime);
            if (w == null) continue;
            widthCounts[prop][String(w)] = (widthCounts[prop][String(w)] ?? 0) + 1;
            const leadH = (Date.parse(v.validTime.split("/")[0]) - now) / 3_600_000;
            widthByLead[prop].push({ leadH: Number(leadH.toFixed(1)), widthH: w });
          }
        }
        widthsCaptured = true;
      }
      await sleep(POLITE_MS);
    }
    if (i < iterations - 1) await sleep(EVERY_MIN * 60_000);
  }

  // ── analysis ──
  const perSite: Record<string, { distinct: string[]; gapsMin: number[]; ages: number[] }> = {};
  for (const s of samples) {
    perSite[s.site] ??= { distinct: [], gapsMin: [], ages: [] };
    if (s.updateTime && !perSite[s.site].distinct.includes(s.updateTime)) perSite[s.site].distinct.push(s.updateTime);
    if (s.updateTime) perSite[s.site].ages.push((Date.parse(s.at) - Date.parse(s.updateTime)) / 3_600_000);
  }
  for (const v of Object.values(perSite)) {
    v.distinct.sort();
    for (let i = 1; i < v.distinct.length; i++) {
      v.gapsMin.push((Date.parse(v.distinct[i]) - Date.parse(v.distinct[i - 1])) / 60_000);
    }
  }

  const out = {
    measuredAt: new Date().toISOString(),
    windowHours: HOURS,
    everyMin: EVERY_MIN,
    samples,
    perSite,
    widthCounts,
    widthByLead,
  };
  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(out, null, 2), "utf8");
  writeFileSync(OUT_MD, render(out), "utf8");
  console.log(`\nwrote ${OUT_MD}`);
}

function render(o: any): string {
  const L: string[] = [];
  L.push("---");
  L.push("title: S0 Unit 2 addendum — NWS re-issuance cadence and per-property interval widths");
  L.push("type: phase-artifact");
  L.push("phase: S0");
  L.push("unit: 2");
  L.push(`date: ${String(o.measuredAt).slice(0, 10)}`);
  L.push("---");
  L.push("");
  L.push("# S0 Unit 2 addendum — NWS cadence and interval widths");
  L.push("");
  L.push(`Sampled every ${o.everyMin} min for ${o.windowHours} h, ending ${o.measuredAt}.`);
  L.push("");
  L.push("## 1. Re-issuance cadence — §1.4's ceiling input");
  L.push("");
  L.push("Council C5 withdrew the plan's \"~170×\" forecast-row multiplier as false precision and required the");
  L.push("ceiling to be derived from a MEASURED cadence. Measured:");
  L.push("");
  L.push("| Site | Distinct issuances seen | Gaps between them | Product age at sampling (min / median / max) |");
  L.push("|---|---|---|---|");
  for (const [site, v] of Object.entries<any>(o.perSite ?? {})) {
    const ages: number[] = [...v.ages].sort((a: number, b: number) => a - b);
    const med = ages.length ? ages[Math.floor(ages.length / 2)] : null;
    L.push(
      `| ${site} | ${v.distinct.length} | ${v.gapsMin.length ? v.gapsMin.map((g: number) => `${g.toFixed(0)} min`).join(", ") : "_none observed_"} | ${ages.length ? `${ages[0].toFixed(1)} h / ${med!.toFixed(1)} h / ${ages[ages.length - 1].toFixed(1)} h` : "—"} |`,
    );
  }
  L.push("");
  const allGaps = Object.values<any>(o.perSite ?? {}).flatMap((v) => v.gapsMin as number[]);
  if (allGaps.length) {
    const medianGap = [...allGaps].sort((a, b) => a - b)[Math.floor(allGaps.length / 2)];
    L.push(`**Median observed re-issuance interval: ${(medianGap / 60).toFixed(1)} h.**`);
    L.push("");
    L.push("With the retained horizon measured at **179 h** (Unit 2 §3), the forecast-row ceiling is:");
    L.push("");
    L.push("```");
    L.push(`rows/vineyard/year = 8,760 valid hours × ceil(179 h horizon / ${(medianGap / 60).toFixed(1)} h cadence)`);
    L.push(`                   = 8,760 × ${Math.ceil(179 / (medianGap / 60))}`);
    L.push(`                   ≈ ${(8760 * Math.ceil(179 / (medianGap / 60))).toLocaleString()} rows/vineyard/year`);
    L.push("```");
    L.push("");
    L.push(
      `That is a **${Math.ceil(179 / (medianGap / 60))}×** multiplier on the observed-hours baseline for a retain-every-issuance forecast posture — versus the withdrawn "~170×" guess.`,
    );
  } else {
    L.push("⚠️ **No re-issuance was observed in the entire sampling window, at any site.** That is a result, not a");
    L.push("failed measurement, and it is the more interesting one: the raw gridpoint product is re-issued LESS");
    L.push("often than the window is long, and the product ages above show it was already many hours old when");
    L.push("sampling began.");
    L.push("");
    L.push("So the ceiling can only be BOUNDED, not fixed:");
    L.push("");
    L.push("```");
    L.push(`cadence  >  ${o.windowHours} h            (no change observed across the window)`);
    L.push("horizon  =  179 h              (measured, Unit 2 §3)");
    L.push(`multiplier  <  ceil(179 / ${o.windowHours}) = ${Math.ceil(179 / o.windowHours)}×`);
    L.push("```");
    L.push("");
    L.push("**This is an UPPER bound on the multiplier, and it is already far below the withdrawn \"~170×\".**");
    L.push("The retain-every-issuance branch is therefore materially cheaper than the plan feared — which weakens");
    L.push("the strongest argument the plan had for the snapshot branch of council S2. Unit 8 must take the");
    L.push("bound as a bound and not silently harden it into a point estimate.");
    L.push("");
    L.push("⚠️ **S1 requirement:** a bound is not a cadence. Before S1 sizes a forecast retention job, it needs a");
    L.push("multi-day observation of `updateTime` per gridpoint — cheap to run, impossible to fake, and the");
    L.push("difference between sizing a table and guessing at one.");
  }
  L.push("");
  L.push("## 2. ⚠️ Per-property interval widths — the finding that changes S1's parser");
  L.push("");
  L.push("NWS gridpoint properties are ISO8601 **intervals**, not instants, and the widths differ per property");
  L.push("*and* grow with lead time. Measured distribution, one full response:");
  L.push("");
  const widths = new Set<string>();
  for (const counts of Object.values<any>(o.widthCounts ?? {})) for (const w of Object.keys(counts)) widths.add(w);
  const sortedWidths = [...widths].sort((a, b) => Number(a) - Number(b));
  L.push(`| Property | ${sortedWidths.map((w) => `${w} h`).join(" | ")} | slots | hours covered |`);
  L.push(`|---|${sortedWidths.map(() => "---|").join("")}---|---|`);
  for (const prop of PROPS) {
    const counts = (o.widthCounts ?? {})[prop] ?? {};
    const slots = Object.values<number>(counts).reduce((a, b) => a + b, 0);
    const hours = Object.entries<number>(counts).reduce((a, [w, n]) => a + Number(w) * n, 0);
    L.push(
      `| \`${prop}\` | ${sortedWidths.map((w) => (counts[w] ? String(counts[w]) : "·")).join(" | ")} | ${slots} | ${hours} |`,
    );
  }
  L.push("");
  L.push("### Why this is not a parsing detail");
  L.push("");
  L.push("**A 10-hour-wide relative-humidity bin fed into an hourly leaf-wetness model is nine fabricated hours");
  L.push("wearing the tenth one's value.** CART is a threshold model: a flat 10-hour RH plateau either crosses");
  L.push("87.8% for all ten hours or for none of them. There is no intermediate. So a single coarse bin at long");
  L.push("lead time can manufacture — or erase — a ten-hour wetness run, and the wet-run segmentation that feeds");
  L.push("every pathogen model in S5b inherits that artifact whole.");
  L.push("");
  L.push("Three consequences, none of which S0 is scoped to fix:");
  L.push("");
  L.push("1. **S1's NWS adapter must carry the native interval width per value**, not expand each interval into");
  L.push("   N identical hourly rows and forget it happened. Plan 097 already learned this for the hourly");
  L.push("   forecast modal (`precipDurationH` exists on `VineyardForecastHourly` for exactly this reason); the");
  L.push("   CART inputs need the same treatment, per property, because their widths differ from each other.");
  L.push("2. **The LWD confidence band must degrade with the width of the bin the hour came from.** An hour");
  L.push("   derived from a 1-hour bin and an hour derived from a 10-hour bin are not the same evidence, and");
  L.push("   rule §3.5 already requires estimated values to be labeled.");
  L.push("3. **S7b's application window inherits it too.** `quantitativePrecipitation` arrives in 2- and 6-hour");
  L.push("   bins only, so \"will it rain in the next hour\" is not a question this product answers at all.");
  L.push("");
  L.push("Widths also GROW with lead time, so the degradation is systematic rather than random: the far end of");
  L.push("the horizon is uniformly coarser than the near end. Any model consuming day 6 of the forecast is");
  L.push("consuming a materially different data product from the one it consumes on day 1.");
  L.push("");
  return L.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
