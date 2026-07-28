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

  // Latest Brix / temperature per lot. Readings live on AnalysisReading via
  // AnalysisPanel — there is no FermentReading model — and VOIDED panels must be
  // excluded, or a reading the winemaker already corrected would still show here.
  // One grouped read rather than a query per row: a harvest worksheet is 40+ rows
  // and this is a screen a cellar hand refreshes all day.
  const lotIds = rows.map((r) => r.lotId);
  if (lotIds.length > 0) {
    const readings = await prisma.analysisReading.findMany({
      where: {
        analyte: { in: ["BRIX", "TEMP"] },
        panel: { lotId: { in: lotIds }, voidedAt: null },
      },
      select: { analyte: true, value: true, panel: { select: { lotId: true, observedAt: true } } },
      orderBy: { panel: { observedAt: "desc" } },
    });

    const latest = new Map<string, { brix: number | null; temp: number | null; at: Date }>();
    for (const r of readings) {
      const cur = latest.get(r.panel.lotId) ?? { brix: null, temp: null, at: r.panel.observedAt };
      // Rows arrive newest-first, so the first value seen per analyte is the latest.
      if (r.analyte === "BRIX" && cur.brix == null) cur.brix = Number(r.value);
      if (r.analyte === "TEMP" && cur.temp == null) cur.temp = Number(r.value);
      if (r.panel.observedAt > cur.at) cur.at = r.panel.observedAt;
      latest.set(r.panel.lotId, cur);
    }
    for (const row of rows) {
      const r = latest.get(row.lotId);
      if (!r) continue;
      row.brix = r.brix;
      row.tempC = r.temp;
      row.lastReadingAt = r.at.toISOString();
    }
  }

  return rows.sort((a, b) => a.vesselCode.localeCompare(b.vesselCode));
}
