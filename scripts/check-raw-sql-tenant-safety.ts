/**
 * Plan 029 guard — raw SQL ($queryRaw/$executeRaw) bypasses the tenant Prisma extension (which only
 * intercepts model operations), so a raw query on a top-level client runs with NO app.tenant_id and,
 * under the activated NOBYPASSRLS role, silently returns 0 rows (and would leak cross-tenant if RLS
 * were relaxed). Any raw read/write MUST run inside a GUC-setting transaction — runInTenantRawTx
 * (reads) or runInTenantTx / runLedgerWrite (writes) — and use the `tx` client it hands back.
 *
 * This is a pure static scan (no DB). It fails if a raw call is made directly on a top-level client
 * (`prisma.$queryRaw` / `prismaBase.$executeRaw` / …Unsafe) anywhere in src/ outside the allowlisted
 * GUC-setters. It matches the receiver by name (`prisma`/`prismaBase`) rather than allow-listing a
 * `tx` identifier, so a transaction client under any name (tx/db/trx/…) never false-positives — and
 * it scans the whole file (comments stripped) so a call split across lines can't evade it.
 *
 * Known limitation (tripwire, not a proof): destructuring (`const { $queryRaw } = prisma`) or aliasing
 * (`const p = prisma; p.$queryRaw`) evades it. Those are exotic; the realistic regression is a plain
 * `prisma.$queryRaw`, which this catches.
 *
 *   npm run verify:raw-sql   (or: npx tsx scripts/check-raw-sql-tenant-safety.ts)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";

// The GUC-setters legitimately issue raw set_config on the `base` client (not prisma/prismaBase),
// so they wouldn't match anyway — allowlisted as belt-and-suspenders.
const ALLOWLIST = new Set([
  "src/lib/prisma.ts",
  "src/lib/ledger/write.ts",
  "src/lib/tenant/tx.ts",
  // Plan 079 hybrid retrieval: raw pgvector/tsvector queries over the GLOBAL knowledge corpus tables
  // (knowledge_chunk/knowledge_document — NO RLS, like fx_rate). There is no tenant GUC to set; tenant
  // scoping is enforced UPSTREAM in resolveEnabledSources (runAsTenant over the RLS subscription table),
  // and every query filters `d."sourceId" IN (enabled)`. Confirmed no tenant leak in the code review.
  "src/lib/knowledge/retrieve.ts",
]);

// A raw call directly on a TOP-LEVEL client. `\s*` spans newlines so a call split across lines
// (receiver on one line, `.$queryRaw` on the next) is still caught.
const RAW = /\b(prisma|prismaBase)\s*\.\s*\$(?:queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe)\b/g;

/** Strip block and line comments so prose like "don't call prisma.$queryRaw" can't false-positive.
 *  Coarse (does not model string literals), which only ever REDUCES matches — safe for a fail-closed
 *  guard because a real call is never inside a comment. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/[^\n]*/g, "");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const violations: string[] = [];
for (const file of walk(ROOT)) {
  const rel = file.split(/[\\/]/).join("/");
  if (ALLOWLIST.has(rel)) continue;
  const text = stripComments(readFileSync(file, "utf8"));
  RAW.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RAW.exec(text)) !== null) {
    const line = text.slice(0, m.index).split("\n").length;
    violations.push(`${rel}:${line}  ${m[0].replace(/\s+/g, "")}`);
  }
}

if (violations.length > 0) {
  console.error(
    "✗ Unscoped raw SQL on a top-level Prisma client (plan 029). Wrap in runInTenantRawTx (reads) " +
      "or runInTenantTx / runLedgerWrite (writes) and use the tx client:",
  );
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}
console.log("✓ No unscoped raw SQL found (plan 029 guard).");
process.exit(0);
