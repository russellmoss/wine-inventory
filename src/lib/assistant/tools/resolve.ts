import "server-only";

/**
 * Collapse a candidate list to exactly one match, or throw a helpful message the
 * model can relay. Used by write tools so a fuzzy name never silently writes to
 * the wrong block / item / location.
 */
export function resolveExactlyOne<T>(
  rows: T[],
  opts: { describe: (r: T) => string; noneMsg: string; manyMsg: string },
): T {
  if (rows.length === 0) throw new Error(opts.noneMsg);
  if (rows.length > 1) {
    throw new Error(`${opts.manyMsg}: ${rows.map(opts.describe).join("; ")}. Please be more specific.`);
  }
  return rows[0];
}
