import "server-only";
import type { ChoiceOption, ChoiceRequest } from "../assistant-events";

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

export type ResolveResult<T> = { kind: "one"; row: T } | { kind: "choice"; choice: ChoiceRequest };

/**
 * Like resolveExactlyOne, but on ambiguity returns a CHOICE (clickable options) instead of throwing a
 * text question. Text disambiguation dead-loops when candidate names collide (the user types a name, we
 * re-run the same match, same tie) — a picker resolves by id via `send`, so identical names still pick
 * cleanly. Still throws on zero matches (nothing to pick). Caller does `if (res.kind === "choice") return
 * res.choice;` — run.ts turns that into the picker event.
 */
export function resolveOneOrChoice<T>(
  rows: T[],
  opts: {
    prompt: string; // picker heading, e.g. 'Which "KMBS" did you mean?'
    describe: (r: T) => string; // button label
    detail?: (r: T) => string | undefined; // sublabel — a DISTINGUISHING field so dupes are tell-apart-able
    send: (r: T) => string; // the id-pinned follow-up the tap posts
    noneMsg: string;
  },
): ResolveResult<T> {
  if (rows.length === 0) throw new Error(opts.noneMsg);
  if (rows.length === 1) return { kind: "one", row: rows[0] };
  const options: ChoiceOption[] = rows.map((r) => {
    const sub = opts.detail?.(r);
    return { label: opts.describe(r), send: opts.send(r), ...(sub ? { sublabel: sub } : {}) };
  });
  return { kind: "choice", choice: { needsChoice: true, prompt: opts.prompt, options } };
}
