# S2b QA report — product facts master

**Date:** 2026-07-26 · **Tenant:** Demo Winery (`org_demo_winery`) — confirmed in-browser before any
write; **Bhutan never touched** · **Surface:** `localhost:3005` (see §0) · **Protocol:**
[QA-PROTOCOL.md](QA-PROTOCOL.md)

> **Verdict: the FOUNDATION passes. The PHASE does not.** Everything built was exercised and is
> green, including the headline proof that the real resolver runs in the live request path. But four
> units are incomplete (plan §Build status), so several gate items are **deferred, not passed** — each
> is written down below with its reason. Per QA-PROTOCOL, a skipped case is recorded as skipped; a
> blank row would read as a pass.

## 0. ⚠️ The finding that invalidated the first two QA attempts

The first two passes recorded sprays that came back with **no resolved facts**, which looked like a
resolver bug. It was not. **Two dev servers were running, and `localhost:3000` was owned by a
different worktree** (`vineyard-weather-noaa-07db12`, PID 36628, started 20:45) — nine minutes before
the main checkout's server, which therefore never got the port. Both point at the same production
database, so the writes landed and looked plausible while executing a branch with no S2b code at all.

Diagnosed by mapping listening ports to owning processes, not by inference. The main-checkout server
was restarted on **:3005** and the test re-run there.

**Lesson worth keeping: on this box, "localhost:3000" does not identify a branch.** Confirm which
checkout owns the port before trusting any UI result.

## 1. The headline proof — the resolver is live in the request path

Identical form input each time (Pristine, EPA `7969-199`, 14.5 oz per area, Stoney Hill Block 1);
only the entitlement toggle differs. Written through the **browser**, read back from the **database**.

| Source toggle | `factsSource` | `factsCompleteness` | resistance groups | PHI / REI |
|---|---|---|---|---|
| **ON** | `REGISTRY` | `PARTIAL` | `FRAC:7, FRAC:11` · known=true | `null` / `null` |
| **OFF** | `NONE` | `UNKNOWN` | `[]` · known=**false** | `null` / `null` |

`FRAC:7, FRAC:11` is S2's own Pristine gate criterion, reproduced through the new code path. AI keys
normalized to `BOSCALID`, `PYRACLOSTROBIN`. The composite watermark travelled
(`factsPublishedRevisionId`, `factsApprilAsOf` 2026-07-26 19:20).

**PHI and REI stay null in BOTH rows** — correct, and the point of the phase: registry *identity*
resolves, curated *facts* do not exist yet, and the record says so rather than inventing them.

UI rendering of the entitled record:

```
REI / PHI            ? h / ? d
Resistance groups    FRAC:7, FRAC:11
Facts                facts partial
Blocks · REI window  unknown — cannot determine safely
"Facts are frozen as-of entry (2026-07-26 19:54 UTC) — a later registry update never
 silently changes what this record meant. Unknown means unknown, not clear."
```

## 2. Safety cases

| Case | Result | Evidence |
|---|---|---|
| **SAFE-10** — a missing input renders *cannot determine* as its OWN state, not a degraded pass | ✅ **PASS** | `? h / ? d`, "facts unknown"/"facts partial", "unknown — cannot determine safely". Never blank, never zero, never "clear". |
| **SAFE-14** — source toggle OFF withholds registry data rather than answering from memory | ✅ **PASS** | The A/B in §1. Same product, same UI, flips to `NONE`/`UNKNOWN`/`known=false`. |
| **SAFE-3 / SAFE-4** — *gap* renders distinctly from *no-code-exists* | ✅ **PASS (data layer)** | `verify:pesticide` 31/31 (unchanged by this phase); K13 most-conservative rollup asserted in `verify:product-facts`. No S2b UI change. |
| **SAFE-19** — a non-US tenant does not brick; the manual path is offered | 🟨 **DEFERRED — data layer only** | RLS + resolution proven (`verify:product-facts` 5, 5b, 6, 8, 11: a grower-supplied row resolves with the source OFF). **Unit 5 has no entry surface, so the "manual path is offered" half cannot be exercised in a browser.** This was S2's deferral into S2b and it remains open. |
| **SAFE-6** — oil then sulfur is blocked, naming the oil and its date | 🟥 **NOT RUN** | Requires `separation.ts` (Unit 3, not built) and S7b's evaluator. Data model exists; the logic does not. |
| **SAFE-15** — a Bulletins Live! Two product surfaces "a bulletin check is required" | 🟥 **NOT RUN** | `requiresBulletinCheck` column exists; nothing populates or renders it (Unit 2 seeder not built). |
| SAFE-2, 11, 17, 18, 20 | 🟨 re-run at existing scope | No S2b regression; no surface changed beyond the spray record. |

## 3. Gates

| Gate | Result |
|---|---|
| `verify:product-facts` | ✅ **22/22** |
| `verify:spray-record` | ✅ 14/14 |
| `verify:pesticide` | ✅ 31/31 |
| `verify:tenant-isolation` | ✅ all checks |
| `verify:invariants` | ✅ 48/48 (SPRAY-6 added) |
| `verify:naming` | ✅ 25/25 **before and after** fixtures |
| `verify:ai-native` | ✅ green, no allowlist entry spent (KD-7) |
| `tsc` · lint | ✅ clean · 0 errors |
| Full unit suite | ✅ 4,612 pass (one pre-existing flake, `assistant-commit-tenant-context`, documented in its own source as whole-suite contention; passes in isolation) |

## 4. Gate items NOT met (from the plan's acceptance gate)

- **"Every curated group row carries source + as-of + reviewer"** — unenforced. No curated artifact
  and **no artifact-discipline test** (Unit 2 not built). Vacuously true only because zero rows exist.
- **"The non-US path proven end-to-end on a Bhutan-shaped fixture"** — data layer only (above).
- **"Separation rules are direction-specific and non-inheriting"** — unproven; `separation.ts` and the
  JMS oil↔sulfur goldens do not exist.
- **"Jurisdiction is snapshotted per block line and survives a later vineyard edit"** — **not
  implemented.** Columns exist; nothing writes them, so council C3 is unfixed in practice.
- **Coverage thresholds** — `report:product-facts-coverage` reads **0%** on every field across 2,420
  active grape registrations. Both pre-committed thresholds report BELOW, so **S7a and S6 remain
  blocked.** By design (curated content needs a human reviewer), but it means this phase ships no
  grower-visible change.

## 5. Fixtures and teardown

- 5 × `QA-S2B*` spray applications created on Demo Winery, **all removed** via the sanctioned
  owner-context purge (`app.allow_spray_purge`, council C15). Read-back returns `[]`.
- `epa-pesticide` subscription toggled ON for the test and **restored to OFF** (it ships dark).
- Temp scripts deleted. `verify:naming` green before and after.
- ⚠️ **Left in place deliberately:** the 42,132 pest mappings from Unit 7b, whose `revisionId` points
  at a FAILED revision (the run was killed mid-flight; data verified clean). The next monthly ingest
  re-stamps them. Nothing reads these tables yet.

## 6. Recommendation

**Merge the foundation; do not close S2b.** The diff is additive, fail-closed, and every gate that
applies to what was built is green. The source ships dark, so no tenant's behavior changes on deploy.

Before S2b can be called done: Unit 3's `separation.ts` + goldens (pure logic, no curation needed —
the highest-value next step), Unit 1's jurisdiction write path, Unit 2's artifact + seeder +
discipline test, and Unit 5's entry surface so SAFE-19 can actually be run.
