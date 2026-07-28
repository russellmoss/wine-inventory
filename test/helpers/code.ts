/**
 * Strip comments before asserting that a pattern is ABSENT from source.
 *
 * This repo's static guards keep failing on their own documentation: the comment
 * explaining *why* a pattern is gone contains the pattern. It has happened four
 * times now — `tone="gold"`, `fonts.googleapis.com`, `role="alert"`,
 * `role="tablist"` — so this lives in one place instead of being re-derived.
 *
 * Use `code(src)` for `not.toContain` assertions. Use the raw source for
 * `toContain`, where a comment match is harmless.
 */
export function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}
