---
tags:
  - reference
---

# Querying the database directly

How to point a SQL client at this database, what you can safely change by hand, and the two ways a
well-formed `UPDATE` silently corrupts data here.

Companion docs: [[data-dictionary]] (every table and column) · [[erd]] (relationship diagrams).

## Use a real SQL client, not Prisma Studio

**DBeaver Community** is the recommended one — free, and the only common client that gives you ER
diagrams plus a CSV/Excel import wizard.

```bash
brew install --cask dbeaver-community
```

TablePlus is faster and nicer for daily querying but (as of writing) has no ER-diagram feature.
pgAdmin works and has diagrams; it is clunkier with no upside here. Neon's built-in SQL editor is fine
for one-off questions.

> [!important] A SQL client sees MORE of this schema than the ORM does
> 183 of the 439 foreign keys are composite — `(tenantId, refId) → (tenantId, id)` — which is what makes
> a cross-tenant reference structurally impossible. Prisma cannot express those, so they carry no
> `@relation` and are **invisible in Prisma Studio**. They are ordinary `pg_constraint` rows, so any
> client reading the catalog draws all 439.

## Connecting

Credentials come from the Neon dashboard → **Connection Details**, or from `.env` if you have one.
Neon gives two hostnames and the difference matters:

| host | use it? |
| --- | --- |
| `ep-xxxx-pooler.…neon.tech` | **No.** Transaction pooling drops your session settings between statements. |
| `ep-xxxx.…neon.tech` (direct) | **Yes.** |

In DBeaver: **Database → New Database Connection → PostgreSQL**, set **Connect by → URL** and paste the
direct string. **SSL tab → Use SSL**, mode `require` — Neon refuses plaintext. Let DBeaver download the
JDBC driver when it offers.

### Which role — this is the one real decision

| | owner (`DATABASE_URL_UNPOOLED`) | app role (`DATABASE_URL`) |
| --- | --- | --- |
| Sees | **every winery at once** — `BYPASSRLS` overrides the 156 `FORCE ROW LEVEL SECURITY` tables | one winery, after you set the tenant |
| Good for | diagrams, reporting, cross-tenant checks | editing, because the database itself stops you touching the wrong winery |

### If every table looks empty, this is why

Tenant-scoped tables carry:

```sql
CREATE POLICY "tenant_isolation" ON "vineyard"
  USING ("tenantId" = current_setting('app.tenant_id', true));
```

Unset, `current_setting(…)` is NULL, `"tenantId" = NULL` is NULL, and you get **zero rows**. Nothing is
broken. As the app role, run this first in every session:

```sql
SET app.tenant_id = 'org_demo_winery';
```

⚠️ The **inbox tables carry per-USER security on top** — `inbox_notification`, `direct_message`,
`direct_message_thread`, `direct_message_attachment` also filter on
`current_setting('app.user_id', true)`. Setting only the tenant returns zero rows, which reads exactly
like "the message was never sent." Set both:

```sql
SET app.tenant_id = 'org_demo_winery';
SET app.user_id   = '<a user id>';
```

The ~30 global tables (`organization`, `user`, `member`, `fx_rate`, the pesticide and knowledge-corpus
tables) have no RLS and show data with no setup.

## ER diagrams: pick a subset

Do **not** point a diagram at all 188 tables. Every table has `tenantId → organization`, so
`organization` becomes a hub that flattens the layout into an unreadable strip — measured at 2384×249px
before that edge was filtered out of [[erd]].

Right-click the schema → **Create New ER Diagram**, then drag in a handful. Good starting sets:

| to see | drag in |
| --- | --- |
| the core ledger | `lot`, `lot_operation`, `lot_operation_line`, `vessel`, `vessel_lot` |
| the land | `vineyard`, `vineyard_block`, `vineyard_subblock`, `vineyard_planting_area`, `variety` |
| cost | `supply_lot`, `cost_line`, `lot_cost_state`, `operation_cost_transfer`, `cost_variance_event` |
| bottling | `bottling_run`, `bottling_source`, `wine_sku`, `bottled_inventory`, `finished_good` |

[[erd]] has all 17 domain groupings to copy.

## What you can safely change by hand

**Safe.** Ordinary reference and catalog rows — `variety`, `vineyard`, `vineyard_block`, `vessel`,
`location`, `cellar_material`, `vendor`, `app_settings`, `user`, `member`. Edit these like any table.

**Never — these are computed, not entered.** Think of a spreadsheet column that holds a formula.

| table | why |
| --- | --- |
| `vessel_lot` | The schema says it: *"the materialized current-state projection… always equals the fold of the ledger (INVARIANT #7)"*. How much wine is in a tank is **derived** from every pour, rack and blend. |
| `vessel_component` | Maintained by the ledger write chokepoint (`src/lib/ledger/write.ts`) — it deletes, creates and updates these rows as part of folding an operation. |
| `bottled_lot_state` | Schema: *"DETERMINISTIC FOLDS of the ledger's BOTTLE_STORAGE legs, materialized INSIDE the writeLotOperation chokepoint."* |

Edit one of these and the write succeeds, the UI shows your number, and the ledger it was derived from
now disagrees with it. Nothing errors. The next operation folds from the ledger again and your edit
either vanishes or wedges the lot. **To change how much wine is in a tank, record an operation.**

**Careful — maintained balances with several writers.** `bottled_inventory` (7 writers across bottling,
compliance, sparkling and stock movements) and `lot_vineyard` (a set materialized at each BLEND write).
Not strict ledger folds, but still maintained by app logic that will overwrite or contradict you.

## The rounding trap

Volumes and money are `Decimal(10,2)` — Postgres **rounds to 2 decimal places on insert**.

Split 10 litres three ways as `3.3333 / 3.3333 / 3.3334` and it looks balanced. It stores as
`3.33 / 3.33 / 3.33`, which is 9.99. Every operation must conserve volume exactly, so the app will then
refuse to touch that wine — permanently, and with no error at insert time.

**Round to 2dp yourself before inserting.** Per-unit costs are `Decimal(18,8)` — 8dp there. The
`db_type` column in [[data-dictionary]] gives the exact precision for every column.

## Bulk-loading data

DBeaver's CSV import is the fastest way to load reference tables, and the fastest way to create data the
app cannot use.

A wine lot is not one row. It is a lot, **plus its operation history, plus the folded balances, plus
cost records, plus origin links**. `INSERT INTO lot` alone gives you a lot with no history — zero
volume, no cost basis, invisible on most screens. It looks like the insert failed even though it
succeeded.

- **Reference tables** — import away.
- **Anything ledger-shaped** — use the seed scripts (`npm run seed:demo-scenario`, `seed:demo-materials`,
  and eight others). They go through the app's own cores, so everything related is created consistently.

House rule from `CLAUDE.md`: synthetic data goes in **Demo Winery (`org_demo_winery`) only, never Bhutan
(`org_bhutan_wine_co`)**, prefixed `QA-`, and cleaned up afterwards.

## Starter queries

```sql
-- What is in every tank right now (the projection).
SELECT v.code AS vessel, l.code AS lot, l.form, vl."volumeL"
FROM vessel_lot vl
JOIN vessel v ON v.id = vl."vesselId" AND v."tenantId" = vl."tenantId"
JOIN lot    l ON l.id = vl."lotId"    AND l."tenantId" = vl."tenantId"
ORDER BY v.code;
```

```sql
-- One lot's full history, oldest first.
SELECT o."observedAt", o.type, ln."vesselCode", ln."deltaL", ln.reason, ln.bucket
FROM lot_operation_line ln
JOIN lot_operation o ON o.id = ln."operationId"
WHERE ln."lotId" = '<lot id>'
ORDER BY o."observedAt", ln.id;
```

```sql
-- INVARIANT #7 by hand: does the projection still equal the fold of the ledger?
-- Any row returned is drift, and drift is a bug — often a hand-edit of vessel_lot.
SELECT COALESCE(f."lotId", p."lotId") AS lot_id, f.folded, p.projected
FROM (SELECT "lotId", SUM("deltaL") AS folded FROM lot_operation_line
      WHERE bucket = 'VESSEL' GROUP BY "lotId") f
FULL JOIN (SELECT "lotId", SUM("volumeL") AS projected FROM vessel_lot GROUP BY "lotId") p
  ON p."lotId" = f."lotId"
WHERE COALESCE(f.folded, 0) <> COALESCE(p.projected, 0);
```

```sql
-- Operations that do not conserve volume. Should always be empty.
SELECT "operationId", SUM("deltaL") AS imbalance
FROM lot_operation_line GROUP BY "operationId" HAVING SUM("deltaL") <> 0;
```

The last two are worth running after any manual editing session. They are the cheapest way to find out
whether you broke something, and both should return **no rows**.
