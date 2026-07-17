# NOW

> The working-set spine. The ONE file that answers "where was I?" on resume.
> Long-horizon lives in `ROADMAP.md`; parked ideas in `TODOS.md`; decisions in the
> context-ledger. This file is only **today / in-flight**. Keep it short — if it grows
> past a screen, something belongs in TODOS.md or the roadmap instead.

## 🎯 Current objective  (ONE thing)

**Invoice/document ingestion → deterministic expendables & equipment intake (Plan 072) — BUILDING (`/work`).**
Branch `claude/invoice-ingestion-intake-385010`. Units 1-7 + 9 + 12(STEP1-3) SHIPPED to the branch
(committed, all gates green): U1 schema+migration (4 RLS staging/provenance tables + composite FKs, applied to
Neon), U2 EQUIPMENT category + `isDoseableCategory` denylist→ALLOWLIST + `UNCLASSIFIED` sink (WORKORDER-7),
U3 PDF-aware private blob + upload route, U4 extraction core (de-risking spike PASSED — `claude-opus-4-8`
accepts native PDF `document` blocks; captured + verified all 8 real docs vs the plan matrix), U5 landed-cost
allocator + UOM normalize (money-critical), U6 vendor-scoped dedup matcher, U7 atomic apply core (inject ONE
tx through the cost cores; proforma/reconciliation/concurrency gates; unified new+existing→receiveSupplyCore
both emitting A/P stamped with invoice#; COA attach; tenant re-verify) — **proven by `verify:ingest` (31
assertions) + `verify:cost` 55/55**, U9 assistant `ingest_documents` tool (verify:ai-native green), U12
real-doc acceptance (STEP2 CI test 12/12 + STEP3 gated live script). **In flight:** U8 review UI (subagent),
U10 provenance surfacing (write side done in U7; read side pending), U11 final sweep. **PENDING: human sign-off
on the extraction snapshots (`qa/ingest-fixtures/SNAPSHOT-VERIFIED.md`) + browser-QA of U8 in Demo Winery.**
Full vitest 2162 passing, 0 regressions. See:
`docs/plans/2026-07-17-072-feat-invoice-ingestion-intake-plan.md` (Deep, 12 units). `+ Ingest invoice`
takes a mixed pile (PDF text/scanned + images), classifies each doc (invoice|proforma|coa|other), and routes
only receipts into ONE human-reviewed screen per invoice; every write goes through existing cores
(`createStockMaterialCore`/`receiveSupplyCore`/`findOrCreateVendorCore`). Decisions locked: Gmail = fast-follow
(out of scope); new NON-DOSEABLE `EQUIPMENT` category (the load-bearing edit is `isDoseableCategory` denylist —
protects WORKORDER-3); shipping allocated into per-unit landed cost (bakes into A/P, no separate line);
one review screen/invoice; proforma prompts "is this a landed receipt?"; fuzzy-match + dedup guard vs existing
expendables AND equipment; COA lot/expiry attach by Lot No.; private-blob provenance. Extraction = own
server endpoint (one-shot `messages.create` json_schema, `claude-opus-4-8`, native `document`/`image` blocks)
— NOT the text-only chat loop; DB staging (not the 5-min token) carries the batch. New schema: `vendorItemCode`
on CellarMaterial, `expiresAt`+`sourceDocumentId` on SupplyLot, `vendorInvoiceNumber` on ApExportEvent,
`IngestedInvoice`(+lines)/`LotDocument`/`VendorMaterialCode` staging (all RLS). **Reviewed FOUR ways (eng →
council[Codex+Gemini] → design → ChatGPT outside voice); all findings folded; BUILD-READY.** Council reversed
2 calls: inject ONE tx through cost cores (resumable-per-line was unsound); `isDoseableCategory` denylist→
ALLOWLIST. ChatGPT caught 2 money-critical bugs the others missed: (#1 UOM — invoice qty≠stock qty, Unit 5
now normalizes via convert/deriveOpeningLot; #2 A/P asymmetry — createStockMaterialCore emits no A/P, so
unified path = create@0 then receiveSupplyCore for every line) + reconciliation gate, concurrency claim,
UNCLASSIFIED non-doseable, LotDocument provenance. A/P (user, corrected QBO info): per-lot bills, invoice # as
searchable PrivateNote memo (NOT grouped — QBO DocNumber is the per-lot idempotency key). Next: `/work`.

<details><summary>original directive + diagnosis</summary>

User directive: every WO must ALWAYS have a WO-level Lead (`WorkOrder.assigneeEmail`); per-task assignees
stay optional. Diagnosed WO #27: Mike set the *task* assignee to Russell (= `russellmoss87@gmail.com`, the
only Russell) but left the WO-level "Lead" dropdown at "— unassigned —"; header + Print/PDF read only the
Lead field → show "—". Fix: default the Lead to the actor at `createWorkOrderCore`, require it in the
builder, add an admin/developer detail-page Edit, backfill existing rows, guard with WORKORDER-5.

</details>

<details><summary>prev objective (shipped)</summary>

Vendor management (Plan 070, PR #195) and inbox DM (#197) landed on main; Plan 068 inbox shipped (#191).

</details>

## 🧵 Tangent stack  (LIFO — push when you detour, pop when done)

1. ← you are here

## 🪝 Off-path — do NOT do now

- **Plan 062 Units 2/5 — liquid-solution booking (feature gap, NOT the money bug).** Booking a
  *stocked liquid KMBS-solution material* by ppm currently books an UNKNOWN-cost line with no depletion
  (no durable `so2SolutionPercentKmbs` field; `consumeMaterialCore` can't convert g→mL). Powder KMBS is
  fully correct. Needs a governed schema change + eng review — separate plan when prioritized, not now.

## ✅ Done recently

- **`/bug-triage` live run (2026-07-17) — 1 merged, 5 plans handed off, 3 to a human; 0 errors.**
  First had to unbreak the tooling: `b0ea4f6` (feedback-workspace rebuild) added a top-level
  `requireDeveloper` import to `feedback.ts`, and `dal.ts` eagerly imports `next/navigation` →
  `React.createContext` crash under `triage:list`'s `--conditions=react-server`. Fix = lazy-import
  in the 2 functions that use it → **PR #219 MERGED** (`1e624ec`). Main tree still carries the identical
  1-liner uncommitted (harmless dup; reconciles when this branch picks up origin/main, or `git checkout` it).
  Merged **PR #215** (expendables stock category, root-fix confirmed → Bhutan 👎 RESOLVED; residual gap:
  no per-item storage-location field). Plans handed off for `/work`: WO filtering (#201, 2-report cluster —
  ⚠️ `WorkOrderFilterBar.tsx` already dirty, maybe in flight), delete harvest pick (#188), 3rd-party sales
  counterparty (#202), report builder + Excel (#199), Help/assistant consolidation (#214, P2). To human:
  chat 400 "Invalid message" (real defect, out-of-fence `api/assistant/route.ts` — `/investigate`, do NOT
  approve its queued AGENTIC_FIX), "Talk" voice (unclear, env pending — `/investigate`), bare "error
  message" #204 (too vague — bounce/close).
- **Plan 070 — vendor management — BUILT (12 units) + reviewed + browser-QA'd; SHIPPING.**
  Reused the existing (Phase 15 QBO) `Vendor` table + new `VendorContact` child (RLS + composite FK);
  `vendorId` on `CellarMaterial` + `SupplyLot`; backfill (Demo: 54 mats/106 lots, 0 nulls) with a seeded
  "Unknown" fallback; shared vendor cores (A/P find-or-create refactored to reuse); mandatory fuzzy
  `VendorPicker` with pinned "+ create new vendor" + URL autofill on Add/Edit expendable; `/setup/vendors`
  CRUD; assistant `create_vendor` + `query_vendors` (golden gate green). `/review` fixed 5 findings
  (no-vendor-reactivate wipe, restock-lot linkage, edit gate for legacy vendors, +2). Browser-QA'd on
  Demo (mandatory picker, pinned create, URL autofill, inline create-and-select, Unknown editable).
  Gates: tsc, 2034 vitest, lint, next build, verify:tenant-isolation (110/110 + vendor FK checks),
  eval:assistant, verify:naming — all green. Worktree made buildable (copied .env + npm ci).
- **Plan 068 — user inbox / Gmail-like messaging — SHIPPED, PR #191 merged (`2a139dd`).** Merged into
  this branch during the Plan 070 pre-ship merge (disjoint from vendor work).
- **SO₂ ~1.74× dosing money bug — RECONCILED CLOSED (2026-07-15, no code change).** Investigated on a
  fresh branch off `origin/main`: the money-critical fix already shipped. Plan 066 (PR #180, `370b7b6`,
  MERGED) divides the stock draw by the active fraction in `consumeMaterialCore` (÷0.576); Plan 065
  (PR #179) landed `resolveSo2Dose` — used **display-only**, so no double-application. `verify:cost`
  55/55 green (40 ppm × 450 L → 18 g SO₂ delivered, 31.25 g KMBS drawn, $1.56). Running `/work` on
  Plan 062 would have DOUBLE-APPLIED 0.576 and re-broken `verify:cost` — deliberately did not.
  Remaining Plan 062 scope (liquid-solution booking) is a feature gap → Off-path.

- **Feedback cmrm5x3lq "vineyard identification" — SHIPPED, PR #190 merged; ticket RESOLVED.**
  Assistant told admin Mike "the Bajo vineyard doesn't exist" — `resolveVineyards`
  (`src/lib/assistant/scope.ts`) used a one-directional SQL `contains`, so the stored name
  "Bajo" failed to match "Bajo Vineyard". Added pure `vineyardNameMatches` (two-directional,
  mirrors `findScopedBlocks`), match in JS after untouched access scoping. Proven on live data
  (scope preserved for non-admins) + tenant-isolation CI green; 7-case regression test;
  assistant suite 25f/145t green. Reviewed (1 LOW note: 200-vineyard fetch cap, non-issue at
  realistic counts). Also shipped the calculator display fix (PR #189, browser-QA'd).
- **bug-triage `/bug-triage` dry-run RAN LIVE this session — REMEDIATED.** `args` reached the workflow
  as a JSON *string*, so `args.dryRun` was `undefined` → `DRY_RUN=false`. It dispatched a real
  `feedback_bug_fix` run (calculator display) + `feedback_plan` run (harvest-pick deletion), dismissed
  the thumbs-down ticket, set 5 statuses. Nothing merged to `main`. All triage decisions were sound, so
  kept (not rolled back). The calculator fix run completed → **PR #189 "fix: display" open for review**
  (nothing to cancel). Vineyard ticket cmrm5x3lq updated to IN_PROGRESS/DEFECT + PR #190 note.
  Hazard memory hardened ([[bug-triage-dryrun-args-gotcha]]) — burned twice now.
- **Plan 067 PR A — agentic PLAN/FIX routing — SHIPPED, PR #181 merged** (`d2b504f`).
- **Plan 067 PR B — Linear handoff core — BUILT, PR #183 open.** Tenant-scoped/RLS-protected
  feedback-to-Linear links, sanitized handoff rules, conflict-safe link/replace actions, exact loaders,
  dual-cursor pagination, notes-version concurrency protection, and DB/isolation verification. No
  Linear API credentials are used; browser-facing workflow remains PR C.
- **Plan 066 — SO₂/KMBS ledger active-fraction fix — BUILT, eng-review PR (no auto-merge).**
  `consumeMaterialCore` gains an optional `activeFraction`; `recordNeutralDoseTx` passes it for
  ppm/mg/L SO₂ doses so the stock draw + cost = SO₂g/0.576 (KMBS), while `LotTreatment.computedTotal`
  stays delivered SO₂. Fraction from `percentActive` else 0.576. `verify:cost` flipped (31.25 g/$1.56)
  + green; cost-consume unit tests; WORKORDER-3 + invariants green; ADR 0005; read-only under-booking
  advisory. History NOT rewritten. Branch `claude/so2-kmbs-ledger-active-fraction`.
- **Plan 065 — SO₂ addition execution-view clarity — SHIPPED, PR #179 merged** (`df6c6dc`); browser-QA'd.
- **Feedback "SO2 work order unclear" — RESOLVED** (outcome note written; deeper money bug → Plan 066).
- **Plan 064 — bug-triage outcome notes — SHIPPED, PR #177 merged** (`39abefa`). Richer
  write-back (what+how / why+next) in the global workflow + SKILL.md (out-of-repo), and a
  visible outcome timeline + "Outcome" column + `resolvedAt` in `/developer`. New pure
  `parseTriageNotes` (6 tests). No schema (reuses `developerNotes`). Branch pruned; on main.
- Security #90 — cross-tenant user leak + account takeover. `src/lib/users/scope.ts` membership
  filter now scopes the `/users` page reads + all `users/actions.ts` mutators to the caller's
  effective tenant; `createUser` binds new users to the org; `resetUserPassword` gained the
  developer-target guard. Proven closed on live Bhutan/Demo data + isolation harnesses. On branch
  `claude/fix-90-cross-tenant-user-mgmt` → shipping now. Follow-up: TODOS "Per-tenant user role/state".
- Scale tripwire #166 — wrapped the 4 SERIALIZABLE work-order maintenance completion/undo
  txns in `withWriteRetry`. **SHIPPED, PR #172 merged** (`28331fd`); issue closed.
- Plan 063 developer user type (self-replicating) — **SHIPPED, PR #170 merged** (`1fda348`).
  Remaining: interactive browser QA only.

## ⏭️ Next up (candidates, not commitments)

- Browser QA pass on Plan 063 (developer user type).
- **Feedback log HTML-entity garbling** — SHIPPED #178 (`6bc2db1`).
- **Plan 065 — SO₂ addition execution-view clarity — BUILT, shipping.** Execute view is now
  summary-first + edit-gated ("Add 14 ppm SO₂ to Tank 4 → ≈ X L of 10% KMBS solution"); landed
  `resolveSo2Dose` (×0.576) on main; captured solutionPercentKmbs through NL/assistant authoring;
  new pure `buildTaskSummary`. Green locally: tsc, eslint, `next build`, vitest 1927. No schema.
  Branch `claude/addition-execution-view-clarity`. Remaining: CI + browser QA on `/work-orders/*/execute`.

---
_Last updated: 2026-07-17 — `/bug-triage` live run: merged PR #215, handed off 5 plans, queued 3 for human; unblocked triage:list via PR #219 (lazy-import fix). Prior: Plan 072 (invoice/document ingestion → expendables & equipment intake) PLANNED (Deep, 12 units) + REVIEWED 4 ways (eng → council[Codex+Gemini] → design → ChatGPT outside voice); all findings folded; BUILD-READY. Key fixes: inject-tx atomicity, allowlist dose-safety, UOM normalization (Unit 5, money-critical), unified A/P apply path, reconciliation + concurrency gates, Unit 12 real-doc acceptance suite (all 8 docs/invoice examples/ files). A/P = per-lot bills, invoice # as QBO PrivateNote memo. Next /work. Plan 071 (full WO editing) shipped #213 (f0be796)._
