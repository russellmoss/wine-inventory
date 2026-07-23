# Council Feedback — Phase 23 Granular RBAC (plan 092)
**Date**: 2026-07-23
**Reviewers**: Codex (SQL/RLS/type correctness; fell back to gpt-5.4-mini), Gemini 3.1 Pro (custom-crush domain + data-leak)
**Prior gates**: /plan-eng-review (6 decisions), independent adversarial subagent (2 criticals → Units 5b, 6b). Council was asked to find what BOTH missed.

## Headline

The council found genuinely new, high-value problems. Gemini's domain fire is the story:
a scalar `ownerId` on `WorkOrderTask` is structurally wrong for multi-owner group ops; a
`CostLine` with no visibility flag leaks the facility's labor rate; and leaving compliance
facility-only blocks Alternating Proprietorship clients from filing their legally-required
own 5120.17. Codex added SECURITY DEFINER `search_path` hardening and a sharper fail-closed
framing (represent "staff sees all" as an explicit capability bit, not the *absence* of a
scope assignment). Both models independently said Branch A is too big for one PR.

## Critical Issues

**C1 — `WorkOrderTask` scalar `ownerId` breaks multi-owner group operations (Gemini).**
A facility groups one task (topping, filtration) across several clients' tanks for efficiency.
A single `ownerId` on the task can't represent that: owned by A, B's lots can't join; owned by
the facility, neither client sees their own history. Fix: WOs/tasks are NOT scalar-owner-scoped;
authorize by the *lots involved* — `EXISTS(task-lot junction WHERE ownerId = current owner)`,
and a client sees only the task header plus their own lot rows. **This contradicts the plan's
Owner-Scope Surface, which lists `WorkOrderTask` as scalar-`ownerId`.**

**C2 — `CostLine` leaks the facility's margin (Gemini, Q_B).** A client querying their lot's
cost would see facility labor rate and barrel amortization — the facility's confidential COGS.
Fix: a `visibility` enum on `CostLine` (`client_billable` | `internal_overhead`); the client
policy is `ownerId = mine AND visibility = 'client_billable'`; the facility sees both.

**C3 — Alternating Proprietorship clients can't file compliance (Gemini).** The plan keeps
`ComplianceReport` tenant-only. Under TTB an AP is a legally distinct winery that MUST file its
own 5120.17. Facility-only compliance means AP clients cannot legally operate on the software.
Fix: carry `ownerId` (mapped to their bond) on the compliance + tax-class chain so an AP client
can read/file their own report. **This is literally Phase 24's title ("...alternating
proprietorship..."), so the question is whether the DATA MODEL carries owner now to avoid a
painful retrofit, or Phase 24 owns it entirely.**

**C4 — SECURITY DEFINER `search_path` injection (Codex).** `app_owner_scope()` is owned by the
BYPASSRLS role; without a pinned `search_path` and schema-qualified references, a temp-object or
operator-shadowing attack is a privilege-escalation path. Fix: `SET search_path = pg_catalog`
(plus the app schema), schema-qualify every relation and operator, keep `STABLE`, do not reach
for `LEAKPROOF`.

## Design Questions (need a decision)

**Q1 — WorkOrderTask model:** scalar `ownerId` (simple, wrong for group ops) vs EXISTS-via-a
task-lot junction (correct, more complex predicate). See C1.

**Q2 — CostLine visibility:** add the `visibility` enum in Phase 23 (the clean answer to Q_B) or
defer the cost-leak handling to Phase 24 and keep `CostLine` out of the client-visible surface
for now. See C2.

**Q3 — Compliance/AP scope:** carry `ownerId` on the compliance + tax-class chain now (so AP is a
data-ready retrofit) vs keep facility-only and let Phase 24 build AP filing wholesale. See C3.

**Q4 — Branch A size:** both models flagged it. Split the enforcement spine into A1 (schema +
RLS + capability engine, no call-site edits) and A2 (the ~19 call-site migrations + action gates)
for reviewability?

## Suggested Improvements (fold in, no decision)

- **"Unscoped" as an explicit capability bit, not the absence of an assignment (Codex).** More
  fail-closed: a user unseeded by a backfill bug should get zero, not all. Represent staff's
  see-all as a granted capability; absence of any resolution = deny.
- **`ownerId` inheritance is DIRECTIONAL to the TARGET lot (resolves Gemini's topping-wine leak
  C-lineage).** A facility ADDITION into a client lot is attributed to the client lot's owner, so
  composition still sums to 100% for the client. This reuses plan 088's directional-attribution
  rule; make it explicit in Unit 6.
- **`WineSku` uniqueness must include `ownerId` (Gemini).** Two clients bottling identical
  varietal/vintage need separate SKUs (COLA/COGS/tax bind to the entity). The existing per-tenant
  unique `(name, vintage, bottleSize)` becomes per-owner.
- **Inventory EVERY owner-scoped write path, not just `runLedgerWrite` (Codex).** Seeds,
  backfills, bottling cores, `StockMovement`, `prismaBase`/`runInTenantRawTx` can create
  owner-scoped rows; Unit 6 must audit them all or tests won't catch a stale/missing `ownerId`.
- **Consider a DB-side ownership invariant (Codex).** `ownerId` is app-maintained metadata today;
  a composite FK `(tenantId, ownerId, lotId)` on the ownership edges (the K11 pattern) would make
  the parent-child owner relationship DB-enforced, not just TypeScript.
- **Metadata side channels (Gemini).** `lot_code` unique should be per-owner, or the app must
  return a generic "code unavailable" on the P2002 rather than confirming existence (same class as
  ticket #309). Auto-increment WO numbers leak activity volume; note it, UUIDs are a bigger change.

## Interaction the council didn't know about (mitigates Gemini C1)

Gemini's vessel-capacity leak (client sees a tank as half-empty because RLS hid the co-resident
owner's wine → overflow) is **largely closed by LEDGER-12 (plan 088, one-lot-per-vessel)**: a
vessel holds exactly one lot = one owner, so a client's tank is theirs alone. The residual is
legacy multi-lot vessels during transition. Worth a note, not the opaque-bucket capacity view
Gemini proposed.

---
## Raw Response — Codex (gpt-5.4-mini, fallback)

CRITICAL
- app_owner_scope() is SECURITY DEFINER but does not pin search_path or fully qualify objects. On a
  BYPASSRLS owner function, temp/search-path shadowing on role_assignment, member, or helper calls is
  a real privilege-escalation path. Fix: SECURITY DEFINER SET search_path = pg_catalog, app;
  schema-qualify every relation/operator/helper; keep STABLE; do not "solve" with LEAKPROOF.
- The unscoped branch is default-open ("no assignment => all" + "create no scoped assignment in prod
  until verify passes"): one missed backfill or unseeded user gets full intra-tenant visibility. Fix:
  make absence fail closed ({}/false); represent "staff sees all" with an explicit role/capability
  bit, not sentinel data or missing rows.
- ownerId is only app-maintained metadata; no DB-side invariant ties a child's ownerId to the
  parent/source owner. Any write path outside runLedgerWrite can create a cross-owner reference the
  policy will trust. Fix: composite FKs or triggers/checks on every ownership edge.

SHOULD FIX
- runLedgerWrite is not the only mutation surface. prismaBase, runAsSystem, runInTenantRawTx, seed,
  repair, backfill can write owner-scoped rows; Unit 6 won't catch that alone. Inventory every path.
- The PR is too broad: schema/RLS for ~25 tables + capability engine + ~19 call-site migrations in one
  branch. Split infra/policies from call-site/UI/tooling.

DESIGN QUESTIONS
- Should role_assignment be directly readable by app_rls, or only via the definer function?
- Which parent edges need composite ownership enforcement vs tenant-only FK?

## Raw Response — Gemini (gemini-3.1-pro-preview)

Q_A: A single ownerId on a WorkOrder/Task breaks custom crush (facilities group tasks across owners'
tanks). Fix: no scalar ownerId; authorize by lots involved — EXISTS(TaskLot WHERE task_id=Task.id AND
ownerId=current). Clients see the task header + their own TaskLot rows.

Q_B: If a client sees facility labor/barrel depreciation, your margin leaks. Fix: a visibility enum on
CostLine (client_billable, internal_overhead); client RLS: ownerId=mine AND visibility='client_billable';
facility sees both.

CRITICAL
1. Multi-owner vessel aggregation leak: A and B share a tank; A queries volume, RLS hides B's lot, A
   sees a 10,000G tank holding 2,000G → issues a WO to add 5,000G → overflow. A SECURITY DEFINER
   capacity view that fixes the math leaks B's blend. Fix: clients drive UI from Lot, never vessel; a
   capacity view aggregates non-owned wine into an opaque "Co-Tenant Volume" bucket.
2. Facility topping wine breaks lineage: facility tops a client barrel with facility wine (ownerId
   NULL); under restrictive RLS the client can't read that addition → composition doesn't sum to 100%.
   Fix: composition/history RLS flows DOWN from the parent lot — read a component if you own the
   target/parent lot regardless of the source component's ownerId.
3. AP compliance crippling: ComplianceReport tenant-only, but an AP is a legally distinct winery that
   must file its own 5120.17. Facility-only => AP clients can't legally operate. Fix: compliance
   ledgers + tax classes carry ownerId (bond id); AP clients read their own 5120.17.

SHOULD FIX
4. Metadata/existence side channels: auto-increment WO IDs reveal job volume; lot_code unique
   violation reveals a competitor's fermenting wine. Fix: UUID client-visible PKs; UNIQUE(tenant,
   ownerId, lot_code), or app catches the DB error and returns generic "Code unavailable".
5. WineSku sharing: finished goods can't be shared in custom crush (COLA/COGS/tax bind to the client
   entity). Enforce ownerId strictly on WineSku; identical wine for two clients = duplicate SKU.
