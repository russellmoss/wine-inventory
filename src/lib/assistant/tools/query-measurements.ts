import "server-only";
import { prisma } from "@/lib/prisma";
import type { AssistantTool } from "../registry";
import { normVesselCode, vesselCodeCandidates, resolveLotTarget } from "../scope";
import { resolveAnalyteKey, ANALYTE_KEYS, getAnalyte } from "@/lib/chemistry/analytes";
import { dedupeByPhysicalReading } from "@/lib/chemistry/fanout-plan";
import {
  ageDays,
  analyteLabel,
  drynessLabel,
  expandVesselRefs,
  formatReading,
  latestPerAnalyte,
  rankVessels,
  stalenessVerdict,
  type FlatReading,
  type RankDirection,
  type RankRow,
} from "@/lib/chemistry/measurement-history";

// Assistant read coverage — a lot/vessel's recorded CHEMISTRY history (the AnalysisPanel data the
// lot page already shows). Filed as a bug report by the winemaker: the assistant could log a
// reading (record_measurement) and read current contents (query_cellar_contents) but had no way to
// read a reading BACK, so "what's tank T5's Brix" dead-ended in "open the lot page". query_brix is
// the VINEYARD-BLOCK ripeness reading (grapes on the vine); this is the CELLAR side.
//
// Cross-vessel rule (winemaker, 2026-07-22): never average across vessels. Comparisons are
// per-vessel enumeration or a ranking sort. See src/lib/chemistry/measurement-history.ts.

const MAX_VESSELS = 200;
const MAX_PANELS = 2000;
const MAX_HISTORY_POINTS = 200;

type Input = {
  lot?: string;
  vessel?: string;
  vessels?: string[];
  vesselType?: "TANK" | "BARREL";
  analyte?: string;
  analytes?: string[];
  rank?: RankDirection;
  history?: boolean;
  sinceDays?: number;
  since?: string;
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

function normalize(raw: unknown): Input {
  const r = (raw ?? {}) as Record<string, unknown>;
  const vesselType = str(r.vesselType)?.toUpperCase();
  const rank = str(r.rank)?.toLowerCase();
  return {
    lot: str(r.lot),
    vessel: str(r.vessel),
    vessels: strArray(r.vessels),
    vesselType: vesselType === "TANK" || vesselType === "BARREL" ? vesselType : undefined,
    analyte: str(r.analyte),
    analytes: strArray(r.analytes),
    rank: rank === "lowest" || rank === "highest" ? rank : undefined,
    history: r.history === true,
    sinceDays: typeof r.sinceDays === "number" && Number.isFinite(r.sinceDays) ? r.sinceDays : undefined,
    since: str(r.since),
  };
}

/** Resolve the requested analyte names to canonical registry keys; unknown names are reported. */
function resolveAnalytes(input: Input): { keys: string[]; unknown: string[] } {
  const asked = [...(input.analyte ? [input.analyte] : []), ...(input.analytes ?? [])];
  const keys: string[] = [];
  const unknown: string[] = [];
  for (const name of asked) {
    const key = resolveAnalyteKey(name);
    if (key) {
      if (!keys.includes(key)) keys.push(key);
    } else unknown.push(name);
  }
  return { keys, unknown };
}

/** The lower bound on observedAt, from `since` (ISO) or `sinceDays`. */
function sinceDate(input: Input, now: Date): Date | undefined {
  if (input.since) {
    const d = new Date(input.since);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (input.sinceDays != null && input.sinceDays > 0) {
    return new Date(now.getTime() - input.sinceDays * 86_400_000);
  }
  return undefined;
}

type TargetVessel = { id: string; code: string; type: string; label: string };

function vesselLabel(type: string, code: string): string {
  return `${type === "BARREL" ? "Barrel" : "Tank"} ${code}`;
}

/**
 * Resolve the vessel set in ONE query. A range ("barrels 1 through 5") is expanded first, then all
 * refs are matched against normalized vessel codes together — N separate lookups for a 40-barrel
 * sweep would be 40 round trips for data one findMany already has.
 */
async function resolveTargetVessels(input: Input): Promise<{ vessels: TargetVessel[]; unknown: string[] }> {
  const refs = expandVesselRefs([...(input.vessel ? [input.vessel] : []), ...(input.vessels ?? [])]);

  const all = await prisma.vessel.findMany({
    where: input.vesselType ? { type: input.vesselType } : {},
    select: { id: true, code: true, type: true },
    orderBy: { code: "asc" },
  });

  // No explicit refs: the whole type is the target ("across all barrels").
  if (refs.length === 0) {
    return {
      vessels: all.slice(0, MAX_VESSELS).map((v) => ({ ...v, label: vesselLabel(v.type, v.code) })),
      unknown: [],
    };
  }

  const byCode = new Map<string, (typeof all)[number]>();
  for (const v of all) byCode.set(normVesselCode(v.code), v);

  const vessels: TargetVessel[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const { wanted } = vesselCodeCandidates(ref);
    const hit = wanted.map((w) => byCode.get(w)).find((v) => v != null);
    if (!hit) {
      unknown.push(ref);
      continue;
    }
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    vessels.push({ ...hit, label: vesselLabel(hit.type, hit.code) });
  }
  return { vessels: vessels.slice(0, MAX_VESSELS), unknown };
}

type PanelRow = {
  id: string;
  lotId: string;
  vesselId: string | null;
  observedAt: Date;
  vesselReadingGroupId: string | null;
  readings: { analyte: string; value: unknown; unit: string }[];
};

function flatten(panels: PanelRow[], analyteKeys: string[]): FlatReading[] {
  const wanted = analyteKeys.length ? new Set(analyteKeys) : null;
  const out: FlatReading[] = [];
  for (const p of panels) {
    for (const r of p.readings) {
      if (wanted && !wanted.has(r.analyte)) continue;
      const value = Number(r.value);
      if (!Number.isFinite(value)) continue;
      out.push({ analyte: r.analyte, value, unit: r.unit, observedAt: p.observedAt.getTime(), panelId: p.id });
    }
  }
  return out;
}

function readingOut(r: FlatReading, nowMs: number) {
  return {
    analyte: r.analyte,
    label: analyteLabel(r.analyte),
    value: r.value,
    unit: r.unit,
    display: formatReading(r.analyte, r.value, r.unit),
    observedAt: new Date(r.observedAt).toISOString(),
    ageDays: ageDays(r.observedAt, nowMs),
    ...(r.analyte === "BRIX" ? { dryness: drynessLabel(r.value) } : {}),
  };
}

export const queryMeasurementsTool: AssistantTool = {
  name: "query_measurements",
  description:
    "Read the recorded lab/bench CHEMISTRY history for wine in a tank, a barrel, several vessels, or a lot — the same measurements shown on the lot page. Use for 'what is tank 5 at', 'what's T5's Brix', 'pH and TA on lot 2026-SY-2', 'show me the free SO2 history on barrel 12', 'has the VA moved on T3'. Analytes: pH, TA, VA, free SO2, total SO2, RS, Brix, SG, malic, lactic, alcohol, temperature, YAN, acetaldehyde. This is the CELLAR reading on wine already in a vessel — for ripeness Brix on grapes still on the vine in a vineyard block, use query_brix instead. " +
    "COMPARING VESSELS: pass `vessels` to enumerate ('pH of barrels 1 through 5' → vessels: ['barrels 1-5']; ranges are expanded for you), or `vesselType` to sweep every tank or barrel. Values are ALWAYS reported per vessel and are NEVER averaged together. To answer a superlative — 'which tank is closest to dry', 'which barrel has the lowest free SO2', 'what is my warmest tank' — pass ONE analyte plus `rank`: 'lowest' or 'highest'. Closest to dry = analyte 'BRIX' with rank 'lowest' (a dry wine sits slightly below 0 Brix). " +
    "Results carry each reading's date and age in days, plus a `staleness.warning` when the compared readings were taken too far apart to rank honestly — RELAY that warning to the user rather than stating the ranking flatly. Vessels with no reading come back in `vesselsWithNoReadings`; say so, because they are not part of the ranking.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      lot: { type: "string", description: "Lot code or name, e.g. '2026-SY-2'. Use when the user names a lot rather than a vessel." },
      vessel: { type: "string", description: "A single vessel reference, e.g. 'tank 5', 'T5', 'barrel 12'." },
      vessels: {
        type: "array",
        items: { type: "string" },
        description: "Several vessels to compare. Accepts ranges verbatim — ['barrels 1 through 5'] or ['B1-B5'] are expanded server-side. Values are reported per vessel, never averaged.",
      },
      vesselType: { type: "string", enum: ["TANK", "BARREL"], description: "Sweep every vessel of this type. Use for 'which tank…' / 'across all barrels' questions." },
      analyte: { type: "string", description: "One analyte: pH, TA, VA, FREE_SO2, TOTAL_SO2, RS, BRIX, SG, BAUME, TEMP, MALIC, LACTIC, ALCOHOL, YAN, ACETALDEHYDE. Required when `rank` is used." },
      analytes: { type: "array", items: { type: "string" }, description: "Several analytes. Omit both to return every analyte on record." },
      rank: {
        type: "string",
        enum: ["lowest", "highest"],
        description: "Rank the compared vessels by their latest value of `analyte`. 'lowest' for closest-to-dry (BRIX), lowest SO2, coldest; 'highest' for highest VA, warmest, highest pH.",
      },
      history: { type: "boolean", description: "True to return the full time series (trend over time) instead of just the latest value. Best on a single lot or vessel." },
      sinceDays: { type: "number", description: "Only readings from the last N days." },
      since: { type: "string", description: "Only readings on or after this ISO date (e.g. '2026-07-01')." },
    },
  },
  async run(_ctx, rawInput) {
    const input = normalize(rawInput);
    const now = new Date();
    const nowMs = now.getTime();

    const { keys: analyteKeys, unknown: unknownAnalytes } = resolveAnalytes(input);
    if (unknownAnalytes.length) {
      return {
        message: `I don't track an analyte called ${unknownAnalytes.map((a) => `"${a}"`).join(", ")}. Known analytes: ${ANALYTE_KEYS.map((k) => getAnalyte(k)!.label).join(", ")}.`,
      };
    }
    if (input.rank && analyteKeys.length !== 1) {
      return { message: "To rank vessels I need exactly one analyte — e.g. Brix for 'closest to dry', or free SO₂ for 'lowest SO₂'." };
    }

    const gte = sinceDate(input, now);
    const observedAtFilter = gte ? { observedAt: { gte } } : {};

    // ---- LOT scope: the user named a lot, not a vessel. -------------------------------------
    if (input.lot && !input.vessel && !(input.vessels ?? []).length && !input.vesselType) {
      const { lotId, lotCode } = await resolveLotTarget({ lot: input.lot });
      const panels = (await prisma.analysisPanel.findMany({
        where: { lotId, voidedAt: null, ...observedAtFilter },
        orderBy: { observedAt: "desc" },
        take: MAX_PANELS,
        select: { id: true, lotId: true, vesselId: true, observedAt: true, vesselReadingGroupId: true, readings: { select: { analyte: true, value: true, unit: true } } },
      })) as PanelRow[];

      const flat = flatten(panels, analyteKeys);
      if (flat.length === 0) {
        return { scope: "lot", lot: lotCode, message: `No ${analyteKeys.length ? analyteKeys.map(analyteLabel).join(" / ") + " " : ""}readings on record for lot ${lotCode}.` };
      }
      return {
        scope: "lot",
        lot: lotCode,
        latest: latestPerAnalyte(flat).map((r) => readingOut(r, nowMs)),
        ...(input.history
          ? { history: flat.sort((a, b) => b.observedAt - a.observedAt).slice(0, MAX_HISTORY_POINTS).map((r) => readingOut(r, nowMs)) }
          : {}),
        panelCount: panels.length,
      };
    }

    // ---- VESSEL scope --------------------------------------------------------------------
    if (!input.vessel && !(input.vessels ?? []).length && !input.vesselType && !input.lot) {
      return { message: "Which tank, barrel, or lot should I read? You can also ask across all tanks or all barrels." };
    }

    const { vessels, unknown } = await resolveTargetVessels(input);
    if (vessels.length === 0) {
      return { message: unknown.length ? `I couldn't find ${unknown.join(", ")}. Use a code like "T3" or "barrel 14".` : "No matching vessels." };
    }

    const vesselIds = vessels.map((v) => v.id);
    const residents = await prisma.vesselLot.findMany({
      where: { vesselId: { in: vesselIds } },
      orderBy: { volumeL: "desc" },
      select: { vesselId: true, lotId: true, lot: { select: { code: true } } },
    });
    const lotToVessel = new Map<string, string>();
    const lotCodeByVessel = new Map<string, string>();
    for (const r of residents) {
      if (!lotToVessel.has(r.lotId)) lotToVessel.set(r.lotId, r.vesselId);
      if (!lotCodeByVessel.has(r.vesselId)) lotCodeByVessel.set(r.vesselId, r.lot.code);
    }
    const residentLotIds = [...lotToVessel.keys()];

    // A panel counts for this vessel if it carries the vessel snapshot, OR it has no snapshot but
    // belongs to a lot currently resident here (same sourcing rule as listVesselAnalyses — without
    // the second arm, readings logged without a vessel snapshot vanish from vessel views).
    const panels = (await prisma.analysisPanel.findMany({
      where: {
        voidedAt: null,
        ...observedAtFilter,
        OR: [
          { vesselId: { in: vesselIds } },
          ...(residentLotIds.length ? [{ vesselId: null, lotId: { in: residentLotIds } }] : []),
        ],
      },
      orderBy: { observedAt: "desc" },
      take: MAX_PANELS,
      select: { id: true, lotId: true, vesselId: true, observedAt: true, vesselReadingGroupId: true, readings: { select: { analyte: true, value: true, unit: true } } },
    })) as PanelRow[];

    // Collapse legacy plan-060 fan-out groups so one physical reading is not counted twice.
    const byVessel = new Map<string, PanelRow[]>();
    for (const p of panels) {
      const vid = p.vesselId ?? lotToVessel.get(p.lotId);
      if (!vid || !vesselIds.includes(vid)) continue;
      const list = byVessel.get(vid) ?? [];
      list.push(p);
      byVessel.set(vid, list);
    }

    const rows = vessels.map((v) => {
      const vesselPanels = dedupeByPhysicalReading(byVessel.get(v.id) ?? []);
      const flat = flatten(vesselPanels, analyteKeys);
      return {
        vesselId: v.id,
        vessel: v.label,
        code: v.code,
        lotCode: lotCodeByVessel.get(v.id) ?? null,
        latest: latestPerAnalyte(flat),
        all: flat,
        panelCount: vesselPanels.length,
      };
    });

    const vesselsWithNoReadings = rows.filter((r) => r.latest.length === 0).map((r) => r.vessel);

    // ---- Superlative: rank the per-vessel latest values. ------------------------------------
    if (input.rank) {
      const key = analyteKeys[0];
      const rankRows: RankRow[] = rows.map((r) => ({
        vesselLabel: r.vessel,
        lotCode: r.lotCode,
        reading: r.latest.find((x) => x.analyte === key) ?? null,
      }));
      const { ranked, noData } = rankVessels(rankRows, input.rank);
      if (ranked.length === 0) {
        return {
          scope: "vessels",
          message: `No ${analyteLabel(key)} readings on record for ${vessels.length === 1 ? vessels[0].label : `any of those ${vessels.length} vessels`}.`,
          vesselsWithNoReadings: noData,
        };
      }
      const staleness = stalenessVerdict(
        ranked.map((r) => ({ vesselLabel: r.vesselLabel, observedAt: r.reading!.observedAt })),
        nowMs,
      );
      return {
        scope: "vessels",
        comparison: "ranking",
        analyte: key,
        analyteLabel: analyteLabel(key),
        direction: input.rank,
        note: "Per-vessel latest values, sorted. These are individual readings — nothing is averaged across vessels.",
        results: ranked.map((r, i) => ({
          rank: i + 1,
          vessel: r.vesselLabel,
          lot: r.lotCode,
          ...readingOut(r.reading!, nowMs),
        })),
        winner: ranked[0].vesselLabel,
        vesselsWithNoReadings: noData,
        ...(staleness?.warning ? { staleness } : {}),
        ...(unknown.length ? { unknownVessels: unknown } : {}),
      };
    }

    // ---- Enumeration: one row per vessel. ---------------------------------------------------
    const single = rows.length === 1;
    const staleness = stalenessVerdict(
      rows.flatMap((r) => (r.latest.length ? [{ vesselLabel: r.vessel, observedAt: Math.max(...r.latest.map((x) => x.observedAt)) }] : [])),
      nowMs,
    );
    return {
      scope: single ? "vessel" : "vessels",
      ...(rows.length > 1 ? { note: "One row per vessel. Report each vessel's own value — these are not averaged." } : {}),
      vessels: rows.map((r) => ({
        vessel: r.vessel,
        lot: r.lotCode,
        latest: r.latest.map((x) => readingOut(x, nowMs)),
        ...(input.history && single
          ? { history: r.all.sort((a, b) => b.observedAt - a.observedAt).slice(0, MAX_HISTORY_POINTS).map((x) => readingOut(x, nowMs)) }
          : {}),
        panelCount: r.panelCount,
      })),
      ...(vesselsWithNoReadings.length ? { vesselsWithNoReadings } : {}),
      ...(staleness?.warning ? { staleness } : {}),
      ...(unknown.length ? { unknownVessels: unknown } : {}),
    };
  },
};
