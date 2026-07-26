/**
 * Vineyard Intelligence P4 — parse the SDA `JSON+COLUMNNAME` payload.
 *
 * PURE: no I/O. SDA returns `{ Table: [[colName,...], [value,...], ...] }` — an ARRAY OF ARRAYS whose
 * row 0 is column names and whose EVERY value is a string (or null), untyped (design §External
 * interface). An engineer expecting `[{mukey: 547239}]` writes the wrong parser and finds out at
 * runtime — so coerce explicitly and column-by-name, never by position.
 */

export type SdaTable = { cols: string[]; rows: (string | null)[][] };

/** Composition (spatial) row — one per map unit. Areas are SQL-Server square degrees (ratios only). */
export type SdaCompositionRow = {
  mukey: string;
  muname: string;
  mukind: string | null;
  drclassdcd: string | null; // muaggatt dominant-condition drainage (NRCS roll-up — cited as such)
  aws025wta: number | null; // available water storage 0–25cm, mm (NOT the cm/cm fraction)
  isectSqDeg: number; // clipped intersection area, square degrees
  blockSqDeg: number; // whole-block area, square degrees (same engine — the coverage denominator)
  surveyAreaSymbol: string | null;
  surveyAreaVersion: string | null;
};

/** Property (tabular) row — one per component. pH/restrictive depth are scalar (topmost horizon / min). */
export type SdaPropertyRow = {
  mukey: string;
  cokey: string;
  compname: string | null;
  comppct: number | null;
  majcompflag: string | null;
  taxclname: string | null; // NULL for misc-area/water components — the non-soil signal (council C9)
  phTop: number | null; // topmost mineral-horizon pH
  resdept: number | null; // min restrictive depth, cm
};

/** Parse the raw JSON body into a column-named table. Throws on a non-table shape (the caller maps
 *  that to the unreachable/unreadable state — a malformed body must never be treated as "0 soils"). */
export function parseSdaTable(raw: unknown): SdaTable {
  const obj = raw as { Table?: unknown };
  const table = obj?.Table;
  if (!Array.isArray(table)) throw new Error("SDA payload missing Table array");
  if (table.length === 0) return { cols: [], rows: [] };
  const cols = (table[0] as unknown[]).map((c) => String(c));
  const rows = table.slice(1).map((r) => (r as unknown[]).map((v) => (v == null ? null : String(v))));
  return { cols, rows };
}

/** Coerce a string cell to a finite number, or null. Empty string / non-numeric → null (never NaN). */
function num(v: string | null): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pick(table: SdaTable, name: string): (row: (string | null)[]) => string | null {
  const i = table.cols.indexOf(name);
  return (row) => (i < 0 ? null : row[i]);
}

export function parseCompositionRows(table: SdaTable): SdaCompositionRow[] {
  const mukey = pick(table, "mukey");
  const muname = pick(table, "muname");
  const mukind = pick(table, "mukind");
  const dr = pick(table, "drclassdcd");
  const awc = pick(table, "aws025wta");
  const isect = pick(table, "isect_sqdeg");
  const block = pick(table, "block_sqdeg");
  const saSym = pick(table, "areasymbol");
  const saVer = pick(table, "saverest");
  return table.rows
    .map((r) => ({
      mukey: mukey(r) ?? "",
      muname: muname(r) ?? "",
      mukind: mukind(r),
      drclassdcd: dr(r),
      aws025wta: num(awc(r)),
      isectSqDeg: num(isect(r)) ?? 0,
      blockSqDeg: num(block(r)) ?? 0,
      surveyAreaSymbol: saSym(r),
      surveyAreaVersion: saVer(r),
    }))
    .filter((r) => r.mukey !== "");
}

/** One clipped display-geometry row: a map unit's block-clipped geometry as WKT (overlay only). */
export type SdaGeometryRow = { mukey: string; wkt: string | null };

export function parseGeometryRows(table: SdaTable): SdaGeometryRow[] {
  const mukey = pick(table, "mukey");
  const wkt = pick(table, "wkt");
  return table.rows.map((r) => ({ mukey: mukey(r) ?? "", wkt: wkt(r) })).filter((r) => r.mukey !== "");
}

export function parsePropertyRows(table: SdaTable): SdaPropertyRow[] {
  const mukey = pick(table, "mukey");
  const cokey = pick(table, "cokey");
  const compname = pick(table, "compname");
  const comppct = pick(table, "comppct_r");
  const maj = pick(table, "majcompflag");
  const tax = pick(table, "taxclname");
  const ph = pick(table, "ph_top");
  const res = pick(table, "resdept");
  return table.rows
    .map((r) => ({
      mukey: mukey(r) ?? "",
      cokey: cokey(r) ?? "",
      compname: compname(r),
      comppct: num(comppct(r)),
      majcompflag: maj(r),
      taxclname: tax(r),
      phTop: num(ph(r)),
      resdept: num(res(r)),
    }))
    .filter((r) => r.mukey !== "");
}
