# NOW

> The working-set spine. The ONE file that answers "where was I?" on resume.
> Long-horizon lives in `ROADMAP.md`; parked ideas in `TODOS.md`; decisions in the
> context-ledger. This file is only **today / in-flight**. Keep it short — if it grows
> past a screen, something belongs in TODOS.md or the roadmap instead.

## 🎯 Current objective  (ONE thing)

**Add-variety assistant write flow (ticket cmrs2eops / issue #309, Demo) — FIXED in worktree `variety-add-write-flow-1fd03a`. All gates green (vitest 2452, tsc, lint, verify:naming 25/25); DB-proven on Demo. Next: commit → PR (do NOT push main; wave-1 predecessor to #308/#312).**
Approving an assistant change card to ADD a variety threw a raw error and nothing persisted. Root cause: the generic `db_create` path (`commitDbCreate`) let a duplicate name hit Postgres' `@@unique([tenantId, name])` and surfaced the raw multi-line Prisma **P2002** through the confirm route (`{ ok:false, error }` shows the message verbatim). Reporter asked for varieties (plural), so a same-batch/stale card is the trigger. Second latent bug found: the DB unique is case-SENSITIVE, so "syrah" beside "Syrah" silently created a **duplicate** — a master-data identity violation (NAMING-1).
Fix (fence: `src/lib/assistant/`, `src/lib/reference/`; no schema change):
(1) [entities.ts](src/lib/assistant/entities.ts) — new optional `EntityConfig.findConflict` + shared `nameConflict` helper (case-INSENSITIVE name match, reads only, never re-keys the existing row); wired for the name-unique globals Variety/Vineyard/Location/FinishedGoodCategory (NOT FinishedGood — it has no name unique, dups are legit);
(2) [db-create.ts](src/lib/assistant/tools/db-create.ts) — `run` refuses a conflict up front (no doomed card), `commitDbCreate` re-checks at commit (batch/stale path) **and** catches P2002 as a friendly backstop;
(3) [actions.ts](src/lib/reference/actions.ts) — the `/reference` FORM's `findByName` made case-insensitive too, so both write paths agree on "already exists".
Unit test [assistant-db-create-dedup.test.ts](test/assistant-db-create-dedup.test.ts) (5, hermetic). DB proof on Demo: "Syrah"/"syrah"→friendly refuse (no dup), stale "Merlot" card→refused at commit, a NEW name→persists.
**PENDING: commit + open PR. Browser QA of the live assistant card needs interactive login (user); the DB write is definitively proven by the tenant-script read-back.**

<details><summary>prev objective — bug-report screenshot excludes the report dialog + optionally the assistant (worktree `ecstatic-hofstadter-862254`)</summary>

The assistant's "Report a bug" screenshot captured the report dialog itself (dim backdrop + "Report a bug ×" title bar) and the assistant, occluding the actual page. Fix, 3 files: (1) [Modal.tsx](src/components/ui/Modal.tsx) `overlayProps` passthrough; (2) [AssistantDock.tsx](src/components/assistant/AssistantDock.tsx) `data-assistant-surface` tags; (3) [FeedbackTicketModal.tsx](src/app/(app)/assistant/FeedbackTicketModal.tsx) "Is the bug in the assistant?" Yes/No (default No) + Capture + two-condition `html-to-image` filter + 15s timeout race. Typecheck clean; PENDING user sanity-check of the capture (esp. Yes path) in a REAL browser, then /review → /ship.

</details>

<details><summary>prev objective — Plan 079 winemaking KB RAG — COMPLETE (Unit 11 → PR #293; 4 sources MERGED #292; corpus 1,449 docs)</summary>

**Plan 079 winemaking KB RAG — COMPLETE. Unit 11 subscription settings UI → PR #293 (CI green, browser-QA'd); 4 sources MERGED (#292); corpus 1,449 docs.**
The whole plan is done: crawled cited corpus (AWRI+WA) + Unit 12 re-crawl freshness loop (#289) + 4 new sources
(WSU/OSU-Extension/OSU-OWRI/Scott, #292) + Unit 11 per-tenant subscription UI (#293). Unit 11: a Settings card
(`KnowledgeSourcesCard`) toggles which GLOBAL sources feed THIS winery's assistant — `listSourceSettings()` loader
(effective on/off + doc count), `setKnowledgeSourceEnabled` admin action (upserts tenant-scoped
`KnowledgeSourceSubscription` via runInTenantTx, audited). `verify:kb-subscriptions` 7/7 (disable→dropped from
retrieval, re-enable→restored, RLS isolation, cleanup→default). Browser-QA'd on Demo: card renders 6 sources w/
badges, toggle persists to DB. All sources `defaultEnabled` → nothing changes until a winery toggles one off.
**PENDING: CI on #293 → merge #293. Then plan 079 fully shipped — no active objective; next work is a new plan.**

</details>

<details><summary>prev objective — Unit 12 re-crawl freshness loop (SHIPPED + MERGED PR #289)</summary>

**Plan 079 Unit 12 (re-crawl freshness loop) — MERGED (PR #289); core corpus on main (PR #285).**
Weekly GH Actions loop (`knowledge-recrawl.yml` → `scripts/recrawl-knowledge.ts`): conditional-GET re-crawl
→ re-embed only changed pages into a new revision behind the atomic flip, add new, tombstone 404s
(`status='withdrawn'`, kept for audit); reversible + self-correcting; tombstone gated to COMPLETE crawls;
single-flight; writes GLOBAL corpus only; opens a GitHub issue; never merges code. Post-merge activation
needs repo secrets `DATABASE_URL_UNPOOLED` + `VOYAGE_API_KEY`, then trigger once with `max_docs=5`.

</details>

<details><summary>prev objective — Plan 079 bug-report clarification loop (FULLY SHIPPED, different workstream)</summary>

**Plan 079 bug-report clarification loop — FULLY SHIPPED to main (all 13 units), browser-QA'd end-to-end.**
Four landing PRs: #276 (backend spine), #281 (U11-UI + U12 assistant surfacing), #277 (inventory-error sibling),
**#282 (U8 in-agent `request_clarification` tool + workflow branch, `6ac7b0b`)**; docs truth-up PR #283. What it does:
(1) a bug report auto-captures the browser console (ring buffer → clamped debug context); (2) when the automation
finds a report too thin to act on — either a cheap-LLM **sufficiency gate** pre-flight OR the fix agent
mid-investigation via the new `request_clarification` tool — it **DMs the reporter** from "Cellarhand Support" with a
`[Ref: BUG-XXXX]` token, parks the run at `AWAITING_CLARIFICATION`; (3) the reporter sees a "Needs your input" chip on
My Reports + an assistant nudge, replies in their inbox; (4) the reply hook strips the ref token, flips the
clarification to ANSWERED, feeds the answer onto the ticket, and **re-dispatches the fix workflow at attempt 2**
(`MAX_CLARIFICATION_ROUNDS=2` now live). Watchdog + TTL sweep cron recovers strands. DONE — nothing pending.

</details>

<details><summary>prev objective — P0 bottling ABV range guard (SHIPPED PR #275)</summary>

**P0 bottling ABV range guard (feedback `cmrqtzlc1000kij049zm4me25` / #263, DEFECT) — SHIPPED, PR #275 merged (`c74ec98`).**
Ticket RESOLVED + reporter (Mike, `mike@bhutanwine.com`) DM'd from Cellarhand Support. Branch pruned. Bug: the
bottling flow accepted an absurd ABV (e.g. **140%**) with no upper bound → corrupt finished-goods/tax data.
Fix: ABV is a %-by-volume, physically bounded to **(0, 100]** — new pure helper
[abv-range.ts](src/lib/bottling/abv-range.ts) (`validateBottlingAbv` + constants + friendly messages), shared by
client + server so wording matches. Server source of truth is `runBottlingTx`
([run.ts:63](src/lib/bottling/run.ts)) — the single choke point every entry point routes through (standalone
create/edit AND the WO BOTTLE task in `execute.ts`), so all paths are covered without touching the out-of-fence WO
files. `parseAbv` ([actions.ts](src/lib/bottling/actions.ts)) validates at the action boundary for a fast message;
[BottlingClient.tsx](src/app/(app)/bottling/BottlingClient.tsx) makes ABV controlled with an inline hint + `max` and
blocks submit out of range. Ceiling is the physical max, NOT 24% — compliance tax-class intentionally captures >24%
and flags it for review (`abv-over-24-review`), so rejecting at 24 would defeat that design. GREEN: unit 8/8
([test/bottling-abv-range.test.ts](test/bottling-abv-range.test.ts)), verify:cost 55/55 (happy path intact), tsc +
lint clean, verify:naming 25/25; CI check/review/tenant-isolation/GitGuardian all passed. Demo DB proof:
`executeBottling(abv=140)` rejected with ZERO writes (no SKU/run, vessel untouched), `abv=13.5` still succeeds.

</details>

<details><summary>prev objective — Ticket #188 harvest-pick + VineyardBlock cascade delete (SHIPPED PR #265)</summary>

**Ticket #188 — assistant delete for standalone harvest picks + user-confirmed VineyardBlock cascade — SHIPPED (PR #265, `3eb512e`).**
Feedback `cmrm6akt60001jp04fmxyrl0l` (Bajo test-data cleanup): couldn't delete blocks refused by dependent
Brix/harvest records, and no path to delete a standalone harvest pick.
(1) **`delete_harvest_pick`** assistant tool — inverse of `log_harvest_pick`, mirrors `delete_brix`; hardened
`deleteHarvestPick` refuses a crushed pick (`LotHarvestSource` Restrict; was a latent 500) + fixed audit action.
(2) **Confirmed cascade in `db_delete`** — `RelationSpec.cascadable` + `EntityConfig.cascadeRestrict`; `VineyardBlock`
cascades Brix + harvest records (+ discloses subblocks) but HARD-REFUSES crushed picks & keeps WO-task FK a hard wall.
No schema. `/review` CLEAR (3 specialists, 0 critical). vitest 2333/0, tsc/eslint/ai-native green.

</details>

<details><summary>prev objective — Ticket #268 self-assigned WO inbox emit + "Issue" button (SHIPPED PR #278)</summary>

**Ticket #268 — self-assigned WO emitted no inbox notification + confusing "Issue" button — SHIPPED (PR #278, `6dc2d14`).**
Feedback `cmrqtvwja000fij04rsn25z15` (Demo Winery). Two issues: (a) the WO detail "Issue" button was ambiguous
(reads like "report a problem"; it actually flips DRAFT→ISSUED and opens execution); (b) **the real defect** — a
self-assigned WO showed in the inbox WO bucket (assigneeId set) but produced NO inbox notification, because every emit
path suppressed self-notifications AND the create path never emitted an assignment notification at all.
Fix: new `allowSelfNotification` flag on `EmitNotificationInput` + pure `shouldEmitNotification` gate; emit a
`WO_ASSIGNED` notification at the create chokepoint (`createWorkOrderCore`) to the resolved assignee **allowing self**,
and mark the reassign emit self-aware too. `WO_STATUS` self-suppression unchanged. Button → "Issue & open for
execution" + a DRAFT helper line. vitest 50/50 (4 new gate tests); DB proof passed.

</details>

<details><summary>prev objective — WO builder same-vessel transfer guard (cmrqqm75b, SHIPPED PR #262)</summary>

**WO builder same-vessel transfer guard (feedback cmrqqm75b, P1 defect) — SHIPPED, PR #262 merged (`ee851b8`).**
Ticket RESOLVED/DEFECT + issuer (Mike) DM'd. Branch pruned. Bug: the WO builder let you author a transfer
(RACK) whose source and destination are the SAME vessel; execution correctly refuses it, so a user could save a WO
guaranteed to fail at execute — builder validation out of sync with the execution guard. `/investigate` confirmed
root cause: execution refuses `fromVesselId === toVesselId` at [rack-core.ts:94](src/lib/vessels/rack-core.ts:94)
(RACK) and [topping.ts:42](src/lib/cellar/topping.ts:42) (TOPPING), keyed on **vessel id**; but the shared builder
validation core `readTask` in [proposal-readiness.ts](src/lib/work-orders/proposal-readiness.ts) only checked each
vessel exists + is active, never source ≠ dest. Fix = mirror the guard: add a `blocking(ctx, "same_vessel", …)` in
the RACK and TOPPING readiness cases (same-id short-circuit). Flows to BOTH surfaces automatically — the builder UI
(`readiness.status === "blocked"` disables Create + shows the warning) AND the server write gate
`gateWorkOrderReadinessForWrite` (refuses create/edit; `safeAction`→`settleAction` returns `{ok:false,error}`, no
thrown ActionError). Execution guards kept as backstop, unchanged. GROUP_RACK deliberately untouched (execution
silently filters self-members, not a reject). 4 regression tests in
[test/work-order-readiness.test.ts](test/work-order-readiness.test.ts) (same-vessel RACK+TOPPING blocked, distinct
vessels ready). GREEN at merge: vitest 21/21 (readiness), tsc, eslint, next build, verify:work-orders 43; CI
(check + tenant-isolation + GitGuardian + Vercel) all passed. Closed the loop: ticket → RESOLVED/DEFECT with a
write-back note, and a resolution DM sent to the issuer (Mike, `mike@bhutanwine.com`).

</details>

<details><summary>prev objective — P0 bottling no-cork guard (SHIPPED, PR #259, a173e0a)</summary>

**P0 bottling no-cork guard (feedback bug) — SHIPPED, PR #259 merged (`a173e0a`).**
Superseded client-only PR #242 with a server backstop. Pure classifier in
[packaging-bom.ts](src/lib/bottling/packaging-bom.ts) — `classifyPackagingRole` (name/kind → bottle|closure|label;
a capsule is deliberately NOT a closure). Server guard
[mandatory-packaging.ts](src/lib/bottling/mandatory-packaging.ts) `assertMandatoryPackaging(packaging, loadMaterials)`
— wired into `createBottlingRun`/`editBottlingRun` ([actions.ts](src/lib/bottling/actions.ts)) AND the WO BOTTLE task
([execute.ts](src/lib/work-orders/execute.ts)) at the entry points, not `runBottlingTx`. UI mirrors in
[BottlingClient.tsx](src/app/(app)/bottling/BottlingClient.tsx) + BottlingTaskForm. Live Demo proof: corkless run
REJECTED with zero partial writes; full run wrote 100 bottles + depleted cork 500→400.

</details>

<details><summary>prev objective — #241 dashboard Recent activity filter (BUILT)</summary>

**Feedback #241 (cmrqpp88 "too much detail in dashboard") — dashboard Recent activity filtered to leadership-relevant events — BUILT, ready for /ship.**
Branch `claude/work-241-page-tsx-5fdfdb` (commit 752c212). The leadership dashboard's Recent activity feed pulled the last 6
audit rows indiscriminately, burying operational signal ("we bottled wine today") under bug-triage / dev-automation /
auth-admin churn. Added a leadership-relevance classifier to [src/lib/audit.ts](src/lib/audit.ts) — denylist of
non-operational entity types (`FEEDBACK_TICKET`, `ASSISTANT_FEEDBACK`, `AutomationRun`, `AppSettings`, `Session`, `User`,
`VendorImportCandidate`, `DirectMessage`) + actions (`LOGIN`, `PASSWORD_*`, `USER_CREATED/DELETED`, `USER_VINEYARD_ASSIGNED`,
`IMPERSONATE`) — exposed as a pure predicate `isOperationalAuditEntry` + a synced Prisma fragment `operationalAuditWhere`;
[page.tsx](src/app/(app)/page.tsx) filters the feed at the DB. Denylist (not allowlist) so new operational events show by
default. GREEN: tsc, eslint, vitest 15/15 (audit + assistant-audit). Proven on real prod data (Neon): prior 6th feed row
"Developer approved feedback automation" drops out, replaced by a real work-order event. Next: `/review` then `/ship`.

<details><summary>prev objective — Plan 076/078 invoice ingestion (SHIPPED, PR #246)</summary>

**Plan 076/078 — invoice ingestion: dupe guard + one-Bill-per-invoice QBO + Paid/Outstanding A/P — SHIPPED (PR #246 OPEN).**
Branch `claude/invoice-ingestion-features-95d4df`; merged latest main (Plan 075 vendor-pull; resolved qbo/client.ts conflict).
All gates green post-merge (vitest 2284, ingest 81, accounting-idempotency 33, invariants 35/35, next build). Live QBO
pass + Demo browser-QA both DONE + user-confirmed. Only remaining: accountant sign-off on the BillPayment GL (not a
merge blocker). Plan at
[docs/plans/2026-07-18-076-…](docs/plans/2026-07-18-076-feat-invoice-qbo-bill-payment-status-plan.md).
(1) Duplicate confirm gate — stage-time structured `duplicates` + upload modal ("continue?") + hard apply guard
(`allowDuplicate`). (2) **One aggregate Bill per invoice** — `emitApExportForInvoice` (postingKey `apinv:<id>`,
multi-line `billLinesJson`), per-lot emit suppressed via `skipApEmit`, multi-line `buildBillPayload`; new invariant
AP-1. (3) Paid/Outstanding — schema on `IngestedInvoice`+`ApExportEvent`+AppSettings pay-from accounts, required
review-screen selector, `setInvoicePaymentStatus` post-apply flip, QBO **BillPayment** poster pass (Check/CreditCard,
exactly-once), inbound Bill.Balance read-back in reconcile (two-way + discrepancy surfacing). Two RLS-neutral
migrations applied to Neon. **Live QBO-sandbox pass DONE + USER-CONFIRMED**; **Browser-QA on Demo DONE**. PENDING before
prod trust: **accountant sign-off** on the BillPayment GL direction only.

</details>

<details><summary>prev objective — QBO vendor sync Slice 2 (Plan 077, BUILT on claude/qbo-vendor-eager-push)</summary>

**QBO vendor sync Slice 2 — eager create-into-QBO (Plan 077) — BUILT (all 7 units), gates green, live-proven on Demo. Next: `/ship`.**
Branch `claude/qbo-vendor-eager-push`. Final slice of the vendor-sync arc (Slice 0 #229 near-dup guard, Slice 1
#231 pull queue). When an opted-in winery creates a vendor in Cellarhand it's pushed to QuickBooks immediately,
so an owner-operator never opens QBO. Push runs AFTER `createVendorCore` commits (never a DB tx across the QBO
HTTP call — Neon P2028), home-currency only (foreign `(CUR)` vendors stay lazy at bill-post, Plan 073),
idempotent (skip if already linked; `findOrCreateVendor` query-before-creates). Fuzzy-matches QBO first
(Slice-1 `listVendors` + Plan-074 `findVendorNearMatches`) so it never mints "Scott Labs"/"Scott Laboratories"
in QBO — the modal offers **link-to-existing** vs **create-new**. QBO offline → `syncStatus='pending'` + a retry
sweep (`runVendorSyncSweep` + `/api/cron/qbo-vendor-sync`, 14:45 UTC). Two vendors → one QBO id → `conflict`
(Slice-1 `@@unique`, not a 500). Opt-in per tenant (`AppSettings.pushVendorsToQbo`, default off; large wineries
author in QBO). Units: U1 columns+migration (applied to Neon), U2 eager-push core, U3 fuzzy pre-check action,
U4 modal link-vs-create wired through the setup page, U5 sweep+cron, U6 `/settings` toggle, U7 `verify:vendor-sync`
(5/5 deterministic + live QBO push/pre-check under `VERIFY_VENDOR_SYNC_LIVE=1`) + backfill + security note.
**Gates all green:** tsc, `verify:vendor-sync` (link/idempotent/conflict/sweep-gating/opt-in + LIVE push=synced,
pre-check clean), verify:ai-native, verify:parity, verify:naming, verify:tenant-isolation, vendor vitest 61,
lint 0 errors, `next build` clean (cron route registered). Plan: `docs/plans/2026-07-18-077-feat-qbo-vendor-eager-push-plan.md` (status: completed).

</details>

<details><summary>prev objectives (on their own branches / shipped)</summary>

- **Movable + growable assistant dock — BUILT + browser-QA'd on Demo** on `claude/assistant-widget-drag-resize-3c069b`.

- **Plan 073 multi-currency FX ingestion — BUILT (10 units), gates green, ready for `/ship`** on branch
  `claude/multi-currency-fx-ingestion`. Foreign invoice → base-currency inventory at a dated ECB rate
  (Frankfurter, keyless) + EUR A/P Bill to QBO; P0 double-conversion fixed by decoupling (lot=base,
  `ApExportEvent`=foreign+rate). Live EUR Bill + €767.16 e2e proven in Cellarhand AND QBO.
- **Plan 072 invoice/document ingestion — SHIPPED (PR #223, 24d7d35).** Vendor merge + removal — SHIPPED (#222).

</details>

<details><summary>prev objective — Plan 072 invoice ingestion (SHIPPED, PR #223, 24d7d35)</summary>

**Invoice/document ingestion → deterministic expendables & equipment intake (Plan 072) — SHIPPED to main.**
Branch `claude/invoice-ingestion-intake-385010`. All 12 units committed to the branch
(committed, all gates green): U1 schema+migration (4 RLS staging/provenance tables + composite FKs, applied to
Neon), U2 EQUIPMENT category + `isDoseableCategory` denylist→ALLOWLIST + `UNCLASSIFIED` sink (WORKORDER-7),
U3 PDF-aware private blob + upload route, U4 extraction core (de-risking spike PASSED — `claude-opus-4-8`
accepts native PDF `document` blocks; captured + verified all 8 real docs vs the plan matrix), U5 landed-cost
allocator + UOM normalize (money-critical), U6 vendor-scoped dedup matcher, U7 atomic apply core (inject ONE
tx through the cost cores; proforma/reconciliation/concurrency gates; unified new+existing→receiveSupplyCore
both emitting A/P stamped with invoice#; COA attach; tenant re-verify) — **proven by `verify:ingest` (31
assertions) + `verify:cost` 55/55**, U9 assistant `ingest_documents` tool (verify:ai-native green), U12
real-doc acceptance (STEP2 CI test 12/12 + STEP3 gated live script), U8 review screen (`+ Ingest invoice`
launcher → upload → review; per-doc panels, dedup control, proforma gate, source-doc proxy, apply w/ inline
needsAck; 17 model tests), U11 verify sweep. U10 write side + source-doc surfacing done; the per-lot
expiry/provenance HISTORY panel is a scoped follow-up chip (display-only; data captured + proven).
**GATES ALL GREEN:** tsc 0, next build clean, vitest 2179/0, verify:cost 55/55, verify:ingest 31,
verify:ai-native / invariants / naming / parity / raw-sql / tenant-isolation / work-orders-enhancements.
**PENDING before merge: human sign-off on the extraction snapshots (`qa/ingest-fixtures/SNAPSHOT-VERIFIED.md`)
+ browser-QA of the review screen in Demo Winery. Next: `/ship`.** See:
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
searchable PrivateNote memo (NOT grouped — QBO DocNumber is the per-lot idempotency key).

</details>

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

- **Add-variety assistant write flow (ticket cmrs2eops / #309, Demo) — FIXED (worktree, PR pending).** Raw P2002 on a duplicate variety name surfaced through the confirm route → generic error, nothing persisted; also a case-sensitive silent dup ("syrah" beside "Syrah"). Fix: `EntityConfig.findConflict` (case-insensitive, master-data identity/NAMING-1) guards `db_create` at run + commit + a P2002 backstop, and the `/reference` form's `findByName` is case-insensitive too. vitest 2452/0 (5 new), tsc/lint/verify:naming green; DB-proven on Demo.
- **Plan 079 KB RAG — Unit 11 subscription settings UI → PR #293** (CI green, browser-QA'd). Settings card toggles which sources feed the assistant per winery; `verify:kb-subscriptions` 7/7. LAST plan-079 unit → plan COMPLETE.
- **Plan 079 KB RAG — 4 new sources → MERGED PR #292** (WSU 95 + OSU Extension 36 + OSU-OWRI 264 + Scott Labs 28 = 426 new docs; corpus 1,449 total). Curated wine/grapes-only scoping; verify:knowledge-base 14/14.
- **Plan 079 winemaking KB RAG — core corpus SHIPPED to main (PR #285, `6d7f894`); Unit 12 re-crawl loop MERGED (PR #289).**
  Cited "assistant winemaker" over a GLOBAL crawled pgvector corpus (AWRI 745 + Wine Australia 278 docs / 6,150 chunks),
  per-tenant source subscriptions, hybrid retrieval (dense + FTS, RRF + MMR), defers math to existing calculators. Unit 12
  adds the weekly freshness loop (see current objective). Remaining: add sources (Davis/OSU/WSU/Cornell) → Unit 11 subscription UI.
- **Plan 079 bug-report clarification loop — FULLY SHIPPED (13/13 units, PRs #276/#281/#277/#282, docs #283); browser-QA'd end-to-end.**
  Vague ticket → auto-captured console + a sufficiency gate (or the fix agent's `request_clarification` tool) → DM the
  reporter from "Cellarhand Support" with `[Ref: BUG-XXXX]` → "Needs your input" chip + assistant nudge → reply strips
  the token, flips clarification ANSWERED, feeds the answer onto the ticket + re-dispatches the fix workflow at attempt 2
  (`MAX_CLARIFICATION_ROUNDS=2` live). Watchdog+TTL sweep cron. All 9 council concurrency fixes + 4 /review CRITICALs
  folded. U8 proven: a real fix-agent run on a deliberately vague ticket chose `request_clarification` over `apply_fix`.
- **Empty-source stock-transfer error clarity (feedback cmrquedll…, #270) — SHIPPED + MERGED (PR #277, addc318).**
  `moveStock` → `safeAction` + `unwrap` (Next redacted the thrown ActionError in prod); `transferStock` names the reason
  (empty "no inventory there" vs shortfall "only N there"). vitest 55, verify:naming/ai-native green; Demo DB proof.
- **P0 bottling ABV range guard (feedback cmrqtzlc…me25 / #263, DEFECT) — SHIPPED + MERGED (PR #275, c74ec98); ticket RESOLVED, reporter Mike DM'd; branch pruned.**
  Bottling accepted an absurd ABV (140%) → corrupt finished-goods/tax data. Fix: server-enforced range **(0, 100]** in
  `runBottlingTx` (the one choke point for standalone create/edit AND the WO BOTTLE task) via new shared pure helper
  `src/lib/bottling/abv-range.ts`, + inline client hint/`max` in BottlingClient. Ceiling is the physical max (NOT 24% —
  compliance intentionally captures >24 for review). unit 8/8, verify:cost 55/55, tsc/lint/naming green; Demo DB proof:
  140% rejected with zero writes, 13.5% still succeeds.
- **Ticket #268 — self-assigned WO inbox emit + "Issue" button clarity — SHIPPED + MERGED (PR #278, 6dc2d14); ticket RESOLVED.** (parallel session)
- **Ticket #188 — `delete_harvest_pick` + confirmed VineyardBlock cascade — MERGED (squash PR #265, 3eb512e); ticket RESOLVED.**
- **Inbox WO "viewer redundancy" (feedback cmrqqjk57, P2 display) — SHIPPED + MERGED (PR #274, 222fe63); ticket RESOLVED/DEFECT, reporter Mike DM'd; branch pruned.**
  Design-partner (Mike) report on `/inbox?bucket=wo`: "when I select a work order to view it, I shouldn't have to
  select it again in the viewing box to open it." `/investigate` (via the real ticket `pageUrl`, not `/work-orders`)
  found the Inbox WO list row only set local `selected` state and the reader pane rendered a stub whose "Open work
  order" link did the real nav → two selections per WO. Fix in
  [InboxClient.tsx](src/app/(app)/inbox/InboxClient.tsx): WO row is now a direct `<Link>` to `/work-orders/[id]`
  (one click, matches the DM bucket + /work-orders list cards); removed the dead reader-pane WO branch; narrowed the
  `selected` union. 7 ins / 17 del, one file. tsc + eslint + `next build` green; browser-verified in Demo (single
  `<a href="/work-orders/…">`, no "Open work order" stub, one-click opens the detail page, no console errors);
  QA fixture cleaned up.
- **QBO vendor sync Slices 0–2 — the full arc.** Slice 0 near-dup guard SHIPPED (#229), Slice 1 pull queue
  SHIPPED (#231), Slice 2 eager push BUILT (Plan 077, all 7 units, live-proven on Demo) → `/ship` next.
- **Chat "400 Invalid messages" defect (Bhutan cmrm9s97) — FIXED, PR #220 open; ticket closed-loop.**
  `/investigate` root cause: the chat client sends the FULL conversation history every turn (no cap);
  the server (`api/assistant/route.ts` `parseMessages`) hard-rejected with 400 once history passed 40
  messages OR any turn passed 8000 chars — permanently bricking the conversation (a long assistant reply
  poisoned every future send). NOT a regression (validation existed since `ffb9471`); latent scaling limit.
  Fix = **window, don't reject**: new pure `src/lib/assistant/message-window.ts` (`parseAndWindowMessages`
  keeps last 40, truncates over-long PRIOR turns, specific error only for a bad current msg, guarantees the
  Anthropic shape) + `route.ts` uses it + both clients cap history sent + text client guards over-long input.
  9-case regression test; assistant suite 158/158; tsc clean. Ticket → IN_PROGRESS/DEFECT + outcome note;
  queued AGENTIC_FIX run neutralized (AWAITING_APPROVAL → SKIPPED, ticket automationStatus synced) so it
  can't be dispatched. Related latent bug flagged (consecutive same-role after an errored turn → "Assistant
  error"), left as a follow-up.
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
_Last updated: 2026-07-19 — NEW in-flight: add-variety assistant write flow FIXED (ticket cmrs2eops / #309, Demo). Approving a "add variety" change card threw a raw Prisma P2002 (duplicate name vs @@unique([tenantId,name])) surfaced verbatim through the confirm route → generic error, nothing persisted; plus a case-sensitive silent duplicate ("syrah" beside "Syrah"). Fix (no schema): EntityConfig.findConflict (case-insensitive name match, master-data identity/NAMING-1 — never re-keys the existing row) guards db_create at run (no doomed card) AND commit (batch/stale path) with a P2002 friendly backstop, wired for the name-unique globals Variety/Vineyard/Location/FinishedGoodCategory (not FinishedGood — dups legit); /reference form findByName made case-insensitive so both write paths agree. 5 hermetic unit tests; vitest 2452/0, tsc, lint, verify:naming 25/25; DB-proven on Demo (Syrah/syrah refused no-dup, stale Merlot card refused at commit, new name persists). PENDING commit → PR (wave-1 predecessor to #308/#312; do NOT rebase onto them). Prior in-flight: bug-report screenshot now excludes the "Report a bug" dialog (backdrop + title bar) and, unless the user answers Yes to a default-No "Is the bug in the assistant?" toggle, the assistant dock too — so the capture shows the real page, not the report popup. 3 files (Modal overlayProps passthrough, AssistantDock data-assistant-surface tags, FeedbackTicketModal Yes/No + Capture + two-condition html-to-image filter). Typecheck clean; pending browser-QA. Prior: Plan 079 KB RAG COMPLETE: Unit 11 per-tenant subscription settings UI → PR #293 (CI green + browser-QA'd on Demo; KnowledgeSourcesCard toggles which global sources feed a winery's assistant; listSourceSettings loader + setKnowledgeSourceEnabled admin action upserting tenant-scoped KnowledgeSourceSubscription; verify:kb-subscriptions 7/7 incl RLS isolation). Prior in this arc: 4 new sources MERGED #292 (WSU/OSU-Extension/OSU-OWRI/Scott, corpus 1,449 docs), Unit 12 re-crawl loop MERGED #289, core corpus #285. PENDING: merge #293 → plan 079 fully shipped. Prior: 4 new sources → PR #292 (WSU 95 + OSU Extension 36 wine/grapes-only + OSU-OWRI 264 + Scott Labs 28; corpus 1,449 docs). New config sitemapUrls?/autoCrawl?, normalizeCrawlUrl dedup, reset:knowledge-source. OSU robots reassessed (our UA permitted; blocks only named training crawlers). verify:knowledge-base 14/14, gates green. PENDING CI→merge, then Unit 11 subscription UI. Prior: Unit 12 re-crawl freshness loop MERGED PR #289 (branch claude/kb-recrawler off merged main); core corpus already on main (PR #285). Weekly GH Actions loop (knowledge-recrawl.yml → scripts/recrawl-knowledge.ts): conditional-GET re-crawl of active sources → re-embed only changed pages into a new revision behind the atomic flip, add new pages, tombstone 404s (status='withdrawn', kept for audit); reversible + self-correcting; tombstone pass gated to COMPLETE crawls; single-flight; writes GLOBAL corpus only (never tenant data); opens a GitHub issue; never merges code. Smoke-tested on live Neon (KB_MAX_DOCS=3), tsc clean; AUTOMATION.md loop 5 + security-register corrected. PENDING: CI green → merge #289; then add sources (Davis/OSU/WSU/Cornell) → Unit 11 subscription UI; post-merge add secrets DATABASE_URL_UNPOOLED + VOYAGE_API_KEY and trigger once with max_docs=5. — Prior: Plan 079 bug-report clarification loop FULLY SHIPPED to main (all 13 units): PRs #276 (backend spine) + #281 (U11-UI My-Reports chip + U12 assistant surfacing) + #277 (inventory-error sibling) + #282 (U8 in-agent request_clarification tool + workflow branch, 6ac7b0b) + docs truth-up #283. Vague ticket → auto-captured browser console + a cheap-LLM sufficiency gate (or the fix agent mid-investigation via request_clarification) → DM the reporter from "Cellarhand Support" with a [Ref: BUG-XXXX] token, park the run at AWAITING_CLARIFICATION → reporter sees a "Needs your input" chip on My Reports + an assistant nudge, replies in inbox → reply hook strips the token, flips clarification ANSWERED, feeds the answer onto the ticket, re-dispatches the fix workflow at attempt 2 (MAX_CLARIFICATION_ROUNDS=2 now live); watchdog + TTL sweep cron recovers strands. All 9 council concurrency fixes + 4 /review CRITICALs folded. Browser-QA'd the whole loop in the in-app Claude browser; QA fixtures cleaned, .env + Demo bugReportMode restored; gates green (tsc, eslint, vitest; CI check + tenant-isolation on #282). Prior: Empty-source stock-transfer error clarity (feedback cmrquedll…, plan #270) SHIPPED (PR #277): /inventory Move-stock Transfer from a location holding none of the item was blocked but showed a generic "an error occurred" — `moveStock` was a plain `action` so Next redacted the thrown ActionError in prod. Fix: `moveStock` → `safeAction` + `unwrap` at both call sites (Inventory form + assistant adjust-inventory committer); `transferStock` names the reason (empty "no inventory there" vs shortfall "only N there"). tsc/eslint/vitest-55/verify:naming/verify:ai-native green + DB proof on Demo (QA-* fixtures, cleaned). Worked in the session worktree (main checkout live-in-use by a parallel session). PENDING: CI green → squash-merge → resolve ticket + DM Mike. Prior: P0 bottling ABV range guard (feedback cmrqtzlc…me25 / #263, DEFECT) SHIPPED + MERGED (PR #275 squash-merged to main, c74ec98): bottling accepted an absurd ABV (140%) → corrupt finished-goods/tax data; fix is a server-enforced range (0, 100] in runBottlingTx (the one choke point for standalone create/edit AND the WO BOTTLE task) via new shared pure helper src/lib/bottling/abv-range.ts, + inline client hint/max in BottlingClient; ceiling is the physical max, NOT 24% (compliance intentionally captures >24 for tax review). unit 8/8, verify:cost 55/55, tsc/lint/verify:naming green; CI check/review/tenant-isolation/GitGuardian passed; Demo DB proof — 140% rejected with zero writes (no SKU/run, vessel untouched), 13.5% still succeeds; ticket → RESOLVED with write-back note; resolution DM sent to reporter Mike (mike@bhutanwine.com) from Cellarhand Support; branch pruned. Prior: Inbox WO "viewer redundancy" (feedback cmrqqjk57, P2) SHIPPED + MERGED (PR #274 squash-merged to main, 222fe63): the Inbox wo-bucket reader-pane stub ("Open work order" 2nd click) removed, WO list row is now a direct <Link> to /work-orders/[id]; tsc/eslint/next build green + browser-verified on Demo; ticket → RESOLVED/DEFECT with write-back note; resolution DM sent to reporter Mike (mike@bhutanwine.com); branch pruned. Prior in-flight: Ticket #188 delete_harvest_pick + confirmed VineyardBlock cascade SHIPPING (PR #265) on claude/harvest-vineyard-lib-295869; PENDING live DB proof + browser-QA. Also: WO builder same-vessel transfer guard (feedback cmrqqm75b, P1) SHIPPED — PR #262 squash-merged to main (ee851b8), CI all green; ticket → RESOLVED/DEFECT with write-back note; resolution DM sent to issuer Mike (mike@bhutanwine.com); branch pruned. Fix mirrors the execution guard (rack-core.ts:94 / topping.ts:42, keyed on vessel id) as a blocking readiness warning in RACK+TOPPING (proposal-readiness.ts readTask) → disables builder Create + refuses server write gate; execution kept as backstop; 4 regression tests. Also merged in parallel: Ticket #268 self-assigned WO inbox emit + "Issue" button clarity SHIPPED (PR #278, 6dc2d14). Prior: P0 bottling no-cork guard SHIPPED (PR #259, a173e0a); Plan 076 invoice ingestion SHIPPED (#246)._
