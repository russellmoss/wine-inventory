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

// Parse YAML-ish frontmatter: scalar `key: value` plus simple block lists
// (`key:` then `  - item` lines, e.g. tags/appliesTo). Returns {} if no
// frontmatter block. Scalars are strings; list fields are arrays.
export function parseFrontmatter(text) {
  const md = text.replace(/\r\n?/g, "\n");
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  let listKey = null;
  for (const line of m[1].split("\n")) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      out[listKey].push(item[1].replace(/^"(.*)"$/, "$1").trim());
      continue;
    }
    const kv = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    if (kv[2] === "") {
      // A key with no inline value starts a block list.
      listKey = kv[1];
      out[listKey] = [];
    } else {
      listKey = null;
      out[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1").trim();
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
