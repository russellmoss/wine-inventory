/**
 * Parse a feedback item's `developerNotes` into a read-only outcome/triage timeline.
 *
 * The bug-triage goalie (scripts/bug-triage-set-status.ts `mergeNotes`) prepends each
 * outcome newest-first, stamped `[bug-triage <ISO>] <note>`, entries joined by `\n\n---\n`,
 * and the whole field capped at 5000 chars. A machine note's body starts with the
 * disposition `[type]` (e.g. `[defect]`, `[product-gap]`). A human editing the field in
 * /developer writes free text (no stamp) — those are surfaced as `source: "human"`.
 *
 * The loader (src/lib/developer/feedback.ts) sanitizes this to 4000 chars, so the OLDEST
 * (last) entry can be truncated mid-string; the parser must not throw on a partial tail.
 * Pure + isomorphic (no deps) so it is unit-tested in test/triage-notes.test.ts and safe
 * to import into the client component.
 */

export type TriageNoteSource = "bug-triage" | "human";

export type TriageNoteEntry = {
  /** ISO timestamp from the `[bug-triage <iso>]` stamp, or null for a human/unstamped entry. */
  stamp: string | null;
  /** Who wrote it: the goalie (`bug-triage`) or a person editing in /developer (`human`). */
  source: TriageNoteSource;
  /** The disposition token from a leading `[type]` prefix (e.g. "defect"), or null. */
  type: string | null;
  /** The note text with the stamp and `[type]` prefix stripped. */
  text: string;
};

const ENTRY_SEPARATOR = "\n\n---\n";
// `[bug-triage 2026-07-14T12:34:56.789Z] rest` — capture the stamp, keep the rest.
const STAMP_RE = /^\[bug-triage ([^\]]+)\]\s*/;
// A leading disposition token like `[defect]` / `[model-behavior]` at the start of the body.
const TYPE_RE = /^\[([a-z][a-z-]*)\]\s*/;

/**
 * Split `developerNotes` into timeline entries, newest-first (the stored order).
 * Returns [] for null/empty input. Never throws on a truncated trailing entry.
 */
export function parseTriageNotes(developerNotes: string | null | undefined): TriageNoteEntry[] {
  if (!developerNotes) return [];
  const trimmed = developerNotes.trim();
  if (!trimmed) return [];

  const entries: TriageNoteEntry[] = [];
  for (const raw of trimmed.split(ENTRY_SEPARATOR)) {
    const chunk = raw.trim();
    if (!chunk) continue;

    const stampMatch = chunk.match(STAMP_RE);
    const source: TriageNoteSource = stampMatch ? "bug-triage" : "human";
    const stamp = stampMatch ? stampMatch[1].trim() : null;
    const afterStamp = stampMatch ? chunk.slice(stampMatch[0].length) : chunk;

    const typeMatch = afterStamp.match(TYPE_RE);
    const type = typeMatch ? typeMatch[1] : null;
    const text = (typeMatch ? afterStamp.slice(typeMatch[0].length) : afterStamp).trim();

    entries.push({ stamp, source, type, text });
  }
  return entries;
}
