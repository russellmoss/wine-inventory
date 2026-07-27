/**
 * Spray S2b Unit 7b — pure parsers for CA DPR's pest vocabulary files.
 *
 * Both are fixed-width, CRLF-terminated, no header. Layouts established by reading the live files
 * byte-for-byte (phases/S2b-cdpr-interval-probe.md), not from documentation — DPR's prodtables.htm
 * no longer publishes them.
 *
 *   target_pest.dat        `CCNAME…`         cols [0,2) = 2-char code, [2,) = name
 *   prod_target_pest.dat   `  11349E9`       cols [0,7) = prodno (right-aligned), [7,9) = pest code
 *
 * Pure: no prisma, no fs, no network (rule §3.13). The caller supplies the text.
 */

export interface ParsedPestCategory {
  code: string;
  name: string;
}

export interface ParsedProductPest {
  prodno: string;
  pestCode: string;
}

/** Split on CRLF or LF and drop blank lines — DPR ships CRLF, but never depend on it. */
function lines(text: string): string[] {
  return text.split(/\r?\n/).filter((l) => l.trim().length > 0);
}

/**
 * Parse `target_pest.dat` → the 41 coarse categories.
 * A row whose code is not exactly 2 non-space characters, or whose name is empty, is DROPPED rather
 * than guessed at — an uncited half-row in a reference table is indistinguishable from a guess.
 */
export function parsePestCategories(text: string): ParsedPestCategory[] {
  const out: ParsedPestCategory[] = [];
  const seen = new Set<string>();
  for (const line of lines(text)) {
    const code = line.slice(0, 2).trim();
    const name = line.slice(2).trim();
    if (code.length !== 2 || name.length === 0) continue;
    if (seen.has(code)) continue; // first wins; a duplicate code is a source defect, not a merge
    seen.add(code);
    out.push({ code, name });
  }
  return out;
}

/**
 * Parse `prod_target_pest.dat` → product→category mappings.
 * `validCodes` is REQUIRED: a mapping to a code the dictionary does not contain would violate the
 * FK, and silently inserting it is how a coverage gap becomes an error at read time instead of a
 * countable, reportable drop here.
 */
export function parseProductPests(text: string, validCodes: ReadonlySet<string>): { rows: ParsedProductPest[]; droppedUnknownCode: number } {
  const rows: ParsedProductPest[] = [];
  let droppedUnknownCode = 0;
  for (const line of lines(text)) {
    const prodno = line.slice(0, 7).trim();
    const pestCode = line.slice(7, 9).trim();
    if (!prodno || pestCode.length !== 2) continue;
    if (!validCodes.has(pestCode)) {
      droppedUnknownCode += 1;
      continue;
    }
    rows.push({ prodno, pestCode });
  }
  return { rows, droppedUnknownCode };
}
