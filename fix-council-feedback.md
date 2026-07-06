# FIX Council Feedback — review of `FIX_RUNBOOK.md`

> **What this is.** A council review of [`FIX_RUNBOOK.md`](./FIX_RUNBOOK.md) by two independent
> models — **Codex (gpt-5.4)** and **Gemini 3.1 Pro** — each briefed as a senior reviewer with
> multi-tenant ERP, wine-industry-incumbent (vintrace/InnoVint), and migration-UX expertise. They
> reviewed through three lenses in priority order: **(A) ease of migration FROM vintrace/InnoVint**,
> **(B) ease of use for winemakers fluent in those tools**, **(C) ERP best practices**.
>
> **How to read it.** Every council point below is **adjudicated** — Accept / Accept-with-modification
> / Reject — with the reasoning grounded in Cellarhand's actual state (append-only ledger, shipped D11
> legacy-lot pattern, existing catalogs) and a **concrete edit to make in `FIX_RUNBOOK.md`**. Section 1
> is the verdict, §2 the consensus (highest weight), §3 the adjudicated point list, §4 the single most
> important change, §5 the recommended revised phase order, §6 the ready-to-apply edit checklist, §7 the
> decisions that are genuinely yours.
>
> **Status:** advisory. `FIX_RUNBOOK.md` is **not yet edited** — this report tells us what to change and
> why, so the next `/plan` session (or a runbook revision) can act on it.

---

## 1. Verdict

The runbook is **directionally sound and both councils agree on its three best calls**: identity/naming
first, Bond as a first-class model (not a report label), and the refusal to fabricate history. But both
independently flagged the same structural weakness: **the plan optimizes for internal-model completeness
before it optimizes for migration trust and self-serve onboarding — which is backwards if the stated goal
is "the easiest system to migrate to."** Two structural changes and roughly nine refinements follow.

The good news: most of the fixes are **de-risking clarifications**, not rewrites. The append-only spine,
the D11 legacy-lot pattern, and the existing material/vessel catalogs mean Cellarhand is closer to a clean
migration than the runbook's phrasing suggests. The council's job here was to stop two latent traps (a
double-count in the history ingest, and an under-fenced "in-place edit") and to pull the trust-building
work earlier.

---

## 2. Consensus (both models, independently — treat as highest-confidence)

| # | Consensus finding | Councils |
|---|---|---|
| C1 | **Migration is sequenced too late / needs a "migration kernel" pulled earlier.** A winery buys safe dry-run import + reconciliation + sign-off + repeatability, not "adapter after lifecycle cleanup." | Codex #1, Gemini order |
| C2 | **Seed current balances; do NOT replay legacy operational history through the active fold.** Legacy rounding/order-of-ops/cost bugs differ; replaying them makes Cellarhand's fold disagree with the winemaker's Day-1 reality. Legacy history belongs in a read-only archive stitched into the timeline visually. | Gemini #1, Codex #4 (implied via reconciliation) |
| C3 | **Self-serve reference-data setup is a *deliverable*, not just a principle — and it blocks migration.** You can't map an InnoVint location→vessel or cost→additive without it. | Codex #7/#9, Gemini #3 |
| C4 | **The "in-place typo edit" is dangerous and must be tightly fenced** to non-posting metadata; anything posting goes through reverse+rebook. | Codex #10, Gemini #2 |
| C5 | **Silent collision auto-disambiguation is the wrong default for imported codes** — resolve in preflight; `displayName` should not be unique at all. | Codex #3, Gemini #4 |
| C6 | **Don't be API-first / don't OCR accounting PDFs for vintrace** — canonical export bundle is the baseline; API augments; PDFs attach as evidence, never parsed for numbers. | Codex #11, Gemini #5 |

---

## 3. Adjudicated point list

### 3.1 — Seed vs. event-replay (C2) — **ACCEPT (this is the most important correctness fix)**
**Affects:** Phase 5, Phase 6.
Gemini is right, and it exposes a **latent inconsistency already in the runbook**: Phase 5 says both
"wrap current-state per lot as an `isLegacy` Lot **seeded at current volume via SEED**" *and* "ingest
operational history as `captureMethod:IMPORT` ledger events." Those two clauses **double-count** — if you
seed the current balance *and* replay the movements that produced it, the fold is wrong. (Note for
accuracy: Cellarhand has no hash chain, only a monotonic `sequence` + append-only lines, so Gemini's
"hash chain" phrasing overstates the mechanism — but the drift risk is exactly real.)

**Edit:** Rewrite Phase 5's ingest model to a **strict two-track** design, which is also the honest
reading of D11:
- **Cutover balances** — exactly one `SEED` (call it the migration seed) per lot/vessel that hard-sets
  current volume, cost basis, tax class, and bond at the cutover date. This is the *only* legacy-sourced
  data that participates in the fold.
- **Historical archive** — ingest legacy operational rows (InnoVint TTB/Cost Audit CSV, Activity Feed)
  into a **read-only** store (a `LegacyOperation`/import-snapshot table keyed on the stable action ID),
  **never into the fold**. The lot timeline stitches them visually: *"Pre-Cellarhand history → cutover →
  active ledger."*
- Delete the current "ingest operational history as ledger events" clause; replace with "ingest as
  read-only archived provenance, displayed on the timeline, excluded from the volume/cost fold."

### 3.2 — Migration kernel pulled earlier + split Phase 5 (C1) — **ACCEPT-WITH-MODIFICATION**
**Affects:** phase order, Phase 5.
Both are right that migration trust must come earlier; I disagree only on *how early*. Codex wants the
kernel before Phases 2 and 4 — agreed. Gemini keeps migration last but adds a reference-data phase — its
ordering still leaves the kernel last, which contradicts C1. Synthesis: **split Phase 5 into 5A
(migration kernel) and 5B (InnoVint adapter)**, and place 5A **after Phase 3** (the seed needs the Bond
entity to place a multi-bond winery's positions — see 3.5) but **before Phases 2 and 4** (lifecycle
writers and operations-gaps are not needed to import *current state*).

**Edit:** Split Phase 5; new order in §5 below. 5A = external-file legacy-seed spine + preflight +
reconciliation pack + sign-off + the two-track model. 5B = InnoVint lighthouse adapter.

### 3.3 — Reconciliation pack + draft-until-sign-off (Codex #4) — **ACCEPT (the missing onboarding UX)**
**Affects:** Phase 5A.
This is the trust mechanism that makes a winemaker believe the migration. Coverage-gap tracking (already
in the runbook) is necessary but not sufficient.

**Edit:** Add to Phase 5A as a hard deliverable: an import stays **DRAFT** (not published to the live
tenant) until the operator signs off on a **reconciliation pack**: by-vessel occupancy, by-lot volume,
cost by lot, finished-goods counts, TTB period totals, chemistry-reading counts, unmapped entities, and
inferred/partial lineage — with named-exception acceptance. Add a `verify:migration` assertion that
publish is blocked while unresolved reconciliation deltas exist.

### 3.4 — External identifiers: table, not three columns (Codex #2) — **ACCEPT**
**Affects:** Phase 1.
Wineries carry multiple historical identifiers per lot (current code, prior codes, source-system IDs,
spreadsheet aliases, TTB labels). Three scalar columns on `Lot` can't hold that and can't back operator
search on "whatever code they remember."

**Edit:** In Phase 1, replace `Lot.sourceSystem/sourceId/legacyCode` with a **tenant-scoped
`LotIdentifier` (a.k.a. `ExternalReference`) table**: `lotId`, `kind`, `sourceSystem`, `sourceObjectType`,
`value`, `validFrom`, `validTo`, `isCurrent`, indexed for search. This is the idempotent re-import key
*and* the search index. (`LotCodeEvent` still owns rename *history*; `LotIdentifier` owns *source*
identifiers — keep both, they answer different questions.)

### 3.5 — Bond scoping level: line/position-scoped + time-aware (Codex #5) — **ACCEPT (compliance-correctness)**
**Affects:** Phase 3.
If `bondId` lands as a mutable column on `Lot`, a `TRANSFER_IN_BOND` corrupts historical compliance (the
report for a past period would re-derive under the *new* bond). Bond must be posted at the movement/line
level and be point-in-time, exactly like tax class already is.

**Edit:** In Phase 3, state explicitly: **bond affiliation is posted on the operation/line (the movement
carries source + destination bond); any lot-level "home bond" is a projection only, never the compliance
source of truth.** Per-bond 5120.17 scoping reads the line-level bond, not a mutable lot column. This
mirrors the existing point-in-time `deriveTaxClass()` pattern.

### 3.6 — Fence the "in-place typo edit" (C4) — **ACCEPT-WITH-MODIFICATION**
**Affects:** Phase 4.
The runbook already says the edit "STILL APPENDS an audit event" (so it doesn't mutate a line) — good,
but the *name* invites a mutable-edit backdoor, and it doesn't say which fields are eligible. Both
councils converge: whitelist non-posting metadata; everything posting is reverse+rebook.

**Edit:** In Phase 4, split into two clearly separated affordances:
- **Metadata edit** — whitelist ONLY non-posting, non-fold fields (displayName, notes/free text, tags).
  **Explicitly forbid** dates, volumes/quantities, vessel, lot, tax class, bond, and anything
  report-affecting. Appends an audit event (reuse the NAMING-2 / LotCodeEvent discipline).
- **"Edit" of a posting op** — a UI convenience that the backend executes as a composite
  `reverseOperationCore(original) + rebook(new)` folded into one visual action, so the winemaker
  experiences an edit while the ledger stays strictly append-only (this is the frictionless daily-use win
  the incumbents have — deliver it *without* touching the moat). Rename the runbook bullet away from
  "in-place edit" to "guarded metadata edit + fold-preserving reverse-and-rebook."

### 3.7 — Collision handling + displayName uniqueness (C5) — **ACCEPT-WITH-MODIFICATION**
**Affects:** Phase 1, Phase 5A.
Accept: **`displayName` must not be unique** — allow verbatim legacy duplicates ("2021 Cab" twice). Accept:
**do not silently suffix imported `code`s** — surface true collisions in preflight for operator resolution.
**Reject** Gemini's "make `code` an opaque system slug (`LOT-8492`)": that throws away the whole teardown
thesis (adopt the winery's *familiar human code* verbatim). Cellarhand already has an opaque stable key —
the surrogate `id` — so a second opaque slug is redundant and would hide the codes winemakers recognize.

**Edit:**
- Phase 1: `displayName` is non-unique and free-text; `code` stays human-facing + unique-per-tenant; `id`
  remains the only opaque identity. Reword NAMING-1's "offer auto-disambiguation" to "**offer** (not
  silently apply) auto-disambiguation" so the collision is an operator-facing choice.
- Phase 5A: imported incumbent codes are adopted **verbatim**; a genuine per-tenant collision is a
  **preflight block with explicit operator resolution**, never a silent `-2`. Silent auto-disambiguation
  is reserved for *newly generated post-go-live* codes only.

### 3.8 — Reference-data self-serve setup (C3) — **ACCEPT-WITH-MODIFICATION (narrower than the councils assume)**
**Affects:** new preflight phase / Phase 5A.
Both councils treat reference-data setup as entirely missing. In fact Cellarhand already ships self-serve
**material/additive catalog** (expendables view/edit), **vessels**, **tenant currency/settings**, guided
**chart-of-accounts mapping** (Phase 15), and **members/invitations**. The genuinely migration-blocking
gaps are narrower: **bonds** (arrives in Phase 3), **explicit tax-class config**, **barrel groups/types**
(arrives in Phase 4), **SKU/account import mappings**, **user provisioning at scale**, and **saved import
presets**. So this is *close the gap + gate it*, not a greenfield phase.

**Edit:** Add a **"reference-data readiness preflight"** as an explicit gate at the top of Phase 5A: the
import cannot resolve foreign keys (location→vessel, cost→additive, SKU→WineSku, account mapping, bond)
unless the target reference data exists or is created inline during mapping. Enumerate the required
reference entities and, for each, note whether CRUD already exists (audit in `/plan`) or must be built.
Pull forward only the missing, migration-critical CRUD; do not rebuild what exists.

### 3.9 — AI column-mapping is an assist, not the substrate (Codex #8) — **ACCEPT**
**Affects:** Phase 5A.
Migration trust comes from deterministic, saved, replayable mappings — not from AI guesses that vary run
to run.

**Edit:** In Phase 5A: **connector-specific templates + saved per-tenant mappings are the primary,
deterministic path**; AI *suggests* a mapping for unmatched columns but **never auto-commits** — an
operator confirms, and the confirmed mapping is saved for idempotent re-import. Add parse diagnostics
(row-level rejects with reasons) to the coverage-gap output.

### 3.10 — vintrace: export-bundle-first, no OCR of accounting PDFs (C6) — **ACCEPT**
**Affects:** Phase 6.
OCR of Stock/Cost-detail PDFs is an accounting-corruption tar pit (1/l, 8/B misreads → silent money
errors). API-first is also wrong: the practical product is canonical export intake.

**Edit:** Phase 6: change "Prefer REST API + OpenAPI" → **"Baseline = documented export bundle (CSV);
use the REST API opportunistically where it materially improves fidelity."** Delete the OCR-fallback
requirement; for PDF-only deep history, **attach the PDF to the legacy record as evidence** and, if
structured deep history is required, **require the winery to request a full CSV/data dump from vintrace
support** — never parse accounting numbers from a PDF. Keep the VINx2-ID ↔ mutable-batch-code
reconciliation (that part is correct and important).

### 3.11 — Minimal coarse permissions before go-live (Codex #9) — **ACCEPT-WITH-MODIFICATION**
**Affects:** the "out of scope" note.
Full RBAC (Phase 23) stays out of scope — correct. But import, reversal, bond actions, and TTB filing are
high-risk; shipping them on today's admin/user stub with no gate is a production-ERP risk during exactly
the migration window this runbook targets.

**Edit:** Do NOT pull in the permissions matrix. Add a small note that the high-risk new actions
(import/publish, reverse/LIFO-unwind, bond ops, filing) are gated to **admin/owner** in these phases (the
existing stub already supports admin-only, per WO authority), with the coarse role bundles
(Cellar-operator, Finance/compliance-read, Importer) explicitly deferred to Phase 23. This is a one-line
guardrail, not a new phase.

### 3.12 — Daily-use search resolution across all identifiers (Codex #6) — **ACCEPT**
**Affects:** Phase 1.
A winemaker from InnoVint searches by whatever code they remember. If search only knows the current code,
the system feels broken on Day 1.

**Edit:** Add to Phase 1's UI scope: **every lot picker/search resolves current code, displayName,
historical codes (LotCodeEvent), and legacy source identifiers (LotIdentifier)**. Operational views show
the current label first with alias secondary; audit/timeline views show as-recorded + a "renamed →/also
known as" affordance. (This makes the LotIdentifier table from 3.4 pull double duty.)

---

## 4. The single most important change

**Fix the migration ingest model to "seed current balances + read-only history archive" (3.1 / C2).**
Both councils landed here from different angles. If Cellarhand replays legacy operational history through
its active fold, migrations will fail numeric reconciliation against the winemaker's expected current
state, and onboarding stalls — the exact opposite of the "easiest to migrate to" goal. It also resolves a
double-count already latent in the runbook's Phase 5 text. Everything else is refinement; this is
load-bearing.

---

## 5. Recommended revised phase order

Preserves the runbook's real dependency logic (identity → migration; bond → migration) while pulling the
migration kernel and trust mechanisms earlier, per both councils:

| New | Was | Phase | Why the move |
|-----|-----|-------|--------------|
| 0 | 0 | Governance & docs | unchanged |
| 1 | 1 | Identity presentation layer **(+ LotIdentifier table, non-unique displayName, cross-identifier search)** | unchanged position; expanded scope (3.4, 3.7, 3.12) |
| 2 | 3 | **Bond + tax-class model (+ line-scoped bond)** | pulled before migration — the seed must place multi-bond positions (3.5); both councils keep bond before migration |
| 3 | 5A | **Migration kernel** — external-file legacy-seed spine, ref-data readiness preflight, two-track seed/archive, reconciliation pack + draft-until-sign-off, deterministic saved mappings | pulled ahead of lifecycle/ops per C1; the trust core |
| 4 | 5B | **InnoVint lighthouse adapter** | proves one full migration early |
| 5 | 2 | Lifecycle-writer debt | small/independent; fine after the lighthouse |
| 6 | 4 | Operations gaps **(fenced metadata edit + reverse-and-rebook)** | not needed to import current state; improves *ongoing* use (3.6) |
| 7 | 6 | vintrace connector **(export-first, no OCR)** | still after the shared spine (3.10) |

**Non-negotiable minimum** (if a smaller edit is preferred over the full reorder): apply 3.1 (seed/archive),
split Phase 5, and move the migration kernel ahead of Phases 2 and 4. The bond-before-migration dependency
(3.5) must hold regardless.

---

## 6. Edit checklist for `FIX_RUNBOOK.md` (ready to apply)

- [ ] **Phase 5 ingest model → two-track** (3.1): one migration `SEED` for cutover balances (fold), legacy
      history into a read-only archive table (never folded), timeline stitches them. Delete the
      "operational history as ledger events" clause.
- [ ] **Split Phase 5 → 5A kernel + 5B InnoVint**; reorder per §5.
- [ ] **Phase 5A: add reconciliation pack + draft-until-sign-off** as a hard deliverable + `verify:migration`
      publish-block assertion (3.3).
- [ ] **Phase 1: replace 3 source columns with a `LotIdentifier` table** (3.4) and wire cross-identifier
      search into pickers (3.12).
- [ ] **Phase 1: `displayName` non-unique; NAMING-1 "offer, don't silently apply" disambiguation** (3.7).
- [ ] **Phase 3 (→ new Phase 2): bond is line/position-scoped + time-aware; lot home-bond is projection**
      (3.5).
- [ ] **Phase 4: rename the "in-place edit" to metadata-edit (whitelisted non-posting fields) + a
      reverse-and-rebook composite** for posting ops (3.6).
- [ ] **Phase 5A: deterministic saved connector templates/mappings primary; AI suggests only** (3.9).
- [ ] **Phase 6: export-bundle-first; delete OCR; PDFs as attached evidence only** (3.10).
- [ ] **Phase 5A: add a reference-data readiness preflight** enumerating required entities; audit
      existing CRUD, build only the missing migration-critical subset (3.8).
- [ ] **Out-of-scope note: keep RBAC matrix deferred, but gate the new high-risk actions to admin/owner**
      (3.11).
- [ ] **Governance follow-through:** the new `LotIdentifier`, `LegacyOperation`/archive table, and any bond
      line-scoping change each need a Phase-12 tenancy checklist pass + a `verify:tenant-isolation` case;
      note this in the affected phases.

---

## 7. Decisions that are genuinely yours

These are judgment calls where the council split or where product intent should drive, not the reviewers:

1. **Full reorder (§5) vs. minimum edit.** The reorder pulls migration trust earlier (strongest for the
   "easiest to migrate to" goal) but delays the operations-gaps usability wins (split/lees/barrel-group).
   If you have a design partner imminent, take the full reorder; if daily-use polish for the current
   dogfood tenant matters more first, take the minimum edit.
2. **`code` = adopted human code (recommended) vs. Gemini's opaque slug.** I recommend keeping the human
   code (that *is* the migration-familiarity win) with preflight collision resolution — but if you'd
   rather never risk a code collision at all, the opaque-slug route is defensible at the cost of
   familiarity. I'd keep human codes.
3. **How much reference-data CRUD to pull forward** (3.8) depends on what a real InnoVint/vintrace export
   actually references — best resolved when a design partner's export is in hand, which argues for
   auditing it in the Phase-5A `/plan` rather than guessing now.
4. **Whether the read-only legacy archive is queryable/reportable** or purely display. Pure display is
   cheaper and safe; making it queryable (e.g., "show my vintrace history for lot X") is a retention
   feature that could wait for Phase 27 (institutional memory).

---

*Generated from a parallel council review (Codex gpt-5.4 + Gemini 3.1 Pro) via `council-mcp`, adjudicated
against Cellarhand's current state. Relates to `FIX_RUNBOOK.md`; apply §6 to revise it.*
