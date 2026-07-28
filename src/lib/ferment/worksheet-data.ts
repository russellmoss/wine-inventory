import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * The Fermentation worksheet's read (OD-8).
 *
 * Shape follows the incumbents, because both coalesce here and CLAUDE.md says a
 * Vintrace/InnoVint convergence is load-bearing:
 *
 *   - InnoVint's "Fermentation Worksheets" (Ferm Gen) put ONE ROW PER VESSEL for
 *     tanks and bins, with Vessel · Lot · Stage · Contents · Brix · Temperature,
 *     filtered to ferment-active lots rather than all lots.
 *   - Vintrace's "Ferments Console" is the same idea.
 *
 * Where we deliberately DIVERGE: InnoVint's `Stage` is a linear enum. We keep the
 * three-vector state (`form` + `afState` + `mlfState`) that
 * docs/architecture/data_model_coalescence.md records as an intentional
 * divergence, because real ferment is not linear — a lot can be DRY on alcohol
 * and mid-MLF at the same time, which one stage value cannot express.
 *
 * Vessel-first is already this repo's Phase-6 choice (`FermentMonitor` is
 * vessel-first), so this is consistent rather than new.
 */

export type FermentWorksheetRow = {
  vesselId: string;
  vesselCode: string;
  vesselType: string;
  lotId: string;
  lotCode: string;
  varietyName: string | null;
  vintageYear: number | null;
  volumeL: number;
  /** The three vectors, never flattened into a fake linear stage. */
  form: string;
  afState: string;
  mlfState: string;
  /** Latest non-voided readings; null when nothing has been logged yet. */
  brix: number | null;
  tempC: number | null;
  lastReadingAt: string | null;
};

export async function loadFermentWorksheet(): Promise<FermentWorksheetRow[]> {
  // "Ferment-active" against the REAL enums: AlcoholicFermState is NONE|ACTIVE|DRY
  // and MalolacticState is NONE|ACTIVE|COMPLETE. A lot that is DRY but running MLF
  // is still a live ferment and still belongs on this worksheet — which is exactly
  // the case a single linear stage would lose.
  const vesselLots = await prisma.vesselLot.findMany({
    where: {
      volumeL: { gt: 0 },
      lot: { OR: [{ afState: "ACTIVE" }, { mlfState: "ACTIVE" }] },
    },
    orderBy: { volumeL: "desc" },
    include: {
      vessel: { select: { id: true, code: true, type: true, isActive: true } },
      lot: {
        select: {
          id: true,
          code: true,
          vintageYear: true,
          form: true,
          afState: true,
          mlfState: true,
          originVarietyId: true,
        },
      },
    },
  });

  const active = vesselLots.filter((vl) => vl.vessel.isActive);

  // Lot carries `originVarietyId` as a scalar with no variety relation, so names
  // resolve through one lookup — the same shape /bulk uses.
  const varietyIds = [...new Set(active.map((vl) => vl.lot.originVarietyId).filter((v): v is string => !!v))];
  const varieties = varietyIds.length
    ? await prisma.variety.findMany({ where: { id: { in: varietyIds } }, select: { id: true, name: true } })
    : [];
  const varietyName = new Map(varieties.map((v) => [v.id, v.name]));

  const rows: FermentWorksheetRow[] = active.map((vl) => ({
    vesselId: vl.vessel.id,
    vesselCode: vl.vessel.code,
    vesselType: String(vl.vessel.type),
    lotId: vl.lot.id,
    lotCode: vl.lot.code,
    varietyName: vl.lot.originVarietyId ? (varietyName.get(vl.lot.originVarietyId) ?? null) : null,
    vintageYear: vl.lot.vintageYear ?? null,
    volumeL: Number(vl.volumeL),
    form: String(vl.lot.form),
    afState: String(vl.lot.afState),
    mlfState: String(vl.lot.mlfState),
    brix: null,
    tempC: null,
    lastReadingAt: null,
  }));

  // Latest Brix / temperature per lot.
  //
  // Shape note. The first version ordered AnalysisReading by a RELATION field
  // (`panel.observedAt`) and fetched EVERY reading for every lot with no bound.
  // That is a real scale hazard — a relation order forces a join-then-sort across
  // the whole reading table, and a fermenting lot accumulates readings daily — so
  // this shape (bounded scalar-ordered panels, then readings by indexed FK) is
  // the right one to keep.
  //
  // It was NOT, however, the cause of the 35s /ferment render that prompted the
  // rewrite. Measured with scripts/time-ferment-worksheet.ts: 2.3s for the vessel
  // query (mostly connection setup) and 0.3s for varieties. The slowness is
  // dev-mode compile plus remote-Neon latency — the dashboard measures 10-13s on
  // the same server, and a warm /ferment measures 9.1s. Recorded so nobody
  // re-optimises a query that was never the bottleneck.
  //
  // Instead: find the recent panels first (scalar order on an indexed column,
  // bounded), then read only those panels' readings by indexed FK.
  const lotIds = rows.map((r) => r.lotId);
  if (lotIds.length > 0) {
    const panels = await prisma.analysisPanel.findMany({
      where: { lotId: { in: lotIds }, voidedAt: null },
      orderBy: { observedAt: "desc" },
      select: { id: true, lotId: true, observedAt: true },
      // A few panels per lot is plenty to find the newest Brix AND the newest
      // temp, which may have been recorded in different panels.
      take: lotIds.length * 6,
    });
    if (panels.length > 0) {
      const readings = await prisma.analysisReading.findMany({
        where: { panelId: { in: panels.map((p) => p.id) }, analyte: { in: ["BRIX", "TEMP"] } },
        select: { panelId: true, analyte: true, value: true },
      });
      // Index readings BY PANEL, then walk `panels` in newest-first order. The
      // previous shape iterated `readings`, which comes back unordered — so
      // "first value wins" would have picked an arbitrary reading, not the
      // latest. Silent wrong numbers on a ferment screen are worse than slow ones.
      const readingsByPanel = new Map<string, { analyte: string; value: unknown }[]>();
      for (const r of readings) {
        const list = readingsByPanel.get(r.panelId) ?? [];
        list.push({ analyte: String(r.analyte), value: r.value });
        readingsByPanel.set(r.panelId, list);
      }

      const latest = new Map<string, { brix: number | null; temp: number | null; at: Date | null }>();
      for (const p of panels) {
        const cur = latest.get(p.lotId) ?? { brix: null, temp: null, at: null };
        for (const r of readingsByPanel.get(p.id) ?? []) {
          if (r.analyte === "BRIX" && cur.brix == null) {
            cur.brix = Number(r.value);
            cur.at = cur.at ?? p.observedAt;
          }
          if (r.analyte === "TEMP" && cur.temp == null) {
            cur.temp = Number(r.value);
            cur.at = cur.at ?? p.observedAt;
          }
        }
        latest.set(p.lotId, cur);
      }

      for (const row of rows) {
        const r = latest.get(row.lotId);
        if (!r) continue;
        row.brix = r.brix;
        row.tempC = r.temp;
        row.lastReadingAt = r.at ? r.at.toISOString() : null;
      }
    }
  }

  return rows.sort((a, b) => a.vesselCode.localeCompare(b.vesselCode));
}
