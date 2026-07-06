// -----------------------------------------------------------------------------
// vault-notes — shared note IO for the pure-Node vault guards (verify:parity,
// verify:ai-native). One DRY home for the frontmatter parsing + CRLF-normalize
// + note-globbing that the register checkers need.
//
// The two EXISTING guards (verify-invariant-guards.mjs, verify-tripwire-guards.mjs)
// keep their own inline copies on purpose — this helper serves the NEW scripts only,
// so landing it never touches proven CI-gate code (blast-radius control).
//
// Pure Node, no deps.
// -----------------------------------------------------------------------------
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// scripts/lib/vault-notes.mjs → repo root is two levels up.
export function repoRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

// Read a note and normalize CRLF→LF. A CRLF file would break the `^---\n` match
// and leave a trailing \r on every value; normalizing first is Windows-critical.
export function readNote(absPath) {
  return readFileSync(absPath, "utf8").replace(/\r\n?/g, "\n");
}

// Strip surrounding double-quotes, unescaping via JSON.parse so a value written by
// JSON.stringify (embedded quotes/colons) round-trips exactly; falls back to a naive
// strip if it isn't valid JSON.
function unquote(v) {
  const t = v.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    try { return JSON.parse(t); } catch { return t.slice(1, -1); }
  }
  return t;
}

// Parse YAML-ish frontmatter: scalar `key: value` plus simple block lists
// (`key:` then `  - item` lines, e.g. tags/appliesTo). Returns {} if no
// frontmatter block. Scalars are strings; list fields are arrays.
//
// A key with an empty inline value (`evidence:`) is an EMPTY SCALAR (""), NOT a
// list — it only becomes a list if a `- item` line actually follows. (Treating
// every empty value as `[]` made a blank `evidence:` parse to an array, which
// then crashed the string-only consumers downstream.)
export function parseFrontmatter(text) {
  const md = text.replace(/\r\n?/g, "\n");
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  let pendingKey = null; // last key with an empty inline value — may turn into a list
  for (const line of m[1].split("\n")) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && pendingKey) {
      if (!Array.isArray(out[pendingKey])) out[pendingKey] = [];
      out[pendingKey].push(unquote(item[1]));
      continue;
    }
    const kv = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    if (kv[2] === "") {
      pendingKey = kv[1];
      out[kv[1]] = ""; // empty scalar by default; upgraded to [] iff items follow
    } else {
      pendingKey = null;
      out[kv[1]] = unquote(kv[2]);
    }
  }
  return out;
}

// List note files in a register dir (absolute paths), excluding README.md.
export function listNotes(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => join(dir, f));
}
