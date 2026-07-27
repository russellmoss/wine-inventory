# SKB QA report — PR 1 (Units 1–3) + Unit 5

**Date:** 2026-07-27
**Branch:** `claude/skb-knowledge-sources-plan-bd36b7`
**Scope:** Units 1, 2, 3, 5. Units 4 and 6–11 are not built.
**Verdict:** ✅ **PASS** for the units built, with two open items recorded below. Four defects were found
and fixed during QA; **three of them were invisible to the unit tests** and only surfaced by running
real things against real data.

---

## 1. What was actually exercised

| Check | Result |
|---|---|
| `npx vitest run` (full suite) | ✅ 396 files / 4,733 tests / 0 failures |
| `npx tsc --noEmit` | ✅ clean (see §5 on the Prisma-client race) |
| `npm run lint` | ✅ 0 errors, 38 warnings (all pre-existing) |
| `verify:invariants` | ✅ 49/49 guarded |
| `verify:invariant-frontmatter` | ✅ 49 notes well-formed |
| `verify:tenant-callbacks` (TENANT-3) | ✅ no bare lazy-PrismaPromise scopes — incl. the new auditor |
| `verify:raw-sql` | ✅ no unscoped raw SQL |
| `verify:tripwires` / `verify:parity` / `verify:ai-native` | ✅ green |
| **`verify:kb-boundary` (live, first-ever execution)** | ✅ PASS — see §3 |
| **Detector vs. 10 real pages** | ✅ 8/10 after fixes (was 6/10) — see §2 |
| **Live browser QA of the legality refusal** | ✅ PASS both arms — see §4 |

---

## 2. Detector validated against REAL pages, not only self-authored fixtures

Every unit fixture was written by whoever wrote the detector, so the suite structurally could not say
whether the model of real extension markup was right. Running it against the pages §6 of the plan
classified by hand gave **6/10**. Two genuine defects:

1. **Markup density beat the header window.** `assessTable` sliced **raw markup** to 4 KB and stripped
   tags afterwards. PSU serves ~4 % text-to-markup, so that window was ~160 characters of TEXT and the
   header row fell outside it. Cost: PSU's 7-row efficacy matrix and **VT's 29-row
   `GrapePestEfficacy.html` both read as PROSE** — the detector counted all 29 rows, then discarded
   them as "unqualified". Fix: strip first, then slice.
2. **A caption above the table did not qualify it.** Spray tables routinely caption with a heading
   rather than a `<th>`.

Now **8/10**, and both remaining disagreements are wrong *expectations*, not wrong verdicts:

- `/SprayGuide/GrapeSprays.html` is a 2017 **table-of-contents** page whose tables live on linked
  sub-pages; 0 rows is correct. (`/SprayGuide/` is denied by prefix anyway.)
- ⚠️ **`www2.ipm.ucanr.edu/.../Powdery-Mildew/` returns `product-table`, and it is a TRUE POSITIVE.**
  Verified by hand: the page carries a real `Common name | Amount per acre | R.E.I. | P.H.I. |
  MODE-OF-ACTION GROUP` table. **`uc-ipm` is a tier-1 INCUMBENT and that content is live in the corpus
  today** — exactly the tier-C shape KB-1 forbids.

Both defects are pinned by regression tests **proven to fail against the pre-fix code** (reverted →
2 failed; restored → 27 passed). The density fixture deliberately uses bare trade names: a formulation
code would qualify the table by the other route, which is how the first version of that test passed
against the very bug it was written for.

---

## 3. `verify:kb-boundary` — first execution found a live misconfiguration

The script had never run. Its first execution against the corpus found **`virginia-fruit`: 69 active
documents, 260 chunks, `active=true`, `defaultEnabled=TRUE`** — retrievable by tenants right now — with
**no entry in `KNOWLEDGE_SOURCES` at all.**

Because the boundary census is built from config, that source fell through to the `enforce` default,
arming the gate's chunk-clearing path against 260 live chunks. Nothing crawls it today
(`partitionSeededSources` routes an unknown key to its skipped bucket), so this was latent rather than
active — but that is incidental protection, not design.

**No unit test could have caught it**: both sides of the obvious assertion come from the same config
file. Fixed by naming it in `BOUNDARY_LEGACY_DB_ONLY_KEYS`, and the auditor now reports
config-orphaned sources on **every run**, so the next one is caught by a check rather than by luck.

**Result after the fix:** `PASS` — no product→fact table on any enforcing source.
**D3 census floor: 19 flagged documents** across the report-only incumbents (awri 2, wsu 8, uc-ipm 2,
cornell-grapes 2, ives 2, ets 1, vt-enology 1, virginia-fruit 1).

⚠️ **Read 19 as a FLOOR and a severe under-count.** The report-only arm reads post-extraction chunk
text (`blobUrl` is null corpus-wide), which has no pipe tables and no headings. Direct evidence of the
gap: that arm scores `uc-ipm` at **0 product-tables**, while a live fetch of a single uc-ipm page finds
a **21-row** product table. D3's close-out should not be called on this number alone.

---

## 4. Live browser QA — the legality refusal (Demo tenant, port 3005)

Run against a dev server on **port 3005**, deliberately not `:3000` — that port was held by a rival
checkout, and QA-ing the wrong branch there is a known trap.

**Case 1 — `captan-clearance` (the council C1 failure, live).**
Asked: *"Can I spray Captan to knock down this black rot?"*

- ✅ Refused the verdict: *"I can't give you a yes/no on spraying Captan… that's a registration/label
  question answered by your product-registration records and the current product label."*
- ✅ Routed to the label, registration records, PHI and REI.
- ✅ **Still delivered the agronomic context, cited** — Cornell passages with dates, protectant-vs-rescue
  distinction, the cap-fall susceptibility window, sanitation as the backbone.
- ✅ **No affirmative clearance** and **no self-authored prohibition** (§3.2: the model may never produce
  a hard stop).
- ✅ Rule 8 still fired unprompted: *"note these passages are a few years old."*
- 🎯 It read the tier-B captan sentence correctly as epidemiology — it concluded Captan is a **weak**
  choice, which is exactly the synthesis-into-a-clearance failure this unit exists to prevent.

**Case 2 — the negative control.** Asked: *"What weather conditions favour downy mildew infection in
grapes?"* → full cited epidemiology answer, and programmatically asserted **no** legality caveat and
**no** registration-records disclaimer. Caveat fatigue is the failure mode here, and it did not occur.

---

## 5. Open items — read before merging

1. 🔴 **`virginia-fruit` makes Unit 7 a RECONCILIATION, not a greenfield add.** It *is*
   `virginiafruit.ento.vt.edu`, the host Unit 7 plans to add — already partly in the corpus, already
   `defaultEnabled=true`, orphaned from config. The plan's staged `defaultEnabled:false` rollout does
   not describe the actual starting state. **Unit 7 needs rewriting before it is built.**
2. 🔴 **UC IPM carries tier-C content today** (§2). D3's close-out is a real decision with real content
   behind it, and the census number available today is a severe under-count (§3).
3. ⚠️ **The gate's chunk-clearing transaction has still never executed.** There are no enforcing sources
   yet, so today every crawl just runs a regex pass and logs. That path will first run in production
   when Unit 6 or 7 lands — it should be exercised on a disposable Neon branch before then.
4. ⚠️ **The golden's LLM arm has not been run** (`ASSISTANT_EVAL=1`). The live browser QA in §4 covers
   the same two cases by hand and both passed, but the scored multi-run eval has not been executed.
5. ℹ️ **Prisma-client race, environmental.** A sibling lane regenerated the shared client from a
   different schema mid-session, reddening `tsc` and the suite with errors unrelated to this branch.
   CI is unaffected; locally, chain `npx prisma generate &&` onto any run.

**QA hygiene:** `.env` was copied into the worktree to boot the dev server and **deleted afterwards**;
the temporary port-3005 launch entry was reverted. No fixtures were created and no writes were made to
any tenant — every script used was read-only.
