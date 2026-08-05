/**
 * FK-1 runtime proof — the committed registry matches what Postgres actually has.
 *
 * WHY THIS EXISTS. `prisma/fk-registry.json` is produced by REPLAYING 186 migration files with regexes
 * (`gen:fk-registry`). That is a parse, and a parse can be wrong in ways no static check would notice:
 * a constraint spelled across lines the pattern didn't anticipate, a `DROP` my replay missed, a
 * constraint created inside a `DO $$` block, a migration that failed halfway in production. The static
 * guard `verify:fk-registry` would keep passing in every one of those cases, because it only compares
 * schema.prisma against the registry — never against the database.
 *
 * So this reads the referential graph a SECOND, independent way: straight out of `pg_constraint`, which
 * is the only authority that cannot be wrong. Any difference is real and must be resolved by hand —
 * either the parser needs fixing, a migration needs writing, or someone changed the database
 * out-of-band. The script deliberately does NOT auto-rewrite the registry; silently adopting whatever
 * the database says would turn a detected drift into a laundered one.
 *
 * It compares the FULL definition — table, ordered source columns, referenced table, ordered referenced
 * columns, and both referential actions. Column ORDER is load-bearing: `(tenantId, lotId)` and
 * `(lotId, tenantId)` are different constraints with the same members.
 *
 * Reads through `runAsSystem` (the owner role): `pg_constraint` is visibility-filtered by privilege, and
 * the app_rls role cannot see every table's constraints.
 *
 * Run:  npm run verify:fk-registry-db      (needs DATABASE_URL + DATABASE_URL_UNPOOLED)
 *       CI: the `db-proofs` job, after `prisma migrate deploy`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";

type Fk = {
  constraint: string;
  table: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete: string | null;
  onUpdate: string | null;
};

/** pg_constraint stores referential actions as a single char. */
const ACTION: Record<string, string> = {
  a: "NO ACTION",
  r: "RESTRICT",
  c: "CASCADE",
  n: "SET NULL",
  d: "SET DEFAULT",
};

type Row = {
  constraint: string;
  table: string;
  refTable: string;
  columns: string[];
  refColumns: string[];
  deltype: string;
  updtype: string;
};

/** Canonical one-line form, so a diff points at exactly what differs. */
const sig = (f: Fk): string =>
  `${f.table}(${f.columns.join(",")}) -> ${f.refTable}(${f.refColumns.join(",")}) ` +
  `onDelete=${f.onDelete ?? "-"} onUpdate=${f.onUpdate ?? "-"}`;

async function main(): Promise<number> {
  const registryRaw = JSON.parse(readFileSync(join(process.cwd(), "prisma", "fk-registry.json"), "utf8"));
  const declared = new Map<string, Fk>();
  for (const c of registryRaw.constraints as Fk[]) declared.set(c.constraint, c);

  // `unnest(...) WITH ORDINALITY` preserves column ORDER, which a plain join on pg_attribute would lose.
  const rows = await runAsSystem((db) =>
    db.$queryRaw<Row[]>`
      SELECT con.conname                                  AS "constraint",
             src.relname                                  AS "table",
             tgt.relname                                  AS "refTable",
             (SELECT array_agg(a.attname ORDER BY u.ord)
                FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = u.attnum) AS "columns",
             (SELECT array_agg(a.attname ORDER BY u.ord)
                FROM unnest(con.confkey) WITH ORDINALITY AS u(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = u.attnum) AS "refColumns",
             con.confdeltype::text                        AS "deltype",
             con.confupdtype::text                        AS "updtype"
      FROM pg_constraint con
      JOIN pg_class src ON src.oid = con.conrelid
      JOIN pg_class tgt ON tgt.oid = con.confrelid
      WHERE con.contype = 'f'
        AND src.relnamespace = 'public'::regnamespace
      ORDER BY src.relname, con.conname`,
  );

  const actual = new Map<string, Fk>();
  for (const r of rows) {
    actual.set(r.constraint, {
      constraint: r.constraint,
      table: r.table,
      columns: r.columns ?? [],
      refTable: r.refTable,
      refColumns: r.refColumns ?? [],
      onDelete: ACTION[r.deltype] ?? null,
      onUpdate: ACTION[r.updtype] ?? null,
    });
  }

  console.log(`\nFK-1 runtime proof — registry ${declared.size} constraints vs database ${actual.size}\n`);

  const missingInDb: string[] = [];
  const missingInRegistry: string[] = [];
  const mismatched: string[] = [];

  for (const [name, want] of declared) {
    const have = actual.get(name);
    if (!have) {
      missingInDb.push(`  ${name}\n      registry: ${sig(want)}`);
      continue;
    }
    // The registry omits an explicit NO ACTION where the SQL was silent; Postgres always reports one.
    const norm = (v: string | null) => (v === null || v === "NO ACTION" ? "-" : v);
    if (
      want.table !== have.table ||
      want.refTable !== have.refTable ||
      want.columns.join(",") !== have.columns.join(",") ||
      want.refColumns.join(",") !== have.refColumns.join(",") ||
      norm(want.onDelete) !== norm(have.onDelete) ||
      norm(want.onUpdate) !== norm(have.onUpdate)
    ) {
      mismatched.push(`  ${name}\n      registry: ${sig(want)}\n      database: ${sig(have)}`);
    }
  }
  for (const name of actual.keys()) if (!declared.has(name)) missingInRegistry.push(`  ${name}  ${sig(actual.get(name)!)}`);

  let failed = false;
  if (missingInDb.length) {
    failed = true;
    console.error(`✗ ${missingInDb.length} constraint(s) in the registry do NOT exist in the database.`);
    console.error("  Either a migration was never applied, or the generator invented them from SQL that never ran:\n");
    for (const m of missingInDb) console.error(m);
  }
  if (missingInRegistry.length) {
    failed = true;
    console.error(`\n✗ ${missingInRegistry.length} constraint(s) exist in the database but NOT in the registry.`);
    console.error("  Either the generator's parse missed them, or they were created out-of-band:\n");
    for (const m of missingInRegistry) console.error(m);
  }
  if (mismatched.length) {
    failed = true;
    console.error(`\n✗ ${mismatched.length} constraint(s) DIFFER between the registry and the database:\n`);
    for (const m of mismatched) console.error(m);
  }

  if (failed) {
    console.error(
      "\nResolve by hand — do NOT just re-run gen:fk-registry to paper over it. The generator reads " +
        "migrations; if the database disagrees, one of them is wrong and it matters which.\n",
    );
    return 1;
  }

  console.log(`✓ FK-1: the registry matches pg_constraint exactly (${actual.size} foreign keys).\n`);
  return 0;
}

main()
  .then(async (code) => {
    await disconnectSystem();
    process.exit(code);
  })
  .catch(async (e) => {
    console.error("\n✗ FK-1 runtime proof ERRORED:", e);
    await disconnectSystem();
    process.exit(1);
  });
