#!/usr/bin/env node
// -----------------------------------------------------------------------------
// PreToolUse hook — auto-inject the "brain" before an agent edits hot code.
//
// Fires on Edit/Write/MultiEdit. If the target file is under a governed path
// (the ledger, tenancy, cost, compliance, transform, accounting, commerce, auth,
// or the Prisma schema/migrations), it injects the matching INVARIANTS + a
// pointer to the registers into the model's context — enforcing the CLAUDE.md
// rule "read the registers before you touch tenancy/ledger/cost" automatically,
// so it is never silently skipped.
//
// SAFETY: never blocks a tool call. Any error, or a non-hot path → exit 0 with
// no output (the edit proceeds normally). Pure Node, no deps.
//
// Registered in .claude/settings.json under hooks.PreToolUse.
// -----------------------------------------------------------------------------
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function emitAndExit(additionalContext) {
  if (additionalContext) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          additionalContext,
        },
      })
    );
  }
  process.exit(0);
}

try {
  const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const INV_DIR = join(REPO, "docs", "architecture", "invariants");

  // Only these top-level areas trigger injection (signal over noise).
  const HOT = [
    "prisma/schema.prisma",
    "prisma/migrations/",
    "src/lib/ledger/",
    "src/lib/tenant/",
    "src/lib/cost/",
    "src/lib/compliance/",
    "src/lib/transform/",
    "src/lib/accounting/",
    "src/lib/commerce/",
    "src/lib/auth",
    // Plan 080 U13a — these were MISSING despite the invariants naming them: the consumable stock/cost
    // cores (COST-1/COST-2, WORKORDER-3/7), invoice ingestion + the aggregate A/P bill (AP-1, COST-4), and
    // costed equipment. Editing them injected no invariant context, which is exactly the blind spot the
    // register exists to close.
    "src/lib/cellar/",
    "src/lib/ingest/",
    "src/lib/equipment/",
  ];

  const raw = readFileSync(0, "utf8");
  const input = JSON.parse(raw || "{}");
  const ti = input.tool_input || {};
  let file = ti.file_path || ti.path || "";
  if (!file) emitAndExit(null);

  // Normalize to repo-relative, forward slashes.
  file = file.replace(/\\/g, "/");
  const repoFwd = REPO.replace(/\\/g, "/").replace(/\/+$/, "");
  if (file.startsWith(repoFwd + "/")) file = file.slice(repoFwd.length + 1);
  file = file.replace(/^\.\//, "");

  if (!HOT.some((h) => file === h || file.startsWith(h))) emitAndExit(null);
  if (!existsSync(INV_DIR)) emitAndExit(null);

  // Parse the register: frontmatter (id, severity, verify, appliesTo) + the
  // callout statement from the body.
  function parseNote(md) {
    const fm = md.match(/^---\n([\s\S]*?)\n---/);
    const out = { appliesTo: [] };
    if (fm) {
      const lines = fm[1].split("\n");
      let inList = null;
      for (const line of lines) {
        const kv = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
        if (kv && kv[2] !== "") {
          inList = null;
          out[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1").trim();
        } else if (kv && kv[2] === "") {
          inList = kv[1];
          out[inList] = [];
        } else {
          const item = line.match(/^\s+-\s+(.*)$/);
          if (item && inList) out[inList].push(item[1].replace(/^"(.*)"$/, "$1").trim());
        }
      }
    }
    // Statement = first quoted callout body line that isn't the [!type] header.
    const body = md.replace(/^---\n[\s\S]*?\n---\n/, "");
    const stmt = body.split("\n").find((l) => l.startsWith("> ") && !l.startsWith("> [!"));
    out.statement = stmt ? stmt.replace(/^>\s*/, "").trim() : "";
    return out;
  }

  const matched = [];
  for (const f of readdirSync(INV_DIR)) {
    if (!f.endsWith(".md") || f === "README.md") continue;
    const n = parseNote(readFileSync(join(INV_DIR, f), "utf8"));
    if (!n.id) continue;
    if ((n.appliesTo || []).some((p) => file === p || file.startsWith(p))) matched.push(n);
  }

  if (!matched.length) emitAndExit(null);

  matched.sort((a, b) => (a.id || "").localeCompare(b.id || ""));
  const lines = matched.map(
    (n) => `  • ${n.id} [${n.severity}] ${n.statement}  (guard: ${n.verify})`
  );

  const ctx = [
    `⚠ You are editing governed code: \`${file}\`.`,
    `These INVARIANTS must not be violated (from docs/architecture/invariants/, narrative in INVARIANTS.md):`,
    ...lines,
    ``,
    `Before proposing changes here, honor CLAUDE.md: consult docs/architecture/security-register.md`,
    `+ scale-register.md. After changing, the matching guard must still pass`,
    `(run \`npm run verify:invariants\` for coverage; the specific guard above for correctness).`,
  ].join("\n");

  emitAndExit(ctx);
} catch {
  // Never block an edit because of this hook.
  process.exit(0);
}
