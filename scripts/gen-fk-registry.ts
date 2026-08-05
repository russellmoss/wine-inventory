/**
 * FK-REGISTRY generator — recover the composite-foreign-key graph from the migration history.
 *
 * WHY THIS EXISTS. 42% of models (79 of 188) carry real foreign-key columns with **no Prisma
 * `@relation`**, because their FKs are composite `(tenantId, refId) → (tenantId, id)` and Prisma cannot
 * express that. The safety property is deliberate and worth keeping: a cross-tenant reference is
 * structurally impossible at the database. The cost is that the referential graph for **182 columns**
 * exists only inside 82 hand-written migration files — invisible to the type system, to `prisma migrate
 * diff` (documented broken on this schema), and to anyone reading `schema.prisma`.
 *
 * This script makes that graph a first-class, reviewable artifact: `prisma/fk-registry.json`.
 *
 * HOW. It replays every `prisma/migrations/<ts>/migration.sql` in chronological (lexical) order, tracking
 * FK constraints as they are ADDed and DROPped, and emits the FINAL state. Replay — rather than "collect
 * all ADDs" — matters because a dropped-and-recreated constraint would otherwise appear twice, with the
 * stale definition winning. (Measured: 186 additions, 2 drops, 4 inline `CREATE TABLE` forms — so replay
 * is cheap here, but correctness shouldn't depend on that staying true.)
 *
 * The registry is the input to two guards:
 *   - `verify:fk-registry`    — static, no DB: every raw FK column in schema.prisma is declared here.
 *   - `verify:fk-registry-db` — CI, with a DB: the registry matches `information_schema` exactly.
 * Two independent derivations of the same graph, so drift in either direction is caught.
 *
 * Run:  npm run gen:fk-registry     (then commit prisma/fk-registry.json)
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(process.cwd(), "prisma", "migrations");
const OUT = join(process.cwd(), "prisma", "fk-registry.json");

export type FkConstraint = {
  /** Constraint name — the key we replay ADD/DROP against. */
  constraint: string;
  table: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete: string | null;
  onUpdate: string | null;
  /** Which migration last defined it (provenance for review). */
  definedIn: string;
};

/** `ON DELETE RESTRICT` / `ON UPDATE CASCADE` etc., read off the tail of a constraint clause. */
function referentialAction(clause: string, keyword: "DELETE" | "UPDATE"): string | null {
  const m = clause.match(new RegExp(`ON\\s+${keyword}\\s+(CASCADE|RESTRICT|SET\\s+NULL|SET\\s+DEFAULT|NO\\s+ACTION)`, "i"));
  return m ? m[1].toUpperCase().replace(/\s+/g, " ") : null;
}

const columnList = (raw: string): string[] =>
  raw
    .split(",")
    .map((c) => c.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);

/**
 * Both spellings of a foreign key:
 *   ALTER TABLE "t" ADD CONSTRAINT "c" FOREIGN KEY ("a","b") REFERENCES "r" ("x","y") ON ... ;
 *   CREATE TABLE … ( CONSTRAINT "c" FOREIGN KEY ("a") REFERENCES "r" ("x") … )
 * The ALTER form carries its own table name; the inline form inherits the enclosing CREATE TABLE.
 */
const ALTER_FK =
  /ALTER\s+TABLE\s+(?:ONLY\s+)?"?([a-zA-Z_0-9]+)"?\s+ADD\s+CONSTRAINT\s+"?([a-zA-Z_0-9]+)"?\s+FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+"?([a-zA-Z_0-9]+)"?\s*\(([^)]*)\)([^;]*)/gi;
const INLINE_FK =
  /CONSTRAINT\s+"?([a-zA-Z_0-9]+)"?\s+FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+"?([a-zA-Z_0-9]+)"?\s*\(([^)]*)\)([^,)]*)/gi;
const CREATE_TABLE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z_0-9]+)"?/gi;
const DROP_FK = /ALTER\s+TABLE\s+(?:ONLY\s+)?"?([a-zA-Z_0-9]+)"?\s+DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?"?([a-zA-Z_0-9]+)"?/gi;

/** Strip `--` and block comments so commented-out SQL never enters the registry. */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function inlineTableFor(sql: string, at: number): string | null {
  let table: string | null = null;
  CREATE_TABLE.lastIndex = 0;
  for (let m = CREATE_TABLE.exec(sql); m !== null; m = CREATE_TABLE.exec(sql)) {
    if (m.index > at) break;
    table = m[1];
  }
  return table;
}

export function buildRegistry(): { constraints: FkConstraint[]; stats: Record<string, number> } {
  const dirs = readdirSync(MIGRATIONS)
    .filter((d) => /^\d/.test(d))
    .sort(); // lexical == chronological for Prisma's timestamp-prefixed names

  /** constraint name → definition. Replaying ADD/DROP in order leaves the FINAL state. */
  const live = new Map<string, FkConstraint>();
  let added = 0;
  let dropped = 0;
  let inline = 0;

  for (const dir of dirs) {
    let sql: string;
    try {
      sql = readFileSync(join(MIGRATIONS, dir, "migration.sql"), "utf8");
    } catch {
      continue;
    }
    sql = stripComments(sql);

    // Collect ADDs and DROPs with their POSITION, then apply in file order.
    //
    // ⚠️ Ordering is load-bearing and this was a real bug: applying every ADD and then every DROP loses a
    // constraint that a migration DROPs and re-CREATEs in one file — which is precisely the shape of
    // "widen an existing key" (drop the 2-column FK, add the 3-column one under the SAME name). The
    // constraint would silently disappear from the registry, and the static guard would then report the
    // column as undeclared. Found by widening block_spatial_metric_block_fkey and watching the count fall.
    type Event =
      | { at: number; kind: "add"; fk: FkConstraint }
      | { at: number; kind: "drop"; constraint: string };
    const events: Event[] = [];

    ALTER_FK.lastIndex = 0;
    for (let m = ALTER_FK.exec(sql); m !== null; m = ALTER_FK.exec(sql)) {
      const [, table, constraint, cols, refTable, refCols, tail] = m;
      events.push({
        at: m.index,
        kind: "add",
        fk: {
          constraint,
          table,
          columns: columnList(cols),
          refTable,
          refColumns: columnList(refCols),
          onDelete: referentialAction(tail, "DELETE"),
          onUpdate: referentialAction(tail, "UPDATE"),
          definedIn: dir,
        },
      });
    }

    INLINE_FK.lastIndex = 0;
    for (let m = INLINE_FK.exec(sql); m !== null; m = INLINE_FK.exec(sql)) {
      // The inline pattern also matches inside an ALTER … ADD CONSTRAINT; skip those.
      const before = sql.slice(Math.max(0, m.index - 80), m.index);
      if (/ADD\s+$/i.test(before)) continue;
      const [, constraint, cols, refTable, refCols, tail] = m;
      const table = inlineTableFor(sql, m.index);
      if (table === null) continue;
      if (events.some((e) => e.kind === "add" && e.fk.constraint === constraint)) continue;
      events.push({
        at: m.index,
        kind: "add",
        fk: {
          constraint,
          table,
          columns: columnList(cols),
          refTable,
          refColumns: columnList(refCols),
          onDelete: referentialAction(tail, "DELETE"),
          onUpdate: referentialAction(tail, "UPDATE"),
          definedIn: dir,
        },
      });
      inline++;
    }

    DROP_FK.lastIndex = 0;
    for (let m = DROP_FK.exec(sql); m !== null; m = DROP_FK.exec(sql)) {
      events.push({ at: m.index, kind: "drop", constraint: m[2] });
    }

    events.sort((a, b) => a.at - b.at);
    for (const e of events) {
      if (e.kind === "add") {
        live.set(e.fk.constraint, e.fk);
        added++;
      } else if (live.delete(e.constraint)) {
        dropped++;
      }
    }
  }

  const constraints = [...live.values()].sort((a, b) =>
    a.table === b.table ? a.constraint.localeCompare(b.constraint) : a.table.localeCompare(b.table),
  );
  const composite = constraints.filter((c) => c.columns.includes("tenantId")).length;
  return {
    constraints,
    stats: {
      migrations: dirs.length,
      additions: added,
      inlineAdditions: inline,
      dropsApplied: dropped,
      final: constraints.length,
      tenantComposite: composite,
      simple: constraints.length - composite,
    },
  };
}

if (process.argv[1] && process.argv[1].includes("gen-fk-registry")) {
  const { constraints, stats } = buildRegistry();
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        $comment:
          "GENERATED by scripts/gen-fk-registry.ts — do not hand-edit. Replayed from prisma/migrations/<ts>/migration.sql. " +
          "Guarded by verify:fk-registry (static) and verify:fk-registry-db (against a real database).",
        generatedFrom: "prisma/migrations",
        stats,
        constraints,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`✓ wrote prisma/fk-registry.json`);
  for (const [k, v] of Object.entries(stats)) console.log(`    ${k.padEnd(18)} ${v}`);
}
