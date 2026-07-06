#!/usr/bin/env node
// -----------------------------------------------------------------------------
// verify:invariant-frontmatter — assert every invariant register note is WELL-FORMED,
// regardless of whether it declares a `verify:` guard.
//
// The sibling verify-invariant-guards.mjs (verify:invariants) SKIPS any note without
// a `verify:` field (line 50: `if (!fm.id || !fm.verify) continue;`) and its `/^---\n/`
// frontmatter regex silently returns {} on a CRLF file. So a malformed or CRLF-mangled
// planned note is indistinguishable from a correct one and stays green either way —
// the exact silent-skip hole PHASE-0 Surprise 2 demonstrated on Windows. This checker
// closes it: it fails on ANY note that is CRLF, missing a required key, has a bad
// status, mismatches guarded⇔verify, or whose filename doesn't start with `<id>-`.
//
// Pure Node, no deps. Run: node scripts/verify-invariant-frontmatter.mjs
// -----------------------------------------------------------------------------
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const INV_DIR = join(REPO, "docs", "architecture", "invariants");

const RED = "\x1b[31m", GRN = "\x1b[32m", DIM = "\x1b[2m", RST = "\x1b[0m";

const REQUIRED_KEYS = ["id", "group", "severity", "enforcedBy", "decision", "status", "appliesTo", "tags"];
const VALID_STATUS = new Set(["guarded", "planned", "deferred"]);

if (!existsSync(INV_DIR)) {
  console.error(`${RED}No invariant register at ${INV_DIR}${RST}`);
  process.exit(1);
}

// Parse frontmatter with support for the register's list-valued keys (appliesTo, tags):
// a `key:` line followed by `  - item` block-list entries. Scalars keep their value.
// Returns { fields, listKeys } where listKeys names keys that used block-list syntax.
function parseFrontmatter(block) {
  const fields = {};
  const listKeys = new Set();
  const lines = block.split("\n");
  let currentList = null;
  for (const line of lines) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && currentList) {
      fields[currentList].push(item[1].replace(/^"(.*)"$/, "$1").trim());
      continue;
    }
    const kv = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
    if (kv) {
      const key = kv[1];
      const val = kv[2].replace(/^"(.*)"$/, "$1").trim();
      if (val === "") {
        // A key with no inline value — expect a block list to follow.
        fields[key] = [];
        listKeys.add(key);
        currentList = key;
      } else {
        fields[key] = val;
        currentList = null;
      }
    } else if (line.trim() === "") {
      currentList = null;
    }
  }
  return { fields, listKeys };
}

const files = readdirSync(INV_DIR).filter((f) => f.endsWith(".md") && f !== "README.md");
const errors = [];

for (const f of files) {
  const raw = readFileSync(join(INV_DIR, f), "utf8");
  const path = `docs/architecture/invariants/${f}`;

  // 1. Line endings: CRLF silently breaks the guard checker's /^---\n/ regex.
  if (raw.includes("\r")) {
    errors.push(`${path}: contains CRLF line endings — must be LF (pin via .gitattributes).`);
    continue; // the frontmatter parse below would be unreliable on CRLF anyway
  }

  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) {
    errors.push(`${path}: no parseable LF frontmatter block (expected leading '---').`);
    continue;
  }

  const { fields } = parseFrontmatter(m[1]);

  // 2. Required keys present.
  for (const k of REQUIRED_KEYS) {
    const v = fields[k];
    const empty = v === undefined || (Array.isArray(v) ? v.length === 0 : String(v).trim() === "");
    if (empty) errors.push(`${path}: missing/empty required key '${k}'.`);
  }

  // 3. status is one of the known values.
  if (fields.status !== undefined && !VALID_STATUS.has(String(fields.status))) {
    errors.push(`${path}: status '${fields.status}' invalid (expected guarded|planned|deferred).`);
  }

  // 4. guarded ⇔ verify. A guarded note MUST declare a guard; a planned/deferred note MUST NOT.
  const hasVerify = fields.verify !== undefined && String(fields.verify).trim() !== "";
  if (fields.status === "guarded" && !hasVerify) {
    errors.push(`${path}: status is 'guarded' but no 'verify:' field — a guarded invariant must name its guard.`);
  }
  if ((fields.status === "planned" || fields.status === "deferred") && hasVerify) {
    errors.push(`${path}: status is '${fields.status}' but declares 'verify:' — planned/deferred notes must omit it (or flip to guarded).`);
  }

  // 5. Filename starts with `<id>-` (repo convention: LEDGER-10-immutable-operations.md).
  if (fields.id && !f.startsWith(`${fields.id}-`)) {
    errors.push(`${path}: filename must start with '${fields.id}-' (id↔filename mismatch).`);
  }
}

console.log(`\n${DIM}Invariant frontmatter well-formedness — ${files.length} notes${RST}`);
if (errors.length) {
  for (const e of errors) console.log(`  ${RED}✗${RST} ${e}`);
  console.log(`\n${RED}✗ ${errors.length} frontmatter problem(s) across the register.${RST}`);
  console.log(`${DIM}  These are silent to verify:invariants (it skips no-verify + CRLF notes). Fix them.${RST}\n`);
  process.exit(1);
}
console.log(`\n${GRN}✓ All ${files.length} invariant notes are well-formed (LF, keyed, status/verify consistent, id↔filename).${RST}\n`);
process.exit(0);
