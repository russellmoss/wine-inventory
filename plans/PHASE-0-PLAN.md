# PHASE 0 — Governance & documentation — Execution Plan

- **Date:** 2026-07-06
- **Source runbook:** `FIX_RUNBOOK.md` v2.2 → PHASE 0 block (lines 221-341), Decision Log #1-5, Build posture, "Reviewer's modifications" 1-3, Conventions.
- **Grounding:** `analysis/incumbent-teardown/SYNTHESIS.md` §B.1/§B.2/§B.3; `fix-council-feedback.md` §3.1/§3.4/§3.5/§3.7/§3.12 + §6 checklist + §7 decisions.
- **Posture:** **DOCS-ONLY.** No `src/`, no `prisma/`, no `scripts/`, no schema, no new guard code. Every new invariant lands as a *narrative + `status: planned` register note with NO `verify:` field* (guard-sequencing rule, reviewer mod 1). The enforcing guards land in later phases (Phase 1 for NAMING-1/2, Phase 2 for BOND/TAXCLASS/TAXPAID/AMEND, Phase 3 for MIGRATE-1).
- **Plan file location:** `plans/PHASE-0-PLAN.md` (repo root `plans/`, per the user's explicit instruction — deviates from the `/plan` skill default of `docs/plans/`; noted, not a conflict).

---

## Problem Frame

The seven-agent incumbent teardown produced reviewed decisions (SYNTHESIS §B, adjudicated in `fix-council-feedback.md`) that the governing docs do not yet reflect. Until they do, every later remediation phase (identity layer, bond model, migration kernel, adapters) has no written contract to build against, and the docs still describe the immutable `Lot.code` as identity — the exact anti-pattern Phase 1 exists to kill. Phase 0 encodes those decisions into `INVARIANTS.md`, the invariant register, `ROADMAP.md`, `ux-principles.md`, and `api-strategy.md`, repairs dangling doc references, and (optionally) records the two largest decisions as ADRs — **keeping the docs ahead of the code** while staying green (`verify:invariants` + `verify:tripwires`).

**Why this is the right problem / cost of doing nothing:** skipping it means each later phase re-derives the same decisions ad hoc, the invariant register drifts from reality, and the CI guard-sequencing contract (planned-note-now, guard-later) is never established — so Phase 1 either reds the gate (adds a `verify:` before the guard exists) or ships an unregistered invariant. This is the root of the dependency graph; nothing else can be trusted without it.

**Self-size:** Standard-depth **docs** plan. Not a code feature, so the `/plan` codebase-research fan-out was intentionally skipped — all primary sources were read directly for exact-edit tracing (higher fidelity than agent summaries). One session, doc-editing only.

---

## Scope Boundaries

**IN scope (files touched):**
- `INVARIANTS.md` (narrative)
- `docs/architecture/invariants/*.md` (8 new register notes; possibly `README.md` coverage snapshot — see Open Questions)
- `ROADMAP.md`
- `VISION.md` (dangling refs only)
- `docs/architecture/ux-principles.md`
- `docs/api-strategy.md`
- `docs/architecture/decisions/*.md` (optional ADRs 0002/0003 — see Open Questions)
- `PHASE-0-REPORT.md` (repo root, written at end)
- `plans/PHASE-0-PLAN.md` (this file)

**OUT of scope (hard guardrails, from runbook §"Out-of-scope guardrails"):**
- **No code, no schema, no `prisma/`, no `scripts/`, no `src/`.** If a change tempts a code edit, it belongs in a later phase — note it, don't do it.
- **No `verify:` field on any new register note** (would red the CI gate — reviewer mod 1).
- **Do not renumber existing ROADMAP phases or delete VISION `D*` numbering.** *Insert* Phase 12.5; rescope 13/14 in place.
- **Do not touch `DESIGN.md`** except (at most) a one-line pointer if a new surface is implied (§B.3 keeps domain-UX in `ux-principles.md`). Recommendation: no `DESIGN.md` edit (see Open Questions Q4).
- Do not resolve runbook↔doc conflicts silently — surface them in Open Questions.

---

## Implementation Units

Units are grouped by file. Ordering: I1 (INVARIANTS narrative) → U2 (register notes, must match I1) → the roadmap/ux/api edits (independent) → optional ADRs → self-consistency + report. Within `/work`, U1 and U2 are the tightly-coupled pair (narrative ↔ machine-readable mirror must agree per acceptance criteria).

---

### Unit 1 — `INVARIANTS.md` narrative: split identity clause + add 8 invariants

**Goal:** Rewrite the identity clause and add the naming + compliance/migration invariants in narrative form.
**Files:** `INVARIANTS.md`
**Traces to:** SYNTHESIS §B.1(i)(ii)(iii)(iv); council §3.5/§3.7/§3.1; runbook PHASE-0 scope item 1.

**Exact changes:**

**1a — Split the identity/provenance clause (current `INVARIANTS.md:61-66`, the `## Identity & provenance` section).**
Replace the provenance bullet (currently: *"Lot identity excludes vintage (D3)… Lot provenance metadata (`code`, origin, `vintageYear`) is immutable after the first operation."*) with the §B.1(i) split, refined per Decision 2:
- A lot's identity is its surrogate **`id`** — the **ONLY** opaque identity.
- `id` **and** the point-in-time `lotCode`/`vesselCode` **line snapshots** on each `LotOperationLine` are **immutable**.
- Origin (`vineyard/block/variety`) and `vintageYear` **provenance** remain immutable after the first operation. (Keep the existing "Lot identity excludes vintage (D3); vintage is an attribute.")
- The user-facing **`code` is a mutable, unique-per-tenant human label**; **`displayName` is a mutable, NON-unique free-text label** — together the **mutable presentation layer** (forward-ref **NAMING-1/2**).
- State explicitly: **an opaque system slug is NOT used** — the surrogate `id` already provides the opaque stable key (Decision 2; council 3.7 rejects Gemini's opaque-slug alternative permanently).
- Preserve the existing monotonic-`sequence` bullet (lines 64-66) unchanged.

**1b — Add NAMING-1 and NAMING-2** (new subsection, e.g. `## Naming & identity presentation`, placed right after `## Identity & provenance`):
- **NAMING-1** (§B.1(ii) + council 3.7): identity is `id`, never `code`; **`code` uniqueness is a per-tenant UX constraint** (not an identity constraint), **`displayName` has no uniqueness constraint**; a code collision is a **label error the system OFFERS to auto-disambiguate — it does not silently apply** disambiguation; **silent auto-disambiguation is reserved for newly generated post-go-live codes only**; nothing in lineage/cost/ledger joins on `code`.
- **NAMING-2** (§B.1(iii)): a rename is an **append-only `LotCodeEvent`** (`fromValue`/`toValue`/`actor`/`observedAt`/`commandId`) that **never rewrites `LotOperationLine` snapshots**; current-state reads resolve `id → current code/displayName`, historical reads show **as-recorded** + a "renamed → X / also-known-as" affordance. **(council/Gemini sharpening)** State the read-routing rule explicitly so the Phase-1 implementer cannot build `WHERE lotCode = ?`: **all user-facing filtering/lookup by a human `code` MUST resolve to the surrogate `id` first, then read history by `id`** — never join on the mutable `code`. Phrase the guard status in **future tense** so it doesn't read as already-enforced: **"Will be verify-guarded like LEDGER-10 — guard `verify:naming` lands in Phase 1; currently `status: planned`."**

**1c — Add a `## Compliance & migration invariants` section** (see Open Questions Q3 for the heading choice; runbook literally says "Compliance invariants" but lists MIGRATE-1 among the members). Members:
- **BOND-1** (council 3.5, restated): every tenant-scoped ledger position belongs to exactly one bond; **bond affiliation is posted at the operation/line level and is time-aware** (movement carries source + destination bond); **any lot-level "home bond" is a projection only, never the compliance source of truth** — mirrors the point-in-time `deriveTaxClass()` pattern; a cross-bond movement posts **symmetric Removed-in-Bond / Received-in-Bond** to both bonds' reports (§A 7/15, §B 3/9). **(council/Gemini sharpening)** State that the symmetric pair is posted **atomically within a single ledger transaction** (composes into one `runLedgerWrite`, per the runbook's `…Tx` convention) — never two separate writes — so a partial post is impossible.
- **TAXCLASS-1** (§B.1(iv)): a cross-class blend/rack/topping posts **symmetric Produced-by / Used-for-blending** (atomic, single tx); the result carries the **destination (receiving) lot's** tax class; the winemaker is warned when sources cross classes. **(council/Gemini note)** The rule fixes the *class carried* = the receiving lot's class; the mechanism for assigning a class to a brand-new blend lot (and whether the winemaker must confirm) is a **Phase-2 `/plan` design detail** — do NOT invent a "highest class wins" rule here (would fabricate policy the runbook didn't set).
- **TAXPAID-1** (§B.1(iv)): taxpaid is a **terminal one-way state**; only a **refund-flagged Return-to-Bond** re-admits (guards the generic reverser against corrupting the taxpaid boundary).
- **AMEND-1** (§B.1(iv)): correcting a **FILED** period cascades `NEEDS_AMENDMENT` down the **form+bond** chain and regenerates begin-balances (carry-forward makes this cheap). **(council/Gemini flag — Phase 2)** Whether the begin-balance regeneration runs **synchronously or as a queued job with a `NEEDS_CALCULATION` lock** at scale (amending Jan in Dec = 11 periods) is a **Phase-2 `/plan` design decision**, recorded here as an open impl question — the Phase-0 invariant states only the *rule*, not the mechanism.
- **CBMA-1** (§B.1(iv), reviewer mod 3): **flagged deferred** — controlled-group ladder apportionment; `excise.ts:66-74` already parameterized "v2"; **activate when multi-entity tenants appear**. No code in any phase here.
- **MIGRATE-1** (council 3.1 — two-track model): **exactly one migration `SEED` per lot/vessel participates in the fold** (cutover balances); **legacy operational history is ingested ONLY into the read-only archive and is NEVER folded**; **an import cannot publish to the live tenant while any reconciliation delta remains unresolved.** **(council/Gemini sharpening)** "Unresolved" is the runbook's named-exception model, not a numeric tolerance: a delta is *resolved* when reconciled to zero **or** explicitly accepted by the operator as a **named exception** in the reconciliation pack — do NOT bake a "strictly non-zero volume" threshold (that contradicts the runbook's named-exception acceptance). Phrase in **future tense**: **"Will be verify-guarded — guard `verify:migration` lands in Phase 3; currently `status: planned`."** Operationalizes **D11** (no fabricated ledger history).

**Approach:** Edit-in-place, preserving surrounding sections and the `[!info]` machine-readable-mirror callout at the top. Match the file's existing bullet/heading style. **(design-review D2 — section placement for IA coherence):** put `## Naming & identity presentation` **immediately after** the existing `## Identity & provenance` section (identity → its presentation layer reads in order); add `## Compliance & migration invariants` as a **new top-level domain section** placed after the existing `## Work orders` block (it's a new domain, mirroring how cost/work-orders are their own sections). Keep heading depth (`##`) consistent with siblings.
**Depends on:** none.
**Verification:** manual read for internal consistency; grep (see Unit 8) confirms no remaining "immutable `Lot.code` as identity" phrasing.

---

### Unit 2 — 8 invariant register notes (machine-readable mirror)

**Goal:** Create the typed register notes mirroring Unit 1, all unguarded so `verify:invariants` stays green.
**Files (new):**
- `docs/architecture/invariants/NAMING-1-identity-is-id.md`
- `docs/architecture/invariants/NAMING-2-honest-rename.md`
- `docs/architecture/invariants/BOND-1-bond-isolation.md`
- `docs/architecture/invariants/TAXCLASS-1-cross-class-blend.md`
- `docs/architecture/invariants/TAXPAID-1-terminal-state.md`
- `docs/architecture/invariants/AMEND-1-amended-chain.md`
- `docs/architecture/invariants/CBMA-1-controlled-group.md`
- `docs/architecture/invariants/MIGRATE-1-seed-not-replay.md`
**Traces to:** runbook PHASE-0 scope item 2; template = `docs/architecture/invariants/LEDGER-10-immutable-operations.md`.

**Frontmatter shape** (per `LEDGER-10`, with `status` added and `verify` OMITTED):
```yaml
---
id: <NAMING-1|…>
group: <naming|compliance|migration>
severity: <critical|high>
enforcedBy: app-code        # intended enforcer; checker ignores this field
decision: "<source>"        # e.g. "Decision 2 / council 3.7"
status: planned             # deferred for CBMA-1
appliesTo:
  - <governed path(s)>
tags:
  - invariant
---
```
**CRITICAL:** **no `verify:` line.** The checker (`scripts/verify-invariant-guards.mjs:50`, `if (!fm.id || !fm.verify) continue;`) skips any note without `verify:`, so these stay green and unguarded. The checker does **not** read `status` — `status:` is purely for the dashboard/humans.

**Per-note specifics:**

| id | group | severity | status | decision | appliesTo (intended) | body note |
|----|-------|----------|--------|----------|----------------------|-----------|
| NAMING-1 | naming | critical | planned | "Decision 2 / council 3.7 / §B.1(ii)" | `src/lib/lot/` | guard lands Phase 1 (`verify:naming`) |
| NAMING-2 | naming | critical | planned | "§B.1(iii) / council 3.7" | `src/lib/lot/`, `src/lib/ledger/` | **"verify-guarded like LEDGER-10; guard `verify:naming` lands in Phase 1."** |
| BOND-1 | compliance | critical | planned | "council 3.5 / §B.1(iv)" | `src/lib/compliance/`, `src/lib/ledger/` | guard `verify:bond` lands Phase 2 |
| TAXCLASS-1 | compliance | critical | planned | "§B.1(iv)" | `src/lib/compliance/`, `src/lib/transform/` | guard lands Phase 2 (`verify:taxclass`/folded into `verify:ttb`) |
| TAXPAID-1 | compliance | critical | planned | "§B.1(iv)" | `src/lib/compliance/`, `src/lib/ledger/` | guard lands Phase 2 (`verify:taxpaid`/`verify:excise`) |
| AMEND-1 | compliance | critical | planned | "§B.1(iv)" | `src/lib/compliance/` | guard lands Phase 2 (extends `verify:ttb`/`verify:excise`) |
| CBMA-1 | compliance | high | **deferred** | "§B.1(iv) / reviewer mod 3" | `src/lib/compliance/` | **deferred — activate when multi-entity tenants appear; `excise.ts` already "v2"-parameterized** |
| MIGRATE-1 | migration | critical | planned | "council 3.1 / Decision 4 / D11" | *(see note)* | **"verify-guarded; guard `verify:migration` lands in Phase 3. Operationalizes D11."** |

> **Eng-review adjustment (MIGRATE-1 `appliesTo`):** do NOT point MIGRATE-1 at `src/lib/ledger/` — the PreToolUse brain-context hook would then inject a not-yet-enforced migration rule on *every* ledger edit (noise). The migration lib does not exist yet, so use a **future/most-specific path** that best matches where the guard will live (e.g. `scripts/migrate-legacy-lots.ts` + a placeholder `src/lib/migration/` if `/plan`-for-Phase-3 confirms that dir). The hook simply won't match until that path exists — which is the correct behavior for a planned invariant. Confirm the target path in the Phase-3 `/plan`; for Phase 0, point it at the closest existing anchor (`scripts/migrate-legacy-lots.ts`) rather than the broad ledger dir.

> **Eng-review adjustment (group consistency):** `compliance` is the confirmed existing group value (`COMPLIANCE-1` uses it). `naming` and `migration` are new group values — acceptable (each domain gets its own group), but `/work` must read one existing note per family before authoring to match the exact frontmatter *shape* (field order, quoting) so the new notes are byte-consistent with the register.

**Body shape** (per `LEDGER-10`): a `> [!danger]`/`> [!warning]` one-line invariant statement, then "Guarded by:" (state *planned*, not a real guard), "Decision:" line, "Applies to:", and the standard closing paragraph cross-linking `[[INVARIANTS]]`. Each note body must cross-link `[[INVARIANTS]]`.

**Approach:** Copy `LEDGER-10`'s structure verbatim, swap fields, delete the `verify:` line, add `status:`. IDs/severity/decision must match the Unit-1 narrative exactly (acceptance criterion).
**Depends on:** Unit 1 (narrative is the source of truth these mirror).
**Verification:** `npm run verify:invariants` green (8 new notes skipped as unguarded, no existing guard regressed); manual cross-check that all 8 ids/severities/decisions match Unit 1.

---

### Unit 2b — Register-consistency: README snapshot + note template *(council-added, now mandatory)*

**Goal:** Stop the register from lying about itself the moment 8 unguarded notes land, and stop a future contributor from "fixing" a planned note back to `verify:` (which would red CI early). **Both councils flagged this as the main residual governance hole.**
**Files:** `docs/architecture/invariants/README.md`, `docs/_templates/invariant.md`
**Traces to:** council (Codex CRIT-1 + Gemini CRIT-1); Open Question Q2 (promoted from optional → mandatory).

**Exact changes:**
- **`README.md` coverage snapshot** — currently *"18 invariants … all guarded (100%)"* is doubly wrong: there are already **21** guarded notes (pre-existing drift), and Phase 0 adds 8 unguarded. Replace the fake percentage with **status counts, not a percentage**: e.g. *"29 total invariants: 21 guarded, 7 planned, 1 deferred. Planned/deferred notes intentionally omit `verify:` until their enforcing guard ships (Phases 1-3) — `verify:invariants` skips them by design."* (Codex SHOULD-2: don't publish another 100% figure.)
- **`README.md` "Adding an invariant" tip** — it currently says *"Set `verify:` to the guard that proves it… Run `verify:invariants` to confirm it's covered."* Add one sentence: **a `planned`/`deferred` invariant OMITS `verify:` entirely until its guard exists; add the `verify:` field only when you flip `status: guarded`.**
- **`docs/_templates/invariant.md`** — the template hardcodes `verify: "npm run verify:"` and `status: guarded`, silently teaching "every invariant is guarded." Add a short frontmatter comment (or an alternate stanza) documenting the guard-sequencing rule: **for a `planned`/`deferred` invariant, delete the `verify:` line and set `status:` accordingly; add `verify:` only at `guarded`.** Keep the default stanza guarded (most invariants are).

**Approach:** minimal prose edits; no code. This closes Codex's "contributors will fix planned notes back toward `verify:` and red CI" residual risk.
**Depends on:** none (independent of the note bodies).
**Verification:** `verify:invariants` still green; README status counts match the actual register after Unit 2.

---

### Unit 3 — `ROADMAP.md`: insert Phase 12.5 + rescope 13/14 + additions + debt + do-not-chase

**Goal:** Encode the roadmap consequences of the teardown without renumbering existing phases.
**Files:** `ROADMAP.md`
**Traces to:** SYNTHESIS §B.2; council 3.1/3.2/3.3/3.4; runbook PHASE-0 scope item 3.

**Exact changes:**

**3a — Insert "Phase 12.5 — Identity presentation layer (naming templates + rename)"** between the end of Phase 12 (`ROADMAP.md:680…`) and the "Competitive / GTM layer" header (`:727`). Scope per §B.2 + council 3.4:
- `Lot.displayName` (**non-unique**);
- per-tenant **versioned tokenized `NamingTemplate`** (today's `buildLotCode` becomes the default template's renderer);
- append-only `LotCodeEvent`;
- **a `LotIdentifier` external-reference table (NOT three scalar columns)** — replaces the discarded `sourceSystem`/`sourceId`/`legacyCode` scalar model;
- cross-identifier search into every lot picker.
Mark it a **hard dependency for migration**.

**3b — Update the line-206 "Unplanned bonus" note** (`## Phase 2` blockquote, `ROADMAP.md:204-206`) to point to the new Phase 12.5 (naming is now roadmapped, no longer an "unplanned bonus").

**3c — Rescope Phase 13 (Migration)** (`ROADMAP.md:745-769`) per §B.2 + council 3.1/3.2/3.3:
- InnoVint-first; a shared **migration kernel** + thin per-incumbent adapters;
- the **two-track model** (one migration SEED for balances into the fold; legacy history into a **read-only, structured, action-ID-keyed archive** stitched onto the timeline, **never folded**);
- a **reconciliation pack + draft-until-sign-off** with a publish-block;
- **deterministic saved mappings (AI suggest-only)**;
- explicit **identity-layer (Phase 12.5) + bond-model (Phase 14) prerequisites**. **(council/Gemini SHOULD-3)** Add a literal **`Depends on: Phase 12.5 (LotIdentifier/NamingTemplate schema) + Phase 14 (Bond)`** line to the Phase 13 heading — chronological order in a markdown file is not a contract; state the dependency explicitly.
- **Correct the two stale clauses in place:** line 760-761 ("External identifiers (`sourceSystem` + `sourceId`/`legacyCode`)") → `LotIdentifier` table; lines 758-759 ("source record as a JSON snapshot") → structured, typed, action-ID-keyed archive per Decision 4 (not an opaque JSON blob).

**3d — Rescope Phase 14 (Compliance) remaining scope** (`ROADMAP.md:771…`): add Bond entity (line-scoped, time-aware), `TRANSFER_IN_BOND` op family, per-bond report scoping, dated append-only Change-Of-Tax-Class event, tax-paid terminal state + Returned-to-Bond, AMEND-1; add the **bounded, partner-gated international sub-phase** (AU WET / NZ excise / CA Winegrower) as **market-expansion, not a US-launch blocker**.

**3e — Add the "new operations to name" list** (§B.2): `CHANGE_OWNERSHIP`, `TRANSFER_IN_BOND`, one-action in-place split, lees sub-lot, barrel-group (+ break/combine), recurring WOs + task-skip, guarded metadata edit + reverse-and-rebook composite, generic `CUSTOM` op + `DRAIN`/`DELESTAGE`/`COLD_STAB`.

**3f — Add the "lifecycle writers to finish" debt:** `Lot.status` `DEPLETED`/`ARCHIVED` and `LotLineage.kind=TRANSFORM` are declared-but-never-written.

**3g — Add the "do NOT chase" note:** vintrace's DSP/distillation/RTD breadth is explicitly out of scope.

**3h — Weight↔volume dual fruit-lot tracking** noted as a Phase-6/30 evaluation (kept in its roadmap home; add if not already present).

**Placement of 3e/3f/3g/3h — REVISED per council (Codex "consolidated for audit" vs Gemini "distributed where the implementer looks" split):** adopt a **hybrid**. Put each item **in its owning phase family** where the implementer will actually look (§B.2's framing): the new-ops list into the Phase 14/Phase 9 rescope context; the lifecycle-writer debt near its phase (the ROADMAP already references it around Phase 2/8 lifecycle); "do NOT chase" as a scope note on the migration/compliance phases; weight↔volume stays in its Phase-6/30 home. **Then add a short "Remediation additions (FIX_RUNBOOK)" index block** (a bulleted list of one-line pointers → the phase where each lives) so the teardown decisions remain auditable together (Codex's concern) without a rot-prone parallel spec (Gemini's concern). See Open Questions Q7.

**Approach:** Insertions + in-place rescopes; **no phase renumbering**. Preserve the existing "Build-order priority overrides phase numbers" framing.
**Depends on:** none (independent of U1/U2, but should agree with the invariants).
**Verification:** manual read; grep confirms Phase 12.5 present, no existing phase renumbered.

---

### Unit 4 — Dangling-reference repairs (`ROADMAP.md` + `VISION.md`)

**Goal:** Redirect all references to the two non-existent docs to `analysis/incumbent-teardown/`.
**Files:** `ROADMAP.md`, `VISION.md`
**Traces to:** reviewer mod 2; runbook PHASE-0 scope item 6; acceptance criterion "Dangling references resolved."

**Confirmed absent:** `docs/STRATEGY.md` and `docs/competitive-analysis-vintrace-innovint.md` (verified — neither exists; `CELLARHAND-CURRENT-STATE.md:13`).

**Occurrences found (grep):**
- `ROADMAP.md`: **line 75** (`docs/STRATEGY.md`), **line 730** (`docs/STRATEGY.md`), **line 731** (`docs/competitive-analysis-vintrace-innovint.md`), **line 754** (`docs/competitive-analysis-vintrace-innovint.md`), **line 1508** (both).
- `VISION.md`: **lines 320-321** (both).

**DISCREPANCY (flagged, not silently resolved):** the runbook names only `ROADMAP.md:730-731,754`, but there are **5** occurrences in ROADMAP (also 75 and 1508). See Open Questions Q1. **Recommended:** repair **all** occurrences (acceptance criterion says "no dangling references remain anywhere"), redirecting each to `analysis/incumbent-teardown/` (SYNTHESIS.md as the competitive analysis; a one-line pointer where a full rewrite is out of scope).

**Approach:** replace each `docs/STRATEGY.md` / `docs/competitive-analysis-vintrace-innovint.md` mention with a pointer to `analysis/incumbent-teardown/SYNTHESIS.md` (the teardown *is* the competitive analysis). Keep surrounding prose intact; where a sentence's meaning depends on a "strategy doc," reword to a one-line pointer.
**Depends on:** none.
**Verification:** repo-wide grep for both filenames returns no live references in `ROADMAP.md`/`VISION.md` (Unit 8).

---

### Unit 5 — `docs/architecture/ux-principles.md`: add rules 8-12

**Goal:** Add the five checkable domain-UX rules from §B.3.
**Files:** `docs/architecture/ux-principles.md`
**Traces to:** SYNTHESIS §B.3; runbook PHASE-0 scope item 4.

**Exact changes:** insert numbered rules **8-12** after rule 7 (`:42`), before the `TEMPLATE` comment (`:44`), matching the existing `### N. <title>` + one-line checkable-rule format:
- **8. Self-service correction is first-class UX** — a LEDGER-11 block names the later op that touched the wine and offers **one-click LIFO unwind** in plain language.
- **9. No support ticket to configure anything** — bonds, locations, members, vendors, vessel attributes, analysis metrics are tenant-editable; gate by **plan** (Phase 17), never by **ticket**.
- **10. Exports never fail silently** — server-side generation, synchronous folds; "click export → file appears." (Flag in QA.)
- **11. Offline-first capture is table stakes** — not a nice-to-have (D25/Phase 28). **(design-review D1)** This capability is **not built yet (Phase 28)**, so unlike rules 1-10 it is not pass/fail-checkable on a *current* screen. Word it so `/design-review` does not grade today's screens against an unbuilt feature and emit false failures — EITHER tag it explicitly **"(forward principle — Phase 28; not yet enforceable)"**, OR phrase it as a checkable graceful-degradation rule ("a capture flow must not hard-fail without a live connection; it queues and syncs"). Recommend the explicit forward-principle tag (the runbook §B.3 lists it as table-stakes-but-Phase-28).
- **12. No phantom vessels** — split/blend-return are **real operations**, never fake round-trips.

**(design-review D3 — scope guard):** do NOT add a 13th+ rule. §B.3 fixes exactly these five (8-12). The NAMING-2 "renamed →/also-known-as" affordance and cross-identifier search are **already** captured in the invariants (Unit 1) + runbook Phase-1 scope and are specializations of the existing **rule 4** (state visible + trustworthy); adding them as new ux-principles would exceed the runbook's Phase-0 scope. Flag them in `PHASE-0-REPORT.md` for the **Phase-1 `/plan`** to treat as concrete UI deliverables.

**Approach:** append within the "Checkable rules" section; keep the north-star + template comment intact.
**Depends on:** none.
**Verification:** manual read; rules 8-12 present and numbered.

---

### Unit 6 — `docs/api-strategy.md`: correct the InnoVint API claim

**Goal:** Fix the factual error that InnoVint has no public REST API.
**Files:** `docs/api-strategy.md`
**Traces to:** SYNTHESIS §B.2 ("Fix `docs/api-strategy.md:23`"); runbook PHASE-0 scope item 5.

**Exact changes:** at the InnoVint bullet (`docs/api-strategy.md:23-25`, currently *"InnoVint … has no public developer REST API surfaced and no QuickBooks API at all"*):
- Correct to: InnoVint **has** a public REST API at **`sutter.innovint.us/api/v1/`** (**PAT auth**).
- **Keep** the QBO-gap claim (accurate — no QuickBooks API).
- Add: the **anti-lock-in thesis still holds** because their APIs are **extraction/one-way**.

**Approach:** minimal in-place correction of the one bullet; leave the three-tier architecture unchanged.
**Depends on:** none.
**Verification:** manual read; the corrected claim + retained QBO gap present.

---

### Unit 7 — (Optional) ADRs for the two largest decisions

**Goal:** Record the identity-vs-naming split and the two-track migration model as ADRs (CLAUDE.md: "for big ones, add an ADR").
**Files (new, optional):**
- `docs/architecture/decisions/0002-identity-vs-naming-split.md`
- `docs/architecture/decisions/0003-two-track-migration-seed-not-replay.md`
**Traces to:** runbook PHASE-0 scope item 7 (marked *optional, if `/plan` judges it warranted*). **`/plan` judges BOTH warranted** — these are the two load-bearing architectural decisions of the whole runbook.

**Format** (per `docs/architecture/decisions/0001-vineyard-block-wo-target-seam.md`): title, `Date`, `Status: accepted`, `## Context`, `## Decision`, `## Why (and what we rejected)`, `## Consequences / at scale`. Cross-link `[[INVARIANTS]]`, `[[system-map]]`, the register notes, and `FIX_RUNBOOK.md`.
- **0002** — identity is `id`; `code` mutable + unique-per-tenant; `displayName` mutable + non-unique; **no opaque slug** (rejected: Gemini's opaque-slug route — throws away the migration-familiarity win; the surrogate `id` already IS the opaque key). Rejected: pinning `code` immutable (the incumbent-worse status quo).
- **0003** — two-track migration: exactly one `SEED` into the fold + read-only structured archive never folded; publish blocked on unresolved reconciliation deltas. Rejected: replaying legacy operational history as ledger events (double-counts the seed; makes the fold disagree with Day-1 reality — the single most important correctness fix, council §4).

**Approach:** create both, following 0001's headings exactly.
**Depends on:** Unit 1/2 (should reference the finalized invariant wording).
**Verification:** manual read; ADRs render; cross-links resolve. **Note:** ADRs are optional — if a review gate argues to drop 0003 or defer both, they can be cut without breaking any acceptance criterion.

---

### Unit 8 — End-of-phase self-consistency checks + `PHASE-0-REPORT.md`

**Goal:** Prove the docs are internally consistent and green, then record deltas vs. plan.
**Files:** `PHASE-0-REPORT.md` (new, repo root)
**Traces to:** runbook PHASE-0 "Acceptance criteria" + "Tests + verify-guards required"; cross-phase completion checklist.

**Checks (all must pass):**
1. **`npm run verify:invariants` green** — proves the 8 new planned/deferred notes are correctly unguarded/skipped and no existing guard regressed. (This is the load-bearing gate for the guard-sequencing rule.)
2. **`npm run verify:tripwires` green.**
3. **No new guard scripts** added this phase (guards land with their enforcing code).
4. **Grep: no remaining reference anywhere to immutable `Lot.code` as identity** — e.g. `rg -i "code.*immutable|immutable.*code"` across `INVARIANTS.md`, `ROADMAP.md`, `VISION.md`, `DESIGN.md`, `docs/`; confirm each hit describes the *snapshot* immutability, not `code`-as-identity. Confirm the docs now state `code` unique-per-tenant, `displayName` non-unique, `id` the only opaque identity. **(council Q4)** `DESIGN.md` was grepped and is **clean** (no `Lot.code`-as-identity claim) → no `DESIGN.md` edit needed; if a hit ever appears there it becomes in-scope to fix under this acceptance criterion.
5. **Grep: dangling refs resolved** — `rg "docs/STRATEGY\.md|docs/competitive-analysis-vintrace-innovint\.md"` returns no live references in `ROADMAP.md`/`VISION.md`.
6. **Narrative ↔ register agreement** — the 8 register notes' `id`/`severity`/`decision` match the `INVARIANTS.md` narrative (acceptance criterion). 8 notes total: 7 `planned` + CBMA-1 `deferred`.
6a. **(eng + council) New-note well-formedness — explicit per-file manual checklist.** Because `verify:invariants` *silently skips* any note lacking `id`/`verify` (a malformed planned note is indistinguishable from a correct one and stays green either way — flagged by BOTH councils), run this **explicit checklist on each of the 8 files** (do not rely on the `invariants.base` dashboard render alone — Codex: that's a weak visual check):
   - (a) frontmatter fences (`---`) present and parseable;
   - (b) all required keys present: `id`, `group`, `severity`, `enforcedBy`, `decision`, `status`, `appliesTo`, `tags`;
   - (c) **no `verify:` line**;
   - (d) `status` ∈ {`planned`, `deferred`} (here) — not `guarded`;
   - (e) **filename starts with `<id>-`** (repo convention is `LEDGER-10-immutable-operations.md`, not `LEDGER-10.md` — Codex CRIT-2: the check is "filename prefix == id", NOT exact match; the 8 new files use slugged names like `NAMING-1-identity-is-id.md`);
   - (f) `appliesTo`/`tags` use the **exact inline block-list syntax** already in `LEDGER-10` — no creative/multiline YAML (the checker's frontmatter parser is a minimal line-regex).
   **Backlog (NOT built this phase — docs-only):** an automated frontmatter schema-validator (Gemini's Zod suggestion) that fails on any malformed note *regardless of `verify:`* is a genuinely good guard — but it is **code**, so it belongs to a later phase (it's itself the kind of guard the guard-sequencing rule defers). Record it as a Phase-1 governance-hardening backlog item in `PHASE-0-REPORT.md`; do not add a script here.
6b. **(eng-review) Link + numbering integrity** — concrete greps: no broken `[[wikilink]]` introduced in `ROADMAP.md`/`VISION.md` (spot-check any renamed anchors), the VISION `D*` decision numbering is unchanged, and no existing ROADMAP phase number was renumbered (only Phase 12.5 inserted). `rg "\[\[[^]]+\]\]" ROADMAP.md VISION.md` and eyeball; `rg "^## Phase " ROADMAP.md` to confirm the phase list is intact + 12.5 present.
7. **Docs-only proof** — `git diff --stat` touches only `INVARIANTS.md`, `ROADMAP.md`, `VISION.md`, `docs/architecture/invariants/*`, `docs/architecture/ux-principles.md`, `docs/api-strategy.md`, `docs/architecture/decisions/*` (if ADRs), `plans/`, `PHASE-0-REPORT.md`. **Zero** changes under `src/`, `prisma/`, `scripts/`, `package.json`.
8. **`PHASE-0-REPORT.md`** written: what changed vs. this plan, deferrals, surprises, the grep results, and the open-question resolutions the user chose.

**Note on the full `vitest` suite / `npm run build` / `npm run lint`** (cross-phase checklist items): this phase changes **no code**, so the suite/build/lint state is unchanged by definition. Recommend running `verify:invariants` + `verify:tripwires` (the doc-governance gates) as the real proof; a full `vitest`/`build` run is optional confirmation that nothing was touched. See Open Questions Q6 for whether the reviewer wants the full green-suite run anyway. (Worktree/`.env` caveat from memory: `verify:*` needing a DB may be blocked in a worktree without `.env` — `verify:invariants`/`verify:tripwires` are pure-Node/file-based and run anywhere.)

**Depends on:** Units 1-7.
**Verification:** the checks above; report committed.

---

## Test Strategy

No unit tests (docs-only). The "tests" are the two governance guards + grep-based self-consistency assertions in Unit 8:
- `npm run verify:invariants` — **must stay green** (the guard-sequencing contract's proof).
- `npm run verify:tripwires` — must stay green.
- Grep assertions for (a) no `Lot.code`-as-identity language, (b) no dangling doc refs.
- Narrative↔register field-match audit.

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| A new register note accidentally includes a `verify:` field → reds `verify:invariants` | Medium | Explicit "NO `verify:` line" rule in Unit 2; Unit 8 check #1 catches it. |
| Rescoping ROADMAP renumbers a phase / breaks a `[[wikilink]]` | Low | Insert-only for 12.5; in-place rescope for 13/14; grep for broken links in Unit 8. |
| Repairing only the 3 runbook-named dangling refs, leaving 75/1508 live | Medium | Q1 flags all 5; recommend repair-all. |
| `README.md` coverage snapshot ("18 … 100% guarded") becomes misleading with planned notes | Medium | Q2 flags; recommend updating snapshot + fixing pre-existing 18→21 drift. |
| ADR scope-creep (writing code-level detail) | Low | ADRs follow 0001's decision-record shape (WHAT/WHY, not HOW); optional anyway. |
| Touching `DESIGN.md` unnecessarily | Low | Guardrail: no `DESIGN.md` edit (Q4). |

---

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Runbook + council are explicit; root of the dependency graph. |
| Scope Boundaries | HIGH | Runbook enumerates in/out precisely; guard-sequencing rule verified against the checker source. |
| Implementation Units | HIGH | Every edit traced to a §B / council §6 / Decision-Log source with file+line anchors. |
| Test Strategy | HIGH | Two pure guards + greps; guard-skip behavior confirmed at `verify-invariant-guards.mjs:50`. |
| Risk Assessment | MEDIUM | Two genuine judgment calls (dangling-ref breadth, README snapshot) surfaced as Open Questions rather than assumed. |

---

## Open questions (need user/reviewer judgment — NOT resolved silently)

Each question now carries the council's steer. Several are effectively resolved by the two reviewers agreeing (and by the runbook winning conflicts); the genuinely-still-yours calls are **Q5** and confirmations on **Q1/Q6**.

1. **Dangling-ref breadth.** Runbook names `ROADMAP.md:730-731,754`; grep found **5** in ROADMAP (also **75**, **1508**) + **VISION.md:320-321**. **Both councils: repair all.** **Recommendation: repair all 5 + VISION, and record the exact resolved path+line targets in `PHASE-0-REPORT.md`** (Codex SHOULD-5: enumerate, don't just say "repair all," so line-drift leaves none behind). Just confirm.
2. **README coverage snapshot** → **RESOLVED (promoted to mandatory, Unit 2b).** Both councils: update it, and don't publish another fake "100%" — use **status counts** ("29 total: 21 guarded, 7 planned, 1 deferred"). Also updates the "Adding an invariant" tip + `docs/_templates/invariant.md` to document the planned-omits-`verify:` rule (closes the "contributors re-add `verify:` and red CI" hole). *No longer an open question unless you want README left untouched.*
3. **MIGRATE-1 section heading.** **CONFLICT:** Gemini wants compliance and migration as **separate** sections ("migration is transient ETL state"); Codex wants the combined **"Compliance & migration invariants"** heading; the **runbook literally says one "Compliance invariants" section containing MIGRATE-1.** **Runbook wins → one section, honestly titled `## Compliance & migration invariants`** (Codex's call; closest to the runbook's single-section instruction while truthful). Gemini's split is noted but not adopted (would deviate from the runbook's structure). Confirm.
4. **`DESIGN.md` pointer** → **RESOLVED. No edit.** Grep confirmed `DESIGN.md` has **no** `Lot.code`-as-identity claim (Codex's only condition for touching it), and §B.3 keeps domain-UX in `ux-principles.md`. Gemini's "add a discoverability pointer" is rejected as an extra drift surface (Codex) and outside the runbook guardrail. Unit 8 keeps a `DESIGN.md` grep as a safety net.
5. **ADRs (Unit 7)** → **GENUINELY YOURS — councils split.** Codex: **0002 only** (identity/naming is durable + cross-cutting; 0003 duplicates ROADMAP + MIGRATE-1, extra maintenance). Gemini: **both** (ADRs record resulting architecture, distinct from the runbook's process). Runbook: 0002 warranted, 0003 "consider." **My recommendation: write 0002 (definite); make 0003 optional — lean yes** (two-track migration is load-bearing enough to deserve its own record), but Codex's duplication caution is legitimate. **Your call.**
6. **Full green-suite run.** **CONFLICT:** Codex: guards + doc greps only (full build/lint/vitest is noise for docs). Gemini: run the **full CI suite** (markdown edits can trip prettier/markdown-lint/spellcheck in the primary pipeline). **Recommendation flipped to: run the full suite** (`verify:invariants` + `verify:tripwires` **required**, plus `npm run lint` + `npm run build` + `vitest` as cheap confirmation) — it matches the cross-phase checklist literally and de-risks Gemini's markdown-lint concern. Cheap insurance. Confirm.
7. **ROADMAP placement of 3e-3h** → **RESOLVED to a hybrid** (see Unit 3). Councils split (Codex consolidated-for-audit vs Gemini distributed-where-implementer-looks); the hybrid puts each item in its owning phase family **and** adds a short "Remediation additions" *index of pointers* — satisfies both. Confirm the hybrid.
8. **Phase label 12.5.** **CONFLICT:** Gemini calls `12.5` "unacceptable" (decimals break semantic sorting; wants renumber 13→14… or "12b"). **This directly violates the runbook's hard guardrail "Do not renumber existing ROADMAP phases; insert 12.5."** **Runbook wins → keep `Phase 12.5`** (Codex + runbook agree). Gemini's renumber is noted and rejected — renumbering every downstream phase is exactly the churn the guardrail forbids and would break every existing `Phase N` cross-reference in the repo.

---

## Review adjudication — eng

Ran `/plan-eng-review` in autonomous (self-adjudicating) mode per the pipeline instruction to run gates without stopping between stages. The codex "outside voice" sub-step was deferred to the next pipeline stage (`/council`) to avoid duplication. Findings and dispositions:

| # | Finding (confidence) | Disposition | Rationale |
|---|----------------------|-------------|-----------|
| E1 | Guard-sequencing correctness — planned notes with no `verify:` keep `verify:invariants` green (9/10; verified at `verify-invariant-guards.mjs:50`) | **Accepted (no change)** | Already the plan's core mechanism; source-verified, no edit needed. |
| E2 | Test gap: `verify:invariants` silently skips malformed planned notes, so nothing proves the 8 notes are well-formed (7/10) | **Accepted → plan revised** | Added Unit 8 check **6a** (frontmatter valid + renders in `invariants.base` + id↔filename). This is the real proof the notes are authored right. |
| E3 | PreToolUse brain-context hook fires on planned `appliesTo` paths immediately; MIGRATE-1 at `src/lib/ledger/` = noise on every ledger edit (6/10) | **Modified → plan revised** | Repointed MIGRATE-1 `appliesTo` to `scripts/migrate-legacy-lots.ts` (closest existing anchor; hook won't match a non-existent migration dir, which is correct for a planned invariant). Contract-ahead-of-code injection for NAMING/BOND on their real dirs is *desirable* — kept. |
| E4 | Group-value consistency unchecked (6/10) | **Accepted → plan revised** | Confirmed `group: compliance` exists (`COMPLIANCE-1`); added an instruction to read one existing note per family for byte-consistent frontmatter shape. `naming`/`migration` are acceptable new groups. |
| E5 | Link/numbering integrity during in-place ROADMAP/VISION rescopes (6/10) | **Accepted → plan revised** | Added Unit 8 check **6b** with concrete greps for `[[wikilink]]`s, `D*` numbering, and phase-list integrity. |
| E6 | Performance / N+1 / data-access | **N/A** | Docs-only; no runtime surface. "No issues found." |

**Step 0 — Scope:** accepted as-is (docs-only, minimal, boils the lake on dangling refs). The ">8 files" smell does not apply to a docs plan.

**What already exists (reused, not rebuilt):** the invariant register + `verify:invariants` checker, `LEDGER-10` as the note template, the `invariants.base` dashboard, the PreToolUse brain-context hook, ADR format `0001`, and `ux-principles.md`'s rule template. The plan reuses all of these rather than inventing parallel structures.

**NOT in scope (deferred, with rationale):** all `verify:` guard scripts (land with enforcing code, Phases 1-3); any `src/`/`prisma/`/`scripts/` edit (later phases); a narrative↔register drift *guard* (would be code; manual cross-check suffices for one phase); README auto-count automation (Q2 is a one-time manual snapshot fix).

**Failure modes (governance):** (1) a stray `verify:` in a new note → reds CI → caught by Unit 8 check #1; (2) malformed note silently skipped → caught by new check 6a; (3) partial dangling-ref repair → caught by check #5 (repo-wide grep). No silent-failure critical gaps remain.

**Parallelization (worktrees):** low value for a one-session docs plan, but the lanes are: **Lane A** `U1 → U2 → U7` (narrative → register mirror → ADRs, sequential — the mirror and ADRs cite finalized wording); **Lane B** `U3 → U4` (both touch `ROADMAP.md`, sequential; U4 also VISION); **Lane C** `U5` (ux-principles, independent); **Lane D** `U6` (api-strategy, independent). Lanes B/C/D are mutually independent. `U8` is the final gather. Recommend just doing it sequentially inline.

**Eng verdict:** CLEARED. No open architecture issues; 4 revisions applied to the plan (checks 6a/6b, MIGRATE-1 path, group-shape instruction). The 8 open questions remain user-facing product/consistency calls, not eng blockers.

## Review adjudication — council

Ran `/council` (cross-LLM) on the eng-revised plan: **Codex gpt-5.4** (governance/CI-correctness lens) + **Gemini 3.1 Pro** (doc-consistency / downstream-implementer-ambiguity lens). Both returned substantive CRITICAL/SHOULD-FIX/DESIGN-QUESTION findings. Per the pipeline rule, **where council conflicts with the runbook's recorded decisions (Decision Log 1-5, §7 calls, reviewer mods 1-3), the runbook wins** — those are noted, not relitigated. Did **not** overwrite the repo's existing `council-feedback.md` (a tracked file about a different review); synthesis lives here instead.

| # | Finding (source) | Disposition | Rationale |
|---|------------------|-------------|-----------|
| C1 | **README + template lie once unguarded notes land**; contributors will "fix" planned notes back to `verify:` and red CI (Codex CRIT-1 + Gemini CRIT-1) | **Accepted → new Unit 2b (mandatory)** | The main residual governance hole. README snapshot → status counts (no fake %); README tip + `docs/_templates/invariant.md` now document "planned/deferred omit `verify:`". |
| C2 | **`id`-matches-filename check wrong vs repo convention** (`LEDGER-10-immutable-operations.md`, not `LEDGER-10.md`) (Codex CRIT-2) | **Accepted → Unit 8 6a(e)** | Check is now "filename **starts with** `<id>-`"; the 8 new files use slugged names accordingly. |
| C3 | **Silent-skip hole not truly closed; dashboard render is weak proof** (Codex CRIT-3 + Gemini CRIT-1) | **Accepted (manual) / partial-reject (automated)** | Unit 8 6a is now an explicit per-file frontmatter checklist. The automated Zod validator Gemini wants is **code** → deferred to Phase-1 backlog (docs-only scope + it's itself a guard the sequencing rule defers). **Conflict-with-scope: runbook/scope wins.** |
| C4 | **NAMING-2 temporal-query ambiguity** — implementer may build `WHERE lotCode = ?` (Gemini CRIT) | **Accepted → Unit 1 sharpening** | NAMING-2 now mandates: user-facing lookup by `code` resolves to `id` first, then reads history by `id`. |
| C5 | **BOND-1 / TAXCLASS-1 symmetric posting could be two txns (race)** (Gemini CRIT) | **Accepted → Unit 1 sharpening** | Both now state "atomic within a single ledger transaction" (matches the runbook's one-`runLedgerWrite` `…Tx` convention). |
| C6 | **TAXCLASS-1 non-deterministic destination class** (Gemini CRIT) | **Accepted-with-modification** | Clarified "destination = receiving lot's class" (already the runbook's wording); the new-blend-lot class-assignment detail is explicitly a **Phase-2 `/plan`** call — refused to invent "highest class wins" (would fabricate policy). |
| C7 | **MIGRATE-1 "unresolved delta" threshold vague** (Gemini SHOULD) | **Accepted-with-modification** | Defined via the runbook's **named-exception** model (resolved = zero **or** operator-accepted exception), **not** Gemini's "strictly non-zero volume" (which contradicts named-exception acceptance). Conflict noted, runbook model kept. |
| C8 | **AMEND-1 cascade sync-vs-async at scale** (Gemini SHOULD) | **Noted as Phase-2 flag, not baked in** | The Phase-0 invariant states the *rule*; the sync/async + `NEEDS_CALCULATION` lock mechanism is a Phase-2 design decision (deciding it now = resolving a later-phase question, which my standing constraint says to defer). |
| C9 | **Present/future-tense blur** ("verify-guarded like LEDGER-10" reads as already-guarded) (Codex SHOULD-4) | **Accepted → Unit 1** | NAMING-2 + MIGRATE-1 now phrased future-tense with explicit "currently `status: planned`". |
| C10 | **Phase-13 dependency not a contract** (Gemini SHOULD) | **Accepted → Unit 3 3c** | Added a literal `Depends on: Phase 12.5 + Phase 14` line to the Phase-13 heading. |
| C11 | **Enumerate exact dangling-ref targets, not "repair all"** (Codex SHOULD-5) | **Accepted → Q1 + report** | Exact path+line targets recorded; `PHASE-0-REPORT.md` logs resolved locations. |
| C12 | **MIGRATE-1 `appliesTo` inert until file exists** (Codex SHOULD) | **Accepted → report note** | Report will state the hook is not active for MIGRATE-1 yet (by design for a planned invariant). |

**Design-question dispositions:** Q1 all-refs (both agree) ✓; Q2 README (both agree → mandatory, status counts) ✓; **Q3 runbook wins** (one combined section, not Gemini's split); Q4 no DESIGN edit (grep clean) ✓; **Q5 remains the user's call** (Codex 0002-only vs Gemini both); **Q6 flipped to full-suite run** (Gemini's markdown-lint risk + checklist literalism); Q7 hybrid ✓; **Q8 runbook wins** (keep `12.5`; Gemini's renumber violates the no-renumber guardrail).

**Conflicts where the runbook overrode council (noted, not relitigated):** Q3 section split (Gemini), Q8 phase renumbering (Gemini), and the automated-validator-now (Gemini C3) — all deferred to runbook decisions / docs-only scope. No recorded Decision-Log / §7 / reviewer-mod call was reopened.

**Council verdict:** no CRITICAL that blocks the docs-only phase; 10 accepted sharpenings/additions applied (Unit 2b added; Units 1/3/8 tightened; Q2/Q6/Q7 resolved). Q5 (ADR 0003 yes/no) is the one substantive item still awaiting your judgment.

## Review adjudication — design

Ran the design review as a **plan-stage IA/UX-contract pass** (autonomous, no AskUserQuestion, per the pipeline). No visual mockups: this phase ships **zero rendered UI** — it edits governing docs. The design lens applied: (a) IA/discoverability of the doc edits, (b) whether new ux-principles rules 8-12 are checkable and consistent with rules 1-7 + DESIGN.md's visual/IA split, (c) downstream UX contracts the invariants imply.

| # | Finding | Disposition | Rationale |
|---|---------|-------------|-----------|
| D1 | ux-principle **11 (offline-first)** is an aspiration, not a screen-checkable rule, and the capability is unbuilt (Phase 28) → `/design-review` would grade current screens against it and emit false failures | **Accepted → Unit 5 revised** | Rule 11 now must be tagged "(forward principle — Phase 28; not yet enforceable)" or reworded as a checkable graceful-degradation rule. Keeps rules 8-12 honest against the "checkable rule" contract of the file. |
| D2 | INVARIANTS.md section **placement unspecified** | **Accepted → Unit 1 revised** | Specified: `## Naming & identity presentation` right after `## Identity & provenance`; `## Compliance & migration invariants` as a new top-level section after `## Work orders`. IA reads in domain order. |
| D3 | Temptation to add ux-principles for the NAMING-2 affordance / cross-identifier search | **Rejected (scope guard) → noted in Unit 5** | §B.3 fixes exactly five rules (8-12); those UX contracts already live in the invariants + Phase-1 scope and specialize existing rule 4. Adding rules would exceed runbook scope. Flagged for the Phase-1 `/plan` as concrete UI deliverables instead. |
| D4 | `DESIGN.md` separation of concerns | **Approved (no change)** | Plan correctly leaves DESIGN.md (visual system) untouched and puts domain-UX in `ux-principles.md` — exactly §B.3's split. Confirms Q4. |

**Design ratings (docs plan):** IA/coherence **8→9** (section placement fixed); rule-quality **8→9** (rule 11 tagged); UX-contract capture **9** (invariants carry the NAMING-2/search/LIFO-unwind promises as checkable rules); DESIGN-system alignment **10** (untouched, correct). No AI-slop / responsive / mockup passes apply (no rendered surface).

**Design verdict:** design-complete for a docs phase. Two small doc-IA fixes applied (D1/D2); one scope guard held (D3). No conflict with any runbook decision (rules 8-12 kept to the fixed §B.3 set — did not expand them despite the temptation).

---

## Gate pipeline summary (Phase 0)

Three review gates run in sequence, each self-adjudicated into the plan (per the "run without waiting" instruction). No recorded runbook decision (Decision Log 1-5, §7 calls, reviewer mods 1-3) was reopened; conflicts were resolved in the runbook's favor and noted.

- **Eng:** CLEARED. 5 findings → 4 plan revisions (Unit 8 checks 6a/6b, MIGRATE-1 `appliesTo`, group-shape instruction). Guard-sequencing verified against `verify-invariant-guards.mjs:50`.
- **Council (Codex + Gemini):** 12 findings → 10 accepted/sharpened + **new Unit 2b** (README/template governance fix — the top residual hole both flagged); 3 conflicts resolved runbook-wins (Q3 one-section, Q8 keep 12.5, automated-validator deferred as code).
- **Design:** design-complete. 2 doc-IA fixes (rule-11 tag, section placement) + 1 scope guard held.

**One item still needs your judgment: Q5** — write ADR **0003** (two-track migration) or ship only ADR **0002** (identity/naming)? Councils split; runbook makes 0003 "consider." Everything else is resolved with a recommendation.
