#!/usr/bin/env node
// -----------------------------------------------------------------------------
// verify:invariants — assert every invariant in the register is actually guarded.
//
// Reads docs/architecture/invariants/*.md, and for each note's `verify:` field
// confirms the guard REALLY EXISTS:
//   - "npm run verify:xyz"      → package.json must define a "verify:xyz" script
//   - "scripts/foo.ts" (a path) → that file must exist on disk
//
// A missing guard is a live safety hole (an invariant nobody checks), so this
// exits 1. Also reports reverse coverage: verify:* scripts that NO invariant
// claims (candidates for a new invariant note). Detection only — never edits.
//
// Pure Node, no deps. Run: node scripts/verify-invariant-guards.mjs
// -----------------------------------------------------------------------------
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const INV_DIR = join(REPO, "docs", "architecture", "invariants");
const PKG = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
const SCRIPTS = PKG.scripts || {};

const RED = "\x1b[31m", GRN = "\x1b[32m", YEL = "\x1b[33m", DIM = "\x1b[2m", RST = "\x1b[0m";

// Minimal frontmatter reader for the fields this register controls.
function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1").trim();
  }
  return out;
}

if (!existsSync(INV_DIR)) {
  console.error(`${RED}No invariant register at ${INV_DIR}${RST}`);
  process.exit(1);
}

const files = readdirSync(INV_DIR).filter((f) => f.endsWith(".md") && f !== "README.md");
const claimed = new Set();
const rows = [];

for (const f of files) {
  const fm = frontmatter(readFileSync(join(INV_DIR, f), "utf8"));
  if (!fm.id || !fm.verify) continue;
  const verify = fm.verify;
  let ok = false;
  let kind = "";
  const npm = verify.match(/npm run (\S+)/);
  if (npm) {
    kind = "npm";
    ok = Boolean(SCRIPTS[npm[1]]);
    if (ok) claimed.add(npm[1]);
  } else if (verify.includes("/")) {
    kind = "file";
    ok = existsSync(join(REPO, verify));
  }
  rows.push({ id: fm.id, severity: fm.severity || "?", verify, ok, kind });
}

rows.sort((a, b) => a.id.localeCompare(b.id));

const gaps = rows.filter((r) => !r.ok);
const verifyScripts = Object.keys(SCRIPTS).filter((s) => s.startsWith("verify:") && s !== "verify:invariants");
const unclaimed = verifyScripts.filter((s) => !claimed.has(s));

console.log(`\n${DIM}Invariant guard coverage — ${rows.length} invariants${RST}`);
for (const r of rows) {
  const mark = r.ok ? `${GRN}✓${RST}` : `${RED}✗ MISSING${RST}`;
  console.log(`  ${mark}  ${r.id.padEnd(13)} ${DIM}${r.severity.padEnd(8)}${RST} → ${r.verify}`);
}

if (unclaimed.length) {
  console.log(`\n${YEL}⚠ verify:* scripts with no invariant note (candidates for a new invariant):${RST}`);
  for (const s of unclaimed) console.log(`    ${DIM}npm run ${s}${RST}`);
}

const pct = rows.length ? Math.round(((rows.length - gaps.length) / rows.length) * 100) : 0;
if (gaps.length) {
  console.log(`\n${RED}✗ ${gaps.length}/${rows.length} invariant(s) have a MISSING guard (${pct}% covered).${RST}`);
  console.log(`${DIM}  Each is an invariant nothing verifies — add/fix the verify: field or the guard.${RST}\n`);
  process.exit(1);
}
console.log(`\n${GRN}✓ All ${rows.length} invariants are guarded by an existing check (${pct}%).${RST}\n`);
process.exit(0);
