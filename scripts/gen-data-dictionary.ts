/**
 * Generate the data dictionary + ER diagrams from the schema. Run it, don't hand-maintain it.
 *
 *   npm run docs:data-dictionary
 *
 * Emits three artifacts, all derived — never edit them by hand:
 *   docs/architecture/data-dictionary.md    every table, every column: type, null, default, key, description
 *   docs/architecture/data-dictionary.csv   the same, flat — open it in Excel
 *   docs/architecture/erd.md                Mermaid ER diagrams, ONE PER DOMAIN
 *
 * WHY PER-DOMAIN DIAGRAMS. 188 tables and 439 foreign keys in a single diagram renders as a hairball
 * nobody can read. The domains below are the seams the app already has, so each diagram is something you
 * can actually follow.
 *
 * WHY THIS BEATS THE ORM'S OWN VIEW. 183 of the 439 foreign keys are COMPOSITE — `(tenantId, refId) →
 * (tenantId, id)` — which is what makes a cross-tenant reference structurally impossible. Prisma cannot
 * express those, so they carry no `@relation` and are invisible to Prisma Studio and to `include:`. They
 * ARE real `pg_constraint` rows (CI proves it by diffing against the catalog every run), so this reads
 * the registry rather than the schema's relations, and the diagrams show all 439.
 *
 * DESCRIPTIONS ARE NOT INVENTED. They come from the comments already in `schema.prisma` — the `///` docs,
 * the `//` line(s) directly above a field, and the trailing `//` on the field itself. A field whose
 * description is blank simply has no comment in the schema. That is a to-do, not a defect in this script,
 * and leaving it visibly blank is the point: a fabricated description is worse than none.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
const REGISTRY = join(ROOT, "prisma", "fk-registry.json");
const OUT = join(ROOT, "docs", "architecture");

/** The seams the app already has. A model matches the first pattern that hits; the rest fall to "Other". */
const DOMAINS: { name: string; blurb: string; match: RegExp }[] = [
  { name: "Identity & access", blurb: "Who can sign in, which winery they belong to, and what they may reach.", match: /^(User|Session|Account|Verification|Organization|Member|Invitation|UserVineyard|VoiceProfile|VoicePreference|AppSettings|Owner)$/ },
  { name: "The land", blurb: "Vineyards, blocks, plantings, and the geospatial layers over them.", match: /^(Location|Variety|Grower|GrowerContact|Vineyard|Block|Subblock|Spatial|Cdse|FieldNote|FieldInput)/ },
  { name: "Weather & climate", blurb: "Observed and forecast weather per vineyard, plus provider usage.", match: /^(VineyardClimate|VineyardWeather|VineyardForecast|WeatherProvider)/ },
  { name: "Spray & pest", blurb: "The pesticide corpus, tenant product facts, and the append-only spray chain.", match: /^(Pesticide|Spray|TenantProductFacts|LegacySpray|LatentInfection|PlannedHarvest)/ },
  { name: "Harvest", blurb: "Picks, weigh tags, and Brix readings coming off the vineyard.", match: /^(BrixLog|Harvest|WeighTag)/ },
  { name: "The cellar ledger", blurb: "THE CORE. Lots, the append-only operation ledger, and the projections folded from it.", match: /^(Lot|Vessel|Press|Blend|Analysis|Sample|NamingTemplate|CellarMaterial)/ },
  { name: "Materials & equipment", blurb: "Consumables, supply lots, barrels, and tracked equipment assets.", match: /^(SupplyLot|MaterialMovement|SupplyConsumption|Barrel|EquipmentAsset|CustomUnit|StockMovement)/ },
  { name: "Work orders", blurb: "The human process layer — tasks, attempts, templates, reservations.", match: /^(WorkOrder|Reservation|CalculationLog)/ },
  { name: "Bottling & finished goods", blurb: "Bottling runs, SKUs, and finished-goods inventory.", match: /^(WineSku|Bottling|Bottled|FinishedGood)/ },
  { name: "Cost & accounting", blurb: "Cost roll-up, variance, A/P export, and the accounting connection.", match: /^(Cost|Operation|Accounting|AccountMapping|ApExport|Fx|Commerce7|SalesExport|BillableWine)/ },
  { name: "Compliance & tax", blurb: "TTB reporting, bond isolation, tax class, and reminders.", match: /^(Compliance|Bond|ChangeOfTaxClass)/ },
  { name: "Vendors & ingest", blurb: "Vendors and the invoice/document ingestion staging tables.", match: /^(Vendor|Ingested|LotDocument)/ },
  { name: "Assistant & feedback", blurb: "The AI assistant's conversations, confirmations, and the feedback loop.", match: /^(Assistant|Feedback|Automation)/ },
  { name: "Knowledge base", blurb: "The crawled corpus behind the assistant's domain answers.", match: /^(Knowledge|TrustedDomain|CandidateSource|OAuthState)/ },
  { name: "Inbox", blurb: "Per-user notifications and direct messages (per-USER row security, not just per-tenant).", match: /^(Inbox|DirectMessage)/ },
  { name: "Migration & audit", blurb: "Cutover import staging and the immutable audit log.", match: /^(Migration|Legacy|AuditLog)/ },
];

const SCALARS = new Set(["String", "Int", "BigInt", "Float", "Decimal", "Boolean", "DateTime", "Json", "Bytes"]);

type Field = {
  name: string;
  column: string;
  type: string;
  optional: boolean;
  list: boolean;
  isId: boolean;
  isUnique: boolean;
  dbType: string;
  defaultTo: string;
  description: string;
};
type Model = { name: string; table: string; fields: Field[]; description: string; domain: string };

const src = readFileSync(SCHEMA, "utf8").split("\r\n").join("\n");

// Enum names count as scalars for "is this a real column?".
const enums = new Set([...src.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((m) => m[1]));
const modelNames = new Set([...src.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]));

const clean = (s: string): string => s.replace(/\s+/g, " ").trim();

function parseModels(): Model[] {
  const out: Model[] = [];
  const blocks = [...src.matchAll(/(^(?:\s*\/\/\/?[^\n]*\n)*)^model\s+(\w+)\s*\{\n([\s\S]*?)^\}/gm)];

  for (const b of blocks) {
    const lead = b[1] ?? "";
    const name = b[2];
    const body = b[3];

    const description = clean(
      lead
        .split("\n")
        .map((l) => l.replace(/^\s*\/\/\/?\s?/, ""))
        .join(" "),
    );

    const tableMatch = /@@map\("([^"]+)"\)/.exec(body);
    const table = tableMatch ? tableMatch[1] : name;

    const fields: Field[] = [];
    let pending: string[] = [];

    for (const raw of body.split("\n")) {
      const line = raw.trimEnd();
      if (line.trim() === "") continue;

      // A standalone comment line becomes the description of the NEXT field.
      const solo = /^\s*\/\/\/?\s?(.*)$/.exec(line);
      if (solo) {
        pending.push(solo[1]);
        continue;
      }
      // Block-level attributes (@@index, @@unique, @@map) are not columns.
      if (/^\s*@@/.test(line)) {
        pending = [];
        continue;
      }

      const m = /^\s{2,}(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line);
      if (!m) {
        pending = [];
        continue;
      }
      const [, fname, ftype, list, optional, rest] = m;

      const trailing = /\/\/\s?(.*)$/.exec(rest);
      const attrs = rest.replace(/\/\/.*$/, "");

      // Only real DB columns. A field typed as another MODEL is a Prisma-only virtual relation.
      const isColumn = SCALARS.has(ftype) || enums.has(ftype);
      if (!isColumn || modelNames.has(ftype)) {
        pending = [];
        continue;
      }

      const colMap = /@map\("([^"]+)"\)/.exec(attrs);
      const dbType = /@db\.(\w+(?:\([^)]*\))?)/.exec(attrs);
      const def = /@default\(([^)]*(?:\([^)]*\))?[^)]*)\)/.exec(attrs);

      fields.push({
        name: fname,
        column: colMap ? colMap[1] : fname,
        type: ftype + (list ? "[]" : ""),
        optional: optional === "?",
        list: list === "[]",
        isId: /@id\b/.test(attrs),
        isUnique: /@unique\b/.test(attrs),
        dbType: dbType ? dbType[1] : "",
        defaultTo: def ? def[1] : "",
        description: clean([...pending, trailing ? trailing[1] : ""].filter(Boolean).join(" ")),
      });
      pending = [];
    }

    const domain = DOMAINS.find((d) => d.match.test(name))?.name ?? "Other";
    out.push({ name, table, fields, description, domain });
  }
  return out;
}

type Fk = {
  constraint: string;
  table: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete?: string;
};

const registry = JSON.parse(readFileSync(REGISTRY, "utf8")) as { constraints: Fk[] };
const fks = registry.constraints;

const models = parseModels();
const byTable = new Map(models.map((m) => [m.table, m]));

// ── artifact 1: the dictionary ────────────────────────────────────────────────────────────────────
function dictionary(): string {
  const fkByTable = new Map<string, Fk[]>();
  for (const f of fks) fkByTable.set(f.table, [...(fkByTable.get(f.table) ?? []), f]);

  const L: string[] = [];
  L.push("# Data dictionary");
  L.push("");
  L.push("> **Generated — do not edit.** `npm run docs:data-dictionary` rebuilds this from");
  L.push("> `prisma/schema.prisma` and `prisma/fk-registry.json`. Diagrams: [[erd]].");
  L.push("");
  L.push(`**${models.length} tables · ${models.reduce((a, m) => a + m.fields.length, 0)} columns · ${fks.length} foreign keys**`);
  L.push("");
  L.push("Descriptions come from the comments already in the schema. **A blank description means the");
  L.push("schema has no comment for that column** — that is a gap to fill in `schema.prisma`, not something");
  L.push("this generator should invent.");
  L.push("");
  L.push("`Key` column: 🔑 primary key · 🔗 foreign key (per `pg_constraint`, including the composite ones");
  L.push("Prisma cannot express) · ∪ unique.");
  L.push("");

  for (const d of [...DOMAINS.map((x) => x.name), "Other"]) {
    const inDomain = models.filter((m) => m.domain === d).sort((a, b) => a.table.localeCompare(b.table));
    if (inDomain.length === 0) continue;
    const blurb = DOMAINS.find((x) => x.name === d)?.blurb ?? "Tables that do not fit the other groupings.";
    L.push(`## ${d}`);
    L.push("");
    L.push(`_${blurb}_ — ${inDomain.length} tables.`);
    L.push("");

    for (const m of inDomain) {
      L.push(`### \`${m.table}\``);
      L.push("");
      if (m.description) L.push(`${m.description}`), L.push("");
      if (m.name !== m.table) L.push(`_Prisma model: \`${m.name}\`._`), L.push("");

      const myFks = fkByTable.get(m.table) ?? [];
      const fkCols = new Set(myFks.flatMap((f) => f.columns));

      L.push("| Column | Type | Null | Key | Default | Description |");
      L.push("| --- | --- | :-: | :-: | --- | --- |");
      for (const f of m.fields) {
        const key = [f.isId ? "🔑" : "", fkCols.has(f.column) ? "🔗" : "", f.isUnique ? "∪" : ""].filter(Boolean).join(" ");
        const type = f.dbType ? `${f.type} \`${f.dbType}\`` : f.type;
        L.push(
          `| \`${f.column}\` | ${type} | ${f.optional ? "yes" : "no"} | ${key} | ${f.defaultTo ? `\`${f.defaultTo}\`` : ""} | ${f.description.replace(/\|/g, "\\|")} |`,
        );
      }
      L.push("");

      if (myFks.length > 0) {
        L.push("**References**");
        L.push("");
        for (const f of myFks.sort((a, b) => a.constraint.localeCompare(b.constraint))) {
          const composite = f.columns.length > 1 ? " _(composite — invisible to Prisma)_" : "";
          L.push(
            `- \`(${f.columns.join(", ")})\` → \`${f.refTable}(${f.refColumns.join(", ")})\`${f.onDelete && f.onDelete !== "NO ACTION" ? ` · ON DELETE ${f.onDelete}` : ""}${composite}`,
          );
        }
        L.push("");
      }
    }
  }
  return L.join("\n") + "\n";
}

// ── artifact 2: the CSV (for Excel) ───────────────────────────────────────────────────────────────
function csv(): string {
  const q = (s: string): string => `"${String(s).replace(/"/g, '""')}"`;
  const fkByCol = new Map<string, Fk>();
  for (const f of fks) for (const c of f.columns) fkByCol.set(`${f.table}.${c}`, f);

  const rows: string[] = [
    ["domain", "table", "column", "type", "db_type", "nullable", "is_primary_key", "is_unique", "is_foreign_key", "references", "default", "description"]
      .map(q)
      .join(","),
  ];
  for (const m of models.sort((a, b) => a.domain.localeCompare(b.domain) || a.table.localeCompare(b.table))) {
    for (const f of m.fields) {
      const fk = fkByCol.get(`${m.table}.${f.column}`);
      rows.push(
        [
          m.domain,
          m.table,
          f.column,
          f.type,
          f.dbType,
          f.optional ? "yes" : "no",
          f.isId ? "yes" : "no",
          f.isUnique ? "yes" : "no",
          fk ? "yes" : "no",
          fk ? `${fk.refTable}(${fk.refColumns.join(" ")})` : "",
          f.defaultTo,
          f.description,
        ]
          .map(q)
          .join(","),
      );
    }
  }
  return rows.join("\n") + "\n";
}

// ── artifact 3: the ER diagrams ───────────────────────────────────────────────────────────────────
function erd(): string {
  const L: string[] = [];
  L.push("# Entity-relationship diagrams");
  L.push("");
  L.push("> **Generated — do not edit.** `npm run docs:data-dictionary` rebuilds this. Column detail:");
  L.push("> [[data-dictionary]].");
  L.push("");
  L.push(`**${models.length} tables · ${fks.length} foreign keys**, of which **${fks.filter((f) => f.columns.length > 1).length} are composite**`);
  L.push("`(tenantId, refId) → (tenantId, id)` — the shape that makes a cross-tenant reference structurally");
  L.push("impossible. Prisma cannot express those, so they are absent from Prisma Studio; they are real");
  L.push("`pg_constraint` rows and appear below.");
  L.push("");
  L.push("One diagram per domain, because 188 tables in a single graph is unreadable. An edge to a table");
  L.push("outside the current domain is still drawn — that is where the seams are.");
  L.push("");

  for (const d of [...DOMAINS, { name: "Other", blurb: "Tables that do not fit the other groupings.", match: /^$/ }]) {
    const inDomain = models.filter((m) => m.domain === d.name);
    if (inDomain.length === 0) continue;
    const tables = new Set(inDomain.map((m) => m.table));
    const edges = fks.filter((f) => tables.has(f.table));

    L.push(`## ${d.name}`);
    L.push("");
    L.push(`_${d.blurb}_`);
    L.push("");
    L.push(`${inDomain.length} tables · ${edges.length} outgoing references`);
    L.push("");
    L.push("```mermaid");
    L.push("erDiagram");
    for (const t of [...tables].sort()) L.push(`  ${t}`);
    const seen = new Set<string>();
    for (const f of edges.sort((a, b) => a.table.localeCompare(b.table))) {
      // One edge per (child, parent, columns) — a table pair often has several FKs.
      const label = f.columns.join("+");
      const key = `${f.table}|${f.refTable}|${label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      L.push(`  ${f.refTable} ||--o{ ${f.table} : "${label}"`);
    }
    L.push("```");
    L.push("");
  }
  return L.join("\n") + "\n";
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "data-dictionary.md"), dictionary());
writeFileSync(join(OUT, "data-dictionary.csv"), csv());
writeFileSync(join(OUT, "erd.md"), erd());

const cols = models.reduce((a, m) => a + m.fields.length, 0);
const described = models.reduce((a, m) => a + m.fields.filter((f) => f.description).length, 0);
console.log(`\n✓ data dictionary generated`);
console.log(`  ${models.length} tables · ${cols} columns · ${fks.length} foreign keys (${fks.filter((f) => f.columns.length > 1).length} composite)`);
console.log(`  ${described}/${cols} columns carry a description from the schema (${Math.round((100 * described) / cols)}%)`);
console.log(`  docs/architecture/data-dictionary.md`);
console.log(`  docs/architecture/data-dictionary.csv   ← open in Excel`);
console.log(`  docs/architecture/erd.md\n`);
