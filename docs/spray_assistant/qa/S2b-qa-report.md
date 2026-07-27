# S2b QA report — product facts master

**Date:** 2026-07-26 (foundation) · **updated 2026-07-27 (resumption, Units 1/2/3/5)** · **Tenant:**
Demo Winery (`org_demo_winery`) · **Bhutan never touched** · **Protocol:** [QA-PROTOCOL.md](QA-PROTOCOL.md)

> **2026-07-27 update — Units 1, 2, 3, 5 built and DB-proven; the phase still does not close.**
> Units 1 (jurisdiction), 3 (separation.ts), 2 (facts-artifact machinery), and 5 (tenant-facts entry
> surface) are built, tested, and each proven end-to-end against the real Demo Winery database via
> dedicated scripts (`verify:spray-record` grew from 14 to 15 assertion groups, `verify:tenant-isolation`
> grew 6 new cases, `verify:product-facts` and `verify:pesticide` both unaffected and still green).
> **This update is script- and unit-test-proven, not a fresh interactive-browser pass** — no dev
> server login happened in this session. §2b below records what moved and what a live click-through
> still needs to confirm. The phase remains open for the reason unchanged since the foundation: the
> curated CONTENT (real reviewed product facts) is not something an agent can supply (rule §3.1), and
> coverage is still 0% (§4b).

> **2026-07-26 (original) verdict: the FOUNDATION passes. The PHASE does not.** Everything built was
> exercised and is green, including the headline proof that the real resolver runs in the live
> request path. But four units were incomplete (plan §Build status), so several gate items were
> **deferred, not passed** — each written down below with its reason. Per QA-PROTOCOL, a skipped case
> is recorded as skipped; a blank row would read as a pass.

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

## 2b. Resumption update (2026-07-27) — what moved, script/DB-proven

- **Unit 1 (jurisdiction):** `resolveJurisdiction`/`resolveJurisdictionBatch` built and unit-tested
  (`test/pesticide-jurisdiction.test.ts`); the vineyard settings form gained propose-from-GPS +
  explicit confirm; `spray_block_line.snapshotJurisdictionCountry/State` now writes at record AND
  correction time. **Proven against the real DB** via `verify:spray-record`'s new assertion group 15:
  a confirmed vineyard's block line snapshots correctly; a cross-site pass resolves each vineyard
  independently (an unconfirmed sibling never inherits the confirmed one's jurisdiction); editing the
  vineyard's jurisdiction AFTER a spray never changes that spray's already-written snapshot (rule
  §3.8); a later pass picks up the edit fresh; the null-resolver default never fabricates one.
  **Not yet browser-clicked**: the propose/confirm UI itself (compiles, routes correctly — not
  interactively exercised this session).
- **Unit 3 (separation.ts):** built + 14 goldens against the brief's own JMS Stylet-Oil worked example
  (§8.2) — directional non-implication, most-restrictive-wins, the CLASS-target ambiguity case
  (council G5). Pure logic, DB-independent; SAFE-6 still cannot run end-to-end because nothing calls
  `evaluateSeparation()` yet — that's S7b, a later phase. **SAFE-6 moves from "not run, nothing exists"
  to "logic proven, integration still pending S7b."**
- **Unit 2 (facts artifact machinery):** `seed-product-facts.ts` (`--propose` / replay / `--dry-run`)
  built and **live-tested against real CDPR data**: 1072 PHI/REI proposals generated, reproducing the
  probe's own oracle values exactly (Pristine 7969-199 → 14-day PHI / 12-hour REI). The generated
  artifact was **not committed** — `product-facts.json` still ships `[]`. Two reasons: curated content
  needs a human's review signature (rule §3.1), and a **new finding**: the already-shipped Unit 6
  resolver does not currently gate resolution on `reviewedBy` — every `verify:product-facts` fixture
  already relies on `reviewedBy: null` rows resolving. Committing real proposals would make them
  resolve as live, unreviewed facts. Flagged for Russell rather than silently changed.
- **Unit 5 (tenant-facts entry surface):** `/vineyards/sprays/products` page + actions built; a
  material line's "Custom product ref" field now threads `tenantProductRef` through record + correction.
  **Proven at the DB level** via 5 new `verify:tenant-isolation` cases (RLS visibility, WITH CHECK,
  mutable UPDATE allowed same-tenant/refused cross-tenant, and the KD-3 composite-key upsert never
  duplicating a row). **Not yet browser-clicked** — the dev server redirected correctly to sign-in on
  the new route (proving it exists and isn't a 404/500), but no live session logged in this turn.

⚠️ **A live interactive pass through `/vineyards/sprays/products` and the jurisdiction propose/confirm
form (user login required, per QA-PROTOCOL) is the one thing this update did not do.** Recommended
before closing S2b entirely.

## 2. Safety cases

| Case | Result | Evidence |
|---|---|---|
| **SAFE-10** — a missing input renders *cannot determine* as its OWN state, not a degraded pass | ✅ **PASS** | `? h / ? d`, "facts unknown"/"facts partial", "unknown — cannot determine safely". Never blank, never zero, never "clear". |
| **SAFE-14** — source toggle OFF withholds registry data rather than answering from memory | ✅ **PASS** | The A/B in §1. Same product, same UI, flips to `NONE`/`UNKNOWN`/`known=false`. |
| **SAFE-3 / SAFE-4** — *gap* renders distinctly from *no-code-exists* | ✅ **PASS (data layer)** | `verify:pesticide` 31/31 (unchanged by this phase); K13 most-conservative rollup asserted in `verify:product-facts`. No S2b UI change. |
| **SAFE-19** — a non-US tenant does not brick; the manual path is offered | 🟨 **PARTIAL — DB-proven, not browser-clicked** | RLS + resolution proven (`verify:product-facts` 5, 5b, 6, 8, 11) **plus** the Unit 5 entry surface now exists and its DB behavior is proven (`verify:tenant-isolation`'s 5 new cases). What remains: a live browser session actually typing a Bhutan-shaped product into `/vineyards/sprays/products` and citing it on a spray. |
| **SAFE-6** — oil then sulfur is blocked, naming the oil and its date | 🟨 **LOGIC PROVEN, INTEGRATION PENDING** | `separation.ts` (Unit 3) built + 14 goldens on the exact JMS worked example. Still needs S7b (not yet a phase) to actually call it and render a block reason in the app. |
| **SAFE-15** — a Bulletins Live! Two product surfaces "a bulletin check is required" | 🟥 **NOT RUN** | `requiresBulletinCheck` column exists; nothing populates or renders it (no curated content — rule §3.1). |
| SAFE-2, 11, 17, 18, 20 | 🟨 re-run at existing scope | No S2b regression; no surface changed beyond the spray record. |

## 3. Gates

| Gate | 2026-07-26 | 2026-07-27 (resumption) |
|---|---|---|
| `verify:product-facts` | ✅ 22/22 | ✅ **22/22, unaffected** |
| `verify:spray-record` | ✅ 14/14 | ✅ **15/15** (jurisdiction snapshot group added) |
| `verify:pesticide` | ✅ 31/31 | ✅ **31/31, unaffected** |
| `verify:tenant-isolation` | ✅ all checks | ✅ **all checks, +6 new (tenant_product_facts)** |
| `verify:invariants` | ✅ 48/48 | not re-run this pass (no invariant added) |
| `verify:naming` | ✅ 25/25 | not re-run this pass (no naming-relevant change) |
| `verify:ai-native` | ✅ green, KD-7 held | ✅ **green** — `separation.ts`/`jurisdiction-port.ts`/`product-facts-artifact.ts`/`product-facts-derive.ts` are non-`-core.ts` composition modules, no allowlist entry spent |
| `tsc` · lint | ✅ clean | ✅ **clean across all 4 units** |
| Full unit suite | ✅ 4,612 pass | ✅ **4,959 pass** (same pre-existing `assistant-commit-tenant-context` whole-suite-contention flake, confirmed passes in isolation) |
| New pure-logic suites | — | `pesticide-separation` 14/14, `pesticide-jurisdiction` 9/9, `pesticide-cdpr-parse` +5, `pesticide-product-facts-derive` 6/6, `pesticide-facts-artifact` 14/14, `vineyard-field-coercion` +9 |

## 4. Gate items — updated status

- **"Every curated group row carries source + as-of + reviewer"** — **the enforcement now exists**
  (`validateArtifactRow`/`validateArtifact`, 14 tests + a live test against the committed file). Still
  vacuously true on content because the artifact ships `[]` — the MACHINERY is proven, not the content.
- **"The non-US path proven end-to-end on a Bhutan-shaped fixture"** — data layer unchanged from
  2026-07-26 (still proven); the entry surface to TYPE one in a browser now exists (Unit 5) but wasn't
  clicked through live this session.
- **"Separation rules are direction-specific and non-inheriting"** — ✅ **now proven** — 14 goldens on
  the JMS Stylet-Oil worked example, incl. the CLASS-ambiguity case (council G5).
- **"Jurisdiction is snapshotted per block line and survives a later vineyard edit"** — ✅ **now
  implemented and DB-proven** (`verify:spray-record` assertion group 15); council C3 closed in practice.
- **Coverage thresholds** — still **0%** (unchanged; `report:product-facts-coverage` re-run
  2026-07-27, same result). **S7a and S6 remain blocked.** This is the one gate item resumption could
  not move, because moving it requires real human-reviewed content, which is out of scope for an agent.

## 5. Fixtures and teardown

**2026-07-26:** 5 × `QA-S2B*` spray applications on Demo Winery, all removed via the sanctioned
owner-context purge (`app.allow_spray_purge`, council C15); `epa-pesticide` toggled ON then restored
OFF; temp scripts deleted; `verify:naming` green before/after. 42,132 pest mappings from Unit 7b left
in place (revisionId points at a FAILED revision from a killed mid-flight run; data verified clean).

**2026-07-27:** all fixtures created by `verify:spray-record` (assertion group 15) and
`verify:tenant-isolation` (the `tenant_product_facts` cases) are cleaned up by those scripts' own
teardown — nothing left behind. The 1072-row `--propose` output was generated, spot-checked, and
**reverted to `[]`** before commit — never persisted.

## 6. Recommendation

**Merge the resumption; do not close S2b.** Units 1, 2, 3, and 5 are built, gate-green, and DB-proven.
What's left, in order of value:

1. **A live interactive browser pass** (user login) through `/vineyards/sprays/products` and the
   jurisdiction propose/confirm form — the one thing this update proved at the script/DB layer but not
   by clicking through it.
2. **The `reviewedBy` resolution-gate decision** (§2b) — before any real curated content is merged,
   decide whether `lookupProductFactsBatch` should filter on `reviewedBy IS NOT NULL`, or whether the
   git PR review itself is the intended human sign-off gate.
3. **Real curation** — a human reviewing and signing rows in `product-facts.json` (the 10-product
   calibration spike, plan §10, still hasn't been run) is the only path to moving the 0% coverage
   number, which is what actually unblocks S7a and S6.
