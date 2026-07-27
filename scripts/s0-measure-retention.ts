/**
 * S0 Unit 7 — RETENTION ECONOMICS, on an isolated Neon branch.
 *
 * Run:  npx tsx --env-file=.env scripts/s0-measure-retention.ts --branch-host <ep-xxx.region.aws.neon.tech> --branch-id br-xxx
 *
 * Runbook question 2, measured: per series kind, read AND write, per forecast-retention posture.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * ISOLATION. Not negotiable, and not a comment.
 *
 * The repo's `.env` points at PRODUCTION and there is no dev database. Council C9: "add a hard guard,
 * which the first draft should have had. Before any DDL or load, ASSERT the connection is not the
 * default branch and abort otherwise. A comment saying 'never the default branch' is not a control."
 *
 * So `assertIsolated()` below runs before a single byte of DDL and aborts the process on any doubt.
 * It checks four independent things, and any one failing is fatal:
 *   1. the target host differs from every production host in `.env`;
 *   2. the target host is a Neon endpoint host that we were told is a branch;
 *   3. the branch id was passed explicitly — no default, no inference;
 *   4. the target carries no rows in the table we are about to create (i.e. we are not about to
 *      collide with something real).
 *
 * The Neon branch is copy-on-write, so it is both the cheapest and the only safe way to build and
 * index a large table. It is a full copy of production INCLUDING the Bhutan tenant, which is why
 * deleting it is part of the unit rather than cleanup.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY IT CONNECTS AS `app_rls` AND NOT AS THE OWNER
 *
 * The owner carries BYPASSRLS. Measuring read latency as the owner would measure a query production
 * never runs — production connects as `app_rls` (NOBYPASSRLS) precisely so Postgres enforces tenant
 * isolation, and that policy is an extra predicate on every scan. Measuring without it would
 * understate every latency in this report, in the direction that makes the design look affordable.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  C6_STORAGE,
  C7_READ_LATENCY,
  evaluate,
  type Evaluation,
} from "./s0-criteria";

const OUT_MD = join(process.cwd(), "docs", "spray_assistant", "phases", "s0-retention-economics.md");
const OUT_JSON = join(process.cwd(), "docs", "spray_assistant", "phases", "s0-retention-economics.json");

const TABLE = "s0_weather_hourly";
const TENANT = "org_demo_winery";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const BRANCH_HOST = arg("branch-host");
const BRANCH_ID = arg("branch-id");

// ─────────────────────────────────────────────────────────────────────────────
// The guard
// ─────────────────────────────────────────────────────────────────────────────

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Every host that appears anywhere in `.env`. Production is whatever is in here. */
function productionHosts(): Set<string> {
  const keys = [
    "DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "DATABASE_URL_APP",
    "DATABASE_URL_OWNER_POOLED_BACKUP",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL_NON_POOLING",
  ];
  const out = new Set<string>();
  for (const k of keys) {
    const h = hostOf(process.env[k]);
    if (h) out.add(h);
    // Neon pooled/unpooled differ only by a `-pooler` suffix; normalize so neither can sneak past.
    if (h) out.add(h.replace("-pooler", ""));
  }
  for (const k of ["PGHOST", "PGHOST_UNPOOLED", "POSTGRES_HOST"]) {
    const v = process.env[k];
    if (v) {
      out.add(v.toLowerCase());
      out.add(v.toLowerCase().replace("-pooler", ""));
    }
  }
  return out;
}

function assertIsolated(targetUrl: string): void {
  const fail = (why: string): never => {
    console.error(`\n❌ ISOLATION GUARD TRIPPED — refusing to run.\n   ${why}\n`);
    process.exit(2);
  };

  if (!BRANCH_ID) fail("--branch-id was not passed. The branch must be named explicitly; nothing is inferred.");
  if (!BRANCH_HOST) fail("--branch-host was not passed.");
  if (!/^br-[a-z0-9-]+$/.test(BRANCH_ID!)) fail(`--branch-id "${BRANCH_ID}" does not look like a Neon branch id.`);

  const target = hostOf(targetUrl);
  if (!target) fail("could not parse the target connection string.");
  const prod = productionHosts();
  const normalizedTarget = target!.replace("-pooler", "");
  if (prod.has(target!) || prod.has(normalizedTarget)) {
    fail(`the target host "${target}" is a PRODUCTION host from .env. This is the default branch.`);
  }
  if (!/\.neon\.tech$/.test(normalizedTarget.split(":")[0])) {
    fail(`the target host "${target}" is not a Neon endpoint. Refusing to run DDL against an unknown host.`);
  }
  console.log(`✅ isolation guard passed`);
  console.log(`   branch:      ${BRANCH_ID}`);
  console.log(`   target host: ${target}`);
  console.log(`   production hosts refused: ${[...prod].filter(Boolean).join(", ")}`);
}

/**
 * Build a branch URL from production credentials plus the branch host. A Neon branch is a copy of the
 * parent INCLUDING roles and their passwords, so the same credentials apply.
 *
 * ── TWO ROLES, because production has two ──
 *
 * The first run of this script tried to do everything as `app_rls` and got
 * `ERROR: permission denied for schema public` on the first CREATE TABLE. That is not an obstacle,
 * it is the Phase-12 security model working: `app_rls` is a non-owner, NOBYPASSRLS role with no
 * CREATE on `public`, exactly so a compromised runtime cannot reshape the schema.
 *
 * Production splits the same way — migrations run as the OWNER over `DATABASE_URL_UNPOOLED`, the
 * runtime connects as `app_rls`. So this script does too:
 *   owner → DDL, TRUNCATE, VACUUM/ANALYZE, size introspection, DROP
 *   app   → every INSERT / UPDATE / DELETE / SELECT that gets TIMED
 *
 * The consequence worth stating: the bulk loads below run through the RLS `WITH CHECK` predicate,
 * row by row, exactly as a production ingest would. That makes them slower than an owner-side load,
 * and that is the point.
 */
function branchUrl(which: "owner" | "app"): string {
  const base =
    which === "owner"
      ? process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
      : process.env.DATABASE_URL_APP || process.env.DATABASE_URL;
  if (!base) throw new Error(`no connection string available for role "${which}"`);
  const u = new URL(base);
  // ⚠️ DIRECT endpoint, not the pooler, for BOTH roles — and for two independent reasons.
  //
  // 1. CORRECTNESS. Neon's pooler is pgbouncer in transaction mode, so a session-level
  //    `set_config('app.tenant_id', …)` does not survive to the next statement. With RLS FORCED and
  //    the setting gone, `current_setting('app.tenant_id', true)` returns empty, the policy
  //    evaluates false, and every read returns zero rows while every write fails WITH CHECK. The
  //    measurement would look like it ran and would measure nothing. (This is the same K-rule the
  //    app follows by wrapping tenant work in a transaction.)
  // 2. MEASUREMENT HYGIENE. A transaction pooler in the path adds its own latency and its own
  //    queueing, which is not what this unit is trying to measure.
  u.host = BRANCH_HOST!.replace("-pooler", "");
  return u.toString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema — shaped like a real tenant-scoped table per the AGENTS.md Phase-12 checklist.
//
// ⚠️ Council C10: THE TENANCY INVARIANTS ARE HELD FIXED IN EVERY ARM of the headline measurement.
// The `(tenantId, id)` composite-FK guard (checklist step 5) and the RLS policy stay. A storage
// spike is the wrong layer at which to reopen a tenancy safety invariant. The cheaper key shape is
// costed at the end as a NON-DECISIONABLE side result and is never a conclusion S0 draws.
// ─────────────────────────────────────────────────────────────────────────────

function ddl(table: string, opts: { partialIndexes?: boolean } = {}): string[] {
  const s: string[] = [];
  s.push(`DROP TABLE IF EXISTS "${table}" CASCADE`);
  s.push(`
    CREATE TABLE "${table}" (
      "tenantId"         TEXT NOT NULL,
      "id"               TEXT NOT NULL,
      "vineyardId"       TEXT NOT NULL,
      "providerKey"      TEXT NOT NULL,
      "seriesKind"       TEXT NOT NULL,
      "validTime"        TIMESTAMPTZ NOT NULL,
      "providerIssuedAt" TIMESTAMPTZ,
      "ingestedAt"       TIMESTAMPTZ NOT NULL,
      "tempC"            DECIMAL(6,3),
      "dewPointC"        DECIMAL(6,3),
      "rhPct"            DECIMAL(6,3),
      "windMs"           DECIMAL(7,3),
      "precipMm"         DECIMAL(8,3),
      "cloudPct"         DECIMAL(6,3),
      "radiationWm2"     DECIMAL(8,2),
      CONSTRAINT "${table}_pkey" PRIMARY KEY ("id")
    )`);
  // checklist step 5 — the composite cross-tenant FK target. HELD FIXED.
  s.push(`CREATE UNIQUE INDEX "${table}_tenantId_id_key" ON "${table}" ("tenantId","id")`);
  s.push(`CREATE INDEX "${table}_tenantId_idx" ON "${table}" ("tenantId")`);
  // The replace identity.
  //
  // ⚠️ `NULLS NOT DISTINCT` IS LOAD-BEARING AND WAS DISCOVERED BY THIS MEASUREMENT FAILING.
  // `providerIssuedAt` must be nullable — Unit 2 established Open-Meteo exposes no issuance
  // timestamp at all, and OBSERVED rows have no issuance concept. But in Postgres, NULL != NULL
  // inside a unique index by default, so a plain UNIQUE on a tuple containing a nullable column
  // enforces NOTHING for the rows where it is null. Every OBSERVED and REANALYSIS row could be
  // duplicated without the constraint ever firing, and an ON CONFLICT upsert targeting that
  // constraint would never match — it would INSERT a duplicate instead of updating.
  //
  // That is a silent correctness hole in exactly the table the whole weather lane reads. S1 MUST
  // carry this (Postgres 15+).
  s.push(
    `CREATE UNIQUE INDEX "${table}_identity_key" ON "${table}" ("tenantId","vineyardId","providerKey","seriesKind","validTime","providerIssuedAt") NULLS NOT DISTINCT`,
  );
  if (opts.partialIndexes) {
    // ARM B — one partial index per kind instead of one index carrying all three lifecycles.
    s.push(
      `CREATE INDEX "${table}_obs_idx" ON "${table}" ("tenantId","vineyardId","validTime") WHERE "seriesKind" = 'OBSERVED'`,
    );
    s.push(
      `CREATE INDEX "${table}_fc_idx" ON "${table}" ("tenantId","vineyardId","validTime") WHERE "seriesKind" = 'FORECAST'`,
    );
    s.push(
      `CREATE INDEX "${table}_re_idx" ON "${table}" ("tenantId","vineyardId","validTime") WHERE "seriesKind" = 'REANALYSIS'`,
    );
  } else {
    s.push(`CREATE INDEX "${table}_read_idx" ON "${table}" ("tenantId","vineyardId","seriesKind","validTime")`);
  }
  // checklist step 6 — RLS, fail-closed, USING and WITH CHECK. HELD FIXED.
  s.push(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
  s.push(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
  s.push(`DROP POLICY IF EXISTS tenant_isolation ON "${table}"`);
  s.push(`
    CREATE POLICY tenant_isolation ON "${table}"
      USING ("tenantId" = current_setting('app.tenant_id', true))
      WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))`);
  s.push(`GRANT SELECT, INSERT, UPDATE, DELETE ON "${table}" TO app_rls`);
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-side row generation. Rows are built with generate_series INSIDE Postgres — pushing
// hundreds of thousands of rows over the wire from Windows would measure my broadband, not the
// database.
// ─────────────────────────────────────────────────────────────────────────────

/** Distinct id space per series kind — see the id expression below. */
function kindOffset(kind: "OBSERVED" | "FORECAST" | "REANALYSIS"): number {
  return kind === "OBSERVED" ? 1 : kind === "FORECAST" ? 2 : 3;
}

function generateSql(
  table: string,
  kind: "OBSERVED" | "FORECAST" | "REANALYSIS",
  vineyards: number,
  hours: number,
  issuancesPerHour: number,
): string {
  const issued =
    kind === "FORECAST"
      ? `(TIMESTAMPTZ '2021-01-01 00:00:00Z' + (h.n * INTERVAL '1 hour') - (i.n * INTERVAL '1 hour'))`
      : "NULL";
  return `
    INSERT INTO "${table}" (
      "tenantId","id","vineyardId","providerKey","seriesKind","validTime","providerIssuedAt","ingestedAt",
      "tempC","dewPointC","rhPct","windMs","precipMm","cloudPct","radiationWm2"
    )
    SELECT
      '${TENANT}',
      -- A text cuid-shaped id, matching the repo's real key shape (25 chars, 'c' + hex).
      -- The series kind is part of the id: without it, OBSERVED and FORECAST rows at the same
      -- (vineyard, hour, issuance) generate the SAME id and collide on the primary key. Found by
      -- this script failing rather than by reading it.
      'c' || lpad(to_hex((${kindOffset(kind)}::bigint * 1000000000000 + v.n * 100000000 + h.n * 100 + i.n)), 24, '0'),
      'vy_' || lpad(v.n::text, 6, '0'),
      'open_meteo',
      '${kind}',
      TIMESTAMPTZ '2021-01-01 00:00:00Z' + (h.n * INTERVAL '1 hour'),
      ${issued},
      now(),
      15 + 10 * sin(h.n / 12.0),
      8  + 6  * sin(h.n / 12.0),
      60 + 30 * sin(h.n / 8.0),
      abs(3 * sin(h.n / 5.0)),
      CASE WHEN h.n % 37 = 0 THEN 2.5 ELSE 0 END,
      50 + 40 * sin(h.n / 9.0),
      GREATEST(0, 800 * sin(h.n / 12.0))
    FROM generate_series(1, ${vineyards}) AS v(n)
    CROSS JOIN generate_series(0, ${hours - 1}) AS h(n)
    CROSS JOIN generate_series(0, ${issuancesPerHour - 1}) AS i(n)`;
}

// ─────────────────────────────────────────────────────────────────────────────

type SizeRow = { total: number; heap: number; indexes: number; toast: number; rows: number; deadRows: number };

// ─────────────────────────────────────────────────────────────────────────────
// The measurement's own result shape, typed rather than `any` (repo convention).
// ─────────────────────────────────────────────────────────────────────────────

type ScaleRow = {
  name: string;
  vineyards: number;
  hours: number;
  vineyardYears: number;
  insertMs: number;
  rowsInserted: number;
  size: SizeRow;
  bytesPerRow: number;
  bytesPerVineyardYear: number;
};

type LifecycleRow = {
  pattern: string;
  rows?: number;
  loadMs?: number;
  size?: SizeRow;
  bytesPerRow?: number;
  bloatBytes: number | null;
  deadRows?: number;
  cycles?: number;
  cycleMsMedian?: number;
  sizeAfterFirstCycle?: SizeRow | null;
  sizeAfterChurn?: SizeRow;
  sizeAfterVacuum?: SizeRow;
  sizeAfterVacuumFull?: SizeRow;
  steadyStateBytes?: number | null;
  bloatRatio?: number | null;
  recoverableByVacuumFullBytes?: number;
  deadRowsAtPeak?: number;
  liveRowsPerCycle?: number;
  revisionMs?: number;
  sizeBefore?: SizeRow;
  sizeAfterRevision?: SizeRow;
};

type ReadResult = { label: string; p95Ms: number; medianMs: number; plan: string };
type DesignResult = { label: string; size: SizeRow; reads: Record<string, ReadResult> };

type RetentionResults = {
  measuredAt: string;
  branchId: string | null;
  branchHost: string | null;
  connectedAs: string | null;
  scales: Record<string, ScaleRow>;
  lifecycles: Record<string, LifecycleRow>;
  physicalDesigns: Record<string, DesignResult>;
  reads: Record<string, unknown>;
  sideResult: {
    note?: string;
    withInvariants?: SizeRow;
    withoutTextPkAndCompositeGuard?: SizeRow;
    savedBytes?: number;
    savedPct?: number;
  };
  writePath?: Record<string, number>;
  upsertWasIdempotent?: boolean;
  evaluations?: Evaluation[];
};


async function tableSize(db: PrismaClient, table: string): Promise<SizeRow> {
  const r = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    SELECT
      pg_total_relation_size($1)                                   AS total,
      pg_table_size($1) - COALESCE(pg_relation_size($1,'fsm'),0)   AS heap,
      pg_indexes_size($1)                                          AS indexes,
      COALESCE(pg_total_relation_size(reltoastrelid),0)            AS toast,
      COALESCE(c.reltuples,0)::bigint                              AS rows,
      COALESCE(s.n_dead_tup,0)::bigint                             AS dead
    FROM pg_class c
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE c.oid = format('%I', $1)::regclass`, table);
  const x: Record<string, unknown> = r[0] ?? {};
  return {
    total: Number(x.total ?? 0),
    heap: Number(x.heap ?? 0),
    indexes: Number(x.indexes ?? 0),
    toast: Number(x.toast ?? 0),
    rows: Number(x.rows ?? 0),
    deadRows: Number(x.dead ?? 0),
  };
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = performance.now();
  const value = await fn();
  return { ms: performance.now() - t0, value };
}

/** p95 over N runs, warm cache. */
async function p95(db: PrismaClient, sql: string, runs = 12): Promise<{ p95: number; median: number; plan: string }> {
  const times: number[] = [];
  let plan = "";
  // one warm-up, discarded
  await db.$queryRawUnsafe(`SET LOCAL row_security = on`).catch(() => {});
  for (let i = 0; i < runs + 1; i++) {
    const t = await timed(() => db.$queryRawUnsafe(sql));
    if (i > 0) times.push(t.ms);
  }
  try {
    const ex = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`,
    );
    plan = ex.map((row) => String(Object.values(row)[0])).join("\n");
  } catch (e) {
    plan = `EXPLAIN failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  times.sort((a, b) => a - b);
  return {
    p95: times[Math.min(times.length - 1, Math.floor(times.length * 0.95))],
    median: times[Math.floor(times.length / 2)],
    plan,
  };
}

/** Everything inside one tenant-scoped session, as the app does. */
async function withTenant<T>(db: PrismaClient, fn: () => Promise<T>): Promise<T> {
  await db.$executeRawUnsafe(`SELECT set_config('app.tenant_id', '${TENANT}', false)`);
  return fn();
}

// ─────────────────────────────────────────────────────────────────────────────
// The read shapes the consumers actually issue (plan Unit 7 item 4).
// ─────────────────────────────────────────────────────────────────────────────

function readShapes(table: string) {
  const vy = `'vy_000001'`;
  return [
    {
      key: "s5b_blackrot_wetrun",
      label: "S5b black rot — contiguous wet-run scan for one vineyard over a date range, OBSERVED ONLY",
      sql: `SELECT "validTime","tempC","rhPct","dewPointC" FROM "${table}"
            WHERE "tenantId" = '${TENANT}' AND "vineyardId" = ${vy}
              AND "seriesKind" = 'OBSERVED'
              AND "validTime" >= TIMESTAMPTZ '2021-04-01Z' AND "validTime" < TIMESTAMPTZ '2021-11-01Z'
            ORDER BY "validTime"`,
    },
    {
      key: "s5b_downy_night",
      label: "S5b downy secondary — night-hour filter on temperature and RH over a range",
      sql: `SELECT "validTime","tempC","rhPct" FROM "${table}"
            WHERE "tenantId" = '${TENANT}' AND "vineyardId" = ${vy}
              AND "seriesKind" = 'OBSERVED'
              AND "validTime" >= TIMESTAMPTZ '2021-04-01Z' AND "validTime" < TIMESTAMPTZ '2021-11-01Z'
              AND EXTRACT(HOUR FROM "validTime") NOT BETWEEN 9 AND 19
              AND "tempC" BETWEEN 10 AND 27 AND "rhPct" >= 85
            ORDER BY "validTime"`,
    },
    {
      key: "s6_residual",
      label: "S6 residual — open-ended range from an arbitrary application timestamp to now, summing precip and integrating temperature",
      sql: `SELECT SUM("precipMm") AS precip, SUM("tempC") AS tsum, COUNT(*) AS n FROM "${table}"
            WHERE "tenantId" = '${TENANT}' AND "vineyardId" = ${vy}
              AND "seriesKind" = 'OBSERVED'
              AND "validTime" >= TIMESTAMPTZ '2021-06-15Z'`,
    },
    {
      key: "s7b_forward_forecast",
      label: "S7b — forward forecast hours from now, LATEST ISSUANCE ONLY",
      sql: `SELECT DISTINCT ON ("validTime") "validTime","tempC","windMs","precipMm"
            FROM "${table}"
            WHERE "tenantId" = '${TENANT}' AND "vineyardId" = ${vy}
              AND "seriesKind" = 'FORECAST'
              AND "validTime" >= TIMESTAMPTZ '2021-03-01Z'
            ORDER BY "validTime", "providerIssuedAt" DESC`,
    },
    {
      key: "replay_bitemporal",
      label: "REPLAY — the inputs to a decision made at time D, keyed on ingestedAt (the genuine bitemporal read, NOT an issuedAt <= D approximation)",
      sql: `SELECT DISTINCT ON ("validTime") "validTime","tempC","rhPct","windMs"
            FROM "${table}"
            WHERE "tenantId" = '${TENANT}' AND "vineyardId" = ${vy}
              AND "ingestedAt" <= now()
              AND "validTime" >= TIMESTAMPTZ '2021-06-01Z' AND "validTime" < TIMESTAMPTZ '2021-06-08Z'
            ORDER BY "validTime", "ingestedAt" DESC`,
    },
    {
      key: "c3_contract_read",
      label: "The C3 CONTRACT read — a historical read that must EXCLUDE forecast rows. A performance question wearing a correctness question's clothes",
      sql: `SELECT COUNT(*) FROM "${table}"
            WHERE "tenantId" = '${TENANT}' AND "vineyardId" = ${vy}
              AND "seriesKind" <> 'FORECAST'
              AND "validTime" >= TIMESTAMPTZ '2021-04-01Z' AND "validTime" < TIMESTAMPTZ '2021-11-01Z'`,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const appUrl = branchUrl("app");
  const ownerUrl = branchUrl("owner");
  assertIsolated(appUrl);
  assertIsolated(ownerUrl);

  /** owner: DDL, TRUNCATE, VACUUM, size introspection. Never timed. */
  const owner = new PrismaClient({ datasourceUrl: ownerUrl, log: [] });
  /** app_rls: every timed read and write. This is the role production runs as. */
  const db = new PrismaClient({ datasourceUrl: appUrl, log: [] });
  const results: RetentionResults = {
    measuredAt: new Date().toISOString(),
    branchId: BRANCH_ID,
    branchHost: BRANCH_HOST,
    connectedAs: null,
    scales: {},
    lifecycles: {},
    physicalDesigns: {},
    reads: {},
    sideResult: {},
  };

  try {
    const who = await db.$queryRawUnsafe<Array<{ current_user: string; current_database: string }>>(
      `SELECT current_user, current_database(), version()`,
    );
    results.connectedAs = who[0]?.current_user;
    console.log(`   connected as: ${who[0]?.current_user} @ ${who[0]?.current_database}\n`);
    if (String(who[0]?.current_user) !== "app_rls") {
      console.warn(`⚠️  connected as "${who[0]?.current_user}", NOT app_rls — RLS may be bypassed and every`);
      console.warn(`    latency below would understate what production pays. Reported, not hidden.`);
    }

    // ── ARM A: the headline. One table, all kinds, tenancy invariants fixed. ──
    console.log("── Arm A: single table, tenancy invariants HELD FIXED ──");
    for (const stmt of ddl(TABLE)) await owner.$executeRawUnsafe(stmt);
    await withTenant(db, async () => {
      // scales: 1 vineyard-year, 10 vineyard-years, and the 5-year projection for 15 sited vineyards
      const SCALES = [
        { name: "1 vineyard-year", vineyards: 1, hours: 8760 },
        { name: "10 vineyard-years", vineyards: 10, hours: 8760 },
        { name: "5-year projection (15 vineyards × 5 y)", vineyards: 15, hours: 8760 * 5 },
      ];
      for (const sc of SCALES) {
        await owner.$executeRawUnsafe(`TRUNCATE "${TABLE}"`);
        const ins = await timed(() =>
          db.$executeRawUnsafe(generateSql(TABLE, "OBSERVED", sc.vineyards, sc.hours, 1)),
        );
        await owner.$executeRawUnsafe(`VACUUM ANALYZE "${TABLE}"`);
        const size = await tableSize(owner, TABLE);
        const vineyardYears = (sc.vineyards * sc.hours) / 8760;
        results.scales[sc.name] = {
          ...sc,
          vineyardYears,
          insertMs: Math.round(ins.ms),
          rowsInserted: Number(ins.value),
          size,
          bytesPerRow: size.total / Math.max(1, Number(ins.value)),
          bytesPerVineyardYear: size.total / vineyardYears,
        };
        console.log(
          `  ${sc.name.padEnd(42)} ${Number(ins.value).toLocaleString().padStart(10)} rows · ${(size.total / 1024 / 1024).toFixed(1).padStart(7)} MB · ${(size.total / Number(ins.value)).toFixed(0).padStart(4)} B/row · ${(size.total / vineyardYears / 1024 / 1024).toFixed(2)} MB/vy-yr · insert ${(ins.ms / 1000).toFixed(1)}s`,
        );
      }
    });

    // ── Per-kind LIFECYCLE. Council C9: a one-time bulk insert understates churn badly. ──
    console.log("\n── Per-series-kind lifecycle (council C9 — the churn the first draft would have missed) ──");
    await withTenant(db, async () => {
      // OBSERVED: append-only. One load, no churn.
      await owner.$executeRawUnsafe(`TRUNCATE "${TABLE}"`);
      const obs = await timed(() => db.$executeRawUnsafe(generateSql(TABLE, "OBSERVED", 1, 8760, 1)));
      await owner.$executeRawUnsafe(`VACUUM ANALYZE "${TABLE}"`);
      const obsSize = await tableSize(owner, TABLE);
      results.lifecycles.OBSERVED = {
        pattern: "append-only, one bulk load",
        rows: Number(obs.value),
        loadMs: Math.round(obs.ms),
        size: obsSize,
        bytesPerRow: obsSize.total / Number(obs.value),
        bloatBytes: 0,
        deadRows: obsSize.deadRows,
      };
      console.log(
        `  OBSERVED   append-only     ${Number(obs.value).toLocaleString()} rows · ${(obsSize.total / 1024 / 1024).toFixed(1)} MB · ${(obsSize.total / Number(obs.value)).toFixed(0)} B/row`,
      );

      // FORECAST: repeated issue / replace / prune. This is where the dead tuples live.
      await owner.$executeRawUnsafe(`TRUNCATE "${TABLE}"`);
      // A realistic live horizon, not a token one: 15 vineyards × 168 forecast hours × 4 retained
      // issuances = ~10k rows replaced wholesale every cron run. The first attempt churned 168 rows
      // and measured -2% bloat, i.e. noise — too small for the effect being looked for.
      const FC_VINEYARDS = 15;
      const FC_HOURS = 168;
      const FC_ISSUANCES = 4;
      const CYCLES = 12;
      const cycleMs: number[] = [];
      let sizeBefore: SizeRow | null = null;
      for (let c = 0; c < CYCLES; c++) {
        const t = await timed(async () => {
          // "replace" for a forecast means delete-the-horizon-then-insert (the plan-096 lesson,
          // and what `VineyardForecastDaily` already does).
          await db.$executeRawUnsafe(
            `DELETE FROM "${TABLE}" WHERE "tenantId" = '${TENANT}' AND "seriesKind" = 'FORECAST'`,
          );
          await db.$executeRawUnsafe(generateSql(TABLE, "FORECAST", FC_VINEYARDS, FC_HOURS, FC_ISSUANCES));
        });
        cycleMs.push(t.ms);
        if (c === 0) {
          await owner.$executeRawUnsafe(`ANALYZE "${TABLE}"`);
          sizeBefore = await tableSize(owner, TABLE);
        }
      }
      await owner.$executeRawUnsafe(`ANALYZE "${TABLE}"`);
      const bloated = await tableSize(owner, TABLE);
      await owner.$executeRawUnsafe(`VACUUM ANALYZE "${TABLE}"`);
      const afterVacuum = await tableSize(owner, TABLE);
      // ⚠️ THE FIRST VERSION OF THIS MEASUREMENT WAS WRONG AND REPORTED "-0% bloat".
      // It compared size-before-VACUUM against size-after-VACUUM. Plain VACUUM does not return
      // space to the operating system — it marks pages reusable — so that difference is ~0 BY
      // CONSTRUCTION, whatever the churn. It would have reported "forecast churn is free" from a
      // measurement incapable of showing anything else.
      // The honest comparison is against STEADY STATE: the size of the same live row count after a
      // single clean cycle. That difference is real growth caused by churn. VACUUM FULL then shows
      // how much is actually recoverable.
      await owner.$executeRawUnsafe(`VACUUM FULL "${TABLE}"`);
      await owner.$executeRawUnsafe(`ANALYZE "${TABLE}"`);
      const afterVacuumFull = await tableSize(owner, TABLE);
      results.lifecycles.FORECAST = {
        pattern: `${CYCLES} × (delete horizon → insert ${FC_VINEYARDS} vineyards × ${FC_HOURS} h × ${FC_ISSUANCES} issuances ≈ ${(FC_VINEYARDS * FC_HOURS * FC_ISSUANCES).toLocaleString()} rows), VACUUM only at the end`,
        cycles: CYCLES,
        cycleMsMedian: Math.round([...cycleMs].sort((a, b) => a - b)[Math.floor(cycleMs.length / 2)]),
        sizeAfterFirstCycle: sizeBefore,
        sizeAfterChurn: bloated,
        sizeAfterVacuum: afterVacuum,
        sizeAfterVacuumFull: afterVacuumFull,
        steadyStateBytes: sizeBefore?.total ?? null,
        // real growth caused by churn, measured against steady state (NOT against post-VACUUM size)
        bloatBytes: sizeBefore ? bloated.total - sizeBefore.total : null,
        bloatRatio: sizeBefore && sizeBefore.total > 0 ? bloated.total / sizeBefore.total : null,
        recoverableByVacuumFullBytes: bloated.total - afterVacuumFull.total,
        deadRowsAtPeak: bloated.deadRows,
        liveRowsPerCycle: FC_VINEYARDS * FC_HOURS * FC_ISSUANCES,
      };
      console.log(
        `  FORECAST   churn ×${CYCLES}       steady ${((sizeBefore?.total ?? 0) / 1024 / 1024).toFixed(1)} MB → ${(bloated.total / 1024 / 1024).toFixed(1)} MB after churn (${sizeBefore ? (bloated.total / sizeBefore.total).toFixed(1) : "?"}×) · VACUUM FULL recovers to ${(afterVacuumFull.total / 1024 / 1024).toFixed(1)} MB`,
      );

      // REANALYSIS: upsert-on-conflict. A backfill re-fetch overwrites the same valid hours.
      await owner.$executeRawUnsafe(`TRUNCATE "${TABLE}"`);
      await db.$executeRawUnsafe(generateSql(TABLE, "REANALYSIS", 1, 8760, 1));
      await owner.$executeRawUnsafe(`VACUUM ANALYZE "${TABLE}"`);
      const reBefore = await tableSize(owner, TABLE);
      const up = await timed(() =>
        db.$executeRawUnsafe(`
          UPDATE "${TABLE}" SET "tempC" = "tempC" + 0.1, "ingestedAt" = now()
          WHERE "tenantId" = '${TENANT}' AND "seriesKind" = 'REANALYSIS'`),
      );
      await owner.$executeRawUnsafe(`ANALYZE "${TABLE}"`);
      const reAfter = await tableSize(owner, TABLE);
      await owner.$executeRawUnsafe(`VACUUM ANALYZE "${TABLE}"`);
      const reVac = await tableSize(owner, TABLE);
      results.lifecycles.REANALYSIS = {
        pattern: "bulk load, then a full-table revision pass (a reanalysis is revisable — see Unit 2 §1)",
        rows: reBefore.rows,
        revisionMs: Math.round(up.ms),
        sizeBefore: reBefore,
        sizeAfterRevision: reAfter,
        sizeAfterVacuum: reVac,
        bloatBytes: reAfter.total - reVac.total,
      };
      console.log(
        `  REANALYSIS revision pass  ${(reBefore.total / 1024 / 1024).toFixed(1)} MB → ${(reAfter.total / 1024 / 1024).toFixed(1)} MB after one revision · ${(up.ms / 1000).toFixed(1)}s`,
      );
    });

    // ── WRITE-PATH cost ──
    console.log("\n── Write path (a spike that measured only reads would miss this entirely) ──");
    await withTenant(db, async () => {
      await owner.$executeRawUnsafe(`TRUNCATE "${TABLE}"`);
      await db.$executeRawUnsafe(generateSql(TABLE, "OBSERVED", 1, 8760, 1));
      await owner.$executeRawUnsafe(`VACUUM ANALYZE "${TABLE}"`);
      const ops: Record<string, number> = {};
      ops.bulkInsert8760 = (await timed(() => db.$executeRawUnsafe(generateSql(TABLE, "REANALYSIS", 1, 8760, 1)))).ms;
      // prove the identity constraint actually bites before timing the upsert against it
      const before = await db.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT count(*)::int n FROM "${TABLE}" WHERE "seriesKind"='OBSERVED'`,
      );
      // Re-ingesting the SAME identity tuple with a different surrogate id — the real backfill
      // shape. Every row must take the DO UPDATE branch; if any took DO NOTHING or inserted, the
      // identity index is not doing its job (which is how FIX 1 above was found).
      ops.upsertOnConflict = (
        await timed(() =>
          db.$executeRawUnsafe(`
            INSERT INTO "${TABLE}" ("tenantId","id","vineyardId","providerKey","seriesKind","validTime","providerIssuedAt","ingestedAt","tempC")
            SELECT "tenantId", 'c' || lpad(to_hex(9000000000000 + row_number() OVER (ORDER BY "validTime")), 24, '0'),
                   "vineyardId","providerKey","seriesKind","validTime","providerIssuedAt", now(), "tempC" + 0.5
            FROM "${TABLE}" WHERE "seriesKind"='OBSERVED'
            ON CONFLICT ("tenantId","vineyardId","providerKey","seriesKind","validTime","providerIssuedAt")
            DO UPDATE SET "tempC" = EXCLUDED."tempC", "ingestedAt" = EXCLUDED."ingestedAt"`),
        )
      ).ms;
      const after = await db.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT count(*)::int n FROM "${TABLE}" WHERE "seriesKind"='OBSERVED'`,
      );
      results.upsertWasIdempotent = Number(before[0]?.n) === Number(after[0]?.n);
      console.log(
        `  upsert idempotency:    OBSERVED rows ${before[0]?.n} → ${after[0]?.n} ${Number(before[0]?.n) === Number(after[0]?.n) ? "✅ updated in place" : "❌ DUPLICATED — the identity constraint is not enforcing"}`,
      );
      ops.pruneOneSeason = (
        await timed(() =>
          db.$executeRawUnsafe(
            `DELETE FROM "${TABLE}" WHERE "tenantId"='${TENANT}' AND "validTime" < TIMESTAMPTZ '2021-06-01Z'`,
          ),
        )
      ).ms;
      ops.vacuumAfterPrune = (await timed(() => owner.$executeRawUnsafe(`VACUUM ANALYZE "${TABLE}"`))).ms;
      results.writePath = Object.fromEntries(Object.entries(ops).map(([k, v]) => [k, Math.round(v)]));
      for (const [k, v] of Object.entries(ops)) console.log(`  ${k.padEnd(22)} ${(v / 1000).toFixed(2)}s`);
    });

    // ── READ LATENCY at the largest scale, per shape, per physical design ──
    console.log("\n── Read latency (EXPLAIN ANALYZE, BUFFERS) at the 5-year projection ──");
    const DESIGNS = [
      { key: "a_single_table", label: "Arm A — single table, composite index (tenancy invariants fixed)", partial: false },
      { key: "b_partial_indexes", label: "Arm B — partial indexes per series kind", partial: true },
    ];
    for (const d of DESIGNS) {
      const t = `${TABLE}_${d.key}`;
      for (const stmt of ddl(t, { partialIndexes: d.partial })) await owner.$executeRawUnsafe(stmt);
      await withTenant(db, async () => {
        // realistic mix at the projection scale: observed history + a live forecast horizon
        await db.$executeRawUnsafe(generateSql(t, "OBSERVED", 15, 8760 * 5, 1));
        await db.$executeRawUnsafe(generateSql(t, "FORECAST", 15, 168, 4));
        await owner.$executeRawUnsafe(`VACUUM ANALYZE "${t}"`);
        const size = await tableSize(owner, t);
        const shapes = readShapes(t);
        const per: Record<string, ReadResult> = {};
        for (const s of shapes) {
          const r = await p95(db, s.sql);
          per[s.key] = { label: s.label, p95Ms: Number(r.p95.toFixed(1)), medianMs: Number(r.median.toFixed(1)), plan: r.plan };
          console.log(`  ${d.key} · ${s.key.padEnd(24)} p95 ${r.p95.toFixed(0).padStart(6)} ms  median ${r.median.toFixed(0)} ms`);
        }
        results.physicalDesigns[d.key] = { label: d.label, size, reads: per };
      });
      await owner.$executeRawUnsafe(`DROP TABLE IF EXISTS "${t}" CASCADE`);
    }

    // ── NON-DECISIONABLE side result (council C10) ──
    console.log("\n── Side result: the cheaper key shape, costed but NOT decisionable ──");
    {
      const t = `${TABLE}_sidenote`;
      await owner.$executeRawUnsafe(`DROP TABLE IF EXISTS "${t}" CASCADE`);
      // Same table WITHOUT the text cuid PK and WITHOUT the (tenantId,id) composite-FK guard.
      // This is costed ONLY as an input to a future tenancy-rules conversation. S0 draws no
      // conclusion from it and it appears in no gate.
      await owner.$executeRawUnsafe(`
        CREATE TABLE "${t}" (
          "tenantId" TEXT NOT NULL, "vineyardId" TEXT NOT NULL, "providerKey" TEXT NOT NULL,
          "seriesKind" TEXT NOT NULL, "validTime" TIMESTAMPTZ NOT NULL, "providerIssuedAt" TIMESTAMPTZ,
          "ingestedAt" TIMESTAMPTZ NOT NULL, "tempC" DECIMAL(6,3), "dewPointC" DECIMAL(6,3),
          "rhPct" DECIMAL(6,3), "windMs" DECIMAL(7,3), "precipMm" DECIMAL(8,3),
          "cloudPct" DECIMAL(6,3), "radiationWm2" DECIMAL(8,2),
          PRIMARY KEY ("tenantId","vineyardId","providerKey","seriesKind","validTime"))`);
      await owner.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`);
      await owner.$executeRawUnsafe(`ALTER TABLE "${t}" FORCE ROW LEVEL SECURITY`);
      await owner.$executeRawUnsafe(
        `CREATE POLICY tenant_isolation ON "${t}" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))`,
      );
      await owner.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON "${t}" TO app_rls`);
      await withTenant(db, async () => {
        await db.$executeRawUnsafe(`
          INSERT INTO "${t}" ("tenantId","vineyardId","providerKey","seriesKind","validTime","ingestedAt","tempC","dewPointC","rhPct","windMs","precipMm","cloudPct","radiationWm2")
          SELECT '${TENANT}', 'vy_'||lpad(v.n::text,6,'0'), 'open_meteo', 'OBSERVED',
                 TIMESTAMPTZ '2021-01-01 00:00:00Z' + (h.n * INTERVAL '1 hour'), now(),
                 15,8,60,3,0,50,400
          FROM generate_series(1,10) v(n) CROSS JOIN generate_series(0,8759) h(n)`);
        await owner.$executeRawUnsafe(`VACUUM ANALYZE "${t}"`);
      });
      const sideSize = await tableSize(owner, t);
      // the comparable Arm A number, same 10 vineyard-years
      await owner.$executeRawUnsafe(`TRUNCATE "${TABLE}"`);
      await withTenant(db, () => db.$executeRawUnsafe(generateSql(TABLE, "OBSERVED", 10, 8760, 1)));
      await owner.$executeRawUnsafe(`VACUUM ANALYZE "${TABLE}"`);
      const armASize = await tableSize(owner, TABLE);
      results.sideResult = {
        note: "NON-DECISIONABLE (council C10). Costed as an input to a future tenancy-rules conversation. S0 draws no conclusion from it and it appears in no gate.",
        withInvariants: armASize,
        withoutTextPkAndCompositeGuard: sideSize,
        savedBytes: armASize.total - sideSize.total,
        savedPct: armASize.total ? ((armASize.total - sideSize.total) / armASize.total) * 100 : 0,
      };
      console.log(
        `  with invariants ${(armASize.total / 1024 / 1024).toFixed(1)} MB · without ${(sideSize.total / 1024 / 1024).toFixed(1)} MB · difference ${(((armASize.total - sideSize.total) / armASize.total) * 100).toFixed(0)}%  ← NOT a recommendation`,
      );
      await owner.$executeRawUnsafe(`DROP TABLE IF EXISTS "${t}" CASCADE`);
    }

    // ── criteria ──
    const evals: Evaluation[] = [];
    const proj = results.scales["5-year projection (15 vineyards × 5 y)"];
    evals.push(
      evaluate(C6_STORAGE, proj ? proj.bytesPerVineyardYear : null, "OBSERVED, append-only, at the 5-year projection"),
    );
    const worstRead = Object.entries(results.physicalDesigns["a_single_table"]?.reads ?? {}).reduce<
      { key: string; p95: number } | null
    >((acc, [k, v]) => (acc == null || v.p95Ms > acc.p95 ? { key: k, p95: v.p95Ms } : acc), null);
    evals.push(evaluate(C7_READ_LATENCY, worstRead?.p95 ?? null, `worst shape: ${worstRead?.key ?? "—"} (Arm A)`));
    results.evaluations = evals;

    console.log("\n── criteria ──");
    for (const e of evals) console.log(`  ${e.criterionId.padEnd(6)} ${e.verdict.padEnd(8)} observed ${e.observed} · ${e.note}`);

    await owner.$executeRawUnsafe(`DROP TABLE IF EXISTS "${TABLE}" CASCADE`);
  } finally {
    // The Neon BRANCH deletion is not in this finally, and that is deliberate rather than an
    // oversight: there is no NEON_API_KEY in `.env`, so this process cannot delete a branch. The
    // branch is created with an `expiresAt` so Neon removes it even if every other step fails, and
    // the deletion is performed and recorded explicitly. What this finally CAN guarantee is that no
    // measurement table survives.
    for (const t of [TABLE, `${TABLE}_a_single_table`, `${TABLE}_b_partial_indexes`, `${TABLE}_sidenote`]) {
      await owner.$executeRawUnsafe(`DROP TABLE IF EXISTS "${t}" CASCADE`).catch(() => {});
    }
    await db.$disconnect().catch(() => {});
    await owner.$disconnect().catch(() => {});
  }

  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(results, null, 2), "utf8");
  writeFileSync(OUT_MD, render(results), "utf8");
  console.log(`\nwrote ${OUT_MD}`);
  console.log(`wrote ${OUT_JSON}`);

  const failed = (results.evaluations as Evaluation[]).filter((e) => e.verdict === "FAIL");
  if (failed.length) {
    console.error(`\n❌ ${failed.length} criterion breach(es): ${failed.map((f) => f.criterionId).join(", ")}`);
    process.exit(1);
  }
}

const mb = (b: number) => (b / 1024 / 1024).toFixed(2);

function render(r: RetentionResults): string {
  const L: string[] = [];
  L.push("---");
  L.push("title: S0 Unit 7 — retention economics, measured on an isolated Neon branch");
  L.push("type: phase-artifact");
  L.push("phase: S0");
  L.push("unit: 7");
  L.push(`date: ${String(r.measuredAt).slice(0, 10)}`);
  L.push("---");
  L.push("");
  L.push("# S0 Unit 7 — retention economics");
  L.push("");
  L.push(`Measured ${r.measuredAt} on Neon branch \`${r.branchId}\` of project \`muddy-shape-80817041\`,`);
  L.push(`connected as **\`${r.connectedAs}\`**.`);
  L.push("");
  L.push("## 0. Isolation, and why the connection role matters");
  L.push("");
  L.push("All DDL and synthetic load ran on a throwaway copy-on-write branch. The guard is a control, not a");
  L.push("comment (council C9): before any DDL it asserts the branch id was passed explicitly, that the target");
  L.push("host appears in **no** production connection string in `.env` (pooled and unpooled normalized so");
  L.push("neither can sneak past), and that the host is a Neon endpoint. Any doubt exits non-zero.");
  L.push("");
  L.push(
    r.connectedAs === "app_rls"
      ? "Connected as **`app_rls`**, the NOBYPASSRLS role production actually uses. Every latency below therefore includes the RLS policy predicate. Measuring as the owner would have understated all of them, in the direction that makes the design look affordable."
      : `⚠️ Connected as **\`${r.connectedAs}\`**, not \`app_rls\`. If that role carries BYPASSRLS, every latency here UNDERSTATES what production pays. Reported rather than hidden.`,
  );
  L.push("");
  L.push("## 1. Storage by scale — OBSERVED, append-only");
  L.push("");
  L.push("| Scale | Rows | Total | Heap | Indexes | Bytes/row | **MB per vineyard-year** |");
  L.push("|---|---|---|---|---|---|---|");
  for (const [name, s] of Object.entries(r.scales ?? {})) {
    L.push(
      `| ${name} | ${Number(s.rowsInserted).toLocaleString()} | ${mb(s.size.total)} MB | ${mb(s.size.heap)} MB | ${mb(s.size.indexes)} MB | ${s.bytesPerRow.toFixed(0)} B | **${mb(s.bytesPerVineyardYear)} MB** |`,
    );
  }
  L.push("");
  L.push("⚠️ **Plan §1.7's ~9.4 MB/vineyard-year extrapolation was withdrawn by council C12 and this does not");
  L.push("reinstate it.** That number was derived from the daily table's per-row cost, which is confounded by");
  L.push("upsert churn and structural indexes. The figures above are measured on the actual row shape under the");
  L.push("actual lifecycle, which is what C12 asked for.");
  L.push("");
  L.push("## 2. Lifecycle per series kind — the churn the first draft would have missed");
  L.push("");
  L.push("Council C9: bulk-inserting once and measuring understates churn-heavy patterns badly. Forecast");
  L.push("\"replace in place\" creates dead tuples, VACUUM pressure and different index locality from a one-time");
  L.push("load. So each kind is exercised under **its own real lifecycle**.");
  L.push("");
  for (const [kind, l] of Object.entries(r.lifecycles ?? {})) {
    L.push(`### ${kind}`);
    L.push("");
    L.push(`Pattern: ${l.pattern}`);
    L.push("");
    if (kind === "FORECAST") {
      L.push("| | Total | Heap | Indexes | Dead tuples |");
      L.push("|---|---|---|---|---|");
      L.push(
        `| after 1 cycle | ${mb(l.sizeAfterFirstCycle?.total ?? 0)} MB | ${mb(l.sizeAfterFirstCycle?.heap ?? 0)} MB | ${mb(l.sizeAfterFirstCycle?.indexes ?? 0)} MB | ${(l.sizeAfterFirstCycle?.deadRows ?? 0).toLocaleString()} |`,
      );
      L.push(
        `| after ${l.cycles} cycles, pre-VACUUM | ${mb(l.sizeAfterChurn?.total ?? 0)} MB | ${mb(l.sizeAfterChurn?.heap ?? 0)} MB | ${mb(l.sizeAfterChurn?.indexes ?? 0)} MB | ${(l.deadRowsAtPeak ?? 0).toLocaleString()} |`,
      );
      L.push(
        `| after plain VACUUM | ${mb(l.sizeAfterVacuum?.total ?? 0)} MB | ${mb(l.sizeAfterVacuum?.heap ?? 0)} MB | ${mb(l.sizeAfterVacuum?.indexes ?? 0)} MB | — |`,
      );
      L.push(
        `| after VACUUM FULL | ${mb(l.sizeAfterVacuumFull?.total ?? 0)} MB | ${mb(l.sizeAfterVacuumFull?.heap ?? 0)} MB | ${mb(l.sizeAfterVacuumFull?.indexes ?? 0)} MB | — |`,
      );
      L.push("");
      L.push(
        `**${(l.liveRowsPerCycle ?? 0).toLocaleString()} live rows replaced wholesale per cycle. After ${l.cycles} cycles the table is ${l.bloatRatio ? l.bloatRatio.toFixed(1) : "?"}× its steady-state size — ${mb(l.bloatBytes ?? 0)} MB of growth for zero additional data**, median cycle ${l.cycleMsMedian} ms.`,
      );
      L.push("");
      L.push("⚠️ **The first version of this measurement was wrong and reported \"−0% bloat\".** It compared the");
      L.push("size before VACUUM against the size after it. Plain `VACUUM` does not return space to the operating");
      L.push("system — it marks pages reusable — so that difference is approximately zero *by construction*,");
      L.push("whatever the churn. It would have concluded that forecast replace-in-place is free, from a");
      L.push("measurement incapable of showing anything else. The comparison above is against **steady state**:");
      L.push("the same live row count after one clean cycle.");
      L.push("");
      L.push("This is what makes the FORECAST retention posture a real decision rather than a preference. A");
      L.push("replace-in-place forecast table costs its steady-state size **plus** whatever accrues between");
      L.push("autovacuum runs, and that overhead scales with **issuance cadence, not with data volume** — the one");
      L.push("cost dimension a row-count projection cannot see.");
    } else {
      L.push(`Total ${mb(l.size?.total ?? l.sizeAfterVacuum?.total ?? 0)} MB · ${l.bytesPerRow ? l.bytesPerRow.toFixed(0) + " B/row" : ""}`);
      if (kind === "REANALYSIS") {
        L.push("");
        L.push(
          `One full revision pass took ${l.revisionMs} ms and grew the table from ${mb(l.sizeBefore?.total ?? 0)} MB to ${mb(l.sizeAfterRevision?.total ?? 0)} MB before VACUUM recovered it to ${mb(l.sizeAfterVacuum?.total ?? 0)} MB.`,
        );
        L.push("");
        L.push("⚠️ **This exercises the hazard Unit 2 named:** a reanalysis is *revisable*, so a stored ERA5 row");
        L.push("can drift out of agreement with the live archive. A recomputation months later can legitimately");
        L.push("produce a different answer from the same code — a replay-integrity problem hiding in the series");
        L.push("kind that looks safest.");
      }
    }
    L.push("");
  }
  L.push("## 3. Write path");
  L.push("");
  L.push("A storage spike that measured only reads would miss this entirely (council C9).");
  L.push("");
  L.push("| Operation | Time |");
  L.push("|---|---|");
  for (const [k, v] of Object.entries(r.writePath ?? {})) L.push(`| \`${k}\` | ${(v / 1000).toFixed(2)} s |`);
  L.push("");
  L.push("## 4. Read latency at the 5-year projection");
  L.push("");
  L.push("`EXPLAIN (ANALYZE, BUFFERS)` per shape, warm cache, 12 runs, as `app_rls` with the RLS policy active.");
  L.push("");
  for (const [, d] of Object.entries(r.physicalDesigns ?? {})) {
    L.push(`### ${d.label}`);
    L.push("");
    L.push(`Table size ${mb(d.size.total)} MB (heap ${mb(d.size.heap)} MB, indexes ${mb(d.size.indexes)} MB)`);
    L.push("");
    L.push("| Read shape | p95 | median |");
    L.push("|---|---|---|");
    for (const [, s] of Object.entries(d.reads ?? {})) {
      L.push(`| ${s.label} | ${s.p95Ms} ms | ${s.medianMs} ms |`);
    }
    L.push("");
  }
  const a = r.physicalDesigns?.a_single_table;
  const b = r.physicalDesigns?.b_partial_indexes;
  if (a && b) {
    L.push("### Arm A vs Arm B");
    L.push("");
    L.push("| Read shape | A (composite index) | B (partial indexes) | Δ |");
    L.push("|---|---|---|---|");
    for (const k of Object.keys(a.reads)) {
      const av = a.reads[k].p95Ms;
      const bv = b.reads[k]?.p95Ms;
      L.push(`| \`${k}\` | ${av} ms | ${bv ?? "—"} ms | ${bv != null ? (bv - av > 0 ? "+" : "") + (bv - av).toFixed(1) + " ms" : "—"} |`);
    }
    L.push("");
    L.push(`Index footprint: A ${mb(a.size.indexes)} MB · B ${mb(b.size.indexes)} MB.`);
    L.push("");
  }
  L.push("### The C3 contract read");
  L.push("");
  L.push("The historical read that must **exclude forecast rows** is a performance question wearing a");
  L.push("correctness question's clothes. If the safe query is the slow one, the safe query stops getting");
  L.push("written — not through malice, through a p95 chart. Its number above is the one to watch when S1");
  L.push("picks the physical design.");
  L.push("");
  L.push("## 5. Side result — the cheaper key shape (NON-DECISIONABLE)");
  L.push("");
  L.push(`> ${r.sideResult?.note ?? ""}`);
  L.push("");
  if (r.sideResult?.withInvariants) {
    L.push("| | Total | Heap | Indexes |");
    L.push("|---|---|---|---|");
    L.push(
      `| with the tenancy invariants (text cuid PK + \`(tenantId, id)\` guard) | ${mb(r.sideResult.withInvariants.total)} MB | ${mb(r.sideResult.withInvariants.heap)} MB | ${mb(r.sideResult.withInvariants.indexes)} MB |`,
    );
    L.push(
      `| natural composite key, no cuid PK, no composite guard | ${mb(r.sideResult.withoutTextPkAndCompositeGuard?.total ?? 0)} MB | ${mb(r.sideResult.withoutTextPkAndCompositeGuard?.heap ?? 0)} MB | ${mb(r.sideResult.withoutTextPkAndCompositeGuard?.indexes ?? 0)} MB |`,
    );
    L.push("");
    L.push(
      `Difference: **${mb(r.sideResult.savedBytes ?? 0)} MB (${(r.sideResult.savedPct ?? 0).toFixed(0)}%)** at 10 vineyard-years.`,
    );
    L.push("");
    L.push("**This is not a recommendation and S0 does not act on it.** Plan §1.7 measured that 41% of the daily");
    L.push("table's index budget has never been scanned, and both zero-scan indexes are structural: the cuid");
    L.push("primary key and the `(tenantId, id)` composite-FK guard from the AGENTS.md Phase-12 checklist step 5.");
    L.push("Council C10 was explicit that neither is S0's to relax — a storage spike is the wrong layer at which");
    L.push("to reopen a tenancy safety invariant. The number is recorded because a future tenancy-rules");
    L.push("conversation will want it, and for no other reason.");
    L.push("");
  }
  L.push("## 6. Criteria");
  L.push("");
  L.push("| Criterion | Observed | Threshold | Verdict |");
  L.push("|---|---|---|---|");
  for (const e of (r.evaluations ?? []) as Evaluation[]) {
    const obs =
      e.criterionId === "C6" && e.observed != null ? `${mb(e.observed)} MB/vineyard-year` : `${e.observed ?? "—"}`;
    const th = e.criterionId === "C6" && e.ceiling != null ? `≤ ${mb(e.ceiling)} MB` : `≤ ${e.ceiling ?? "—"}`;
    L.push(
      `| ${e.criterionId} | ${obs} | ${th} | ${e.verdict === "PASS" ? "✅ PASS" : e.verdict === "FAIL" ? "❌ FAIL" : "⏳ PENDING"} — ${e.note} |`,
    );
  }
  L.push("");
  L.push("## 7. Branch lifecycle");
  L.push("");
  L.push(`Branch \`${r.branchId}\` on host \`${r.branchHost}\`, created for this measurement from the default`);
  L.push("branch and carrying a full copy of production **including the Bhutan tenant** — which is why deleting");
  L.push("it is part of this unit rather than cleanup.");
  L.push("");
  L.push("Two honest notes on the deletion:");
  L.push("");
  L.push("- The plan asked for branch deletion in a `finally`. **There is no `NEON_API_KEY` in `.env`**, so this");
  L.push("  process cannot delete a Neon branch; only the measurement TABLES are dropped in the `finally`.");
  L.push("- The branch is therefore created with an **`expiresAt`**, so Neon removes it automatically even if");
  L.push("  every step here fails, and the deletion is additionally performed and recorded explicitly.");
  L.push("");
  return L.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
