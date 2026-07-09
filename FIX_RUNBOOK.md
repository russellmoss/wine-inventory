# FIX_RUNBOOK — Incumbent-Teardown Remediation · **v2.4**

> **What this is.** A phased, executable remediation plan that turns the seven-agent incumbent
> teardown (`analysis/incumbent-teardown/SYNTHESIS.md` §B/§C/§D, read against
> `analysis/CELLARHAND-CURRENT-STATE.md`) into shipped changes. Each phase is sized for **one focused
> Claude Code session driven by `/plan` → `/work` → `/ship`**. The order and its dependency logic are
> load-bearing.
>
> **v2 (this revision)** applies the council review in [`fix-council-feedback.md`](./fix-council-feedback.md)
> — the full §5 phase reorder and the complete §6 edit checklist — plus the four §7 decisions recorded in
> the Decision Log below. The headline change: **migration trust is pulled forward** (a dedicated
> migration *kernel* now lands right after the identity + bond model, ahead of the lifecycle/ops-gaps
> work), and the migration ingest model is corrected to **"seed current balances + read-only history
> archive"** (never replay legacy history through the active fold).
>
> **v2.1** set the build posture: **Phases 0–6 are built fully now; Phase 7 (vintrace) is parked** until a
> vintrace design partner is actually in the pipeline (see "Build posture & sequencing" below). Phase 4
> (InnoVint) is **not** deferred symmetrically — it is what proves the Phase-3 kernel and what recruits the
> first design partner.
>
> **v2.2 (this revision)** removes all reliance on incumbent trial accounts and design partners *during
> runbook execution*. There will be **no InnoVint trial account** (obtaining a competitor's trial for
> competitive analysis is a ToS / misrepresentation exposure we avoid) and **no design partner** — InnoVint
> or vintrace — while these phases are built; partners come *after*. Phase 4 therefore builds against a
> **corpus-derived synthetic InnoVint fixture bundle** committed to the repo. The build order is unchanged
> (Phases 0–6 now, Phase 7 parked). Reality-dependent work is tracked in the new **Post-runbook calibration
> backlog** so nothing silently drops. See Decision Log #5.
>
> **v2.3 (this revision) — the incumbent order flips to Vintrace-first, because reality changed.**
> v2.1/v2.2 sequenced **InnoVint-first with Vintrace parked** on three premises that are now false:
> (1) *no design partner during execution* — we now have **two warm partners, both on Vintrace** (Macari,
> Sparkling Pointe); (2) *Vintrace is the harder second target (PDF-locked, two ID spaces)* — we have since
> mapped a real, documented **Vintrace v7 REST API** (`vintrace-docs/api/`, incl. a **sandbox**) that gives
> clean current-state reads, so it is the *easier* first target for the seed; (3) *Phase 4 (synthetic
> InnoVint) is the partner-recruiting demo* — moot once partners exist. The v2.1 un-park trigger ("a
> vintrace winery entering the pipeline un-parks Phase 7") **has fired.** So: **Phase 7 (Vintrace)
> un-parks and becomes the FIRST/lighthouse adapter; Phase 4 (InnoVint) stays synthetic-until-a-partner and
> becomes second.** Phases 1 and 2 are **shipped** (identity presentation; bond + tax-class model). The
> migration source of truth is now `vintrace-docs/api/MIGRATION-STRATEGY.md` (API for the current-state
> seed + CSV report exports for the history/TTB/finished-goods/materials/chemistry gaps the API doesn't
> expose). See Decision Log #6.
>
> **Current execution posture (v2.4) -- no design partner yet; keep building the app.**
> Decision #6 only applies when a real Vintrace design partner is active. Current reality is
> **no design partner / no authorized incumbent data yet**, so the runbook resumes the partnerless posture:
> build **Phase 3 as a generic, incumbent-agnostic migration kernel**, then move to **Phase 5** and
> **Phase 6** product work. **Do not build Phase 4 or Phase 7 now** except for any minimal synthetic
> fixture needed to verify the Phase-3 kernel. Phase 4 returns when we intentionally want a synthetic
> migration demo or receive authorized InnoVint data; Phase 7 returns only when a real Vintrace partner
> and authorized exports/API access exist. See Decision Log #7.
>
> **How to run it.** One phase per session. Start each with `/plan` (feed it that phase's block from this
> file), execute with `/work`, land via `/ship`. Every phase **ends green**: full `vitest` suite passing,
> `npm run verify:invariants` + `npm run verify:tripwires` + all phase-specific `verify:*` guards passing,
> and a short **`PHASE-N-REPORT.md`** at repo root recording *what changed vs. what this runbook planned*
> (deltas, deferrals, surprises). Do **not** begin executing any phase from this document alone — this is
> the map, `/plan` produces the turn-by-turn.
>
> **Grounding.** Phase objectives trace to `SYNTHESIS.md §B` (the reviewed diffs), §C (mistakes not to
> repeat), and §D (migration strategy); the council refinements trace to `fix-council-feedback.md`
> §3/§5/§6. Current-state facts and code citations trace to `analysis/CELLARHAND-CURRENT-STATE.md`.

---

## Decision Log (the §7 judgment calls — recorded and applied in v2; extended in v2.2)

Review artifact: [`fix-council-feedback.md`](./fix-council-feedback.md) (parallel council review, Codex
gpt-5.4 + Gemini 3.1 Pro, adjudicated). The four open §7 decisions were resolved as follows (Decision 5
added in v2.2; Decision 6 — the Vintrace-first flip — added in v2.3; Decision 7 — the current partnerless
app-building lane — added in v2.4):

1. **Full reorder, not the minimum edit.** The §5 phase reorder is adopted in full. *Rationale:* migration
   trust is the product thesis — "the easiest system to migrate to" — so the migration kernel and its
   trust mechanisms (reconciliation, sign-off) come before daily-use polish.
2. **`code` = adopted human code, unique per tenant; `displayName` = non-unique free text; `id` is the
   ONLY opaque identity.** The opaque-slug alternative (Gemini) is **rejected permanently**. *Rationale:*
   adopting the winery's familiar human code verbatim is the migration-familiarity win; the surrogate `id`
   already provides the opaque stable key, so a second opaque slug is redundant and would hide the codes
   winemakers recognize.
3. **Reference-data pull-forward scope is NOT decided now.** The Phase 3 (migration kernel) `/plan` **must
   begin** with a reference-data readiness audit against a real or synthetic InnoVint export bundle:
   enumerate required reference entities, mark each `exists` / `build`, and build **only** the missing
   migration-critical subset. *Rationale:* what an export actually references is unknown until we hold one;
   guessing now risks rebuilding what already ships (materials/vessels/CoA-mapping/members) or missing a
   blocker.
4. **The legacy-history archive is display-only in this runbook** (timeline stitching only) — **but its
   schema must be structured** (typed columns keyed on the stable source action ID, **not** opaque JSON
   blobs) so queryability can be added in **Phase 27 (institutional memory)** without re-ingest. This
   forward-compatibility requirement is explicit in Phase 3. *Rationale:* cheap and safe now; no data
   re-ingest later.
5. **(v2.2) Synthetic-fixtures-first; no trial account.** Phase 4 builds and validates against a
   corpus-derived synthetic InnoVint fixture bundle committed to the repo — **not** an InnoVint trial
   account (competitive-use ToS / misrepresentation risk) and **not** a design partner's data (partners
   come after execution). Customer-provided exports (a winery's own data, authorized) are the **clean
   upgrade path** that opportunistically enriches fixtures and drives the Phase-4 calibration fast-follow —
   nothing in the runbook blocks on them. *Rationale:* removes legal + availability blockers from the
   critical path while still proving the kernel end-to-end.
6. **(v2.3) Vintrace is the lighthouse; InnoVint is second.** The incumbent order **flips**. Decision 5's
   synthetic-InnoVint-first posture was correct **only under its stated premise — no design partner during
   execution.** That premise no longer holds: two warm design partners (Macari, Sparkling Pointe) are on
   **Vintrace**, and a real **Vintrace v7 REST API** + sandbox is now mapped (`vintrace-docs/api/`). So the
   **first adapter built and calibrated is Vintrace, against those partners' own authorized exports/API +
   the sandbox** (Phase 7 un-parks → first). **InnoVint (Phase 4) stays synthetic-until-a-partner and
   becomes the second target**, un-parked when a friendly InnoVint winery enters the pipeline. Decision 5's
   "customer's own data is the clean path; never a competitor trial account" **still governs** — it now
   applies to Vintrace first. *Rationale:* build the importer for the customers you actually have, against a
   real API, not a hypothetical you'd build to recruit customers you already recruited. The migration source
   of truth is `vintrace-docs/api/MIGRATION-STRATEGY.md`. *(This supersedes the InnoVint-first ordering in
   "Build posture & sequencing" and in ROADMAP Phase 13; the historical reasoning is kept there for the
   record, flagged superseded.)*
7. **(v2.4) Current partnerless lane: Phase 3 generic kernel -> Phase 5 -> Phase 6; park Phase 4 and
   Phase 7.** Decision 6 is treated as conditional on an active Vintrace design partner with authorized
   exports/API access. Until that condition is true, do not spend build cycles on real incumbent adapters.
   Build the **generic migration kernel** in Phase 3 using synthetic/frozen fixtures only as proof, then
   keep building the app through **Phase 5 lifecycle debt** and **Phase 6 operations gaps**. Phase 4 is
   parked unless we explicitly choose to make a synthetic migration demo; Phase 7 is parked until a real
   Vintrace partner exists. *Rationale:* app/product work is not blocked by design-partner discovery, but
   partner-specific migration code without partner data is guesswork.

---

## Current execution posture (v2.4) -- no design partner yet

This section is authoritative for the next work sessions.

**Build now:**
- **Phase 3 -- generic migration kernel only.** Build the incumbent-agnostic spine: draft import batches,
  two-track seed/archive semantics, structured `LegacyOperation`, saved mappings, reconciliation pack,
  publish/sign-off blocking, tenant isolation, and `verify:migration`. Use synthetic/frozen fixtures only
  to prove the kernel. Do not build a real InnoVint or Vintrace adapter in this phase.
- **Phase 5 -- lifecycle-writer debt.** Product work; safe to continue without a design partner.
- **Phase 6 -- operations gaps.** Product work; safe to continue without a design partner.

**Park for later:**
- **Phase 4 -- InnoVint adapter/demo.** Park unless we explicitly decide we need a synthetic migration demo
  before outreach, or until a friendly winery provides its own authorized InnoVint exports.
- **Phase 7 -- Vintrace connector.** Park until a real Vintrace design partner is active and we have
  authorized exports/API access. Do not build against imagined partner data.

**Practical next sequence:** `Phase 3 generic kernel -> Phase 5 -> Phase 6`.

Schema/database migrations required by these phases still happen normally. What is deferred is
**customer/incumbent data migration and partner-specific adapter calibration**, not ordinary Prisma
migrations needed by app features.

---

## Build posture & sequencing (v2.2) — build Phase 4, defer Phase 7

> [!important] SUPERSEDED by v2.3 (Decision 6) — read this section as historical rationale.
> The InnoVint-first / Vintrace-parked ordering below assumed **no design partner during execution**.
> That premise no longer holds. **The incumbent order is now Vintrace-first:** Phase 7 (Vintrace)
> un-parks and becomes the **first/lighthouse** adapter (built against Macari/Sparkling Pointe's own
> Vintrace exports + the v7 API/sandbox mapped in `vintrace-docs/api/`); Phase 4 (InnoVint) stays
> **synthetic-until-a-partner** and becomes **second**. Phases 1 (identity) and 2 (bond + tax-class) are
> **shipped**. Everything below about the *kernel being unproven until one adapter runs it*, *two-track
> seed/archive*, *scope caps*, and *the un-park trigger* still applies — just with **Vintrace as the
> adapter that proves the kernel** and InnoVint as the second target.

**Decision:** Build **Phases 0–6 fully**. **Park Phase 7 (vintrace)** until a vintrace design partner is
actually in the pipeline. Phase 4 (InnoVint) is **not** deferred — the two adapters are **not symmetric**,
and two reasons make the InnoVint adapter part of the critical path, not a wait-for-partner add-on:

1. **Phase 3 is unproven until one adapter runs through it.** The migration kernel (preflight, two-track
   seed/archive, reconciliation pack, draft-until-sign-off) is a *pipeline*; a pipeline with nothing
   flowing through it is untested architecture. The first adapter is what validates the kernel's contracts.
   Building the kernel and walking away means the first real migration discovers the kernel's design flaws
   **and** the adapter's calibration gaps simultaneously, at partner-facing stakes. **Building Phase 4 now
   is really finishing Phase 3.**
2. **Phase 4 is the design-partner *recruiting* tool — which inverts the "adapter waits for partner"
   assumption.** The pitch that lands a partner is a live demo: *"hand me your InnoVint export, watch your
   winery appear with your lot codes intact, here's the reconciliation report to verify against your own
   records."* That demo **is** Phase 4. Waiting for a partner to build the thing that recruits the partner
   is a deadlock.

**Fixture source (v2.2) — no trial account, no design partner during execution.** We will **not** use an
InnoVint trial account (obtaining a competitor's trial for competitive analysis is a contract /
misrepresentation exposure we avoid) and will **not** have any design partner — InnoVint or vintrace —
while the runbook is executed; partners come *after*. Phase 4's fixtures are therefore a **synthetic
InnoVint export bundle generated from the corpus documentation**: the teardown
(`analysis/incumbent-teardown/migration.md` and the `innovint-docs/` corpus) documents the **TTB Audit
CSV**, **Cost Audit CSV**, **Lot Components**, **Activity Feed**, and **SUPPLY** export structures, the
**stable action-ID keying**, the **31-day analysis chunking**, and the **200-row SUPPLY caps** — enough to
generate a coherent, InnoVint-shaped bundle. If a **friendly InnoVint-using winery contact** provides real
export files (**their own data — the clean path**) at any point, those **upgrade the fixture set
opportunistically**, but **nothing in the runbook blocks on it**.

**Why Phase 7 is different on every axis** (so it *should* wait): vintrace was deliberately sequenced as
the **harder second target** (PDF-locked history, two ID spaces); the kernel will already be proven by
Phase 4; and the first partner is likelier to come from the InnoVint (modern-cohort, cloud-comfortable)
side. When a vintrace winery *is* in the pipeline you'll want that partner's own authorized exports from
them regardless — so **build nothing for Phase 7 now beyond what the shared kernel gives for free.**

**Phase 4 scope cap:** cap at **"works end-to-end on the synthetic fixture bundle"** — NOT "hardened
against every partner edge case." Real-file edge-case hardening is a defined fast-follow against the first
customer-provided export (see Phase 4 → "REAL-FILE CALIBRATION").

**The trigger to un-park / start outreach:** the moment Phase 4 produces its **first clean fake-winery
migration** — the synthetic bundle importing cleanly through preflight → mapping → draft → reconciliation →
sign-off with `verify:migration` green — that is the cue to **start design-partner outreach, with the
migration demo as the opener.** The first partner's real exports then drive the Phase-4 calibration
fast-follow; a **vintrace** winery entering the pipeline is what un-parks Phase 7.

---

## Reviewer's modifications to SYNTHESIS §B (still in force in v2)

§B is approved as written, with these **execution refinements**. They don't change the design — they make
it land without breaking the existing safety gates:

1. **Invariant-guard sequencing (governance ↔ code split).** `npm run verify:invariants` is a **hard CI
   gate** (`.github/workflows/ci.yml:30`) that fails if any invariant register note
   (`docs/architecture/invariants/*.md`) declares a `verify:` guard that does not exist on disk / in
   `package.json` (checker: `scripts/verify-invariant-guards.mjs:50-64`). Therefore **Phase 0 (docs-only)
   adds each new invariant's register note with `status: planned` and NO `verify:` field** (the checker
   skips notes without a `verify:` — line 50), and **the phase that implements the enforcing code adds
   both the guard script and the `verify:` field**, flipping the note to `status: guarded`. This is how
   "NAMING-2 must be verify-guarded like LEDGER-10" is satisfied (narrative + planned note in Phase 0, the
   `verify: "npm run verify:naming"` guard in Phase 1); likewise **MIGRATE-1**'s planned note lands in
   Phase 0 and its `verify: "npm run verify:migration"` guard lands in Phase 3.

2. **Dangling doc references get repaired in Phase 0.** `ROADMAP.md:730-731,754` and `VISION.md` point at
   `docs/STRATEGY.md` and `docs/competitive-analysis-vintrace-innovint.md`, **neither of which exists**
   (`CELLARHAND-CURRENT-STATE.md:13`). Since this teardown *is* that competitive analysis, Phase 0
   redirects those references to `analysis/incumbent-teardown/`.

3. **CBMA-1 is documented-but-deferred, not guarded.** Per §B.1(iv) and `excise.ts:66-74` (already
   parameterized "v2"), CBMA-1's register note is created `status: deferred` with no `verify:` and an
   explicit "activate when multi-entity tenants appear" trigger. No code in any phase here.

---

## Phase dependency graph (v2.4 current; partnerless lane)

Current execution sequence:

```
PHASE 0  Governance & docs                         shipped
   |
   v
PHASE 1  Identity presentation layer               shipped
   |
   v
PHASE 2  Bond + tax-class model                    shipped
   |
   v
PHASE 3  Generic migration kernel                  build now
   |       incumbent-agnostic spine only; synthetic/frozen proof fixtures
   |
   +----> PHASE 5  Lifecycle-writer debt           build after Phase 3
   |
   +----> PHASE 6  Operations gaps                 build after Phase 5

PHASE 4  InnoVint adapter/demo                     parked
         un-park for an intentional synthetic demo or authorized InnoVint exports

PHASE 7  Vintrace connector                        parked
         un-park only with a real Vintrace partner + authorized exports/API
```

**Current hard dependencies:** **1 -> 3** and **2 -> 3** remain load-bearing. Phases 5 and 6 depend on
0/1/2 and can run after the generic Phase-3 kernel without a partner adapter. Phase 4 is no longer a
required predecessor for Phase 5/6 under Decision 7. Phase 7 is not started until its partner trigger
fires.

**Current build boundary (v2.4):** build **Phase 3 generic kernel -> Phase 5 -> Phase 6**. Park Phase 4 and
Phase 7. Do not build real incumbent adapters, live import flows, or partner-specific parser calibration
without authorized partner data.

### Historical graph (v2/v2.2/v2.3 context)

```
PHASE 0  Governance & docs
   │     establishes the contract every later phase honors
   ▼
PHASE 1  Identity presentation layer            #1 self-inflicted fix; blocks migration
   │     (+ LotIdentifier table, non-unique displayName, cross-identifier search)
   ▼
PHASE 2  Bond + tax-class model                 compliance table-stakes; line-scoped, time-aware bond
   │     (the seed in Phase 3 must place multi-bond positions on the right bond)
   ▼
PHASE 3  Migration kernel  ◄── hard-deps: 1 (identity/codes/LotIdentifier) + 2 (bond)
   │     two-track seed/archive · ref-data readiness preflight · reconciliation pack + sign-off
   ▼
PHASE 4  InnoVint lighthouse adapter            proves one full migration end-to-end
   │
   ├─────────►  PHASE 5  Lifecycle-writer debt   small, independent; fine after the lighthouse
   │
   ├─────────►  PHASE 6  Operations gaps         deps 1 + 2; NOT needed to import current state
   │            (fenced metadata edit + reverse-and-rebook)
   ▼
PHASE 7  vintrace connector  ⏸ DEFERRED — build nothing until a vintrace design partner is in the pipeline
         (when un-parked) deps: 3 (shared spine) + 4 (proven lighthouse) · export-bundle-first · no OCR
```

**Hard dependencies:** **1 → 3** (migration cannot adopt incumbent codes / resolve identifiers without the
presentation layer), **2 → 3** (the migration seed cannot place a multi-bond winery's positions without the
Bond model), **3 → 4** (the InnoVint adapter is thin over the kernel), **3+4 → 7** (vintrace is a second
adapter over the proven kernel). Phases 5 and 6 depend only on 0/1/2 and are ordered after the lighthouse
for sequencing, not blocked by it. **Do not attempt Phase 3 before 1 and 2 are merged.**

**Build boundary (v2.2):** build **Phases 0–6 fully** (Phase 4 against a corpus-derived synthetic InnoVint
fixture bundle — no trial account, no design partner during execution); **Phase 7 is parked** (see "Build
posture & sequencing" above) — do not start it until a vintrace winery is actually in the pipeline, at
which point it depends on 3 and 4 being merged and that partner's own authorized vintrace exports being
available.

> [!important] Superseded for current execution by Decision 7 / v2.4 above.

---

## Conventions every phase obeys

- **Tenancy.** Any new tenant-scoped table follows the AGENTS.md "Phase 12 checklist" verbatim
  (`tenantId @default("")` + index + composite FK + RLS `ENABLE/FORCE` + `tenant_isolation` policy +
  app_rls grant + a case in `scripts/verify-tenant-isolation.ts`). Auth/org tables stay global. **v2
  tables that must each get this pass:** `NamingTemplate`, `LotCodeEvent`, `LotIdentifier` (Phase 1);
  `Bond` + any line-level bond column (Phase 2); the `LegacyOperation` archive + any import-batch/mapping
  tables (Phase 3).
- **Ledger writes.** Every new op family exposes a `…Tx(tx, …)` core form so it composes into one
  `runLedgerWrite`; no new op opens its own second transaction (system-map §10 rule; mirrors WORKORDER-1).
- **Corrections stay append-only.** Never add an in-place mutate/delete path to the ledger (§C.1). New
  ops get a reversal path routed through `reverseOperationCore` where reversible.
- **High-risk actions are admin/owner-gated in these phases** (council 3.11). Import/publish,
  reverse / LIFO-unwind, bond ops, and TTB filing are gated to **admin/owner** using the existing
  authority stub (the same admin-only posture WO approval uses). The full capability×domain RBAC matrix
  stays in **Phase 23** — do NOT pull it forward; this is a coarse guardrail, not a role system.
- **Migrations on Windows/Neon.** Use `migrate diff → deploy` (not interactive `migrate dev`); isolate
  `ALTER TYPE` enum additions in their own migration committed before any column defaults to the new
  value (the "Windows enum rule"); stop the dev server before `db:generate`.
- **Testing tenant is Demo Winery** (`org_demo_winery`), never Bhutan Wine Co. New `verify:*` scripts run
  inside `runAsTenant("org_demo_winery", …)`.
- **Every new invariant** gets a narrative entry in `INVARIANTS.md` **and** a typed note in
  `docs/architecture/invariants/`, per the sequencing rule above.
- **Assistant coverage** is not required by this runbook (breadth is deliberately capped per the
  assistant-coverage stop rule); if a phase adds a user-facing write worth an assistant tool, note it in
  that phase's report as backlog, don't build it here.

---

# PHASE 0 — Governance & documentation (no code)

**Traces to:** SYNTHESIS §B.1, §B.2, §B.3, §D.0; reviewer modifications 1–3; council `fix-council-feedback.md`
§3.5 (BOND-1), §3.7 (NAMING-1 wording), §3.1 (MIGRATE-1), §6.

### Objective
Encode the reviewed teardown decisions **and the council's invariant-level consequences** into the
governing docs so every later phase has a contract to build against, and the docs stay **ahead of** the
code. **No code, no schema, no scripts.** After this phase, no doc may still describe the immutable
`Lot.code` as identity.

### Exact scope (files touched)
1. **`INVARIANTS.md`**
   - **Split the identity clause** (currently lines 62-63) with the §B.1(i) text, refined per Decision 2:
     identity = surrogate **`id`** (the ONLY opaque identity); `id` and the point-in-time
     `lotCode`/`vesselCode` **line snapshots** are immutable; origin + `vintageYear` **provenance** remain
     immutable; the user-facing **`code` is a mutable, unique-per-tenant human label** and **`displayName`
     is a mutable, NON-unique free-text label** — together the mutable presentation layer (forward-ref
     NAMING-1/2). State explicitly that an opaque system slug is **not** used (Decision 2).
   - **Add NAMING-1** (identity is `id`, never `code`; **`code` uniqueness is a per-tenant UX constraint,
     `displayName` has no uniqueness constraint**; a code collision is a label error that the system
     **offers to auto-disambiguate — it does not silently apply** disambiguation; **silent
     auto-disambiguation is reserved for newly generated post-go-live codes only**; nothing in
     lineage/cost/ledger joins on `code`) — §B.1(ii) + council 3.7.
   - **Add NAMING-2** (rename = append-only `LotCodeEvent`, never rewrites line snapshots; current-state
     reads resolve `id → current code/displayName`, historical reads show as-recorded + "renamed → X").
     Mark in the narrative as **"verify-guarded like LEDGER-10 (guard lands in Phase 1)."** — §B.1(iii).
   - **Add a "Compliance invariants" section** with:
     - **BOND-1** (council 3.5, restated): every tenant-scoped ledger position belongs to exactly one bond
       and **bond affiliation is posted at the operation/line level and is time-aware** (the movement
       carries source + destination bond); **any lot-level "home bond" is a projection only, never the
       compliance source of truth** — mirroring the existing point-in-time `deriveTaxClass()` pattern. A
       movement across bonds posts **symmetric Removed-in-Bond / Received-in-Bond** to both bonds' reports.
     - **TAXCLASS-1** (cross-class blend posts symmetric produced-by/used-for-blending; result carries the
       destination lot's class; winemaker warned).
     - **TAXPAID-1** (taxpaid is a terminal one-way state; only a refund-flagged Return-to-Bond re-admits).
     - **AMEND-1** (correcting a FILED period cascades `NEEDS_AMENDMENT` down the form+bond chain and
       regenerates begin-balances).
     - **CBMA-1** flagged deferred.
     - **MIGRATE-1** (council 3.1 — the two-track migration model): **exactly one migration `SEED` per
       lot/vessel participates in the fold** (cutover balances); **legacy operational history is ingested
       ONLY into the read-only archive and is NEVER folded**; **an import cannot publish to the live tenant
       while unresolved reconciliation deltas exist.** Mark it "verify-guarded (guard `verify:migration`
       lands in Phase 3)." MIGRATE-1 operationalizes D11 (no fabricated ledger history).
2. **`docs/architecture/invariants/` (register notes — machine-readable mirror)**
   - Create `NAMING-1-identity-is-id.md`, `NAMING-2-honest-rename.md`, `BOND-1-bond-isolation.md`,
     `TAXCLASS-1-cross-class-blend.md`, `TAXPAID-1-terminal-state.md`, `AMEND-1-amended-chain.md`,
     `CBMA-1-controlled-group.md`, **`MIGRATE-1-seed-not-replay.md`**.
   - Frontmatter per the existing template (see `LEDGER-10-immutable-operations.md`): `id`, `group`,
     `severity`, `enforcedBy`, `decision`, `appliesTo`, `tags`. **`status: planned`** for all
     (`deferred` for CBMA-1). **Omit the `verify:` field entirely** (so `verify:invariants` skips them and
     stays green — reviewer mod 1). Each note's body cross-links `[[INVARIANTS]]`.
3. **`ROADMAP.md`**
   - **Insert "Phase 12.5 — Identity presentation layer (naming templates + rename)."** Scope per §B.2 +
     council 3.4: `Lot.displayName` (non-unique); per-tenant versioned tokenized `NamingTemplate` (today's
     `buildLotCode` becomes the default template's renderer); `LotCodeEvent`; **a `LotIdentifier` external-
     reference table (NOT three scalar columns)**. Mark it a **hard dependency for migration**. Update the
     line-206 "Unplanned bonus" note to point here.
   - **Rescope Phase 13 (Migration)** per §B.2 + council 3.1/3.2/3.3: InnoVint-first; a shared **migration
     kernel** + thin per-incumbent adapters; the **two-track model** (one migration SEED for balances into
     the fold; legacy history into a read-only, structured archive stitched onto the timeline, never
     folded); a reconciliation pack + draft-until-sign-off; deterministic saved mappings (AI suggest-only);
     explicit identity-layer + bond-model prerequisites.
   - **Rescope Phase 14 (Compliance) remaining scope:** add Bond entity (line-scoped, time-aware),
     `TRANSFER_IN_BOND` op family, per-bond report scoping, dated append-only Change-Of-Tax-Class event,
     tax-paid terminal state + Returned-to-Bond, AMEND-1; add the **bounded, partner-gated international
     sub-phase** as market-expansion (not a US-launch blocker).
   - **Add the "new operations to name"** list (§B.2): `CHANGE_OWNERSHIP`, `TRANSFER_IN_BOND`, one-action
     in-place split, lees sub-lot, barrel-group (+break/combine), recurring WOs + task-skip, guarded
     metadata edit + reverse-and-rebook composite, generic `CUSTOM` op + `DRAIN`/`DELESTAGE`/`COLD_STAB`.
   - **Add the "lifecycle writers to finish" debt:** `Lot.status` DEPLETED/ARCHIVED and
     `LotLineage.kind=TRANSFORM` are declared-but-never-written.
   - **Add the "do NOT chase" note:** vintrace's DSP/distillation/RTD breadth is explicitly out of scope.
   - Weight↔volume dual fruit-lot tracking noted as a Phase-6/30 evaluation (kept in its roadmap home).
4. **`docs/architecture/ux-principles.md`** — add the five checkable rules from §B.3 as numbered rules
   (8-12): (8) self-service correction is first-class UX — a LEDGER-11 block names the later op + offers
   one-click LIFO unwind in plain language; (9) no support ticket to configure anything — gate by *plan*,
   never by *ticket*; (10) exports never fail silently; (11) offline-first capture is table stakes; (12)
   no phantom vessels — split/blend-return are real ops.
5. **`docs/api-strategy.md`** — correct the InnoVint claim (line 23-24): it **has** a public REST API at
   `sutter.innovint.us/api/v1/` (PAT auth); the anti-lock-in thesis still holds because their APIs are
   extraction/one-way. Keep the QBO gap claim (accurate).
6. **Dangling references (reviewer mod 2):** redirect `docs/STRATEGY.md` and
   `docs/competitive-analysis-vintrace-innovint.md` mentions in `ROADMAP.md` and `VISION.md` to
   `analysis/incumbent-teardown/` (or a one-line pointer where a full rewrite is out of scope).
7. *(Optional, if `/plan` judges it warranted)* an ADR under `docs/architecture/decisions/` for the
   identity-vs-naming split (the largest architectural decision here), per CLAUDE.md's "for big ones, add
   an ADR." Consider a second ADR for the two-track migration model (MIGRATE-1).

### Out-of-scope guardrails
- **No code, no schema, no `prisma/`, no `scripts/`, no `src/`.** If a change tempts a code edit, it
  belongs in a later phase — note it, don't do it.
- Do not add `verify:` fields to the new register notes (would red the CI gate — reviewer mod 1).
- Do not delete VISION.md decision (D*) numbering or renumber existing ROADMAP phases; **insert** 12.5.
- Do not touch DESIGN.md except a one-line pointer if a new surface is implied (§B.3 says domain-UX lives
  in ux-principles.md).

### Invariants touched or added
- **Touched:** the identity/provenance clause (`INVARIANTS.md:61-66`) — split, with `code` unique-per-tenant
  and `displayName` non-unique.
- **Added (narrative + planned register notes, unguarded):** NAMING-1, NAMING-2, BOND-1, TAXCLASS-1,
  TAXPAID-1, AMEND-1, MIGRATE-1, CBMA-1 (deferred). **Eight notes.**

### Tests + verify-guards required
- `npm run verify:invariants` — **must stay green** (proves the eight new planned notes are correctly
  unguarded/skipped, and no existing guard regressed).
- `npm run verify:tripwires` — must stay green.
- No new guard scripts in this phase (guards land with their enforcing code).

### Acceptance criteria
- Docs are internally consistent; **no remaining reference anywhere to immutable `Lot.code` as identity**
  (grep as part of the report); the docs state `code` unique-per-tenant, `displayName` non-unique, `id`
  the only opaque identity.
- INVARIANTS.md narrative and the **eight** register notes agree (id/severity/decision match).
- `verify:invariants` + `verify:tripwires` green.
- Dangling `docs/STRATEGY.md` / `docs/competitive-analysis-*` references resolved.
- `PHASE-0-REPORT.md` written.

### Dependencies
None. This is the root of the graph.

---

# PHASE 1 — Identity presentation layer (the #1 self-inflicted fix)  ✅ SHIPPED

**Traces to:** SYNTHESIS §2, §A.2 (naming/identity row), §B.1(ii)(iii), §B.2 (Phase 12.5), §C.2/§C.6,
§D.0.1; current state §5; council `fix-council-feedback.md` §3.4 (LotIdentifier), §3.7 (non-unique
displayName + "offer" disambiguation), §3.12 (cross-identifier search). **The single most important
cross-agent finding; it blocks migration.**

### Objective
Separate durable identity (`id`) from the human-facing label. Give lots a **mutable, non-unique
`displayName`**, a **per-tenant versioned tokenized `NamingTemplate`** (today's hardcoded `buildLotCode`
becomes the default template's renderer), an **append-only `LotCodeEvent`** for renames that never
rewrites history, and a **`LotIdentifier` external-reference table** (replacing scalar source columns).
Wire **cross-identifier search** into every lot picker. Migrate existing data. After this phase a winery
can rename a lot, and (in Phase 3) adopt its incumbent's codes verbatim and find lots by any known
identifier.

### Exact scope
**Schema / entities (`prisma/schema.prisma`, one or more migrations):**
- `Lot.displayName String?` — **mutable, NON-unique** label, defaults to `code` at create. **No unique
  constraint** (council 3.7 — legacy free-typed names collide legitimately).
- **`LotIdentifier`** — **new tenant-scoped table** (full Phase-12 checklist) replacing the three scalar
  `sourceSystem/sourceId/legacyCode` columns (council 3.4): `lotId`, `kind` (e.g. `current-code` |
  `prior-code` | `source-system-id` | `spreadsheet-alias` | `ttb-label`), `sourceSystem`,
  `sourceObjectType`, `value`, `validFrom`, `validTo`, `isCurrent`. Indexed for search + idempotent
  re-import; this is the re-import key **and** the search index. (`LotCodeEvent` owns rename *history*;
  `LotIdentifier` owns *source* identifiers — keep both, they answer different questions.)
- `NamingTemplate` — **new tenant-scoped table** (full checklist): per-tenant, **versioned**
  (clone-on-customize, like WO templates), a tokenized pattern string + token vocabulary, `isDefault`.
  The default row's renderer reproduces today's `YEAR-VINEYARD-BLOCK[-SUBBLOCK]-VARIETY[-TAG]` /
  `[vintage]-BL-<TOKEN>` output exactly.
- `LotCodeEvent` — **new tenant-scoped, append-only table** (full checklist): `lotId`, `field`
  (`code`|`displayName`), `fromValue`, `toValue`, `actor`, `observedAt`, `commandId @unique`. Insert-only.

**Code:**
- `src/lib/lot/code.ts` / `generate.ts`: refactor `buildLotCode`/`buildBlendLotCode` into the **default
  template renderer**; add a template-driven renderer reading the tenant's active `NamingTemplate`. Keep
  `normalizeAbbr`/`disambiguate` pure. The blend anti-single-origin rule stays.
- New `src/lib/lot/rename.ts` (or extend `lot/`): `renameLotCore` / `setDisplayNameCore` that append a
  `LotCodeEvent`, update `Lot.code`/`displayName`, and **never touch `LotOperationLine` snapshots**. On a
  `code` collision the system **offers** disambiguation to the operator (does not silently apply it) —
  NAMING-1 per council 3.7; a collision is a label concern, never a lineage error.
- Resolver helpers: current-state reads resolve `id → current code/displayName`; historical/timeline reads
  show the **as-recorded** `lotCode` snapshot **plus a "renamed → X / also-known-as" affordance** (NAMING-2).
- **Cross-identifier search** (council 3.12): every lot picker/search box resolves **current `code`,
  `displayName`, historical codes (via `LotCodeEvent`), and legacy identifiers (via `LotIdentifier`)**.
  Operational views show the current label first with alias secondary; audit/timeline views show
  as-recorded + the "renamed →" affordance.
- Template CRUD surface (server actions + minimal Settings UI) so a winery can edit/version its pattern
  (ux-principle 9). Follow the WO-template clone-on-customize pattern.
- Timeline / lot-detail UI: surface `displayName`, a rename action (ux-principle 1), and the historical
  "renamed →" affordance.

**Data migration:** backfill `displayName = code` for all existing lots; seed each tenant a default
`NamingTemplate` reproducing current output; seed a `LotIdentifier` `current-code` row per lot. No ledger
rewrite.

**Guard script:** new `scripts/verify-naming.ts` + `"verify:naming"` in `package.json`.

**Governance follow-through:** `NamingTemplate`, `LotCodeEvent`, and `LotIdentifier` each get the Phase-12
tenancy checklist pass + a `verify:tenant-isolation` case (council §6). Flip the Phase-0 `NAMING-1` /
`NAMING-2` register notes to `status: guarded`, adding `verify: "npm run verify:naming"`.

### Out-of-scope guardrails
- **The one-time legacy recode script (`recode-legacy-lots.ts`) stays as-is** — a declared exception; do
  not extend it to external files here (that is Phase 3).
- **Never rewrite `LotOperationLine.lotCode`/`vesselCode` snapshots** — the incumbent mistake NAMING-2
  exists to avoid (§C.2/§C.6). A rename that touches a line snapshot is a bug.
- No migration/import of external files (Phase 3). No bond/tax work (Phase 2).
- **`code` stays unique-per-tenant; `displayName` must NOT be unique; do not introduce an opaque code
  slug** (Decision 2) — identity stays on `id`.

### Invariants touched or added
- **NAMING-1** → guarded (nothing joins on `code`; `code` unique-per-tenant with *offered* disambiguation;
  `displayName` non-unique).
- **NAMING-2** → guarded, **verify-guarded exactly like LEDGER-10** (register note gets
  `verify: "npm run verify:naming"`, `status: guarded`, `enforcedBy: app-code`).
- Identity clause (edited in Phase 0) is now *enforced* by these guards.

### Tests + verify-guards required
- **`npm run verify:naming` (NEW, the NAMING-1/-2 guard):** in Demo Winery — create a lot, run ops (freeze
  line snapshots), rename `code` and set `displayName`; assert (a) a `LotCodeEvent` row appended with
  from/to, (b) **every `LotOperationLine.lotCode` snapshot unchanged**, (c) current-state read returns the
  new code, (d) historical read returns the as-recorded code, (e) a colliding `code` rename is **offered**
  disambiguation (not silently suffixed) and raises **no** lineage error, (f) a duplicate `displayName` is
  accepted (non-unique), (g) no lineage/cost/ledger query joins on `code`, (h) cross-identifier search
  resolves a lot by a `LotIdentifier` value and by a historical code. Model on `verify:reverse`'s shape.
- Pure unit tests: default template reproduces legacy `buildLotCode` output byte-for-byte across existing
  fixtures; a custom template renders + offers disambiguation correctly; the blend anti-single-origin rule
  holds.
- `verify:tenant-isolation` gains cases for `NamingTemplate`, `LotCodeEvent`, `LotIdentifier`.
- `verify:invariants` green (NAMING-1/2 now guarded). Full `vitest` suite green; `npm run build` clean.

### Acceptance criteria
- A winemaker can rename a lot's `code` and set a non-unique `displayName`; the timeline shows history
  honestly (as-recorded + renamed-to), no snapshot rewritten; a colliding code prompts a choice.
- Cross-identifier search finds a lot by current code, displayName, a historical code, or a legacy
  identifier.
- Existing lots migrated: `displayName` populated, default template per tenant, a `current-code`
  `LotIdentifier` per lot, output unchanged for newly minted lots.
- `verify:naming` + `verify:invariants` + `verify:tenant-isolation` + full suite green.
- `PHASE-1-REPORT.md`.

### Dependencies
**Phase 0** (invariant notes + ROADMAP Phase 12.5). Nothing else.

---

# PHASE 2 — Bond + tax-class model (line-scoped, time-aware)  ✅ SHIPPED

**Traces to:** SYNTHESIS §3, §A.1 (multi-bond table stake — FAIL), §A.2 (tax-class row), §A.3.8
(ownership/bond as one atomic event), §B.1(iv), §B.2 (Phase 14 rescope), §C.12, §D.0.2; current state §4
([ABSENT] transfer-in-bond, no bond entity), §6 (no change-ownership op); council `fix-council-feedback.md`
§3.5 (line-scoped, time-aware bond). *(Was Phase 3 in v1; pulled ahead of migration — the seed must place
multi-bond positions on the right bond.)*

### Objective
Give the ledger a real **Bond** entity and the compliance model the things it's missing: **bond isolation
with symmetric transfer-in-bond posting, posted at the operation/line level and time-aware**; an
**explicit dated Change-Of-Tax-Class event**; a **tax-paid terminal state** with explicit Returned-to-Bond
re-admission; and **amended-chain integrity**. Unblocks the two most valuable migration segments
(custom-crush facilities, any >1-bond winery).

### Exact scope
**Schema / entities (Phase-12 checklist for each new tenant-scoped table):**
- `Bond` — registry #, penal sum, premises, owner link (to `organization` or a tenant owner record).
  Tenant-scoped, RLS-isolated.
- **Bond affiliation is posted at the operation/line level and is time-aware** (council 3.5): the movement
  carries source + destination bond; the authoritative bond of a position is derived point-in-time from
  the ledger, **mirroring `deriveTaxClass()`**. Any lot-level "home bond" column is a **projection only**,
  never the compliance source of truth — do NOT put a mutable `bondId` on `Lot` and treat it as authority.
  Backfill existing positions to the tenant's primary bond.

**Op families (each a `…Tx` core composing into one `runLedgerWrite`):**
- **`TRANSFER_IN_BOND`** — moves volume between bonds; posts **symmetric Removed-in-Bond (source) /
  Received-in-Bond (destination)** to both bonds' 5120.17 §A 7/15 & §B 3/9 (fills the form lines today
  static labels — `form-map.ts` has no case). Add to `OperationType` (isolated `ALTER TYPE` migration —
  Windows enum rule).
- **`CHANGE_OWNERSHIP`** — atomic append-only ownership/bond change with **no follow-up zero-volume
  Measurement ritual** (kills vintrace's worst quirk — §C.12/§A.3.8). Writes ownership + triggers the cost
  re-routing §6 notes is currently unimplemented for a *change* (ESTATE ↔ CUSTOM_CRUSH_CLIENT).
- **Change-Of-Tax-Class event** — dated, append-only; ABV stays the *suggested default* but a winemaker
  can intentionally set/correct a class; posts §A 10/24/25. (§A.2 tax-class row.)
- **`REMOVE_TAXPAID` terminal state + `RETURN_TO_BOND`** — taxpaid volume cannot re-enter in-bond via an
  ordinary compensating reversal; only an explicit **refund-flagged Taxpaid-Returned-to-Bond** event
  re-admits it (TAXPAID-1 guards the generic reverser).

**Compliance engine (`src/lib/compliance/`):**
- **Per-bond report scoping** — one filed 5120.17 per bond; extend the `formType`-scoped query pattern
  (`form-type.ts`) with a bond scope reading the **line-level** bond so filing chains never cross.
- **`form-map.ts`** — add the transfer-in-bond and cross-class-blend line cases.
- **AMEND-1** — correcting a FILED period marks all later FILED reports in that form+bond chain
  `NEEDS_AMENDMENT` and regenerates begin-balances (carry-forward makes this cheap).

### Out-of-scope guardrails
- **No international compliance** (AU WET / NZ excise) — partner-gated Phase-14 sub-phase, kept in its
  roadmap home (explicitly OUT of this runbook's scope).
- **No CBMA controlled-group apportionment code** — CBMA-1 stays deferred (reviewer mod 3).
- Do not weaken `formType` scoping; bond scope is *added on top*.
- `TRANSFER_IN_BOND` posting must be **symmetric** — a one-sided post is a BOND-1 violation.
- **Do not make a mutable lot-level `bondId` the compliance authority** (council 3.5) — the operation/line
  is authoritative; a home-bond column, if any, is projection.
- Keep the ledger append-only: tax-class change and ownership change are **events**, not in-place mutations
  (§C.1).

### Invariants touched or added
- **BOND-1** → guarded (bond isolation + symmetric posting; **line-level, time-aware; home-bond is
  projection**).
- **TAXCLASS-1** → guarded (cross-class blend posts symmetric produced-by/used-for-blending; result carries
  destination class; winemaker warned).
- **TAXPAID-1** → guarded (terminal one-way state; only refund-flagged Return-to-Bond re-admits).
- **AMEND-1** → guarded (amended-chain integrity).
- Must honor existing **COMPLIANCE-1** (formType-scoped) and **COMPLIANCE-2** (carry-forward) — extend,
  don't break.

### Tests + verify-guards required
- **`npm run verify:bond` (NEW):** two bonds; `TRANSFER_IN_BOND`; assert symmetric Removed/Received posting
  on both bonds' 5120.17; assert the position's bond is derived point-in-time from the line (not a mutable
  column) and per-bond filing chains don't cross (BOND-1).
- **`npm run verify:taxclass` (NEW)** *(or fold into `verify:ttb`)*: cross-class blend posts §A 10/24/25; a
  dated Change-Of-Tax-Class event corrects a premature declaration; result carries destination class.
- **`npm run verify:taxpaid` (NEW)** *(or fold into `verify:excise`)*: `REMOVE_TAXPAID` cannot be
  re-admitted by `reverseOperationCore`; `RETURN_TO_BOND` (refund-flagged) does re-admit.
- **AMEND-1** by extending `verify:ttb`/`verify:excise`: correcting a filed period flags later reports
  `NEEDS_AMENDMENT` and regenerates begin-balances.
- Flip BOND-1/TAXCLASS-1/TAXPAID-1/AMEND-1 register notes to `status: guarded` with their `verify:` fields;
  `verify:invariants` green.
- `verify:ttb` + `verify:excise` still green (per-bond scoping didn't regress single-bond filing).
- **Governance follow-through:** `Bond` (+ the line-level bond posting) gets the Phase-12 tenancy checklist
  pass + a `verify:tenant-isolation` case (council §6). Full suite + build green.

### Acceptance criteria
- A >1-bond winery's book is representable: transfers post symmetrically at the line level, the bond of a
  position is time-aware (never a mutable authority column), each bond files its own 5120.17, tax-paid is a
  true terminal state, ownership/bond changes atomically with no ritual, and amending a filed period
  cascades correctly.
- All four new invariants guarded and green.
- `PHASE-2-REPORT.md`.

### Dependencies
**Phase 0** (invariant notes + roadmap rescope). Independent of Phase 1 in code, but **required by Phase 3**
(the migration seed must place a multi-bond winery's positions on the right bond — §D.0.2 / council 3.5).
Run before Phase 3.

---

# PHASE 3 — Migration kernel (spine + trust mechanisms)

**Traces to:** SYNTHESIS §A.3.6 (id-keyed export wedge), §B.2 (Phase 13 rescope), §D.0–§D.1, §D.4–§D.5;
current state §7 (migration [ABSENT]/[PLANNED]); council `fix-council-feedback.md` §3.1 (two-track
seed/archive), §3.3 (reconciliation pack + sign-off), §3.8 (ref-data readiness preflight), §3.9
(deterministic mappings), §4 (single most important change); Decisions 3 & 4. **Hard-depends on Phases 1
and 2.** *(Was Phase 5A in v1; pulled ahead of lifecycle/ops-gaps — this is the trust core of the product
thesis.)*

### Objective
Build the **incumbent-agnostic migration kernel**: an external-file legacy-seed spine, a **two-track
seed/archive ingest model**, a **reference-data readiness preflight**, deterministic saved mappings (AI
suggest-only), and a **reconciliation pack + draft-until-sign-off** with a publish-block. This is the
substrate every connector (Phase 4 InnoVint, Phase 7 vintrace) rides. **No connector-specific parsing
here** beyond what's needed to prove the kernel with a synthetic bundle.

> [!important] v2.4 current execution: keep Phase 3 generic. Build adapter interfaces and synthetic/frozen
> proof fixtures only where needed to verify kernel contracts. Do not build the Phase-4 InnoVint adapter or
> Phase-7 Vintrace connector inside this phase.

### Exact scope
**0. Reference-data readiness preflight (Decision 3 + Decision 7 — the `/plan` MUST START HERE).**
- Begin the Phase-3 `/plan` with a **reference-data audit against the generic synthetic/frozen proof
  bundle**: enumerate every reference entity the import must resolve a foreign key to
  (location→**vessel**, cost→**additive/material**, SKU→**WineSku**, account mapping, **bond**, tax class,
  users, barrel groups/types). For each, mark **`exists`** (audit current CRUD — materials/vessels/CoA-
  mapping/members already ship) or **`build`**. **Build only the missing, migration-critical subset**, with
  inline create-during-mapping where practical (ux-principle 9). The import cannot resolve FKs unless the
  target reference data exists or is created in the mapping step.

**1. Two-track ingest model (MIGRATE-1 — council 3.1; the load-bearing correctness fix).**
- **Cutover balances → the fold.** Extend the D11 legacy-lot pattern (`migrate-legacy-lots.ts`) to accept
  an **external file** and emit **exactly one migration `SEED`** per lot/vessel that hard-sets current
  volume, cost basis, tax class, and bond at the cutover date. **This SEED is the ONLY legacy-sourced data
  that participates in the volume/cost fold.**
- **Legacy operational history → a read-only archive (NEVER folded).** Create a **`LegacyOperation`**
  archive table (Phase-12 checklist). **Decision 4 — the schema must be STRUCTURED: typed columns keyed on
  the stable source action ID, NOT an opaque JSON blob**, so Phase 27 (institutional memory) can make it
  queryable **without re-ingest**. Ingest legacy per-action rows here. The lot timeline **stitches** the
  two visually: *"Pre-Cellarhand history → migration cutover → active ledger."* Archived rows **never**
  enter `foldLines()` / `VesselLot` / the cost DAG.
- **This replaces v1's deleted "ingest operational history as `captureMethod:IMPORT` ledger events"
  clause** — that double-counted the seed and is removed entirely.

**2. Identity + units + coverage (§D.1).**
- Use **`LotIdentifier`** (Phase 1) as idempotent re-import keys; **adopt incumbent codes verbatim** into
  `code` + `displayName` (non-unique). A genuine per-tenant `code` collision is a **preflight block with
  explicit operator resolution — never a silent suffix** (council 3.7); silent auto-disambiguation is only
  for post-go-live-generated codes. **No forced rename** — the Phase-1 `NamingTemplate` governs only
  newly-minted lots going forward.
- **Unit reconciliation** (gal / lbs·tons / °Brix → canonical liters, D8).
- **Deterministic saved mappings, AI suggest-only** (council 3.9): connector-specific templates + saved
  per-tenant mappings are the **primary** path; AI **suggests** a mapping for unmatched columns but
  **never auto-commits** — an operator confirms and the confirmed mapping is saved for idempotent re-import.
  Emit **parse diagnostics** (row-level rejects with reasons).
- **Chemistry import** (analyses keyed on lot/vessel code → `AnalysisReading`).
- **Coverage-gap tracking** — snapshot the unmapped, label inferred/partial, **never silent-drop**
  (ux-principle 10).

**3. Reconciliation + publish control (council 3.3 — the missing onboarding UX).**
- An import stays **DRAFT** (not published to the live tenant) until an operator signs off on a
  **reconciliation pack**: by-vessel occupancy, by-lot volume, cost by lot, finished-goods counts, TTB
  period totals, chemistry-reading counts, unmapped entities, and inferred/partial lineage — with
  **named-exception acceptance**. **Publish is blocked while unresolved reconciliation deltas exist**
  (MIGRATE-1). Gate publish to **admin/owner** (conventions).

**Guard script:** new `scripts/verify-migration.ts` + `"verify:migration"`.

**Governance follow-through:** `LegacyOperation` + any import-batch/mapping tables get the Phase-12 tenancy
checklist pass + `verify:tenant-isolation` cases (council §6). Flip the Phase-0 `MIGRATE-1` register note to
`status: guarded`, adding `verify: "npm run verify:migration"`.

### Out-of-scope guardrails
- **Never scrape; ingest only the winery's own authorized exports/API.**
- **Never fold legacy operational history** (MIGRATE-1) — it lives read-only in `LegacyOperation`. **Never
  fabricate lineage/ledger history** (D11/§D.4) — snapshot the source blob labeled inferred/partial where
  lineage isn't cleanly exportable.
- **No connector-specific parsing** beyond a synthetic bundle to prove the kernel — InnoVint specifics are
  Phase 4, vintrace Phase 7.
- **Do not silently auto-disambiguate imported codes** (council 3.7) — collisions are a preflight decision.
- **The `LegacyOperation` archive is display-only in this runbook** (Decision 4) — no query/report surface
  beyond timeline stitching; but its schema must be structured (typed, action-ID-keyed) for Phase-27
  queryability without re-ingest.

### Invariants touched or added
- **MIGRATE-1** → guarded (one SEED per lot/vessel into the fold; legacy history read-only + never folded;
  no publish while unresolved reconciliation deltas exist). Operationalizes **D11**.
- Must honor **NAMING-1** (verbatim codes; collisions resolved, not silently suffixed), **BOND-1** (the
  seed places positions on the right bond, line-level), LEDGER-6/7.

### Tests + verify-guards required
- **`npm run verify:migration` (NEW):** in Demo Winery, run a **synthetic** export bundle through the
  kernel; assert (a) exactly one migration `SEED` per lot/vessel participates in the fold and **no legacy
  history is folded** (`VesselLot` == fold of SEEDs only), (b) legacy rows land in `LegacyOperation`
  (structured, action-ID-keyed) and are excluded from `foldLines()`, (c) incumbent codes adopted verbatim;
  a colliding code **blocks with an operator-resolution prompt** (not a silent suffix), (d) duplicate
  `displayName` accepted, (e) re-import is idempotent on `LotIdentifier`/action-id, (f) units reconciled to
  liters, (g) chemistry attached, (h) coverage-gap report + parse diagnostics enumerate unmapped/rejected
  (nothing silent-dropped), (i) a saved mapping re-applies deterministically and AI never auto-commits,
  (j) **publish is blocked while unresolved reconciliation deltas exist** and succeeds after sign-off.
- `verify:tenant-isolation` for `LegacyOperation` + any import-batch/mapping tables.
- `verify:cost` / `verify:ttb` green on the imported tenant (imported basis + bond scoping consistent).
- `verify:invariants` green (MIGRATE-1 now guarded). Full suite + `verify:tripwires` + build green.

### Acceptance criteria
- A synthetic export bundle imports cleanly under a Demo tenant: current balances seeded (fold correct),
  legacy history archived read-only and stitched onto the timeline, codes adopted verbatim (collisions
  resolved by the operator), a reconciliation pack shown, and **publish blocked until sign-off**.
- The reference-data readiness audit is recorded in `PHASE-3-REPORT.md` (entities × exists/build × what was
  built).
- `verify:migration` green.
- `PHASE-3-REPORT.md`.

### Dependencies
**Phase 1** (identity/codes/`LotIdentifier`/search) and **Phase 2** (Bond entity + line-level bond) are
**hard prerequisites** (§D.0 / council 3.5). **Large phase — `/plan` will self-size it as a deep,
multi-unit plan; it remains one runbook phase (the kernel) as specified.**

---

# PHASE 4 — InnoVint adapter  🔁 v2.3: now the SECOND target (synthetic-until-a-partner)

> [!important] v2.4 current execution: **park this phase for now.** Phase 4 is no longer required before
> Phase 5/6. Un-park only if we explicitly choose to create a synthetic migration demo before outreach, or
> when a friendly winery provides its own authorized InnoVint exports.

> [!note] v2.3 (Decision 6): InnoVint is no longer the lighthouse — **Vintrace (Phase 7) is now first.**
> This phase is unchanged in *content* (build + validate against the corpus-derived synthetic InnoVint
> fixture bundle), but it now runs AFTER the Vintrace adapter has proven the kernel, and it un-parks when a
> friendly InnoVint winery enters the pipeline. The "InnoVint lighthouse" framing below is historical.

**Traces to:** SYNTHESIS §A.3.6, §B.2, §D.2, §D.4–§D.5; corrected `docs/api-strategy.md` (InnoVint REST
API); council `fix-council-feedback.md` §3.1/§3.9 (kernel model + mappings), §5 (lighthouse first).
*(Was Phase 5B in v1.)*

### Objective
Prove **one full winery migration** by building the **InnoVint** adapter — the lowest-friction,
highest-fidelity incumbent — as a thin layer over the Phase-3 kernel. This adapter is **not deferred**: it
is what validates the Phase-3 kernel's contracts (a pipeline with nothing flowing through it is untested)
and it is the **design-partner recruiting demo** ("hand me your InnoVint export, watch your winery appear
with your lot codes intact"). Includes an **early representability check** so we never silently pull
ops-phase work forward to make a real InnoVint winery fit.

**Data source + scope cap (v2.2).** Build and validate against a **corpus-derived synthetic InnoVint
fixture bundle** committed to the repo (generated by the fixture generator built as this phase's first
task — see Exact scope) — **no InnoVint trial account** (competitive-use ToS / misrepresentation risk) and
**no design partner** during execution (Decision Log #5). Cap the adapter at **"works end-to-end on the
synthetic fixture bundle"** — **NOT "hardened against every partner edge case."** Real-file edge cases are a
defined fast-follow (see "REAL-FILE CALIBRATION" below). A friendly winery contact's own authorized exports
may enrich the fixtures opportunistically, but nothing here blocks on it. **Trigger:** the first clean
fake-winery migration through this adapter (synthetic bundle green through the full kernel pipeline with
`verify:migration` passing) is the cue to start design-partner outreach with the migration demo as the
opener.

### Exact scope
- **EARLY TASK #1 — synthetic fixture generator (the permanent `verify:migration` fixture source).** Build
  a script that emits a **coherent fake winery as a full InnoVint-shaped export bundle** and **check the
  generated bundle into the repo** as the permanent fixture source for `verify:migration`. The synthetic
  winery must exercise the hard paths: internally consistent lots; a **blend**; a **split**; **lees lots**;
  **barrel-grouped wine**; **analyses across a >31-day span** (to exercise the analysis-window chunking); a
  **rename mid-history** (to exercise NAMING-2 + `LotCodeEvent` on import); a **bottling into a SKU** (to
  exercise the MAKE↔SUPPLY re-join); and a **multi-bond position** (to exercise line-level bond seeding).
  The bundle's shape follows the corpus (`analysis/incumbent-teardown/migration.md` + `innovint-docs/`):
  TTB Audit CSV, Cost Audit CSV, Lot Components, Activity Feed, SUPPLY, with stable action-ID keying.
- **EARLY TASK #2 — representability check (escalation gate).** Before building the adapter, verify that a
  real InnoVint winery's **current state** — **including lees lots and barrel-grouped wine** — can be
  faithfully **seeded** with the primitives that exist as of Phase 3 (lots, vessels, `sublotTag`, bond, tax
  class). If any current-state shape **cannot** be represented (e.g., a barrel group or a lees sub-lot has
  no faithful seed target), **STOP and escalate to the user** — do NOT silently pull Phase-6 operations work
  forward. The user decides whether to (a) accept a labeled inferred/partial snapshot for that shape, or (b)
  resequence Phase 6 ahead. Record the check's outcome in `PHASE-4-REPORT.md`.
- Thin **InnoVint adapter** over the Phase-3 kernel (reuse the two-track seed/archive, `LotIdentifier`,
  unit reconciliation, saved mappings, reconciliation pack).
- **Primary source = uniform CSV/XLSX exports** (export-first): the **TTB Audit + Cost Audit CSVs** (signed
  per-lot/per-action rows with a **stable action ID**) → **archive as `LegacyOperation`** and **reconcile
  the seed against them** (they are *not* folded — MIGRATE-1). Backfill sweetening / concentrate-to-wine /
  tax-class moves from the **Winery Activity Feed** (the audit CSV omits them). Lineage/composition from the
  **Lot Components** export (informs the seed + inferred/partial snapshots, never fabricated).
- Handlers for the documented gotchas: **URL-parsing** to recover the stable lot id; **MAKE↔SUPPLY re-join**
  (SKU code ≠ case-good lot code, no native linkage); **MAKE-PLUS/Costing add-on tier-gating** (reconstruct
  exports missing on lower tiers); **31-day analysis-window chunking**.
- **API opportunistic:** the **public PAT API** (`sutter.innovint.us/api/v1/`) is used where the customer
  provides a token and it materially improves fidelity — not the baseline.

#### REAL-FILE CALIBRATION (deferred — fast-follow, NOT built in this phase)
Synthetic fixtures cannot validate what only real exports reveal. The following is a **defined fast-follow
task triggered by the first real customer-provided InnoVint export bundle**, expected to touch **ONLY the
adapter's parse/mapping layer** (not the kernel):
- **actual character encodings** (UTF-8/UTF-16/Latin-1, BOMs);
- **date / null / locale formats** (empty-vs-zero, timezone, decimal comma, MM/DD vs DD/MM);
- **undocumented / renamed / reordered columns** the corpus didn't capture;
- **tier-gated export availability** (which exports actually exist on the customer's InnoVint tier);
- **export UI quirks** (pop-up-blocked downloads, silent row truncation, pagination).

This work is tracked in the **Post-runbook calibration backlog**. Do not attempt to pre-harden against
these from guesses — build to the synthetic bundle now, calibrate against real bytes later.

### Out-of-scope guardrails
- **Never fold the TTB/Cost Audit rows** — they archive to `LegacyOperation` and reconcile the seed
  (MIGRATE-1). **Never fabricate lineage** (snapshot inferred/partial — §D.4).
- **Never scrape; authorized exports/API only.** No InnoVint trial account (Decision Log #5).
- **Do not pull Phase-6 ops work forward silently** — the representability check escalates instead.
- **Kernel/adapter boundary is a hard escalation line (v2.2).** Any real-file discovery (during the
  calibration fast-follow or otherwise) that would require changing **kernel contracts** — the two-track
  seed/archive semantics, the reconciliation-pack shape, publish gating, or `LotIdentifier` semantics — is
  an **escalation to the user**, **never a quiet adapter-side workaround.** Kernel semantics are the
  hard-to-unwind core; adapters are the disposable edge. Parse/mapping-layer fixes stay in the adapter;
  contract changes stop and ask.
- **No vintrace here** — that is Phase 7.

### Invariants touched or added
- **No new invariants.** Must honor **MIGRATE-1** (seed folds; audit rows archive-only), **D11**,
  **NAMING-1** (verbatim codes; collisions resolved), **BOND-1**, LEDGER-6/7.

### Tests + verify-guards required
- Extend **`verify:migration`** to run the **committed synthetic InnoVint fixture bundle** (from the
  EARLY-TASK-#1 generator) through the full kernel pipeline: assert TTB/Cost Audit rows archive to
  `LegacyOperation` (not folded), the seed reconciles against them, codes adopted verbatim (rename
  mid-history handled), idempotent re-import on action-id, blend/split/lees/barrel-group seeded, MAKE↔SUPPLY
  re-join + tier-gating + 31-day chunking handled, multi-bond position placed line-level, coverage-gap
  report produced, publish blocked until sign-off.
- The synthetic fixture generator is deterministic and its output is committed (re-running it reproduces the
  same bundle).
- `verify:cost` / `verify:ttb` green on the InnoVint-imported tenant.
- Full suite + `verify:invariants` + `verify:tripwires` + build green.

### Acceptance criteria
- The **synthetic InnoVint fixture bundle** imports cleanly via the kernel — preflight → mapping → draft →
  reconciliation → sign-off — with the winery's lots/vessels/inventory shown in **their own codes + units**,
  legacy history stitched read-only, a reconciliation pack, publish gated on sign-off. The representability
  check outcome and the REAL-FILE CALIBRATION deferral are recorded.
- `verify:migration` green (synthetic InnoVint bundle).
- `PHASE-4-REPORT.md`.

### Dependencies
**Phase 3** (the migration kernel must exist and be proven). Transitively Phases 1 and 2.

---

# PHASE 5 — Lifecycle-writer debt (small, independent)

**Traces to:** SYNTHESIS §B.2 ("Lifecycle writers to finish"), §C.3; current state §0/§8
(`Lot.status DEPLETED/ARCHIVED` declared-never-written; `LotLineage.kind=TRANSFORM` declared-never-produced).
*(Was Phase 2 in v1; resequenced after the lighthouse — small and independent, no reason to gate migration
on it.)*

### Objective
Implement the missing lifecycle writers so declared-but-dead states become real: a lot draws down →
`DEPLETED`; a lot is intentionally closed → `ARCHIVED`; and `LotLineage.kind=TRANSFORM` is produced where a
transform lineage edge is the truthful model. Archive-not-delete once activity exists (§C.3).

### Exact scope
- **`Lot.status` writers.** Decide + implement the transition rules (in `/plan`): when a `VesselLot` fold
  reaches functional-zero for a lot with no remaining positions, mark `DEPLETED` (a projection-driven
  status write, **not** a ledger mutation — status is metadata, the ledger stays append-only). Add an
  explicit **close/archive action** (`archiveLotCore`) that sets `ARCHIVED` with guardrails (cannot archive
  a lot with a live `VesselLot` balance; archive is reversible/un-archivable as metadata).
- **`LotLineage.kind=TRANSFORM`.** Identify the code path(s) that should emit a `TRANSFORM` edge (candidate:
  form/state transforms that today produce no lineage edge; confirm against `transform/*-core.ts` in
  `/plan`) and write the edge. If analysis shows no current op should emit TRANSFORM, **either** wire it
  where truthful **or** remove the dead enum value + schema comment — do not leave it declared-but-dead.
- UI: show `DEPLETED`/`ARCHIVED` state and an archive/un-archive affordance on lot detail (ux-principle 4,
  ux-principle 1).

### Out-of-scope guardrails
- **Status is projection metadata, never a ledger edit.** Deriving/writing `DEPLETED` must not add or
  mutate a `LotOperation` (§C.1). No archive may delete ledger rows or `VesselLot` history.
- Do not overload `CORRECTED` (that stays reversal-only).
- No new op types here (those are Phase 6).

### Invariants touched or added
- None added. Must **not** violate LEDGER-7 (projection == fold): status writes are orthogonal to the
  volume fold and must not perturb it. Confirm `verify:projection` still passes.

### Tests + verify-guards required
- Unit/DB test: draw a lot to zero → `DEPLETED`; archive a zero-balance lot → `ARCHIVED`; attempt to
  archive a lot with a live balance → rejected; un-archive works.
- Test the `TRANSFORM` edge is produced (or the enum removal is clean).
- `npm run verify:projection` (or the existing projection assertion) green.
- Full suite + `verify:invariants` + `verify:tripwires` green.

### Acceptance criteria
- `DEPLETED`/`ARCHIVED` reachable through real code paths and shown in the UI; `TRANSFORM` produced or
  removed. No dead declared state remains.
- `PHASE-5-REPORT.md`.

### Dependencies
**Phase 0** (roadmap debt entry). Independent of the migration phases; ordered after the lighthouse for
sequencing only.

---

# PHASE 6 — Operations gaps (usability + coverage parity)

**Traces to:** SYNTHESIS §A.2 (op-granularity, correction-philosophy rows), §A.3.2 (native split), §B.2
(new ops list), §C.1/§C.3/§C.7; current state §2 (op types), §3 (no-undo ops gap), §5 (split); council
`fix-council-feedback.md` §3.6 (fenced metadata edit + reverse-and-rebook). *(Was Phase 4 in v1;
resequenced after the lighthouse — improves *ongoing* use, not needed to import current state.)*

### Objective
Close the operation-coverage and correction-usability gaps that make the incumbents feel more capable
day-to-day, **without** adopting their mutable-state mistakes. Add the long-tail ops, the in-place split
affordance, lees sub-lots, barrel groups, real reversal paths for the currently no-undo ops, the
plain-language LEDGER-11 experience with one-click LIFO unwind, and the **two fenced edit affordances**.

### Exact scope
- **One-action in-place lot split** — split a resident lot in place (§A.3.2). Truthful lineage DAG split,
  **no phantom vessel** (ux-principle 12). Likely a thin core over existing split machinery
  (`transform/press-core.ts` already mints child codes) exposed as a single affordance.
- **Lees sub-lot primitive** — a child lot via a lineage edge on a rack; §A.1 lees table stake. Uses
  `Lot.sublotTag` (already in schema). *(If the Phase-4 representability check flagged lees as unseedable,
  this closes that gap.)*
- **Barrel-group abstraction (+ break/combine)** — group barrels for group operations; break/combine. §A.1
  table stake. Rides the existing barrel-fill cost DAG (do not disturb the Phase-8b barrel cost invariant).
  *(Also closes the Phase-4 barrel-group representability gap if flagged.)*
- **`CUSTOM` op** + named **`DRAIN` / `DELESTAGE` / `COLD_STAB`** — the long tail (isolated `ALTER TYPE`
  enum migration). `CUSTOM` carries a free-text label but stays a balanced ledger op.
- **Real reversal paths for `ADJUST` / `DEPLETE` / `SEED`** — today non-reversible (`reverse.ts:84-87`).
  Give each a compensating-event reversal routed through `reverseOperationCore` (append-only — §C.1).
  Respect TAXPAID-1 from Phase 2 (a taxpaid removal is not silently reversible). **Note:** the migration
  `SEED` (Phase 3) is a special case — its "reversal" is discarding an unpublished draft import, not a
  ledger compensation; keep those paths distinct.
- **Plain-language LEDGER-11 block + one-click LIFO unwind** — when a correction is blocked, the UI names
  the later op that touched the wine and offers "unwind the chain (LIFO)" in plain language (ux-principle 8;
  §A.2). Backend already supports LIFO chain-unwind (`reverse-guard.ts` excludes CORRECTIONs); this is the
  UX + orchestration layer. Gate the unwind to **admin/owner** (conventions).
- **Two fenced edit affordances** (council 3.6 — replaces v1's ambiguous "in-place typo edit"):
  1. **Guarded metadata edit** — whitelist **ONLY non-posting, non-fold fields** (`displayName`, notes/free
     text, tags). **Explicitly forbid** dates, volumes/quantities, vessel, lot, tax class, bond, and
     anything report-affecting. Appends an audit event (reuse the NAMING-2 / `LotCodeEvent` discipline) —
     never mutates a line snapshot.
  2. **Fold-preserving reverse-and-rebook composite** — for an "edit" of a *posting* op, the UI presents a
     single Edit action; the backend executes `reverseOperationCore(original) + rebook(new)` folded into one
     visual action. The winemaker experiences an edit; the ledger stays strictly append-only.

### Out-of-scope guardrails
- **Absolutely no in-place mutate/delete on the ledger** (§C.1) — every "edit"/"reversal"/"split" appends.
  A phantom-vessel round-trip is forbidden (§C.2/ux-principle 12).
- **The guarded metadata edit must not touch any posting/fold field** (council 3.6) — anything
  report-affecting goes through reverse-and-rebook, never the metadata path.
- No recurring WOs / task-skip here (WO-engine roadmap items; keep in Phase 9 unless `/plan` scopes a
  trivial slice).
- Barrel-group work must not double-count barrel cost or disturb the Phase-8b barrel amortization invariant.
- `CUSTOM` op must still balance (LEDGER-6) and respect capacity (LEDGER-4).

### Invariants touched or added
- **No new invariants.** Every addition must honor LEDGER-6 (balanced), LEDGER-4 (capacity), LEDGER-10
  (append-only reversal), LEDGER-11 (correction guard), TAXPAID-1 (Phase 2), MIGRATE-1 (don't confuse a
  migration SEED with a ledger op reversal). The new reversal paths extend LEDGER-10 to ADJUST/DEPLETE/SEED.

### Tests + verify-guards required
- Extend **`verify:reverse`** / **`verify:reverse-transform`** to cover the new ADJUST/DEPLETE/SEED reversal
  paths, the in-place split reversal, and the reverse-and-rebook composite (asserts the composite is two
  append-only ops, not a mutation).
- New/extended coverage for lees sub-lot creation, barrel-group op + break/combine (assert cost DAG
  integrity via `verify:cost`), `CUSTOM`/`DRAIN`/`DELESTAGE`/`COLD_STAB` balanced writes.
- LIFO-unwind orchestration test: a blocked correction, then a one-click LIFO unwind succeeds and the
  ledger is consistent (`verify:projection`).
- Guarded metadata edit appends an audit event and is **rejected** if it targets a posting/fold field.
- `verify:cost` green; full suite + `verify:invariants` + `verify:tripwires` + build green.

### Acceptance criteria
- Split-in-place, lees sub-lots, barrel groups, the long-tail ops, ADJUST/DEPLETE/SEED reversal, the
  plain-language LEDGER-11 + LIFO unwind, and the **two fenced edit affordances** all work end-to-end, all
  append-only.
- `PHASE-6-REPORT.md`.

### Dependencies
**Phase 0** (op list in roadmap). Uses seams from **Phase 1** (naming for split children; audit-event
discipline for the metadata edit) and **Phase 2** (TAXPAID-1 governs SEED/DEPLETE reversal near tax-paid
boundaries). May also close representability gaps escalated from **Phase 4**. Run after 1 and 2.

---

# PHASE 7 — Vintrace connector  ▶ v2.3: UN-PARKED — now the FIRST / lighthouse adapter

> [!important] v2.4 current execution: **park this phase.** Decision 6 only reactivates when a real
> Vintrace design partner exists and we have authorized exports/API access. Until then, build nothing here
> beyond generic Phase-3 kernel surfaces.

> [!important] v2.3 (Decision 6): this is now the FIRST adapter built, not a deferred second target.
> Reason: the warm design partners (Macari, Sparkling Pointe) are on Vintrace, and Vintrace exposes a real,
> documented **v7 REST API + sandbox** (mapped in `vintrace-docs/api/`; strategy in
> `vintrace-docs/api/MIGRATION-STRATEGY.md`) — so it proves the Phase-3 kernel. Build/calibrate against the
> **sandbox (`sandbox.vintrace.net/vinx2demo`)** and the partners' **own authorized** exports/token (never a
> competitor trial account — Decision 5 still governs). SOURCE SPLIT: the **API supplies the current-state
> seed** (parties, blocks, vessel master, `GET /wine-batches` + `GET /vessel-details-report` for per-vessel
> identity/volume/cost/tax posture); **CSV report exports supply the gaps the API does not expose** —
> operation history (→ read-only archive), filed TTB/compliance reports, finished-goods on-hand, materials
> catalog, chemistry, actual harvest picks. IMPORTER POLICY: Vintrace `Measurement.unit` is a free string
> (no enum) — the importer owns unit→L/kg normalization (extends D8). The "harder second target /
> PDF-locked" framing below is historical; the API changes the picture. Reconciliation ties imported
> balances to Vintrace's **own report output** so the winemaker trusts the cutover (the onboarding-trust
> moment).
>
> **Council-hardened build rules (v2.3 — Codex + Gemini review of Decision 6; both endorse the flip):**
> 1. **Build against FROZEN captures, not live partner systems.** Dev/test the adapter against the
>    **sandbox** + **frozen API/CSV extracts** committed as replayable fixture packs (the Vintrace analog of
>    the synthetic bundle); calibrate against live/prod only at the end. This preserves the v2.2 "kernel
>    proven on controllable fixtures" benefit while using REAL data shapes — avoids conflating kernel bugs
>    with adapter/calibration bugs at partner-facing stakes.
> 2. **Hard kernel/adapter boundary.** The Vintrace adapter only EXTRACTS + MAPS. Preflight, seed, archive,
>    reconciliation, and draft/sign-off stay in the kernel. Do NOT let partner-specific patches leak into
>    the kernel (else you've built "Macari-first," not "Vintrace-first").
> 3. **Productize the CSV side as an evidence pack** (Codex): a required-export list, completeness checks, a
>    provenance manifest, and an explicit **unsupported-history disclosure**. The CSV report-export variance
>    (columns, report versions, free-text/naming drift, human export steps) is the *real* effort sink — plan
>    for it, not for "can I parse my own fixture."
> 4. **TTB continuity without replay** (resolves the Gemini lineage concern while keeping MIGRATE-1): do NOT
>    relationally replay legacy picks through the fold (double-counts the seed). Instead **archive the
>    last-filed Vintrace TTB reports + recompute forward periods from the seed** (carry-forward keys off the
>    last filed report), and keep the history archive **structured + queryable** (Decision 4) so pre-cutover
>    chemistry/ops are reference-grade, not a flat dump. Cutover lineage is *auditable-with-archived-
>    provenance*, not "unbroken relational" — which is correct and honest for an opening-balances migration.
> 5. **Honest claim, not "seamless."** The pitch is **"opening balances seeded + fully-archived, queryable
>    history,"** NOT "full operational continuity from day one." Overclaiming seamless is the thing that
>    breaks trust at cutover.
> 6. **Beachhead order (Gemini): lead with the STANDARD ESTATE (Macari) to prove the adapter; Sparkling
>    Pointe is the SECOND partner.** Sparkling (tirage/riddling/disgorge/dosage, multi-vintage assemblage) is
>    an edge case that must not distort the V1 migration model, and winter is *peak* complexity for a
>    sparkling house. Prove still-wine estate migration first, then extend to sparkling.

**Traces to:** SYNTHESIS §D.3, §D.4–§D.5; §A.2 (vintrace rewrites-history caution); council
`fix-council-feedback.md` §3.10 (export-bundle-first, no OCR). *(Was Phase 6 in v1.)*

> **⏸ DO NOT BUILD THIS PHASE YET.** Per the Build posture & sequencing decision (v2.2), Phase 7 is
> **parked until a vintrace design partner is actually in the pipeline.** Rationale: vintrace was
> deliberately sequenced as the harder second target (PDF-locked history, two ID spaces); the kernel will
> already be proven by Phase 4; the first partner is likelier to be an InnoVint (modern-cohort) winery; and
> when a vintrace winery *does* appear you'll build against **that partner's own authorized exports** (their
> data — the clean path; no trial account). **Build nothing for Phase 7 now beyond what the shared Phase-3
> kernel already provides.** Un-park only when a vintrace winery is in the pipeline *and* Phases 3 + 4 are
> merged. The block below is the plan for that future session — not current work.

### Objective
Add the **vintrace** adapter as a thin layer over the Phase-3 kernel, handling vintrace's harder extraction
surfaces (PDF-locked deep history, two id-spaces, mutable batch codes, row caps) — **export-bundle-first,
API opportunistic, no OCR of accounting numbers**.

### Exact scope
- Thin **vintrace adapter** over the Phase-3 kernel (reuse two-track seed/archive, `LotIdentifier`, unit
  reconciliation, saved mappings, reconciliation pack, coverage-gap tracking).
- **Baseline = the documented export bundle (CSV)** (council 3.10); **use the REST API + OpenAPI
  opportunistically** where it materially improves fidelity — not the baseline.
- Reconcile the **two id-spaces**: the true surrogate **VINx2 ID** (setup/reference CSVs only) vs. the
  **mutable batch code** (keys the machine-readable Operation Throughput report). Map onto our `id`/`code`
  split — **VINx2 ID → a `LotIdentifier` `source-system-id`; batch code → `code`/`displayName`**.
- **PDF-only surfaces** (Stock Summary, Stock Cost Detail — the deepest history): **NO OCR** (council 3.10 —
  an accounting-corruption tar pit). **Attach the PDF to the legacy record as evidence only.** If the winery
  needs structured deep history, **require them to request a full CSV/data dump from vintrace support** — do
  not parse accounting numbers from a PDF.
- Handlers for: **1000-row/file chunking**; **batch-code cascade awareness** (an old report's code may have
  been rewritten in place upstream — reconcile via the VINx2 ID, never the mutable label).

### Out-of-scope guardrails
- **No OCR of accounting/cost PDFs** (council 3.10) — attach as evidence; require a proper dump for
  structured deep history.
- **Not API-first** — export bundle is the baseline; API augments.
- **International compliance boundary:** a NZ/AU winery on vintrace cannot be fully migrated until the
  partner-gated international sub-phase exists (kept in its roadmap home) — **flag as a known boundary**, do
  not build international compliance here.
- Never scrape; authorized exports/API only. Never fold legacy history / fabricate lineage (MIGRATE-1/D11).
- Do not fork the kernel — vintrace is an adapter *behind* the Phase-3 kernel, not a parallel path.

### Invariants touched or added
- **No new invariants.** Same set as Phase 4 (MIGRATE-1, D11, NAMING-1, BOND-1, LEDGER-6/7).

### Tests + verify-guards required
- Extend **`verify:migration`** (or a `verify:migration-vintrace` variant) with a synthetic vintrace bundle:
  assert VINx2-ID ↔ batch-code reconciliation (VINx2 ID → `LotIdentifier`), verbatim code adoption,
  idempotent re-import, row-chunk handling, PDFs attached as evidence (not parsed), and coverage-gap
  reporting for PDF-only surfaces.
- `verify:cost` / `verify:ttb` green on the vintrace-imported tenant.
- Full suite + `verify:invariants` + `verify:tripwires` + build green.

### Acceptance criteria
- A synthetic (and, if available, real) vintrace export imports cleanly via the kernel with the two-id-space
  reconciliation correct, PDFs attached as evidence only, and the international boundary clearly flagged.
- `PHASE-7-REPORT.md`.

### Dependencies
**Parked (v2.2)** — do not start until a vintrace design partner is in the pipeline. When un-parked:
**Phase 3** (the kernel) and **Phase 4** (the proven lighthouse) must be merged, and **that partner's own
authorized vintrace exports** available (their data — the clean path; no trial account). Transitively
Phases 1 and 2.

---

## Explicitly OUT of this runbook's scope

These keep their existing roadmap homes and are **not** remediated here (per the user's directive):
- **Granular permissions matrix** (Phase 23 — capability×domain + owner/vineyard scope in RLS). *Note: the
  coarse admin/owner gate on high-risk actions IS in these phases (conventions); the matrix is not.*
- **Offline-first mobile & sync** (Phase 28) — noted as a UX principle (ux-principle 11) but not built.
- **Weight↔volume dual fruit-lot tracking** (Phase 6/30 evaluation).
- **International compliance** (AU WET / NZ excise / CA Winegrower) — partner-gated Phase-14 sub-phase.
- **DSP / distillation / RTD breadth** — explicitly "do NOT chase" (§B.2).
- **Query/report surface over the `LegacyOperation` archive** — display-only here (Decision 4); queryability
  is Phase 27, enabled without re-ingest by the structured, action-ID-keyed schema built in Phase 3.

---

## Post-runbook calibration backlog (reality-dependent — tracked so nothing silently drops)

These are **deferred by design** because they depend on real incumbent data / a real winemaker, which we do
not have during runbook execution (Decision Log #5). They are **not** dropped — each has a trigger:

- **(a) Phase 4 real-file calibration.** Harden the InnoVint adapter's **parse/mapping layer** against real
  bytes — encodings, date/null/locale formats, undocumented columns, tier-gated export availability, export
  UI quirks (see Phase 4 → "REAL-FILE CALIBRATION"). *Trigger:* the first customer-provided InnoVint export
  bundle. *Boundary:* adapter-only; any kernel-contract change escalates (Phase 4 guardrail).
- **(b) Re-run the Phase-3 reference-data readiness audit against a real bundle.** Decision Log #3
  anticipated this — the synthetic audit is a best-effort from the corpus; a real export may reference
  reference entities the synthetic bundle didn't. *Trigger:* the first real bundle. *Boundary:* build only
  the newly-revealed migration-critical reference CRUD.
- **(c) Reconciliation-pack UX iteration with a real winemaker watching.** The pack's contents/ordering/
  trust cues (council 3.3) should be tuned by observing a real operator sign off, not guessed. *Trigger:*
  first pilot walkthrough.
- **(d) Phase 7 (vintrace) in full.** Parked; build per the Phase-7 block. *Trigger:* a vintrace winery in
  the pipeline + that partner's own authorized exports.
- **(e) Any representability escalations parked during Phase 4.** If EARLY-TASK-#2 flagged a shape (e.g., a
  barrel group or lees sub-lot) as accepted-as-inferred/partial rather than resequencing Phase 6, revisit it
  once the ops primitives exist. *Trigger:* Phase 6 merged, or a partner needs that shape faithfully.

---

## Cross-phase completion checklist (every phase)

- [ ] Full `vitest` suite green (ignore the known pre-broken `invariant-drift.test.ts` load error).
- [ ] `npm run build` clean; `npm run lint` clean.
- [ ] `npm run verify:invariants` + `npm run verify:tripwires` green (hard CI gates).
- [ ] All phase-specific `verify:*` guards green; new invariants flipped `planned → guarded` with a real
      `verify:` field (NAMING-2 verify-guarded exactly like LEDGER-10; MIGRATE-1 by `verify:migration`).
- [ ] `verify:tenant-isolation` extended for every new tenant-scoped table (`NamingTemplate`, `LotCodeEvent`,
      `LotIdentifier`, `Bond`, `LegacyOperation`, import-batch/mapping tables).
- [ ] High-risk new actions (import/publish, reverse/LIFO-unwind, bond ops, filing) gated admin/owner.
- [ ] Governed-code edits (`src/lib/{ledger,tenant,cost,compliance,transform,accounting,commerce,auth}`,
      `prisma/schema|migrations`) refreshed the brain per `/ship` if significant.
- [ ] `PHASE-N-REPORT.md` at repo root: what changed vs. this runbook, deferrals, surprises.
- [ ] Landed via PR → CI green → squash-merge → delete branch (no direct pushes to `main`).
