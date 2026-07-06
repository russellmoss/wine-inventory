#!/usr/bin/env node
// -----------------------------------------------------------------------------
// verify:parity — assert the Capability-Parity register's `covered` claims are
// backed by real evidence, so a "we cover this" note can't silently rot.
//
// For each note in docs/architecture/parity/:
//   - require `id`, `capability`, and a known `status`
//     (covered | partial | gap | deliberately-omitted).
//   - status: covered  → `evidence` MUST be a concrete repo-relative file path
//     (optionally `path:line`) that resolves to a real FILE INSIDE the repo. No
//     wikilinks, no `..` escapes. A dead/absent covered evidence is a VIOLATION.
//   - other statuses    → `evidence` may be a corpus link; a dead link there is a
//     WARNING, never a hard fail (a refactor/hotfix must not be blocked by a
//     non-covered link going stale). (council S1.)
//
// Exposes a pure run(dir) → { violations, warnings } (council S3); the CLI below
// is a thin wrapper that exits 1 on violations. Pure Node, no deps, no DB.
// Run: node scripts/verify-parity-guards.mjs
// -----------------------------------------------------------------------------
import { existsSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot, readNote, parseFrontmatter, listNotes } from "./lib/vault-notes.mjs";

const STATUSES = new Set(["covered", "partial", "gap", "deliberately-omitted"]);

// Resolve an evidence value to an absolute path if it's a plain repo-relative
// path (stripping an optional :line / #anchor). Returns null if it's not a path
// (wikilink, external URL) or escapes the repo root.
function resolveEvidence(repo, evidence) {
  if (typeof evidence !== "string" || evidence === "") return { kind: "missing" };
  if (/\[\[.*\]\]/.test(evidence)) return { kind: "wikilink" };
  if (/^https?:\/\//.test(evidence)) return { kind: "external" };
  // Strip a trailing :line or :line:col (editor/ripgrep form), then a #fragment.
  const bare = evidence.replace(/(:\d+)+$/, "").replace(/#\d+$/, "").trim();
  const abs = resolve(repo, bare);
  const root = resolve(repo);
  if (abs !== root && !abs.startsWith(root + sep)) return { kind: "escape", abs };
  return { kind: "path", abs, bare };
}

export function run(dir) {
  const repo = repoRoot();
  const violations = [];
  const warnings = [];

  for (const abs of listNotes(dir)) {
    const rel = abs.slice(repo.length + 1).replace(/\\/g, "/");
    const fm = parseFrontmatter(readNote(abs));
    if (!fm.id) { violations.push(`${rel}: missing \`id\``); continue; }
    if (!fm.capability) { violations.push(`${fm.id}: missing \`capability\``); }
    const status = fm.status;
    if (!STATUSES.has(status)) {
      violations.push(`${fm.id}: unknown \`status: ${status ?? "(none)"}\` (covered|partial|gap|deliberately-omitted)`);
      continue;
    }

    const ev = resolveEvidence(repo, fm.evidence);
    if (status === "covered") {
      if (ev.kind === "missing") { violations.push(`${fm.id}: status:covered but no \`evidence\``); continue; }
      if (ev.kind === "wikilink") { violations.push(`${fm.id}: status:covered evidence is a wikilink — use a concrete repo path`); continue; }
      if (ev.kind === "external") { violations.push(`${fm.id}: status:covered evidence is an external URL — use a repo path`); continue; }
      if (ev.kind === "escape") { violations.push(`${fm.id}: evidence escapes the repo root (\`..\`): ${fm.evidence}`); continue; }
      if (!existsSync(ev.abs)) { violations.push(`${fm.id}: status:covered evidence path does not exist: ${fm.evidence}`); continue; }
      if (!statSync(ev.abs).isFile()) { violations.push(`${fm.id}: status:covered evidence is not a file: ${fm.evidence}`); continue; }
    } else {
      // Non-covered: a plain repo path that doesn't resolve is a warning only.
      if (ev.kind === "escape") { warnings.push(`${fm.id}: evidence escapes the repo root: ${fm.evidence}`); }
      else if (ev.kind === "path" && !existsSync(ev.abs)) { warnings.push(`${fm.id}: (${status}) evidence link is dead: ${fm.evidence}`); }
    }
  }
  return { violations, warnings };
}

// ---- CLI (thin wrapper) -----------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const RED = "\x1b[31m", GRN = "\x1b[32m", YEL = "\x1b[33m", DIM = "\x1b[2m", RST = "\x1b[0m";
  const dir = join(repoRoot(), "docs", "architecture", "parity");
  const { violations, warnings } = run(dir);
  const total = listNotes(dir).length;

  if (warnings.length) {
    console.log(`${YEL}⚠ ${warnings.length} parity warning(s) (non-blocking):${RST}`);
    for (const w of warnings.slice(0, 12)) console.log(`  ${DIM}${w}${RST}`);
    if (warnings.length > 12) console.log(`  ${DIM}…and ${warnings.length - 12} more${RST}`);
  }
  if (violations.length) {
    console.error(`\n${RED}✗ ${violations.length} parity violation(s) across ${total} notes:${RST}`);
    for (const v of violations) console.error(`  ${RED}•${RST} ${v}`);
    console.error(`\n${DIM}Fix: a status:covered note needs \`evidence\` = a real repo file path (see docs/architecture/parity/README.md).${RST}\n`);
    process.exit(1);
  }
  console.log(`\n${GRN}✓ parity register OK${RST} — ${total} notes, all covered claims resolve.\n`);
  process.exit(0);
}
