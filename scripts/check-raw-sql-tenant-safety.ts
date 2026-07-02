/**
 * Plan 029 guard — raw SQL ($queryRaw/$executeRaw) bypasses the tenant Prisma extension (which only
 * intercepts model operations), so a raw query on a top-level client runs with NO app.tenant_id and,
 * under the activated NOBYPASSRLS role, silently returns 0 rows (and would leak cross-tenant if RLS
 * were relaxed). Any raw read/write MUST run inside a GUC-setting transaction — runInTenantRawTx
 * (reads) or runInTenantTx / runLedgerWrite (writes) — and use the `tx` client it hands back.
 *
 * This is a pure static scan (no DB). It fails if a raw call appears on a top-level client
 * (e.g. prisma.$queryRaw / prismaBase.$executeRaw) anywhere in src/ outside the allowlisted
 * GUC-setters. Raw calls on a `tx` transaction client are treated as already-scoped.
 *
 *   npm run verify:raw-sql   (or: npx tsx scripts/check-raw-sql-tenant-safety.ts)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";

// The GUC-setters themselves legitimately issue raw set_config on the base client.
const ALLOWLIST = new Set(["src/lib/prisma.ts", "src/lib/ledger/write.ts", "src/lib/tenant/tx.ts"]);

const RAW = /(\w+)\.\$(?:queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe)\b/g;

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
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    RAW.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RAW.exec(line)) !== null) {
      if (m[1] === "tx") continue; // on a transaction client -> inside a GUC-set wrapper
      violations.push(`${rel}:${i + 1}  ${m[0]}`);
    }
  });
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
