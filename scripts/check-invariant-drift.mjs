#!/usr/bin/env node
// -----------------------------------------------------------------------------
// check:invariant-drift — flag invariants whose GOVERNED CODE changed but whose
// NOTE did not, since a base ref. That gap is the dangerous case: the guard
// checker (verify:invariants) stays green because a guard still *exists*, while
// the invariant's written statement may no longer match reality — and the
// auto-context hook would then inject a STALE rule.
//
// This is the drift the guard checker structurally can't catch. It is
// DETECTION ONLY (prints a report); the brain-refresh loop reads it and reviews
// each flagged note against the changed code in its PR.
//
// Base ref: argv[2], else the SHA in docs/.brain-refresh-marker, else HEAD~1.
// Range compared: <base>..HEAD (committed history only).
//
// A `src/lib/<domain>/` (3+ segments), `prisma/schema.prisma`, or
// `prisma/migrations/...` change triggers drift; a bare broad prefix like
// `src/lib/` does NOT (it would false-positive on unrelated edits).
//
// Pure Node, no deps. Exit 0 always (report-only) unless --strict is passed,
// in which case it exits 1 when drift is found (for use as a gate).
// The core (computeDrift/isTriggerPrefix/parseFrontmatter) is exported and
// unit-tested in test/invariant-drift.test.ts.
// -----------------------------------------------------------------------------
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RED = "\x1b[31m", GRN = "\x1b[32m", YEL = "\x1b[33m", DIM = "\x1b[2m", RST = "\x1b[0m";

// ── Pure, testable core ──────────────────────────────────────────────────────

// Does a governed-path prefix count as a drift trigger? (exclude broad prefixes)
export function isTriggerPrefix(p) {
  if (p === "prisma/schema.prisma") return true;
  if (p.startsWith("prisma/migrations")) return true;
  const parts = p.split("/").filter(Boolean);
  return parts[0] === "src" && parts[1] === "lib" && parts.length >= 3; // src/lib/<domain>/
}

export function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  const out = { appliesTo: [] };
  if (!m) return out;
  let key = null;
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
    if (kv && kv[2] !== "") { key = null; out[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1").trim(); }
    else if (kv && kv[2] === "") { key = kv[1]; out[key] = []; }
    else { const it = line.match(/^\s+-\s+(.*)$/); if (it && key) out[key].push(it[1].replace(/^"(.*)"$/, "$1").trim()); }
  }
  return out;
}

// notes: [{ id, noteRel, appliesTo, verify }]; changed: string[] of repo-rel paths.
// Returns [{ id, note, verify, hits }] for invariants whose governed code moved
// but whose note did not.
export function computeDrift(changed, notes) {
  const drifted = [];
  for (const n of notes) {
    const triggers = (n.appliesTo || []).filter(isTriggerPrefix);
    const hits = changed.filter((c) => triggers.some((p) => c === p || c.startsWith(p)));
    const noteChanged = changed.includes(n.noteRel);
    if (hits.length && !noteChanged) drifted.push({ id: n.id, note: n.noteRel, verify: n.verify, hits });
  }
  return drifted;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
  const INV_DIR = join(REPO, "docs", "architecture", "invariants");
  const MARKER = join(REPO, "docs", ".brain-refresh-marker");
  const STRICT = process.argv.includes("--strict");
  const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();

  let base = process.argv.find((a, i) => i >= 2 && !a.startsWith("--"));
  if (!base && existsSync(MARKER)) base = readFileSync(MARKER, "utf8").trim();
  try { git(["cat-file", "-t", base || ""]); } catch { base = "HEAD~1"; }

  let changed = [];
  try {
    const out = git(["diff", "--name-only", `${base}`, "HEAD"]);
    changed = out ? out.split("\n").map((s) => s.trim()).filter(Boolean) : [];
  } catch (e) {
    console.error(`${RED}Could not diff ${base}..HEAD: ${e.message}${RST}`);
    process.exit(0);
  }

  if (!existsSync(INV_DIR)) { console.log(`${DIM}No invariant register — nothing to check.${RST}`); process.exit(0); }

  const notes = [];
  for (const f of readdirSync(INV_DIR)) {
    if (!f.endsWith(".md") || f === "README.md") continue;
    const fm = parseFrontmatter(readFileSync(join(INV_DIR, f), "utf8"));
    if (!fm.id) continue;
    notes.push({ id: fm.id, noteRel: `docs/architecture/invariants/${f}`, appliesTo: fm.appliesTo, verify: fm.verify });
  }

  const drifted = computeDrift(changed, notes);

  console.log(`\n${DIM}Invariant drift check — base ${base.slice(0, 10)}..HEAD, ${changed.length} files changed${RST}`);
  if (!drifted.length) {
    console.log(`${GRN}✓ No invariant drift: every invariant whose governed code changed had its note reviewed.${RST}\n`);
    process.exit(0);
  }

  console.log(`${YEL}⚠ ${drifted.length} invariant(s) may be STALE — governed code changed but the note did not:${RST}`);
  for (const d of drifted) {
    console.log(`\n  ${RED}${d.id}${RST}  ${DIM}(${d.note})${RST}`);
    console.log(`    guard: ${d.verify}`);
    console.log(`    changed governed code:`);
    for (const h of d.hits.slice(0, 12)) console.log(`      - ${h}`);
    if (d.hits.length > 12) console.log(`      … +${d.hits.length - 12} more`);
  }
  console.log(`\n${DIM}  → Review each note's statement against the changed code; update the note`);
  console.log(`     (and the matching line in INVARIANTS.md) if the rule moved. Then re-run`);
  console.log(`     npm run verify:invariants.${RST}\n`);

  process.exit(STRICT ? 1 : 0);
}

// Run the CLI only when executed directly (not when imported by the test).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
