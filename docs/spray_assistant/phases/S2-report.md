# S2 phase report — registration + resistance master

**Wave 1, lane B · shipped 2026-07-26 · live in production**
Plan: [S2-registration-resistance-master-plan.md](S2-registration-resistance-master-plan.md) ·
Council: [S2-council-feedback.md](S2-council-feedback.md) ·
QA: [S2-qa-report.md](../qa/S2-qa-report.md) ·
Cross-lane contract: [S2-S3a-factsAsOf-contract.md](S2-S3a-factsAsOf-contract.md)

**PRs:** [#522](https://github.com/russellmoss/wine-inventory/pull/522) (schema slice, landed alone
and first) → [#525](https://github.com/russellmoss/wine-inventory/pull/525) (Units 2–11), squashed to
`147b75c3`. GitHub records a **Production** deployment for that SHA; main CI green.

---

## What exists now that did not before

`src/lib/pesticide/` — the relational answer to the two questions a grower must settle before any
agronomy happens: *is this product legally registered on grapes in my state*, and *what mode of action
is it, so does my program actually rotate*.

**Live in the production tables:**

| | |
|---|---|
| Active grape registrations | **2,420** |
| Grape site registrations (with bearing/non-bearing) | **4,757** |
| Distinct active ingredients | **361** |
| Resistance assignments | **361** — **zero unclassified** |
| CA `REGISTERED` state rows | **3,162** (833 distinct products) |
| Published data revisions | 9 |

**Coverage report** (the Unit 9 deliverable): 35 `CODED` / 1 `NO_CODE_EXISTS` / 325 `GAP`.
Fungicide-scoped — the denominator a rotation question actually depends on — 153 → 35 / 1 / 117.
`biologicalsShareOfGap: 59`. `normalizationRecovered: 10`.

**Gates:** `verify:pesticide` 31/31 · `verify:invariants` 42/42 · `verify:invariant-frontmatter` ·
`verify:ai-native` · `verify:tenant-isolation` · `verify:kb-subscriptions` · `verify:naming` 25/25 ·
4,564 unit tests.

**Shipped DARK.** `epa-pesticide` is `defaultEnabled: false`, so no tenant sees anything until an
admin enables it. Nothing user-facing changed with this deploy — by design (K12: it also keeps
non-US tenants clean).

## The six decisions that carry weight

1. **The safety rules are DB constraints, not conventions.** `chk_pra_coded_has_codes` makes
   `CODED ⟺ non-empty codes` uninsertable otherwise, so a coverage gap physically cannot be stored as
   a resolved code. `chk_pra_product_not_ai_keyed` is the Switch guard: a product-level assignment can
   never originate from an AI-keyed source. Both are CHECKs because a comment and a unit test were the
   alternative, and this is the failure mode the phase exists to prevent.
2. **Entitlement lives in the service layer, not the tool.** `lookup.ts` is the only module in the
   lane that imports `@/lib/prisma`, enforced by a source scan. S9, S10 **and S11** all consume it —
   S11 must not add a second, divergent gate.
3. **Jurisdiction is a required argument.** Federal registration alone is never `ok: true`. Outside
   CA the answer is `state-registration-unknown` with the federal fact shown but not as a clearance;
   outside the US, `jurisdiction-unsupported`, **returned rather than thrown** (Bhutan is live).
4. **`codes` is an array, not a scalar** — a deviation from the plan's literal column. Three of the
   plan's own success criteria are multi-code premixes (Switch 9+12, Pristine 7+11, Zampro 45+40) and
   the per-scheme partial unique allows exactly one row per subject. Same fail-closed contract via the
   cardinality CHECK.
5. **The committed JSON artifacts are the truth; the monthly fetch is a drift DETECTOR.** Running
   `derive:resistance` without `--propose` re-verifies the artifact against the live extension table
   and reports disagreement. It never auto-updates a resistance code — that stays a human review.
6. **No `-core.ts` suffix anywhere in the lane** (K1). S2 ships no user-facing capability, so
   registering a core no tool can reach for three waves would be a false coverage signal.
   `verify:ai-native` is green as a result, with no allowlist entry spent.

## Findings — things the plan could not have known

1. **Zampro resolves `GAP`, not `45, 40`.** A plan success criterion the free sources cannot meet, and
   precisely the miss plan 086's de-risk measured. It is now **visible in the coverage report rather
   than silently wrong**. Closing it is a Cornell purchase decision, and `biologicalsShareOfGap: 59`
   is the number to decide against.
2. **The plan's grape regex had a hole.** `/\bGrapes?\b(?!fruit)/` **matches "Grape-Ivy"** — the
   hyphen is a word boundary — so an ornamental houseplant would have been ingested as a wine-grape
   registration. Explicit rejections added for Grape-Ivy, Grapefruit, Oregongrape and Grapevines
   (Ornamental); tested in both directions.
3. **`exceljs` cannot read the APPRIL dump at all** — not a memory ceiling, a hard failure on the
   zip's data-descriptor entries. The plan's fallback became the primary path: unzip the sheet entry
   and SAX-parse. 366,591 rows in ~15 s at ~134 MB peak RSS. `sharedStrings.xml` is 138 bytes because
   the sheet uses inline strings. Dependencies are `unzipper` + `saxes`, dev-only, scripts-only.
4. **Our own corpus copy is lossy for derivation.** Chunking split a mode-of-action table cell and
   cost iprodione its code. Deriving from the source page directly — same Tier-1 source, same
   citation — recovered **10 more codes** (iprodione, mancozeb, sulfur, mefenoxam, myclobutanil,
   pyrimethanil, quinoxyfen, metrafenone, kresoxim-methyl, and trifloxystrobin's `siteType`).
5. **Measured scale drifted from plan 086**: 2,509 → **2,420** active grape registrations, 338 → **361**
   distinct AIs, between the 2026-07-15 and 2026-07-21 dumps. Headers unchanged, 0 parse errors —
   ordinary registration churn. Recorded as a finding rather than overwritten, per the plan.
6. **CDPR's status trap is now a test rather than a memory.** Liveness is `product.dat` PRODSTAT_IND;
   a product dead since 2004 still carries site-status `A` on its rows. 0 parse failures over 1.24M
   lines. Also: several CDPR prodnos map to one EPA number (Fusilade has three), so aggregation is
   per EPA number.
7. **The dump has ~4,750 rows with no PRODUCT_NAME** (7 of them Active-on-grapes). Falls back to the
   ABNS primary name, then counts the row as a skip — a property of the source, not a run failure.

## Open, and who owns it

| Item | Owner |
|---|---|
| Settings-card browser click-through (the one deferred QA row) | run at merge — needs the main checkout + a user login |
| How a `GAP` renders so it cannot read as "no restriction" | **S9** — S2 must not invent a fifth colour |
| PHI / REI / rainfast / mobility, product versioning, tenant override, non-EPA products | **S2b** |
| The assistant tool + goldens | **S11** (one composite tool for the program) |
| NY / OR / WA state layers — K12 makes their absence explicit, but those tenants get `state-registration-unknown` for everything | Later; re-probe before **S7a** ships |
| Cornell guide purchase | Russell's call, now with three numbers to decide against |
| Per-worktree Prisma client isolation (council C11) | program level — recorded in `TODOS.md`, do it **between** waves |
