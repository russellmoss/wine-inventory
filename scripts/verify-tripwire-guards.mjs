#!/usr/bin/env node
// -----------------------------------------------------------------------------
// verify:tripwires — assert every tripwire in the register is actually CAUGHT
// (or explicitly acknowledged as a manual "watch this in prod" signal).
//
// The scale/security registers list tripwires ("revisit when X fires"), but a
// prose tripwire nobody wired is just a note. This makes each one accountable.
//
// Reads docs/architecture/tripwires/*.md. Each note declares HOW it is enforced:
//   enforce: guard   → `verify:` must resolve — an "npm run verify:xyz" script that
//                      exists in package.json, OR a "scripts/…"/"test/…" path on disk.
//   enforce: static  → `forbid:` (a regex) must NOT appear under the `in:` path. This
//                      is a real alarm: if the forbidden pattern shows up, the tripwire
//                      FIRED and the check exits 1 (with the offending file:line).
//   enforce: observe → `signal:` (a human runtime/log signal) must be present. Printed
//                      as a MANUAL WATCH line — never fails (it's not statically checkable).
//
// Exit 1 on: a malformed note, a `guard` whose script/file is missing, or a `static`
// forbid-pattern that actually appears in the code. Detection only — never edits.
//
// Pure Node, no deps, no DB. Run: node scripts/verify-tripwire-guards.mjs
// -----------------------------------------------------------------------------
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const TRIP_DIR = join(REPO, "docs", "architecture", "tripwires");
const PKG = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
const SCRIPTS = PKG.scripts || {};

const RED = "\x1b[31m", GRN = "\x1b[32m", YEL = "\x1b[33m", CYN = "\x1b[36m", DIM = "\x1b[2m", RST = "\x1b[0m";

// Minimal scalar frontmatter reader (the fields this register controls are all scalars). Normalize CRLF →
// LF first: notes edited on Windows carry \r, which would break the `^---\n` match and leave a trailing \r
// on every value (so e.g. `enforce: guard` would read as "guard\r" and never match).
function frontmatter(md) {
  md = md.replace(/\r\n?/g, "\n");
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
    if (kv && kv[2] !== "") out[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1").trim();
  }
  return out;
}

// Recursively scan a path for a forbidden regex; return [{file, line, text}].
const SKIP = new Set(["node_modules", ".next", ".git", "dist", "build", "out", "coverage", ".turbo", ".vercel"]);
const SCANNABLE = /\.(ts|tsx|js|jsx|mjs|cjs|prisma|sql)$/;
function scanForbidden(absPath, rel, re, hits) {
  let st;
  try { st = statSync(absPath); } catch { return; }
  if (st.isDirectory()) {
    for (const entry of readdirSync(absPath)) {
      if (SKIP.has(entry)) continue;
      scanForbidden(join(absPath, entry), `${rel}/${entry}`, re, hits);
    }
  } else if (st.isFile() && (SCANNABLE.test(absPath) || !absPath.includes("."))) {
    let text;
    try { text = readFileSync(absPath, "utf8"); } catch { return; }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) hits.push({ file: rel, line: i + 1, text: lines[i].trim() });
      re.lastIndex = 0;
    }
  }
}

if (!existsSync(TRIP_DIR)) {
  console.error(`${RED}No tripwire register at ${TRIP_DIR}${RST}`);
  process.exit(1);
}

const files = readdirSync(TRIP_DIR).filter((f) => f.endsWith(".md") && f !== "README.md");
const problems = [];   // hard failures → exit 1
const guarded = [], statics = [], observes = [];

for (const f of files) {
  const fm = frontmatter(readFileSync(join(TRIP_DIR, f), "utf8"));
  const id = fm.id || f;
  if (!fm.id) { problems.push(`${f}: missing \`id\``); continue; }
  const enforce = fm.enforce;
  if (!enforce) { problems.push(`${id}: missing \`enforce\` (guard | static | observe)`); continue; }

  if (enforce === "guard") {
    const v = fm.verify || "";
    if (!v) { problems.push(`${id}: enforce:guard but no \`verify:\``); continue; }
    const npm = v.match(/npm run (\S+)/);
    let ok = false;
    if (npm) ok = Boolean(SCRIPTS[npm[1]]);
    else if (v.includes("/")) ok = existsSync(join(REPO, v));
    if (!ok) { problems.push(`${id}: guard MISSING — \`${v}\` is not a defined npm script or an existing file`); continue; }
    guarded.push({ id, v });
  } else if (enforce === "static") {
    const { forbid, in: scope } = fm;
    if (!forbid || !scope) { problems.push(`${id}: enforce:static needs both \`forbid:\` and \`in:\``); continue; }
    const abs = join(REPO, scope);
    if (!existsSync(abs)) { problems.push(`${id}: static scope \`${scope}\` does not exist`); continue; }
    const hits = [];
    let re;
    try { re = new RegExp(forbid); } catch { problems.push(`${id}: \`forbid:\` is not a valid regex: ${forbid}`); continue; }
    scanForbidden(abs, scope, re, hits);
    if (hits.length) {
      problems.push(
        `${id}: TRIPWIRE FIRED — forbidden pattern /${forbid}/ found in ${scope}:\n` +
          hits.slice(0, 8).map((h) => `        ${h.file}:${h.line}  ${DIM}${h.text}${RST}`).join("\n") +
          (hits.length > 8 ? `\n        …and ${hits.length - 8} more` : "")
      );
      continue;
    }
    statics.push({ id, forbid, scope });
  } else if (enforce === "observe") {
    if (!fm.signal) { problems.push(`${id}: enforce:observe but no \`signal:\` (what to watch)`); continue; }
    observes.push({ id, signal: fm.signal });
  } else {
    problems.push(`${id}: unknown enforce kind \`${enforce}\` (use guard | static | observe)`);
  }
}

// ---- report ----------------------------------------------------------------
console.log(`\n${CYN}Tripwire register${RST} — ${files.length} tripwire${files.length === 1 ? "" : "s"} in docs/architecture/tripwires/\n`);

if (guarded.length) {
  console.log(`${GRN}✔ guarded (${guarded.length})${RST} — an existing check catches these:`);
  for (const g of guarded) console.log(`    ${g.id}  ${DIM}${g.v}${RST}`);
}
if (statics.length) {
  console.log(`${GRN}✔ static (${statics.length})${RST} — forbidden pattern absent (verified now):`);
  for (const s of statics) console.log(`    ${s.id}  ${DIM}/${s.forbid}/ not in ${s.scope}${RST}`);
}
if (observes.length) {
  console.log(`${YEL}◐ observe (${observes.length})${RST} — MANUAL WATCH (runtime/log signal, not statically checkable):`);
  for (const o of observes) console.log(`    ${o.id}  ${DIM}${o.signal}${RST}`);
}

if (problems.length) {
  console.error(`\n${RED}✗ ${problems.length} tripwire problem(s):${RST}`);
  for (const p of problems) console.error(`  ${RED}•${RST} ${p}`);
  console.error(
    `\n${DIM}Fix: give each tripwire a real guard/forbid pattern (copy docs/_templates/tripwire.md),` +
      ` or mark it enforce:observe with a signal. A "TRIPWIRE FIRED" means the risk is now REAL.${RST}\n`
  );
  process.exit(1);
}

console.log(`\n${GRN}✓ all ${files.length} tripwires accounted for${RST} (${guarded.length} guarded, ${statics.length} static, ${observes.length} manual-watch)\n`);
process.exit(0);
