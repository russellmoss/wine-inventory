/**
 * HTML-escape a string for injection into a RAW HTML sink (email bodies, innerHTML, etc.).
 * Do NOT use this for values that will be rendered as React text nodes — React already
 * escapes those, so escaping first double-encodes and shows literal `&quot;`/`&#39;`.
 */
export function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Control chars to drop from displayed plain text: every code point below U+0020 EXCEPT
// tab (9), newline (10), carriage return (13), plus DEL (U+007F). Built from char codes so
// the source file itself never contains a literal control byte.
const CONTROL_CHARS = new RegExp(
  `[${[...Array(0x20).keys()]
    .filter((c) => c !== 0x09 && c !== 0x0a && c !== 0x0d)
    .concat(0x7f)
    .map((c) => `\\u${c.toString(16).padStart(4, "0")}`)
    .join("")}]`,
  "g",
);

/**
 * Cap + clean UNTRUSTED text for display as a React TEXT NODE (the /developer feedback
 * console). React escapes text nodes for XSS safety, so this must NOT HTML-encode — doing
 * so double-encodes and the reader sees literal `&#39;` / `&quot;` instead of `'` / `"`.
 * We only drop corrupting control characters and trim to a length cap.
 */
export function sanitizePlainText(input: string | null | undefined, max = 5000): string {
  return (input ?? "").replace(CONTROL_CHARS, "").slice(0, max);
}

export function safeFilename(input: string): string {
  const base = input.split(/[\\/]/).pop() || "attachment";
  return base.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "attachment";
}
