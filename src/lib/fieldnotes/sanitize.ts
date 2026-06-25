// Pure, unit-tested sanitizers for custom field-input names. No server-only imports.
//
// Two distinct outputs from one raw string:
//  - cleanInputName  -> the human-readable DISPLAY label ("NEEM OIL")
//  - normalizeInputKey -> the DEDUP key, strip-all-non-alphanumeric ("NEEMOIL")
// so "NEEM OIL" / "NEEM-OIL" / "neem  oil" all collapse to one master-list row.

/**
 * Clean a raw input name into its canonical display form: trim, strip anything
 * that is not a letter/number/space/hyphen, collapse runs of whitespace, and
 * UPPERCASE. Throws if nothing usable remains.
 */
export function cleanInputName(raw: unknown): string {
  const cleaned = String(raw ?? "")
    .normalize("NFKD") // decompose accents (é -> e + combining mark)
    .replace(/[̀-ͯ]/g, "") // drop the combining marks so "Coppér" -> "Copper"
    .replace(/[^A-Za-z0-9 -]/g, " ") // drop remaining punctuation/emoji
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  if (!cleaned) throw new Error("Input name is empty after cleaning.");
  return cleaned;
}

/**
 * Dedup key: strip EVERY non-alphanumeric character and UPPERCASE. Collapses
 * spacing/punctuation variants of the same input to one key.
 * "NEEM OIL" / "NEEM-OIL" / "neem  oil" -> "NEEMOIL".
 */
export function normalizeInputKey(raw: unknown): string {
  const key = String(raw ?? "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  if (!key) throw new Error("Input name has no alphanumeric content.");
  return key;
}
