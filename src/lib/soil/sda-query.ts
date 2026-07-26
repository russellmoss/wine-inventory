/**
 * Vineyard Intelligence P4 — the SDA T-SQL builders (PURE, injection-safe).
 *
 * TWO queries, never one joined query (council C2): the SPATIAL composition query clips one row per
 * mukey (a bare join to component×chorizon would multiply the expensive clip 24×), and the TABULAR
 * property query pulls per-component properties reduced to scalars. Both honor the injection invariant:
 * the composition query takes a WKT built only from validated finite numbers (`wkt-core.toWkt`), and the
 * property query interpolates ONLY mukeys that match /^\d+$/ (they come from SDA's own prior response,
 * but we still validate — no string is ever trusted into T-SQL).
 *
 * `.MakeValid()` is applied to the block geometry before every spatial method (council C6) so an ordinary
 * self-touching / bad-winding hand-drawn polygon does not throw a SQL-Server error. Areas are square
 * degrees (`STArea` on WGS84) — used only for the coverage RATIO, whose denominator (`block_sqdeg`) comes
 * from the SAME engine (council C4).
 */

/** The processing/algorithm version stamped on every snapshot (bump when a query shape changes). */
export const SOIL_QUERY_VERSION = "soil-sda-1";

/**
 * Composition + coverage, one row per mukey. `wkt` MUST come from `toWkt` (validated finite numbers).
 * survey area symbol/version via LEFT JOINs so a missing legend/sacatalog never drops a soil row.
 */
export function buildCompositionQuery(wkt: string): string {
  const G = `geometry::STGeomFromText('${wkt}', 4326).MakeValid()`;
  return [
    "SELECT p.mukey, m.muname, m.mukind, mag.drclassdcd, mag.aws025wta,",
    "       lg.areasymbol AS areasymbol, sac.saverest AS saverest,",
    "       SUM(p.isect) AS isect_sqdeg,",
    `       MAX(${G}.STArea()) AS block_sqdeg`,
    "FROM (",
    "  SELECT mukey,",
    `         mupolygongeo.MakeValid().STIntersection(${G}).STArea() AS isect`,
    "  FROM mupolygon",
    `  WHERE mupolygongeo.STIntersects(${G}) = 1`,
    ") p",
    "JOIN mapunit  m   ON m.mukey = p.mukey",
    "JOIN muaggatt mag ON mag.mukey = p.mukey",
    "LEFT JOIN legend    lg  ON lg.lkey = m.lkey",
    "LEFT JOIN sacatalog sac ON sac.areasymbol = lg.areasymbol",
    "GROUP BY p.mukey, m.muname, m.mukind, mag.drclassdcd, mag.aws025wta, lg.areasymbol, sac.saverest",
    "ORDER BY isect_sqdeg DESC",
  ].join("\n");
}

/** Simplification tolerance (degrees) for the display-overlay geometry — spike: 0.0001 → ~10 KB/block,
 *  263 vertices, 263 ms (vs 30 KB/839 vtx unsimplified). Display only; composition areas are exact. */
export const OVERLAY_REDUCE_TOLERANCE = 0.0001;

/**
 * Clipped DISPLAY geometry per map unit — one row per intersecting mupolygon feature, the block-clipped
 * geometry as WKT (`.Reduce()` simplified for size). For the optional soil map overlay ONLY; the
 * composition snapshot stays authoritative and is never derived from this (design §13.6). Same injection
 * posture as the composition query: `wkt` comes from `toWkt` (validated finite numbers).
 */
export function buildGeometryQuery(wkt: string): string {
  const G = `geometry::STGeomFromText('${wkt}', 4326).MakeValid()`;
  return [
    `SELECT p.mukey, p.mupolygongeo.MakeValid().STIntersection(${G}).Reduce(${OVERLAY_REDUCE_TOLERANCE}).STAsText() AS wkt`,
    "FROM mupolygon p",
    `WHERE p.mupolygongeo.STIntersects(${G}) = 1`,
  ].join("\n");
}

/** True only for a bare non-negative integer — the shape every real SSURGO mukey has. */
export function isValidMukey(mukey: string): boolean {
  return /^\d+$/.test(mukey);
}

/**
 * Per-component properties for the given mukeys, reduced to scalars: the topmost mineral-horizon pH and
 * the shallowest restrictive depth, via correlated subqueries so it stays ONE row per component.
 * Throws if any mukey is not a bare integer (injection guard) — the caller must have validated mukeys.
 */
export function buildPropertyQuery(mukeys: string[]): string {
  const clean = Array.from(new Set(mukeys));
  for (const mk of clean) {
    if (!isValidMukey(mk)) throw new Error(`refusing non-numeric mukey in SDA query: ${JSON.stringify(mk)}`);
  }
  if (clean.length === 0) throw new Error("buildPropertyQuery requires at least one mukey");
  const inList = clean.map((mk) => `'${mk}'`).join(", ");
  return [
    "SELECT co.mukey, co.cokey, co.compname, co.comppct_r, co.majcompflag, co.taxclname,",
    "  (SELECT TOP 1 ch.ph1to1h2o_r FROM chorizon ch",
    "     WHERE ch.cokey = co.cokey AND ch.ph1to1h2o_r IS NOT NULL ORDER BY ch.hzdept_r ASC) AS ph_top,",
    "  (SELECT MIN(cr.resdept_r) FROM corestrictions cr WHERE cr.cokey = co.cokey) AS resdept",
    "FROM component co",
    `WHERE co.mukey IN (${inList})`,
    "ORDER BY co.mukey, co.comppct_r DESC",
  ].join("\n");
}
