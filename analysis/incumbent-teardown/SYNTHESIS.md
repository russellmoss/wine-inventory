# Incumbent Teardown — SYNTHESIS

> **One unified recommendation set** from the seven-agent teardown of vintrace (feature-deep legacy) and
> InnoVint (modern cloud-native), read against `analysis/CELLARHAND-CURRENT-STATE.md` and the five planning
> docs. Not two parallel reports — the two incumbents are collapsed into a single view: **where they
> converge = table stakes; where they diverge = our design choice (with a pick); where both fail = our
> differentiator.** Per-topic detail + citations live in the sibling files
> (`domain-model.md`, `operations-workflow.md`, `compliance.md`, `configuration-setup.md`, `migration.md`,
> `ux-friction.md`, `identity-naming.md`). Cellarhand state is tagged **[IMPLEMENTED] / [PLANNED] /
> [ABSENT]**. **This document proposes diffs; it does not edit the planning docs** — §B is for review.

---

## Executive summary — the five findings that matter

1. **The append-only correction model is the one durable moat, and it is already shipped.** Both
   incumbents run mutable-state models and *destroy or rewrite history* to fix a mistake — vintrace with
   rollback-&-replay (volume ops un-reversible; complex fixes = a support ticket), InnoVint with a
   delete-and-re-record dependent-action cascade (no undo, 50-action cap, deletes unrecoverable). All seven
   agents independently converged here. Cellarhand's `reverseOperationCore` + LEDGER-10/11 is
   architecturally what VISION says the incumbents "can't retrofit without a rewrite." **Lead with it.**

2. **Our biggest *self-inflicted* gap is identity/naming — we are currently worse than *both* incumbents.**
   Cellarhand already has the hard half neither incumbent has cleanly: a true immutable surrogate `id`
   carrying all lineage, plus first-class split and an anti-false-single-origin blend rule. But `Lot.code`
   is immutable, scheme-hardcoded, and doubles as the unique key — **no rename, no display name, no
   winery-defined template.** InnoVint renames instantly; vintrace has a configurable auto-code engine.
   This is the #1 structural change and it **blocks migration** (we can't adopt a winery's existing codes).

3. **Bond / transfer-in-bond is the biggest compliance + operations gap.** Both incumbents treat multi-bond,
   transfer-in-bond, tax-paid-vs-in-bond, and per-bond/per-AP filing as core. Cellarhand has **no bond
   entity at all** (§A lines 7/15 and §B 3/4/9 are static labels with no writer; implicitly one bond per
   tenant). This blocks the two most valuable migration segments (custom-crush facilities, any >1-bond
   winery) and is a table-stakes miss, not a differentiator.

4. **Two shipped wins to market now:** the **5000.24 excise return + CBMA credit ladder** (neither
   incumbent documents *any* excise engine) and **two-way QuickBooks** (vintrace is one-way price-only;
   InnoVint has none). Plus a hidden one: our **typed, versioned, clone-on-customize work-order templates**
   are strictly more rigorous than either incumbent's.

5. **The table stakes we are missing:** offline-first mobile (InnoVint has it, vintrace has *nothing* — a
   corpus-confirmed zero), a real permission model beyond admin/user (Phase 23), lees sub-lots + barrel
   groups, and self-serve setup of reference data. Plus one factual correction: **InnoVint has a public REST
   API** (`sutter.innovint.us/api/v1/`), contradicting `docs/api-strategy.md`.

---

## A. Convergence / divergence / both-fail map

### A.1 CONVERGENCE — table stakes (both incumbents agree; we must match, not pitch)

| Table stake | vintrace | InnoVint | Cellarhand |
|---|---|---|---|
| Lot/batch as central identity spanning vessels; per-vessel occupancy | Wine Batch | Lot | **[IMPLEMENTED]** (VesselLot fold — cleanest of the three) |
| Work-order → task → recorded-op, auto-log on completion, templates, mobile completion | Job + Job Mgmt console | Work Order + Tasks | **[IMPLEMENTED]** core (+approve/reject); **[PLANNED]** NL/voice, recurring, skip |
| Core cellar op set (rack/transfer/add/top/fine/filter/blend/crush/press/saignée/bottle/loss) | ✔ (many folded into "Treatment") | ✔ (many folded into "Volume Adjustment") | **[IMPLEMENTED]** — mostly first-class typed ops (cleaner compliance mapping) |
| TTB 5120.17 auto-derived from actions, line-level audit backer | ✔ Tax Breakdown + Tax Event Console | ✔ best-in-class TTB Audit CSV | **[IMPLEMENTED]** |
| Tax class + bond as lot attributes feeding the report; **multi-bond + transfer-in-bond** | ✔ deep | ✔ rich B2B taxonomy | **partial** — tax class yes; **bond/transfer-in-bond [ABSENT]** |
| Self-serve additive/treatment + analysis-metric/panel catalogs | ✔ deep | ✔ (rigid) | additive catalog **[IMPLEMENTED]**; analytes/panels **dev-time only** |
| Permission model beyond admin/everyone; owner/client scoping for custom crush | ~50-permission list + owner-logins/AP02 | 4 levels + owner-based-permissions overlay | **[PLANNED]** Phase 23/24 (today admin/user stub) |
| Backdate / closed-period protection | config lock | manual Lock Backdating | **[IMPLEMENTED]** structurally (append-only + LEDGER-11 + auto-Amended) |
| Offline mobile capture | **none** | **offline-first InnoApp** | **[PLANNED]** D25/Phase 28 |
| Lees handling; barrel grouping | lees = code token; Barrel Group + Break Barrel | first-class **lees lots** (6 actions) | **lees [ABSENT]; barrel group [ABSENT]** (barrel *fills* exist in cost DAG) |
| Blend trials as an off-ledger scratchpad | ✔ | ✔ | **[IMPLEMENTED]** (promote → real BLEND op) |

**Read:** we hold the ledger/occupancy/WO/correction/5120.17 table stakes and *exceed* on WO templates and
closed-period protection. We **fail** the multi-bond, offline, lees/barrel-group, per-tenant-metric, and
real-permission table stakes — these are catch-up work, not moats.

### A.2 DIVERGENCE — the incumbents disagree ⇒ our design choice (with a pick)

| Axis | vintrace | InnoVint | **Recommendation for Cellarhand** |
|---|---|---|---|
| **Correction philosophy** | in-place edit + destructive rollback/replay; volume ops un-reversible → support ticket | delete + re-record dependent cascade (≤50, unrecoverable) | **Keep append-only compensating events (already better than both). Finish the last mile:** plain-language "why blocked" + one-click LIFO unwind; give ADJUST/DEPLETE/SEED a real reversal path. |
| **Naming/identity** | configurable **auto-code template engine** (~18 record types) but code = mutable reference key that **rewrites history** on rename | **no template** (free-typed) but code+name freely renameable, **rewriting display history** | **Adopt vintrace's configurable-template posture on our surrogate-id foundation** — make today's hardcoded scheme the *default* template a winery can override; add a renameable `displayName`; **record renames as append-only events that never rewrite history** (beats both). |
| **Tax class** | user-set, **dated**, correctable attribute | user-set, **dated** ("Tax Class Change" action) | **Move off pure ABV-derivation.** Keep ABV as the *suggested default*, but add an explicit, append-only **Change-Of-Tax-Class event** (posts §A 10/24/25) so wineries can intentionally blend across classes and fix premature declarations — the model every migrating operator already has. |
| **Op granularity** | generic "Treatment" + "Product State" workflow engine | one big "Volume Adjustment" + closed action list | **Keep typed ops (cleaner compliance) but add a `CUSTOM` op** for the long tail (both incumbents have one; we don't) and name `DRAIN`/`DELESTAGE`/`COLD_STAB`. |
| **Configurability posture** | deep but **ticket/vendor-gated** | light but **backend/support-gated** setup | **Make "no support ticket to configure anything" an explicit principle** — bonds, vendors, vessel attributes, analysis sources, metrics as tenant-editable tables, not enums/tickets. We already lean this way via RLS tenancy. |
| **Permission model** | flat ~50-toggle list (roles are cosmetic) | clean 4 levels + owner overlay | **Phase 23 = capability×domain matrix with owner/vineyard scope enforced in RLS.** Borrow vintrace's cost/compliance *granularity* (view-cost vs adjust-cost vs close-period) but ship InnoVint's *clean level set* as the default UX. |
| **Integration model** | fixed connector registry, support-provisioned hardware, **one-way** accounting | 8 support-activated partners, per-user PAT, **no QBO** | **Ship the D20 self-serve open API + event-driven adapters** — both incumbents are weak here; we already beat them on two-way QBO + native Commerce7. |

### A.3 BOTH FAIL — our differentiation white space

1. **Clean, auditable, self-service correction of *any* op after downstream work.** The headline. Neither
   store is append-only for volume corrections. *(Corroborates VISION Moat-honesty; every agent flagged it.)*
2. **Native lot split + blend-and-return.** Both fake these with "phantom vessel" round-trips that pollute
   the audit trail with movements the docs admit never happened. We model them truthfully via the lineage
   DAG — but still lack a *one-action* "split a resident lot in place" affordance **[ABSENT]**.
3. **Rename without rewriting history.** vintrace "updates all historical references"; InnoVint changes the
   code "throughout the entire history" and doesn't even log it as an action. Our append-only ledger +
   point-in-time line snapshots + a `LotCodeEvent` can offer a *tamper-evident* rename neither incumbent has.
4. **Automated 5000.24 excise + CBMA ladder** — neither incumbent documents any excise engine; **we ship it.**
5. **A TTB report that cannot drift.** Both publish long "why is my TTB report wrong" troubleshooting genres;
   an append-only fold *cannot* drift the same way. A demonstrable correctness pitch.
6. **Operational-history / ownership-change / work-order-history as a clean, id-keyed export.** Both onboard
   current-state-only and cannot hand a winery its own deep history in event shape — our ledger can *ingest
   what they export and then out-preserve it* (the D20 anti-lock-in wedge).
7. **CBMA controlled-group governance** — neither prevents commonly-owned entities from double-claiming the
   30k-gallon credit; a multi-tenant ERP with an org graph is uniquely able to.
8. **Ownership/bond change as a single atomic event** — vintrace requires a follow-up zero-volume Measurement
   "to lock the bond change" (three overlapping ops, warning dialogs); InnoVint treats owner as an untracked
   tag. An append-only `CHANGE_OWNERSHIP`/`TRANSFER_IN_BOND` op with no ritual is a wedge.

---

## B. Proposed diffs to the planning docs (for review — NOT applied)

### B.1 INVARIANTS.md

**(i) Split the identity clause (currently `INVARIANTS.md:62-63`).** Today it reads that `code`, origin,
and `vintageYear` are "immutable after the first operation." That pins the *label* immutable — the opposite
of the target and worse UX than both incumbents. Proposed replacement:

> **Identity vs. naming (revised).** A lot's identity is its surrogate `id`; **`id` and the point-in-time
> `lotCode`/`vesselCode` snapshots on each `LotOperationLine` are immutable.** Origin (`vineyard/block/
> variety`) and `vintageYear` **provenance** remain immutable after the first operation. The **user-facing
> `code` and `displayName` are a mutable presentation layer** (see NAMING-1/2).

**(ii) New — NAMING-1 (identity is id, never code).**
> Lot identity is `id`. `code`/`displayName` uniqueness is a **per-tenant UX constraint, not an identity
> constraint** — a code collision is a *label* error (offer auto-disambiguation), never a lineage error.
> Nothing in lineage, cost, or the ledger may join on `code`.

**(iii) New — NAMING-2 (honest rename; the moat move). Verify-guarded like LEDGER-10.**
> A lot rename is an **append-only `LotCodeEvent`** (`fromValue`/`toValue`/`actor`/`observedAt`/`commandId`).
> It **never rewrites `LotOperationLine` code snapshots.** Current-state reads resolve `id → current code`;
> historical reads show the code **as-recorded** plus a "renamed → X" affordance. (Unlike vintrace's
> "updates all historical references" and InnoVint's untracked rename.)

**(iv) New compliance invariants** (INVARIANTS.md is today silent on tax/bond/excise — one cost-export
mention only). Ordered by leverage:
- **BOND-1 (bond isolation + symmetric posting).** Every tenant-scoped ledger position belongs to exactly
  one bond; any movement across bonds posts **symmetric Removed-in-Bond / Received-in-Bond** to both bonds'
  reports (§A 7/15, §B 3/9). *(Requires a Bond entity — §B.2.)*
- **TAXCLASS-1 (cross-class blend).** A BLEND/RACK/TOPPING across ≥2 tax classes posts symmetric
  Produced-by / Used-for-blending movements (§A 5/20); the result carries the **destination** lot's class;
  the winemaker is warned.
- **TAXPAID-1 (terminal one-way state).** `REMOVE_TAXPAID` volume cannot re-enter in-bond §A/§B via an
  ordinary compensating reversal; only an explicit, refund-flagged **Taxpaid-Returned-to-Bond** event
  re-admits it. *(Guards against the generic reverser silently corrupting the tax-paid boundary.)*
- **AMEND-1 (amended-chain integrity).** Correcting a FILED period marks **all later FILED reports in that
  form-chain `NEEDS_AMENDMENT`** and regenerates begin-balances down the chain (our carry-forward makes this
  cheap; turns append-only into a *provable* amended-return story vintrace only documents as manual guidance).
- **CBMA-1 (controlled-group).** Tenants in a common controlled group cannot each independently claim the
  full 30k/100k/750k ladder — the credit is apportioned across the group. *(`excise.ts` already parameterizes
  this as "v2"; add the guard when multi-entity tenants appear.)*

### B.2 ROADMAP.md

- **New, pull-forward: "Phase 12.5 / 13-Unit-0 — Identity presentation layer (naming templates + rename)."**
  Currently *unroadmapped* (naming is an "unplanned bonus", `ROADMAP:206`). Scope: `Lot.displayName`;
  per-tenant versioned tokenized `NamingTemplate` (today's `buildLotCode` becomes the default template's
  renderer); `LotCodeEvent`; `sourceSystem`/`legacyCode` external-id columns. **Hard dependency for Phase 13
  migration** (adopt incumbent codes instead of discarding them) and closes the one UX axis where we trail
  both incumbents.
- **Phase 13 (Migration) — sequence + scope.** Add: **InnoVint first** (uniform CSV/XLSX + public PAT API +
  action-id-keyed TTB/Cost Audit CSVs that map ~1:1 to `LotOperationLine`); vintrace second (PDF-locked
  history → API/OCR fallback). Build **one shared spine** (D11 legacy-lot + `sourceSystem`/`sourceId` +
  unit reconciliation + AI column-mapping + chemistry import + coverage-gap tracking) with thin
  per-incumbent adapters (§D). Note the display-name-layer prerequisite explicitly.
- **Phase 14 (Compliance) — add to remaining scope:** a **Bond entity** (registry #, penal sum, premises,
  owner link) + a **`TRANSFER_IN_BOND` op family** + **per-bond report scoping** (one filed 5120.17 per
  bond); a dated, append-only **Change-Of-Tax-Class event**; **tax-paid terminal state** + Returned-to-Bond;
  amended-chain integrity (AMEND-1). Add a **bounded, partner-gated international sub-phase** (AU WET / NZ
  excise / CA Winegrower) — *market-expansion, not a US-launch blocker*; the ledger is jurisdiction-neutral,
  vintrace proves the shape, and a NZ/AU winery literally cannot leave vintrace today.
- **New operations to name (Phase 3-family / 9-family extensions):** `CHANGE_OWNERSHIP` and
  `TRANSFER_IN_BOND` (append-only, no follow-up Measurement ritual — kills vintrace's worst quirk); a
  **one-action in-place lot split**; a **lees sub-lot** primitive (child lot via a lineage edge on a rack);
  a **barrel-group** abstraction (+ break/combine); **recurring work orders** + **first-class task-skip**; a
  **guarded lightweight in-place edit** for trivial no-downstream typos (the incumbents' one real usability
  edge); a generic **`CUSTOM` op** + `DRAIN`/`DELESTAGE`/`COLD_STAB`.
- **Lifecycle writers to finish:** `Lot.status` `DEPLETED`/`ARCHIVED` are declared but **never written**;
  `LotLineage.kind = TRANSFORM` is declared but never produced. Implement a real close/archive lifecycle
  (both incumbents rely on archive-not-delete once activity exists).
- **Weight↔volume dual fruit-lot tracking** (InnoVint's distinctive model) — evaluate as a Phase-6/30
  extension; today fruit intake is `HarvestPick → CRUSH` with **no weight-tracked lot state [ABSENT]**.
- **Do NOT chase** vintrace's DSP/distillation/RTD breadth — off-strategy; keep explicitly out of scope.
- **Fix `docs/api-strategy.md:23`** — it asserts InnoVint has "no public developer REST API"; the corpus
  documents `sutter.innovint.us/api/v1/` with PAT auth (`innovint: support-hours-faqs/general/
  does-innovint-take-product-requests.md`). The anti-lock-in thesis still holds (their APIs are
  extraction/one-way), but the factual claim must be corrected so Phase 13 targets the real API path.

### B.3 DESIGN.md (and `docs/architecture/ux-principles.md`)

DESIGN.md is a **visual** system (tokens/type/color) — the domain-UX findings belong in
`docs/architecture/ux-principles.md` (per CLAUDE.md). Proposed additions **there** (small note in DESIGN.md
only if a surface is added):
- **Self-service correction is a first-class UX.** When LEDGER-11 blocks a correction, the UI must name the
  later op that touched the wine and offer "unwind the chain (LIFO)" in plain language.
- **No support ticket to configure anything.** Bonds, locations, members, vendors, vessel attributes,
  analysis metrics are tenant-editable — gate by *plan* (Phase 17), never by *ticket*.
- **Exports never fail silently.** Server-side generation, synchronous cost folds — "click export → file
  appears" (beats InnoVint's pop-up-blocked silent failures + hour-long rebuild banners). Flag in QA.
- **Offline-first capture** is table stakes, not a nice-to-have (D25/Phase 28).
- **No phantom vessels.** Split/blend-return are real operations, never fake round-trips.

---

## C. Mistakes from either incumbent our architecture must not repeat

1. **Mutable state that forces destructive corrections.** The root cause of *both* incumbents' #1 pain
   (rollback cascade / delete-and-re-record). Our append-only ledger already avoids it — **never add an
   in-place mutate/delete path to the ledger** to chase a usability shortcut; solve typos with a *guarded*
   edit that still appends, or a compensating event.
2. **Fusing identity with the human label.** Both let the code *be* the join key, so a rename rewrites
   history (vintrace) or is untracked (InnoVint). Keep identity on `id`; renames are events (NAMING-1/2).
3. **"Delete and start over" as a correction.** InnoVint's fruit-lot composition is frozen → delete the lot;
   its "catch up after a break" advice is Volume-Adjust-to-0-then-recreate. An immutable ledger must offer
   clean re-composition without data loss — never make the user destroy a lot to fix it.
4. **Support-ticket-gated setup.** InnoVint gates bonds/locations/users/vendors/analysis-sources/weigh-tag-
   numbers behind support; vintrace gates seats/logo/daily-workflow features. Every "reach out to us" is a
   friction wound. Ship reference data as tenant-editable tables from day one.
5. **Default-off capability + pilot-gating.** vintrace's "available but not enabled by default — contact
   support" recurs 20+ times. Ship features on; gate by subscription *plan*, transparently.
6. **Rename that erases its own audit trail** (InnoVint doesn't log code changes as actions). A compliance
   liability — our rename must be an event.
7. **Hard caps and silent failures:** InnoVint's 50-dependent-action edit ceiling, 430-day edit horizon,
   ±1-minute date windows, pop-up-blocked exports failing invisibly, hour-long cost-rebuild banners. Avoid
   arbitrary caps; make long operations synchronous-or-observably-async, never silently failing.
8. **Permanently-locked config** (InnoVint additive units lock forever → users hack `0.0001` fake rates;
   immutable analysis panels → delete-and-recreate). Config must be editable or versioned, never a trap.
9. **Unlinked internal modules** (InnoVint MAKE↔SUPPLY: "there is not a linkage" → the bulk↔case-goods join
   must be rebuilt). Keep bulk and finished-goods on one lineage spine (we do — `BottlingSource.lotId`).
10. **Paywalling basic structured metadata** (InnoVint MAKE-Plus "Custom Lot Attributes" is the pay-tier
    answer to "let me add my own fields"). Custom fields / naming templates should be free and first-class.
11. **Overfill allowed by default** (vintrace: guardrail is opt-in + admin-only). We enforce capacity at the
    ledger write (D14) — keep it a hard, always-on constraint, not a toggle.
12. **Bond change as a fragile multi-op ritual** (vintrace's zero-volume Measurement "to lock the bond";
    three overlapping ops). Model ownership/bond change as **one atomic append-only op**.

---

## D. Prioritized migration-path strategy (vintrace → Cellarhand AND InnoVint → Cellarhand)

**Guiding facts (from `migration.md`):** both incumbents onboard **current-state-only** (validating D11 "no
fake history"); both separate a **stable id** from a **mutable human label** internally — the exact identity
model we should adopt and the *opposite* of Cellarhand today. Neither can export **operational history /
work-order history / ownership-change timeline** as a clean, id-keyed, event-shaped feed — that gap is our
anti-lock-in wedge (D20).

### D.0 Prerequisites (build before any connector)
1. **Ship the identity presentation layer (§B.2 Phase 12.5).** `displayName` + `NamingTemplate` +
   `LotCodeEvent` + `sourceSystem`/`sourceId`/`legacyCode`. **Without this, migration must discard or mangle
   a winery's existing codes** (today's `recode-legacy-lots.ts` behavior) — the #1 recognition/adoption
   killer. This is the single most important cross-agent finding.
2. **Add the Bond entity + transfer-in-bond (§B.2 Phase 14).** A migrating multi-bond or custom-crush winery
   *has* this history; without an op to receive it, the ledger cannot represent their real book.

### D.1 Shared spine (build once, both incumbents)
- **D11 legacy-lot pattern** — wrap current-state per lot/vessel as an `isLegacy` Lot seeded at current
  volume via `SEED`, source record as a JSON snapshot; extend it to accept an external file, not just our
  own `vessel_component` table.
- **`sourceSystem` + `sourceId`/`legacyCode`** external-id columns — same shape whether the key is a vintrace
  **VINx2 ID** or an InnoVint **URL-embedded lot id / action id**; makes re-imports idempotent.
- **Adopt incumbent codes verbatim** as `code` (auto-disambiguate on per-tenant collision) + `displayName`
  (InnoVint Lot Name if present); **no forced rename** — the template governs only newly-minted lots going
  forward.
- **Unit reconciliation** (gal / lbs·tons / °Brix → canonical liters, D8); **AI-assisted CSV/XLSX
  column-mapping**; **chemistry import** (both round-trip analyses keyed on lot/vessel code);
  **coverage-gap tracking** (snapshot the unmapped, label inferred/partial, never silent-drop).
- **Ingest operational history as `captureMethod:"IMPORT"` ledger events** wherever a stable event key
  exists — historical events, never fabricated live ops (honors D11).

### D.2 InnoVint connector — the lighthouse (build first)
Lowest-friction, highest-fidelity: uniform Export button (CSV/XLSX) + a **public PAT API**
(`sutter.innovint.us/api/v1/`). Specifics:
- **Operational history:** the **TTB Audit + Cost Audit CSVs** carry signed, per-lot, per-action rows with a
  **stable action ID** — near-isomorphic to `LotOperation`/`LotOperationLine`. Primary ingest path.
- **Backfill** sweetening / concentrate-to-wine / tax-class moves from the **Winery Activity Feed** (the
  audit CSV omits them).
- **Lineage:** the **Lot Components** export is the documented round-trip composition path.
- Handle: **URL-parsing** to recover the stable lot id; **MAKE↔SUPPLY re-join** (SKU code ≠ case-good lot
  code — no native linkage); **MAKE-PLUS/Costing add-on gating** (some exports won't exist on lower tiers →
  reconstruct); **31-day analysis-window chunking**; **Chrome/pop-up export fragility** (affects the
  customer's ability to self-serve the files).

### D.3 vintrace connector — the harder second target
- **Prefer the REST API + OpenAPI** for id-stable operational data; the machine-readable report (Operation
  Throughput) keys on the **mutable batch code**, and the true surrogate **VINx2 ID** appears only in
  setup/reference CSVs.
- **PDF-only surfaces** (Stock Summary, Stock Cost Detail — the deepest history) → OCR/snapshot fallback
  (reuse the D22 ambient-capture seam) or API.
- Handle: **1000-row/file chunking**; **batch-code cascade awareness** (a code in an old report may have
  been rewritten in place); the **VINx2-ID ↔ batch-code** two-id-space reconciliation.

### D.4 Honest boundaries (both)
- **Snapshot, don't fabricate:** where lineage / ownership-timeline / work-order-history isn't cleanly
  exportable (both fail here), store the source blob as a JSON snapshot labeled inferred/partial — never
  invent edges (D11).
- **Self-serve extraction UX:** give the winery a per-incumbent checklist of exactly which exports/API calls
  to run, in what order, respecting each tool's caps (vintrace 1000-row; InnoVint 200-row SUPPLY / 31-day
  analyses / admin-permission + Chrome/pop-ups).
- **International:** a NZ/AU winery on vintrace cannot be fully migrated until the international compliance
  sub-phase (§B.2) exists — flag as a known boundary, sequence on a real AU/NZ partner.

### D.5 Sequenced rollout
1. Ship identity presentation layer + `sourceSystem`/`sourceId` (D.0).
2. Bond entity + transfer-in-bond (D.0).
3. Shared migration spine (D.1).
4. **InnoVint lighthouse connector** (D.2) — prove one full migration.
5. vintrace connector (D.3).
6. International compliance sub-phase (only when an AU/NZ design partner appears).

---

## Appendix — where each claim is grounded

Per-topic detail and every `vintrace:` / `innovint:` article citation live in the sibling teardown files;
Cellarhand code/line citations live in `analysis/CELLARHAND-CURRENT-STATE.md`:
- Identity/naming, `NamingTemplate`/`LotCodeEvent` design → `identity-naming.md`
- Bond, tax class, excise, 11 uncovered edge cases → `compliance.md`
- Correction model, operation-coverage matrix, WO engines → `operations-workflow.md`
- Entity mapping, lees/barrel-group/ownership → `domain-model.md`
- Permissions, catalogs, self-serve posture, hardcode-wounds → `configuration-setup.md`
- Extraction surfaces, feasibility maps, API correction → `migration.md`
- Friction profiles, offline gap, release-note design-wounds → `ux-friction.md`
