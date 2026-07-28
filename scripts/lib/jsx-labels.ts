/**
 * Find JSX form controls that have no accessible name.
 *
 * This exists because three successive ad-hoc greps gave three different answers
 * (31, 71, 34 unlabelled selects) and the best of them still produced a false
 * positive. Every one of those failures came from the same root cause: **you
 * cannot find the end of a JSX opening tag by searching for `>`**. A `>` appears
 * inside `(e) => …`, inside `a > b`, and inside string and template literals. So
 * this module tokenises properly instead of pattern-matching, and its own
 * correctness is pinned by test/jsx-labels.test.ts.
 *
 * Pure and dependency-free — no fs, no React — so it is unit-testable under the
 * repo's `environment: "node"` vitest config.
 */

/** A control with no accessible name. */
export interface UnlabelledControl {
  file: string;
  line: number;
  tagName: string;
  /** The opening tag, truncated for reporting. */
  excerpt: string;
}

const CONTROL_TAGS = ["select", "textarea", "input"] as const;
export type ControlTag = (typeof CONTROL_TAGS)[number];

/**
 * Return the full JSX opening tag starting at `start` (the index of `<`).
 *
 * Walks a small state machine over code / '…' / "…" / `…${…}…` / // … / block
 * comments, tracking `{}` depth only while in code. Returns null if unterminated.
 */
export function openingTag(src: string, start: number): string | null {
  let i = start;
  let depth = 0;
  // Stack of template-literal expression depths, so `${ {a:1} }` nests correctly.
  const tmplStack: number[] = [];
  let mode: "code" | "sq" | "dq" | "tmpl" | "line" | "block" = "code";

  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];

    if (mode === "sq" || mode === "dq") {
      if (c === "\\") { i += 2; continue; }
      if ((mode === "sq" && c === "'") || (mode === "dq" && c === '"')) mode = "code";
      i++;
      continue;
    }
    if (mode === "tmpl") {
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { mode = "code"; i++; continue; }
      if (c === "$" && next === "{") { tmplStack.push(depth); depth++; mode = "code"; i += 2; continue; }
      i++;
      continue;
    }
    if (mode === "line") {
      if (c === "\n") mode = "code";
      i++;
      continue;
    }
    if (mode === "block") {
      if (c === "*" && next === "/") { mode = "code"; i += 2; continue; }
      i++;
      continue;
    }

    // mode === "code"
    if (c === "/" && next === "/") { mode = "line"; i += 2; continue; }
    if (c === "/" && next === "*") { mode = "block"; i += 2; continue; }
    if (c === "'") { mode = "sq"; i++; continue; }
    if (c === '"') { mode = "dq"; i++; continue; }
    if (c === "`") { mode = "tmpl"; i++; continue; }
    if (c === "{") { depth++; i++; continue; }
    if (c === "}") {
      depth--;
      // Closing a `${` returns us to the template literal.
      if (tmplStack.length > 0 && depth === tmplStack[tmplStack.length - 1]) {
        tmplStack.pop();
        mode = "tmpl";
      }
      i++;
      continue;
    }
    if (c === ">" && depth === 0) return src.slice(start, i + 1);
    i++;
  }
  return null;
}

/** `sf-m${i}-role` and `sf-m${j}-role` both normalise to the same key. */
export function normaliseId(expr: string): string {
  return expr.replace(/\$\{[^}]*\}/g, "${}").trim();
}

/** Every `htmlFor` value in a file, normalised. */
export function htmlForTargets(src: string): Set<string> {
  const out = new Set<string>();
  const re = /htmlFor=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{([^}]*)\})/g;
  for (const m of src.matchAll(re)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
    out.add(normaliseId(raw.replace(/^["'`]|["'`]$/g, "")));
  }
  return out;
}

/** Extract an attribute's raw value from an opening tag, or null. */
export function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|\\{\`([^\`]*)\`\\}|\\{([^}]*)\\})`);
  const m = tag.match(re);
  if (!m) return null;
  return (m[1] ?? m[2] ?? m[3] ?? m[4] ?? "").trim();
}

/**
 * Is this control's opening tag inside a still-open `<label>`?
 *
 * Counts `<label` vs `</label>` in the preceding source. Crude but correct for
 * the wrapping-label idiom, and it cannot false-negative: an unbalanced count
 * only ever means we are inside one.
 */
export function insideLabel(before: string): boolean {
  const opens = (before.match(/<label[\s>]/g) ?? []).length;
  const closes = (before.match(/<\/label>/g) ?? []).length;
  return opens > closes;
}

/**
 * Controls in `src` that expose no accessible name.
 *
 * A control counts as NAMED if any of these hold:
 *   - a non-empty `aria-label`
 *   - an `aria-labelledby`
 *   - an `id` that some `<label htmlFor>` in the same file points at
 *   - it sits inside a still-open `<label>`
 *
 * `title` is deliberately NOT accepted: the design system forbids putting a
 * control's meaning in a tooltip, because it is unreachable on touch.
 *
 * `input type="hidden"` is skipped — it has no user-facing presence.
 */
export function findUnlabelledControls(
  src: string,
  file: string,
  tags: readonly ControlTag[] = CONTROL_TAGS,
): UnlabelledControl[] {
  const targets = htmlForTargets(src);
  const out: UnlabelledControl[] = [];

  for (const tagName of tags) {
    const re = new RegExp(`<${tagName}[\\s/>]`, "g");
    for (const m of src.matchAll(re)) {
      const start = m.index!;
      const tag = openingTag(src, start);
      if (tag === null) continue;

      // A mention inside a comment is not an element. Detect by re-tokenising
      // the prefix: if the match position is inside a comment, skip it.
      if (isInsideComment(src, start)) continue;

      if (tagName === "input") {
        const t = attr(tag, "type");
        if (t === "hidden") continue;
      }

      const ariaLabel = attr(tag, "aria-label");
      if (ariaLabel && ariaLabel.length > 0) continue;
      if (attr(tag, "aria-labelledby")) continue;

      const id = attr(tag, "id");
      if (id && targets.has(normaliseId(id))) continue;

      if (insideLabel(src.slice(0, start))) continue;

      out.push({
        file,
        line: src.slice(0, start).split("\n").length,
        tagName,
        excerpt: tag.replace(/\s+/g, " ").slice(0, 100),
      });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

/** Is `pos` inside a line or block comment? */
export function isInsideComment(src: string, pos: number): boolean {
  let i = 0;
  let mode: "code" | "sq" | "dq" | "tmpl" | "line" | "block" = "code";
  while (i < pos) {
    const c = src[i];
    const next = src[i + 1];
    if (mode === "sq") { if (c === "\\") { i += 2; continue; } if (c === "'") mode = "code"; i++; continue; }
    if (mode === "dq") { if (c === "\\") { i += 2; continue; } if (c === '"') mode = "code"; i++; continue; }
    if (mode === "tmpl") { if (c === "\\") { i += 2; continue; } if (c === "`") mode = "code"; i++; continue; }
    if (mode === "line") { if (c === "\n") mode = "code"; i++; continue; }
    if (mode === "block") { if (c === "*" && next === "/") { mode = "code"; i += 2; continue; } i++; continue; }
    if (c === "/" && next === "/") { mode = "line"; i += 2; continue; }
    if (c === "/" && next === "*") { mode = "block"; i += 2; continue; }
    if (c === "'") { mode = "sq"; i++; continue; }
    if (c === '"') { mode = "dq"; i++; continue; }
    if (c === "`") { mode = "tmpl"; i++; continue; }
    i++;
  }
  return mode === "line" || mode === "block";
}
