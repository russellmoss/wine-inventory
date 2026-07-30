# RFC-000 · Cross-cutting implementation notes for RFC-001 → RFC-004

**Status:** companion document · **Created:** 2026-07-29 · **Against:** `main` @ `91cd1dcd`
**Covers:** migration order (§1), live-tenant plan (§2), assistant coverage (§3), incumbent parity (§4)

This document holds the parts that span all four RFCs and therefore belong in none of them. It is a
**companion to the amendment pass**, not an approval: RFC-001/002/003/004 all remain `proposed`.

Every claim below carries a `file:line` read on `91cd1dcd`. Where I am not confident, the item says
so rather than flattening everything to one tone.

---

## 1. Migration order (B1)

**Dependency shape.** RFC-003 depends on nothing. RFC-002 depends on RFC-001 (member order) and
RFC-003 (provenance). RFC-004 depends on 001/002 for objects worth scanning. The handoff had this
right — but it names **one** enum-only migration where there are **two**.

```
M1  ENUM-ONLY · ALONE · FIRST · ITS OWN COMMIT · MERGED **AND DEPLOYED** BEFORE M2
    ALTER TYPE "CaptureMethod" ADD VALUE 'DERIVED';      ← RFC-003
    ALTER TYPE "CaptureMethod" ADD VALUE 'NOMINAL';      ← ONLY IF OD-4 resolves to option A
    ALTER TYPE "VesselType"    ADD VALUE 'KEG';          ← ⚠️ RFC-002; NO handoff doc mentions this
    ALTER TYPE "VesselType"    ADD VALUE 'BIN';          ← free ride; register P-item, unblocks weigh-tag tare
        ↓  must be a MERGED, DEPLOYED commit before ANY code references these values
M2  RFC-001 STRUCTURE
    vessel_group        += @@unique([tenantId, id])  ← REQUIRED, missing today; FK target for M2's own FK
                        += type, status, location, settings
    vessel_group_member += position
                        += composite tenant FK (tenantId, groupId) → vessel_group(tenantId, id)
                        += addedAt/removedAt  ← ONLY IF §4.3.1 Option A (effective-dating) is chosen
        ↓
M3  RFC-001 ENFORCE — partial unique index for OD-3:
    CREATE UNIQUE INDEX … ON vessel_group_member (tenantId, vesselId)
      WHERE type = 'OPERATIONAL' [AND "removedAt" IS NULL ← only under Option A]
    (No backfill step: 0 rows. See §2.)
        ↓
M4  RFC-002 STRUCTURE — keg_fill + topping_tick (both NEW, both tenant-scoped → full Phase-12 walk).
    Kegs are vessel rows with type=KEG; no new vessel table.
        ↓
M5  RFC-002 BEHAVIOUR — DERIVED writes, close-out, the narrowly-scoped LEDGER-4 exemption, partial re-fan.
        ↓
M6  RFC-004 — tagToken/tagIssuedAt/tagRevokedAt on vessel (+ vessel_group), @@unique([tenantId, tagToken]),
    /t/ resolver. Rate-limit decision (RFC-004 §3.5.1) answered BEFORE this starts.
```

### What breaks if it is done wrong

| Mis-step | Failure |
|---|---|
| Any `ALTER TYPE … ADD VALUE` in the **same migration or transaction** as code or a default that uses it | `ERROR: unsafe use of new value` — Postgres refuses. **The migration fails on deploy, after CI passed.** This schema documents the same gotcha ~7 times for `OperationType` alone (lines 2092, 2099, 2102, 2108, 2115, 2119, 2127) and once for `AuditAction` (line 191) — the team has been bitten repeatedly. |
| **`VesselType.KEG` forgotten until M4** | **The single most likely way Phase 8 stalls mid-phase.** RFC-002 blocks and needs a new M1-shaped commit + full redeploy before it can continue. No handoff document mentions this enum. |
| M1 split across two commits instead of one | Two deploy cycles for zero benefit. **Batch every enum value into M1** — which is exactly why OD-4 must be decided *before* M1, not after. |
| M2 without `vessel_group.@@unique([tenantId, id])` | M2's own composite tenant FK has **no unique target** and cannot be created → Phase-12 checklist step 5 fails. You discover it while writing the FK, not while planning. Verified: `VesselGroup`'s only composite unique is `@@unique([tenantId, name])` ([`schema.prisma:3073`](prisma/schema.prisma:3073)). |
| M3's partial unique index before M2's `type` column exists | Index references a non-existent column. |
| RFC-002 code **merged before M1 is deployed** (not merely merged) | Runtime `invalid input value for enum` on the first close-out — in production, on the floor. Merge ≠ deploy. |
| M6's `tagToken` unique added as a **global** unique | Cross-tenant enumeration via insert conflict. Must be `@@unique([tenantId, tagToken])` — RFC-004 §3.5.2. |
| `prisma migrate diff` used to author any of these | **Unsafe on this repo — it drops tenant FKs.** Hand-author the SQL. |

**One-way doors in this sequence.** Only M1. Postgres cannot drop an enum value, so every value in
M1 is permanent and rollback is code-only ("stop writing it"). Everything in M2–M6 rolls back to
zero data effect (`DROP INDEX` / `DROP TABLE` / drop columns) — **except** the LEDGER-4 exemption in
M5, whose *code* reverts but whose *overfilled barrels stay overfilled* (RFC-002 §3.5).

---

## 2. Live-tenant plan (B2)

**Governing rule** (AGENTS.md): anything with an FK / RLS / uniqueness / event-write is
**backfill-then-enforce, never a bare additive migration**.

> [!important] The unusual fact that changes how this rule applies here.
> **Every table these RFCs touch is EMPTY.** Re-verified read-only against production on
> 2026-07-29, all 11 tenants: `vessel_group` **0 rows**, `vessel_group_member` **0 rows**,
> `lot_operation` of type `TOPPING` **0**, `lot_lineage` of kind `TOPPING` **0**, vessels ≤60 L
> **0**, and `captureMethod` has only ever held `MANUAL` and `IMPORT`.
>
> So the **backfill step is a verification, not a data operation** — but it is still walked, and
> the enforce step is **not** softened. On 0 rows a constraint can be enforced from day one with
> no violation window.
>
> **Phase 7's "report, don't enforce" caution is deleted, not carried forward.** It was prudence
> against *unknown* data; the data is now known. A report-only phase here has nothing to report,
> nobody to ask, and costs a second migration plus a window in which the constraint is documented
> but untrue. **Dead caution is worse than no caution** — it reads like diligence while buying
> nothing. Deleted from RFC-001 §4.13.
>
> **The risk here is not corruption. It is (a) a failed deploy from enum ordering (§1) and (b)
> wrong domain design shipped against data too thin to contradict it.**

| Change | Backfill | Enforce | Rollback |
|---|---|---|---|
| `CaptureMethod` += `DERIVED` (+`NOMINAL`?) | **None.** No existing row is reclassified (RFC-003 §3.2); 0 rows would qualify anyway. | Additive value — nothing to enforce. Add the §3.3 rule-6 core refusal for the five non-ledger models. | ⚠️ **Enum values cannot be dropped.** Code-only rollback. **One-way door — decide OD-4 first.** |
| `VesselType` += `KEG` (+`BIN`) | None. | Picker + capacity call sites must filter on `type`. | Same one-way door; code-only. |
| `vessel_group` += `type`, `status`, `location`, `settings`, `@@unique([tenantId, id])` | 0 rows. Spec anyway (RFC-001 §4.13): `type='OPERATIONAL'`, `status` from `isActive`. | `NOT NULL` on `type`/`status` **in the same migration** — safe on 0 rows. | Drop columns + index. Zero data loss. |
| `vessel_group_member` += `position` (+ `addedAt`/`removedAt` under Option A), composite tenant FK | 0 rows. Spec: position by vessel-code natural sort. | `NOT NULL` on `position`; FK `(tenantId, groupId) → vessel_group(tenantId, id)` `ON DELETE RESTRICT`. | Drop columns + FK. |
| OD-3 partial unique index | **0 violations — verified.** | `CREATE UNIQUE INDEX … WHERE type='OPERATIONAL'`. **Enforce immediately.** | `DROP INDEX` — instant, no data change. The cheapest rollback in the set, which is *why* enforcing now is the conservative choice. |
| `keg_fill` (**NEW**) | n/a | Full Phase-12 walk below. | `DROP TABLE`. |
| `topping_tick` (**NEW**) | n/a | Full Phase-12 walk below. | `DROP TABLE`. |
| `vessel` += `tagToken`, `tagIssuedAt`, `tagRevokedAt` | 0 tokens; issue lazily on first label print. | **`@@unique([tenantId, tagToken])` — tenant-scoped, never global** (RFC-004 §3.5.2). | Drop columns. |
| LEDGER-4 exemption for `TOPPING`→`BARREL` | n/a — behavioural | Chokepoint change ([`write.ts:212`](src/lib/ledger/write.ts:212)) + [`topping.ts:69`](src/lib/cellar/topping.ts:69) + [`group-apply.ts:181`](src/lib/cellar/group-apply.ts:181), **and** amend the `LEDGER-4` note. | Revert code — **but any barrel overfilled while the exemption was live stays overfilled.** The one genuinely irreversible change, and the one currently mis-classed "C". |

### Phase-12 checklist, walked for the two NEW tenant-scoped tables

Both `keg_fill` and `topping_tick` are new tenant-scoped tables, so **all nine steps** apply — being
empty exempts them from *backfilling*, not from the checklist.

| # | Step | `keg_fill` | `topping_tick` |
|---|---|---|---|
| 1 | `tenantId String @default("")` + `@@index([tenantId])` | ✔ | ✔ |
| 2 | Migration: `tenantId` column + index + FK → `organization(id)` `ON DELETE RESTRICT` | ✔ | ✔ |
| 3 | Backfill → `SET NOT NULL` | n/a (new) — `NOT NULL` at creation | same |
| 4 | Per-tenant uniques (every global unique becomes `@@unique([tenantId, …])`) | none needed | **`@@unique([tenantId, commandId])`** — the idempotency key must NOT be globally unique (mirrors `LotOperation.commandId`, [`schema.prisma:2660`](prisma/schema.prisma:2660)) |
| 5 | `@@unique([tenantId, id])` + composite FKs for cross-tenant-risk refs | **Required** — `topping_tick.kegFillId` must be a composite FK `(tenantId, kegFillId) → keg_fill(tenantId, id)`, else a tick can point at another tenant's fill | composite FKs → `vessel(tenantId, id)` ✔ (target exists, [`schema.prisma:1413`](prisma/schema.prisma:1413)) and → `work_order_task` |
| 6 | RLS: `ENABLE` + `FORCE` + `tenant_isolation` with **USING *and* WITH CHECK** on `current_setting('app.tenant_id', true)` | ✔ fail-closed | ✔ fail-closed |
| 7 | **Not** in the extension denylist (`GLOBAL_MODELS`, `src/lib/tenant/models.ts`) | ✔ leave out | ✔ leave out |
| 8 | `app_rls` DML grants | **verify, don't assume** | verify |
| 9 | Case in `scripts/verify-tenant-isolation.ts` + `test/tenant-isolation.test.ts` | ✔ add | ✔ add |

**Two repo-specific rules the checklist does not state:**

- **Append-only needs `REVOKE`, not `GRANT`.** New tables arrive with `UPDATE`/`DELETE` already
  granted to `app_rls` via default privileges. `topping_tick` is intended to be append-only-ish
  (`TOPPING-2`), so the revoke must be **explicit** in the migration. Granting nothing is not the
  same as revoking something.
- **`$queryRaw` bypasses the tenant extension (`TENANT-2`).** Any raw SQL — an as-of membership read
  under Option A, a keg-fill rollup — must go through `runInTenantRawTx`.

---

## 3. Assistant coverage (B3)

Per CLAUDE.md, assistant coverage is part of the **definition of done**: `verify:ai-native` fails on
a domain core with no tool.

> [!danger] The count is 2.4× over the cliff, and the register under-reports it.
> `ALL_TOOLS` holds **96 tools** ([`registry.ts:143`](src/lib/assistant/registry.ts:143), counted on
> `91cd1dcd`) against a stated **~40-tool selection-accuracy cliff**
> ([`data_model_coalescence.md:102-104`](docs/architecture/data_model_coalescence.md:102)).
>
> **The register's own line reads "We're at ~86 tools" — it is stale by ten.** The document that
> tells us not to proliferate tools is itself under-reporting proliferation. Fix that line as part
> of any consolidation pass; a stale number is how a ratchet quietly stops ratcheting.
>
> The `GAP_ALLOWLIST` ratchet is at `MAX_ALLOWED = 2`
> ([`ai-native-allowlist.mjs:156`](scripts/ai-native-allowlist.mjs:156)) and only ever decrements —
> so a new core with no tool **cannot simply be parked**.

### Wet-hands vs desk-with-coffee, per new core

🧤 **cellar-floor / wet-hands** → gloves on, standing at the vessel → needs a **tool + golden eval**.
☕ **desk-with-coffee** → sitting down, configuring → **GUI is sufficient**; mark the core `INTERNAL`
in `ai-native-allowlist.mjs`, which is the sanctioned exemption.

| New core | Class | Assistant requirement |
|---|---|---|
| **Tick a barrel** | 🧤 **Wet-hands — the archetype.** Gloves, one hand, dark hall, 22 barrels in a row. | **Tool + golden eval.** Voice-first: *"top barrel 14"*, *"that one's weeping"*. **Must extend the topping/vessel write surface, not arrive as `tick_barrel`.** |
| **Close out a keg** | 🧤 Wet-hands. Happens at the keg, standing, divisor stated aloud. | **Tool + golden eval**, and the confirmation card must state the arithmetic in words. **Fold into the same composite tool as tick.** |
| **Fill a keg** | 🧤 Wet-hands — but it is already a transfer. | **Extend the existing rack/transfer tool** with a keg destination. **No new tool.** |
| **Query group state** (*"what's due on rack 14"*, *"which barrels haven't been topped"*) | 🧤 Wet-hands read | **Extend `query_cellar_contents` / `query_operations`.** Do **not** add `query_groups`. |
| **Create / rename / archive a group; edit settings** | ☕ Desk. RFC-001 §4.10 gates it to `admin`. | **GUI only.** Mark `INTERNAL`. |
| **Edit membership** | ☕ Mostly desk — though *"move barrel 14 to rack 9"* is plausibly wet-hands. | GUI sufficient for v1. If it earns a tool later, it **extends the group read tool** and stays `admin`-gated. |
| **Correct a closed-out keg (partial re-fan)** | ☕ Desk. | **GUI only.** Corrections are deliberate-danger; a voice confirmation of an 18-of-21-barrel partial re-fan is the wrong affordance for copy that must name three skipped barrels and why. |
| **Issue / revoke a tag** | ☕ Desk (label printing is class E anyway) | GUI only, `INTERNAL`. |
| **Resolve a scanned tag** | Not a core — a route (`/t/<token>`) | No tool. |

### The shape to build, and the shape to reject

**Net: ONE new domain-composite write tool** — topping as a single vessel-scoped surface
(fill → tick → close out) — with golden evals for **tick idempotency**, **close-out arithmetic**
(exact largest-remainder sum, no dust) and the **capacity soft-warning** path. Plus **two existing
tools extended**, and **everything group-configuration- and correction-shaped marked `INTERNAL`**.

> **Reject at review:** a plan that emits `create_barrel_group`, `tick_barrel`, `close_out_keg`,
> `correct_keg_fill`, `query_groups`. That naive one-tool-per-core decomposition adds five tools to
> a registry already 2.4× over the cliff, and it is the default output of a plan that has not read
> the register's instruction: *"Domain-composite, not one tool per micro-core… extend an existing
> tool where possible, don't proliferate."*

**Recommendation, stated as a flag rather than a demand: 96 tools probably warrants its own
consolidation pass before anything new is added.** That is a real piece of work with its own risk
(every consolidation is a chance to break selection accuracy in a different way), so it is not
something to bolt onto Phase 7. But adding to 96 without a plan to get back toward 40 is choosing
the cliff. Raise it as its own decision.

---

## 4. Incumbent parity (B5)

Source: [`docs/architecture/data_model_coalescence.md`](docs/architecture/data_model_coalescence.md).
Rule: where Vintrace and InnoVint **coalesce**, align — their convergence is load-bearing. Where they
**diverge**, choose deliberately. Where **we** diverge on purpose, keep it and market it.
**Never align a moat away.**

| RFC | Where they COALESCE → align | Where they DIVERGE → our choice | Where WE diverge ON PURPOSE → keep |
|---|---|---|---|
| **001 groups** | Barrel-group metadata is a **named gap**: *"Break-barrel op + barrel-group metadata — align-retro … `VesselGroup` is thin"* ([:177](docs/architecture/data_model_coalescence.md:177)). Both incumbents have a richer group object. **Align.** | Whether a group may hold mixed lots. The register's own nuance: *"a macro-bin/cage/pallet in custom crush holds MIXED lots — the group must allow a mixed-lot association even though the atomic vessel stays 1:1"* ([:177](docs/architecture/data_model_coalescence.md:177)) — which **independently confirms** RFC-001 §4.1's "two or three lots in a group is legal". | The group must never become a vessel. `LEDGER-12` / one-lot-per-vessel is **parity, not divergence** ([:48](docs/architecture/data_model_coalescence.md:48)); our `UNIQUE(tenantId, vesselId)` is the moat-grade implementation of it. RFC-001 §4.1 gets this right. |
| **002 topping / keg** | **Keg as a vessel type** — *"Vessel types **KEG, BIN** + capacity display-unit — align-retro — S — additive enum"* ([:175](docs/architecture/data_model_coalescence.md:175)). Both incumbents model kegs as vessels. **This answers RFC-002's open question 3, which the RFC deferred.** Also: Vintrace documents *"Topping Without Updating Wine Composition"* — which is why `topping.ts` deliberately keeps op type `TOPPING` rather than a blend ([`topping.ts:121-123`](src/lib/cellar/topping.ts:121)). **Align on both.** | The tick / divisor / even-split model. **Neither incumbent derives per-barrel topping by division.** This is ours to choose, and it is the substance of RFC-002. | **Append-only correction-as-event** ([:45](docs/architecture/data_model_coalescence.md:45)) — the partial re-fan of §3.6.1 must be compensating `CORRECTION` ops, **never an `UPDATE` of the original estimates**. RFC-002 says this correctly; hold the line. Also **immutable lineage** — the `TOPPING` edge. |
| **003 measured vs estimated** | **Nothing.** Neither incumbent classifies derived quantities at all. | — | 🏆 **A NEW MOAT CANDIDATE — market it.** Both incumbents surface computed and read volumes identically. A queryable `DERIVED` classification sits on the same axis as immutable lineage and derived bond, and it is **cheap**. Add it to the moat table when it ships. This is the highest-leverage item in the four RFCs per unit of effort. |
| **004 tags / QR / NFC** | Neither incumbent has scan-to-context in the barrel hall. No parity signal either way. | Everything. | Nothing yet — **but see the naming collision.** The register's P1 first-class **`Tag`** model ([:162](docs/architecture/data_model_coalescence.md:162)) is a *different object* (a client-lot sort key) from RFC-004's **`tagToken`** (a physical label). Same word, two things. **Rename before either is built.** |

### Contradictions between the RFCs and the register — the contradiction IS the finding

1. **RFC-002 §3.2 deferred a question the register had already answered.** It said *"Claude Code
   should decide against the real schema; the RFC does not mandate either."* The register mandates
   `VesselType.KEG`, align-retro, additive enum ([:175](docs/architecture/data_model_coalescence.md:175)).
   **Resolved in the amendment: a keg is a `Vessel` with `type = KEG`.** The RFC's stated risk (kegs
   appearing in vessel pickers and capacity logic) is real and handled by filtering on `type` —
   which the app must do anyway once `BIN` lands.
2. **RFC-001 omits `break-barrel`**, which [:177](docs/architecture/data_model_coalescence.md:177)
   names as part of the *same* align-retro slice as barrel-group metadata. Not a blocker — **a
   missed economy.** If M2 is opening `vessel_group` anyway, that is the cheapest moment this op
   will ever have.
3. **RFC-002 §3.5 / DM-22 amend a registered invariant while classed as if they do not.**
   `08-data-dependency-matrix.md:57` calls the capacity downgrade **class C** (behavioural, no DB).
   It edits `LEDGER-4` (severity `high`) at **three** enforcement points including the write
   chokepoint. **Not class C.** See RFC-002 §3.5.
4. **No RFC contradicts a moat.** Checked explicitly: append-only correction-as-event, immutable
   lineage DAG, DB-RLS tenancy, auto barrel depreciation, 5000.24/CBMA. The amended RFC-002 §3.4
   actively *strengthens* the compliance moat by removing the `EXTERNAL` legs that would have
   silently broken the 5120.17 fold.

---

## 5. Confidence

Kept per-item rather than flattened, following the gate brief's §9.

| Item | Confidence | Note |
|---|---|---|
| §1 migration order, and that `VesselType.KEG` is missing | **High** | `enum VesselType` is `BARREL \| TANK`, read directly ([`schema.prisma:155-158`](prisma/schema.prisma:155)). The register says additive enum. The schema documents this gotcha ~7 times. |
| §1 `vessel_group` missing `@@unique([tenantId, id])` | **High** | Read the model; its only composite unique is `(tenantId, name)`. |
| §2 "the tables are empty" | **Certain** | Direct read-only query against production, all 11 tenants, re-run 2026-07-29. |
| §2 "enforce from day one is safe" | **High** | 0 violations possible on 0 rows, and the rollback is `DROP INDEX`. |
| §3 tool count 96 vs ~40 | **High** on the count; **medium** on the ~40 cliff itself, which is a stated heuristic in the register rather than a measured result on this registry. The *direction* is not in doubt. |
| §3 "one composite tool, not five" | **Medium-high.** The register's instruction is unambiguous; how cleanly fill/tick/close-out fold into one tool surface is a design question I have not prototyped. |
| §4 keg-as-vessel parity | **High** | Register line is explicit and the code already assumes it. |
| §4 "003 is a moat candidate" | **Medium-high.** Confident neither incumbent classifies derived quantities; less confident about how much a customer will *pay* for it, which is a GTM judgement, not a schema one. |
| The LEDGER-4 exemption being the one irreversible change | **High** | Every other change rolls back to zero data effect; an overfilled barrel does not un-overfill. |
