#!/usr/bin/env node
// -----------------------------------------------------------------------------
// verify:ai-native — assert every domain CORE is reachable by an assistant tool,
// so a capability we can build is a capability a winemaker can TALK to (the moat).
//
// This is the upstream link of the chain the D26/H8 gate already enforces
// downstream (tool → golden eval). Here we enforce  core → tool.
//
// CODE is the source of truth (council C1/C2): we do NOT parse a hand-maintained
// doc or grep tool files for a `*Core` symbol (tools call WRAPPERS, not cores
// directly — rack_wine → transferWine → transferWineCore — so a grep yields false
// gaps). Instead we build a real import graph with the TypeScript compiler:
//   - nodes  = every .ts/.tsx under src/
//   - edges  = static imports + re-exports (resolving @/ alias, relative, index)
//   - roots  = src/lib/assistant/tools/**  +  registry.ts
//   - a CORE file (src/lib/**/*-core.ts exporting a `*Core` symbol) is REACHABLE
//     if it is in the transitive import closure of the roots.
// A core that is unreachable AND not on the ratcheting allow-list is a VIOLATION.
//
// It also AUTO-GENERATES the coverage table in docs/architecture/assistant-coverage.md
// between <!-- BEGIN GENERATED ... --> markers (council C3: the doc is a build
// artifact, not hand-maintained). `--write` rewrites it; default (check) mode fails
// if the committed doc is stale.
//
// Exposes a pure run() → { violations, reachable, cores, table } (council S3).
// Pure Node + the `typescript` dep. Run: node scripts/verify-ai-native.mjs [--write]
// -----------------------------------------------------------------------------
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { repoRoot } from "./lib/vault-notes.mjs";
import { ALLOWLIST, MAX_ALLOWED } from "./ai-native-allowlist.mjs";

const REPO = repoRoot();
const SRC = join(REPO, "src");
const COVERAGE_DOC = join(REPO, "docs", "architecture", "assistant-coverage.md");
const BEGIN = "<!-- BEGIN GENERATED: ai-native core→tool coverage (npm run verify:ai-native -- --write) -->";
const END = "<!-- END GENERATED -->";

const SRC_EXT = [".ts", ".tsx", ".mts"];
const rel = (abs) => relative(REPO, abs).replace(/\\/g, "/");

// ---- walk src for module files ----------------------------------------------
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next") continue;
    const abs = join(dir, e);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else if (SRC_EXT.some((x) => abs.endsWith(x)) && !abs.endsWith(".d.ts")) out.push(abs);
  }
  return out;
}

// ---- resolve an import specifier to an absolute src file (or null) ----------
function resolveSpecifier(fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // bare / external module — not a core
  const candidates = [];
  for (const x of SRC_EXT) candidates.push(base + x);
  for (const x of SRC_EXT) candidates.push(join(base, "index" + x));
  if (SRC_EXT.some((x) => base.endsWith(x))) candidates.unshift(base);
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

// ---- parse a file's outbound import/re-export edges --------------------------
function importEdges(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const specs = [];
  sf.forEachChild((node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specs.push(node.moduleSpecifier.text);
    }
  });
  return specs.map((s) => resolveSpecifier(file, s)).filter(Boolean);
}

// ---- exported `*Core` symbols declared in a file ----------------------------
export function coreExports(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const names = new Set();
  const hasExport = (n) => n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  sf.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && hasExport(node) && node.name?.text.endsWith("Core")) names.add(node.name.text);
    else if (ts.isVariableStatement(node) && hasExport(node)) {
      for (const d of node.declarationList.declarations)
        if (ts.isIdentifier(d.name) && d.name.text.endsWith("Core")) names.add(d.name.text);
    } else if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) if (el.name.text.endsWith("Core")) names.add(el.name.text);
    }
  });
  return [...names];
}

export function run(opts = {}) {
  const allow = opts.allowlist || ALLOWLIST;
  const maxAllowed = opts.maxAllowed ?? MAX_ALLOWED;
  const files = walk(SRC);
  const graph = new Map();       // abs file → [abs imported files]
  const coreOf = new Map();      // abs core file → [*Core names]
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    graph.set(f, importEdges(f, text));
    if (/[/\\][^/\\]*-core\.ts$/.test(f)) {
      const ex = coreExports(f, text);
      if (ex.length) coreOf.set(f, ex);
    }
  }

  // roots = every assistant tool module (+ the registry that wires them).
  const roots = files.filter(
    (f) => rel(f).startsWith("src/lib/assistant/tools/") || rel(f) === "src/lib/assistant/registry.ts"
  );

  // Multi-source BFS; record which root first reached each file (for "via").
  const via = new Map();
  const queue = [];
  for (const r of roots) { if (!via.has(r)) { via.set(r, r); queue.push(r); } }
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const next of graph.get(cur) || []) {
      if (!via.has(next)) { via.set(next, via.get(cur)); queue.push(next); }
    }
  }

  const cores = [...coreOf.keys()].sort();
  const table = cores.map((f) => {
    const reachable = via.has(f);
    const viaRoot = reachable ? rel(via.get(f)).replace("src/lib/assistant/tools/", "").replace(/\.tsx?$/, "") : "";
    return { core: rel(f), exports: coreOf.get(f), reachable, via: viaRoot, allowed: !!allow[rel(f)] };
  });

  const violations = [];
  // Unreachable + not allow-listed = the gap we care about.
  for (const row of table) {
    if (!row.reachable && !row.allowed)
      violations.push(`${row.core}: exports ${row.exports.join(", ")} but NO assistant tool reaches it (add a tool, or allow-list with a reason)`);
  }
  // Ratchet: the escape hatch can only shrink.
  const allowKeys = Object.keys(allow);
  if (allowKeys.length > maxAllowed)
    violations.push(`allow-list has ${allowKeys.length} entries but MAX_ALLOWED=${maxAllowed} — the ratchet only shrinks; wire a tool or lower MAX_ALLOWED, don't raise it`);
  // Stale allow-list entries (core gone, or now reachable).
  for (const k of allowKeys) {
    if (!coreOf.has(join(REPO, k))) violations.push(`allow-list entry \`${k}\` is stale — no such core file`);
    else if (via.has(join(REPO, k))) violations.push(`allow-list entry \`${k}\` is now reachable — remove it and lower MAX_ALLOWED`);
    else if (!allow[k].owner || !allow[k].reason) violations.push(`allow-list entry \`${k}\` needs both \`owner\` and \`reason\``);
  }

  return { violations, table, cores: cores.length, reachableCount: table.filter((t) => t.reachable).length };
}

// ---- generated coverage table (deterministic) -------------------------------
function renderTable(table) {
  const lines = [
    BEGIN,
    "",
    `_Auto-generated by \`npm run verify:ai-native -- --write\` — do not hand-edit between the markers._`,
    "",
    "| Core | `*Core` exports | AI-reachable | Via tool | Allow-listed |",
    "|------|-----------------|--------------|----------|--------------|",
    ...table.map((r) =>
      `| \`${r.core}\` | ${r.exports.join(", ")} | ${r.reachable ? "✅" : "❌"} | ${r.reachable ? `\`${r.via}\`` : "—"} | ${r.allowed ? "yes" : "—"} |`
    ),
    "",
    `Coverage: **${table.filter((t) => t.reachable).length}/${table.length}** cores reachable by an assistant tool.`,
    "",
    END,
  ];
  return lines.join("\n");
}

function writeDoc(table) {
  const block = renderTable(table);
  let doc = existsSync(COVERAGE_DOC) ? readFileSync(COVERAGE_DOC, "utf8").replace(/\r\n?/g, "\n") : "# Assistant capability coverage\n";
  if (doc.includes(BEGIN) && doc.includes(END)) {
    doc = doc.replace(new RegExp(`${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), block);
  } else {
    doc = doc.replace(/\n*$/, "\n") + "\n## Core → tool reachability (generated)\n\n" + block + "\n";
  }
  return doc;
}

// ---- CLI --------------------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const RED = "\x1b[31m", GRN = "\x1b[32m", YEL = "\x1b[33m", DIM = "\x1b[2m", RST = "\x1b[0m";
  const write = process.argv.includes("--write");
  const { violations, table, cores, reachableCount } = run();

  const expected = writeDoc(table);
  const actual = existsSync(COVERAGE_DOC) ? readFileSync(COVERAGE_DOC, "utf8").replace(/\r\n?/g, "\n") : "";
  if (write) {
    writeFileSync(COVERAGE_DOC, expected, "utf8");
    console.log(`${GRN}✓ wrote coverage table${RST} to docs/architecture/assistant-coverage.md (${reachableCount}/${cores} reachable)`);
  } else if (actual !== expected) {
    violations.push("docs/architecture/assistant-coverage.md is stale — run `npm run verify:ai-native -- --write` and commit");
  }

  console.log(`\n${DIM}AI-native core→tool coverage — ${reachableCount}/${cores} cores reachable${RST}`);
  for (const r of table) {
    const mark = r.reachable ? `${GRN}✓${RST}` : r.allowed ? `${YEL}◐ allow${RST}` : `${RED}✗ GAP${RST}`;
    console.log(`  ${mark}  ${r.core}${r.reachable ? ` ${DIM}via ${r.via}${RST}` : ""}`);
  }

  if (violations.length) {
    console.error(`\n${RED}✗ ${violations.length} AI-native violation(s):${RST}`);
    for (const v of violations) console.error(`  ${RED}•${RST} ${v}`);
    console.error(`\n${DIM}Every core is a capability; the moat is "talk to it". Wire an assistant tool, or add a ratcheting allow-list entry (owner+reason).${RST}\n`);
    process.exit(1);
  }
  console.log(`\n${GRN}✓ every core is reachable by an assistant tool (or ratcheted)${RST}\n`);
  process.exit(0);
}
