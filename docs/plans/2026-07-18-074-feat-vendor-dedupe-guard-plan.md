---
title: Near-duplicate vendor guard — stop "Scott Labs"/"Scott Laboratories" at create time (QBO vendor sync, Slice 0)
type: feat
status: completed
date: 2026-07-18
branch: claude/vendor-dedupe-guard
depth: standard
units: 5
---

## Overview

Stop near-duplicate vendors from being born. Today Cellarhand only blocks an *exact* name
collision (the DB `@@unique([tenantId, name])`), so "Scott Labs" vs "Scott Laboratories" and
"Crush2Cellar" vs "Crush to Cellar" sail straight through and have to be cleaned up later by the
Plan 072 merge tool. This adds a deterministic near-match guard at the two **interactive** create
surfaces (the `/setup/vendors` modal + the assistant `create_vendor` tool): when a new name looks
like an existing vendor, surface "did you mean X?" and let the user pick the existing one or create
anyway. It is Slice 0 of the larger QBO ↔ Cellarhand vendor-sync design (the pull and eager-push
slices come later and both lean on this guard being in front of them).

## Problem Frame

Plan 069 promised "no more Scott Labs vs Scott Laboratories dupes" and Plan 072 shipped the
*curative* fix (merge two existing dupes into one). But nothing *prevents* the next near-dup at the
moment of creation. QBO won't save us either: it enforces only exact `DisplayName` uniqueness
(`findOrCreateVendor`, `src/lib/accounting/qbo/client.ts:229`), so the bookkeeper's QBO is itself a
dup source once the sync pull lands. Prevention has to live on our side, at write time.

The deterministic logic is half-built and mis-wired. `vendorNamesLookDuplicate`
(`src/lib/vendors/vendors-shared.ts:280`) already catches "Scott Labs" vs "Scott Laboratories" via a
shared-prefix ratio, but it is only wired into a read-side *hint* (the assistant `query_vendors`
`possibleDuplicates`), never into any create path. And its prefix-only approach has a real hole:
"Crush2Cellar" (`crush2cellar`) vs "Crush to Cellar" (`crushtocellar`) diverge after 5 chars, so it
does NOT flag them (verified). The `create_vendor` assistant tool even *calls* the fuzzy matcher
then throws away the fuzziness and refuses only exact matches (`create-vendor.ts:54-60`).

If we do nothing: every winery keeps accumulating spelling-variant dupes, reporting and A/P history
fragment across two rows for one supplier, and the merge tool becomes a permanent chore instead of a
rare cleanup.

**Product pressure-test finding:** the tempting version is "hard-block any near match." That's a
trap on a money path. False positives ("Crush Cellars" vs "Crush Wine Co" are two real vendors)
would block legitimate creates, and an over-eager block invites a wrong merge that corrupts A/P
history. The right job is *advisory*: surface candidates, keep the human in the loop, never
auto-collapse. This mirrors the existing `vendorNamesLookDuplicate` doc note ("Conservative — a
hint, not an auto-merge").

## Requirements

- **MUST:** Harden the deterministic matcher so it flags the cases the current prefix-ratio misses:
  digit/homophone substitution ("2"↔"to"/"too", "4"↔"for"), `&`↔"and", legal/entity-suffix noise
  (Inc / LLC / Co / Corp / Ltd / Company / Enterprises), abbreviation pairs (Labs↔Laboratories), and
  word-order differences — while STAYING conservative enough not to fire on genuinely distinct names.
- **MUST NOT** flag two cases that are legitimately similar by design:
  (a) multi-currency variants — "Acme" vs "Acme (EUR)" are ONE local vendor sourcing N currencies
      (Plan 073, `plan073-multi-currency-fx-ingestion`); flagging them re-breaks FX ingestion.
  (b) the seeded "Unknown / Unspecified" fallback vendor (`UNKNOWN_VENDOR_NAME`) — it's the
      un-attributed-purchase sink and must never appear as a "did you mean" candidate.
- **MUST:** Run the guard at both INTERACTIVE create surfaces through ONE shared pure function
  (choke-point discipline, per `wo-inbox-assignee-id-resolution`): the `/setup/vendors` create modal
  (which also backs the `VendorPicker` inline "+ create new vendor") and the assistant `create_vendor`
  tool.
- **MUST:** The guard is ADVISORY. On a high-confidence match, surface the candidate(s) and require an
  explicit "create anyway" to proceed; it never silently blocks and never auto-merges. Merge
  remediation stays the existing admin-gated `mergeVendorsCore` path.
- **MUST:** Two-directional matching only (never a one-directional `LIKE` — `vineyard-name-resolver`
  lesson). Reuse the existing pure matchers, do not invent a parallel one.
- **MUST:** No schema change. This is read-side dedup over existing `Vendor` rows.
- **SHOULD:** Confidence bands — HIGH ("looks like the same supplier" → soft-block: pick existing or
  create anyway), MEDIUM ("might be related" → show as a suggestion but allow create).
- **SHOULD:** A governed-money-style exit proof (`verify:vendor-dedupe`) on Demo Winery that asserts
  the positive catches AND the two must-not-flag exclusions.
- **NICE:** Surface a hint in the assistant flow when the QBO side itself holds two near-dups (defer
  the actual pull-side wiring to Slice 1).

## Scope Boundaries

**In scope:**
- Hardened deterministic near-match engine in `vendors-shared.ts` (pure, unit-tested).
- A read-only "near matches for this name" core + server action, tenant-scoped.
- "Did you mean?" UX in the create modal + a choice card in the assistant `create_vendor` tool.
- The `verify:vendor-dedupe` proof and the near-match unit tests.

**Out of scope (and why):**
- **The agentic background dedup sweep** — the LLM-adjudicated detective pass over the whole vendor
  list for the semantic tail ("G3 Enterprises" = "Gallo"). It's advisory + async + feeds the same
  merge queue; it belongs as Slice 0.5 / a follow-on, not blocking Slice 0. Noted in the design doc.
- **Gating the AUTOMATED create path** (`findOrCreateVendorCore` → A/P bill emit `ap-emit.ts:51`,
  material intake `materials.ts:525`, invoice ingest `ingest-invoice-core.ts:256`). You cannot put a
  human "did you mean" in the middle of an automated bill post. Those stay exact-match; the future
  detective sweep catches anything they create. This plan documents the deliberate gap, it does not
  close it.
- **The QBO → Cellarhand pull and the eager create-into-QBO push** — Slices 1 and 2 of the design
  doc (`~/.rstack/projects/cellarhand/russell-cellarhand-quickbooks-vendor-sync-design-20260718-110318.md`).
  Separate plans, gated on the QBO-tier spike.
- **Any server-enforced hard block.** The guard is advisory by design; the `@@unique` constraint
  remains the only hard stop (exact collisions).

## Research Summary

### Codebase Patterns
- **Three create choke points**, only two interactive:
  1. `createVendorCore` (`src/lib/vendors/vendors.ts:75`) — behind `createVendorAction`
     (`src/lib/vendors/actions.ts:28`, READY-USER gated, throws on error) → `CreateVendorModal.tsx:35`
     and the `VendorPicker` inline create.
  2. Assistant `create_vendor` (`src/lib/assistant/tools/create-vendor.ts:54-60`) — calls the fuzzy
     matcher but narrows to an exact case-insensitive check; confirm-gated via `signProposal` (:63).
  3. `findOrCreateVendorCore` (`vendors.ts:53`) — AUTOMATED (A/P/intake/ingest/backfill), exact
     `findFirst({where:{name}})`. Out of scope (can't prompt).
- **Existing pure matchers to reuse/harden** (`src/lib/vendors/vendors-shared.ts`):
  `matchVendorsByName:171` (two-directional substring + `#id` pin), `vendorNamesLookDuplicate:280`
  (prefix ratio, the thing to harden), `findDuplicateVendorGroups:292` (groups by that rule; powers
  the `query_vendors` hint). Normalizer is `s.toLowerCase().replace(/[^a-z0-9]/g,"")` — strips
  punctuation but NOT digits/word-order/legal-suffix/ampersand.
- **Fuzzy ranking already exists**: `rankVendors` in `src/lib/inventory/vendor-search.ts` (edit-distance
  + abbreviation tolerance for the picker). Candidate to reuse for the similarity score in Unit 1.
- **"Did you mean" precedent**: assistant `resolveOneOrChoice` (`src/lib/assistant/tools/resolve.ts:29`)
  + `ChoiceRequest`/`asChoice` (`assistant-events.ts:88`) + the `WriteProposal` confirm pattern
  (`signProposal`). No UI-side candidate component exists yet — the modal only renders an error string.
- **Purity rule**: `vendors-shared.ts:1-4` — NO server imports (so `'use client'` + vitest can import
  it). New matcher goes here.
- **Test pattern**: `test/vendors-shared.test.ts` (vitest, one `describe` per fn, shared `{id,name}`
  fixtures, assert on `.map(v=>v.id)`; copy the `findDuplicateVendorGroups` block idiom incl. its
  negative "shares a word but shouldn't group" cases).

### Prior Learnings
- `wo-inbox-assignee-id-resolution` — resolve canonical identity at the ONE write choke point;
  snapshot strings are display-only. Put the guard at the choke point, not scattered in callers.
- `vineyard-name-resolver-two-directional-fix` — one-directional `contains` caused a real
  "doesn't exist" bug. Match two-directionally.
- `plan073-multi-currency-fx-ingestion` (U6) — QBO DisplayName gets a currency suffix ("Acme (EUR)");
  ONE local `Vendor` sources N currencies; `Vendor.currency` is informational. Guard MUST ignore the
  `(CUR)` suffix.
- `plan069-vendor-management-shipped` / Plan 072 (PRs #222/#224) — merge/remove is the curative path
  the guard routes to. `backfill-material-vendors.ts` ran on Demo, NOT Bhutan.
- `server-action-actionerror-redacted-in-prod` — user-facing messages need `safeAction`/`safeAdminAction`
  to survive prod redaction; the read-only check action should return `{ok, candidates}` not throw.

### External Research
None needed — no new library; hardening in-repo pure logic. (Digit-homophone normalization is the one
subtlety; handled in Unit 1's approach, not an external dependency.)

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Guard strength | Advisory soft-block on HIGH band; suggestion on MEDIUM; never auto-block/merge | Server-enforced hard block | Money path + false-positive risk; "hint not auto-merge" is the existing, correct posture |
| Which paths | Interactive only (modal + assistant tool) | Also gate `findOrCreateVendorCore` (A/P/intake/ingest) | Can't prompt mid-automated-bill-post; detective sweep (later) covers those |
| Matcher | Harden `vendorNamesLookDuplicate` + new scored `findVendorNearMatches`, reuse `rankVendors` distance | LLM at create time; a brand-new fuzzy lib | Deterministic = free, instant, testable; LLM belongs in the async sweep only |
| Core signature | Separate read-only `check` core/action called BEFORE create; `createVendorCore` unchanged | Add a `force`/`acknowledge` param to `createVendorCore` | Keeps the money-write core untouched; the check is a pure pre-flight the UI/tool orchestrate |
| Schema | No change | New `dedupe` columns | Read-side dedup over existing rows |
| Exclusions | Skip `(CUR)` currency suffix + the Unknown fallback vendor | Flag everything | Both are intentional, flagging them breaks FX ingestion / clutters the picker |

## Implementation Units

### Unit 1: Hardened deterministic near-match engine (pure)

**Goal:** One pure function that, given a candidate name and a list of existing vendors, returns
banded near-match candidates — closing the digit/word-order/legal-suffix/ampersand gaps while
excluding currency-suffix and Unknown-vendor false positives.
**Files:** `src/lib/vendors/vendors-shared.ts`, `test/vendors-shared.test.ts`
**Approach:** Add a `normalizeVendorName(name)` pipeline: lowercase; strip a trailing `(CUR)`
currency suffix before anything else; expand `&`→"and"; drop legal/entity suffix tokens
(inc, llc, co, corp, ltd, company, enterprises); expand known abbreviation pairs (labs→laboratories);
generate homophone digit variants ("2"→{to,too,two}, "4"→{for,four}, "8"→{ate}) so `crush2cellar`
and `crushtocellar` collide, tuned to NOT collapse names like "3M" (test as a negative);
finally strip remaining non-alphanumerics and sort tokens for an order-insensitive key. Add
`findVendorNearMatches<T extends {id,name}>(name, candidates, opts?)` returning
`{high: T[], medium: T[]}` using a token-set + edit-distance score (reuse the distance from
`src/lib/inventory/vendor-search.ts` `rankVendors` if clean, else mirror it) over normalized
variants; HIGH ≥ tuned threshold, MEDIUM in a lower band. Re-implement `vendorNamesLookDuplicate`
on the new normalizer (or delegate) so `findDuplicateVendorGroups` (assistant hint) improves for
free. Exclude any candidate whose normalized name equals the incoming name after currency-suffix
strip (that's the same vendor, different currency), and exclude `UNKNOWN_VENDOR_NAME`.
**Tests:** `describe("findVendorNearMatches")` + updated `vendorNamesLookDuplicate`/`findDuplicateVendorGroups`:
POSITIVE HIGH — "Scott Labs"↔"Scott Laboratories", "Crush2Cellar"↔"Crush to Cellar",
"Gusmer"↔"Gusmer Enterprises", "A & B"↔"A and B", "ABC Supply"↔"Supply ABC" (word order).
NEGATIVE (must NOT flag) — "Scott Labs"↔"Scott Valley", "Crush Cellars"↔"Crush Wine Co",
"3M"↔"Three M Coatings", "Acme"↔"Acme (EUR)" (currency), any name ↔ "Unknown / Unspecified".
**Depends on:** none
**Execution note:** test-first (the positive/negative table IS the spec; tune thresholds until green).
**Patterns to follow:** `vendors-shared.ts:280` (fn to harden), `vendor-search.ts` `rankVendors`
(distance), `test/vendors-shared.test.ts:179-210` (test idiom).
**Verification:** `npm run test -- vendors-shared` green with every case above.

### Unit 2: Read-only near-match lookup at the tenant boundary

**Goal:** A tenant-scoped way to ask "does this name already exist as a near-dup?" without creating
anything.
**Files:** `src/lib/vendors/vendors.ts`, `src/lib/vendors/actions.ts`
**Approach:** Add `getVendorNearMatchesCore(name): Promise<{high, medium}>` in `vendors.ts` — loads
ACTIVE vendors for the current tenant via the extended `prisma` (`{id,name}` select, `isActive:true`),
drops the Unknown fallback, delegates to `findVendorNearMatches`. Expose a read-only
`checkVendorNearMatchesAction(name)` in `actions.ts` using the `safeAction` wrapper (READY-USER gated,
same as `createVendorAction`) returning `{ok:true, high, medium}` so messages survive prod redaction
(`server-action-actionerror-redacted-in-prod`). No writes, no audit.
**Tests:** thin core (load + delegate); covered by the Unit 5 verify script rather than a DB unit test.
**Depends on:** Unit 1
**Patterns to follow:** `getVendorUsage`/`createVendorCore` (`vendors.ts`) for tenant-scoped reads;
`actions.ts:28` for the action wrapper; return-shape per the redaction learning.
**Verification:** call the action from the verify script (Unit 5) and assert banded results on seeded data.

### Unit 3: "Did you mean?" in the create modal + picker inline-create

**Goal:** Before creating, the user sees near-dups and can pick the existing vendor or create anyway.
**Files:** `src/components/vendors/CreateVendorModal.tsx`, `src/components/vendors/VendorPicker.tsx`
**Approach:** In `CreateVendorModal`, on submit call `checkVendorNearMatchesAction(name)` first. If
HIGH candidates exist and the user hasn't yet acknowledged, render a "Did you mean?" panel above the
form listing each candidate with a **"Use this vendor"** button (selects it via the existing
`onCreated`/select path and closes) and a **"Create '\<name\>' anyway"** button that sets a local
`acknowledged` flag and proceeds to `createVendorAction`. MEDIUM candidates render as a smaller inline
hint, non-blocking. `VendorPicker` inherits this automatically (it opens the same modal); ensure the
"Use this vendor" path routes the picker's `onCreated(selectedExisting)` so the picker selects the
existing vendor. Keep the current CONFLICT error render for exact collisions.
**Tests:** no jsdom/RTL in this repo (`assistant-dock-history-shipped`) — manual browser-QA on Demo
(controlled-input caveats from CLAUDE.md apply). Logic that can be pure (band → render decision) can
be a tiny helper unit-tested if extracted.
**Depends on:** Unit 2
**Patterns to follow:** `CreateVendorModal.tsx:33-47` (submit/try-catch/error render), `VendorPicker.tsx:99-148`
(inline create + `onCreated`).
**Verification:** browser-QA on `/setup/vendors`: typing "Scott Laboratories" when "Scott Labs" exists
shows the panel; "Use this vendor" selects it; "Create anyway" creates. QA in Demo Winery only, QA-*
fixtures, cleaned up.

### Unit 4: Near-match choice in the assistant `create_vendor` tool

**Goal:** The assistant offers "use existing X" vs "create anyway" instead of silently creating a near-dup.
**Files:** `src/lib/assistant/tools/create-vendor.ts`, assistant golden eval fixture (per the D26/H8 gate)
**Approach:** Replace the exact-only pre-check (`create-vendor.ts:54-60`) with
`getVendorNearMatchesCore(name)`. If HIGH candidates and no `createAnyway` arg, return a `ChoiceRequest`
(via `asChoice`) whose options are each candidate (`resume` re-invokes id-pinned to select/use it) plus
a final "Create a new vendor named '\<name\>'" option that re-invokes with `createAnyway:true`. When
`createAnyway` is set (or no HIGH match), fall through to the existing `signProposal` confirm-gate
unchanged. Keep the exact-duplicate throw as a fast path.
**Tests:** add/adjust a golden eval case: "add vendor Scott Laboratories" with "Scott Labs" present →
asserts a choice (not a silent create); "add vendor Foo Bar" (no match) → normal confirm. Keep the
assistant structural eval green (hard CI gate).
**Depends on:** Unit 2
**Patterns to follow:** `resolve.ts:29` `resolveOneOrChoice`, `assistant-events.ts:88` `asChoice`,
`merge-vendors.ts` (closest confirm-gated domain analog).
**Verification:** `npm run eval:assistant` (or the repo's assistant eval script) green incl. the new case.

### Unit 5: `verify:vendor-dedupe` proof + document the automated-path gap

**Goal:** A governed-money-style exit proof on real DB, and an explicit written record that the
automated create path is intentionally ungated.
**Files:** `scripts/verify-vendor-dedupe.ts`, `package.json` (script entry), a short note in
`docs/architecture/` (or the security-register) on the deliberate automated-path gap
**Approach:** Mirror `scripts/verify-vendor-merge.ts`: `runAsTenant("org_demo_winery", ...)`, seed
QA-* near-dup fixtures ("QA Scott Labs" + attempt "QA Scott Laboratories", "QA Crush2Cellar" +
"QA Crush to Cellar"), assert `getVendorNearMatchesCore` returns them in the HIGH band; seed
"QA Acme" and assert "QA Acme (EUR)" is NOT flagged; assert the Unknown vendor is never a candidate;
assert `findOrCreateVendorCore` (automated) still creates an exact-name row (documents the gap).
`check(name, pass, detail)` assertions, teardown in `finally`. Add `verify:vendor-dedupe` to
`package.json`. Keep `verify:naming` + `verify:tenant-isolation` green.
**Depends on:** Units 1-2
**Patterns to follow:** `scripts/verify-vendor-merge.ts` (structure, `check`, `runAsTenant`, teardown).
**Verification:** `npm run verify:vendor-dedupe` all green on Demo; `verify:naming` + `verify:tenant-isolation` green.

## Test Strategy

**Unit tests:** `test/vendors-shared.test.ts` — the positive/negative near-match table (Unit 1) is the
spec; extract any pure UI band-decision helper and test it too.
**Integration/exit proof:** `scripts/verify-vendor-dedupe.ts` on Demo (real DB, tenant-scoped) — catches
+ the two must-not-flag exclusions + the documented automated-path gap.
**Assistant:** `eval:assistant` golden case for near-dup → choice (hard CI gate).
**Manual verification:** browser-QA on `/setup/vendors` create modal + `VendorPicker` inline create in
Demo Winery (QA-* fixtures, cleaned up; controlled-input caveat: click ref then type, per CLAUDE.md).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| False positives annoy users / invite a wrong merge | MED | MED | Advisory only; conservative HIGH threshold for soft-block, MEDIUM merely suggests; human always chooses; never auto-merge |
| Currency-suffix "(EUR)" flagged → breaks Plan 073 FX ingestion | LOW | HIGH | Strip `(CUR)` before matching + explicit negative test |
| Digit-homophone expansion over-collapses ("3M" vs "Three M") | MED | LOW | Homophone variants only, bounded; "3M" negative test tunes it |
| Hardening `vendorNamesLookDuplicate` shifts `query_vendors` hint behavior | LOW | LOW | Strict improvement; update its tests; it was always a hint |
| Automated A/P path still makes dupes (out of scope) | MED | LOW | Documented gap; future detective sweep (Slice 0.5) closes it; merge tool remains |
| Client could skip the advisory check | LOW | LOW | Acceptable — guard is a hint; `@@unique` still stops exact dupes; merge remediation exists |

## Success Criteria

- [x] "Scott Labs"/"Scott Laboratories" AND "Crush2Cellar"/"Crush to Cellar" are both flagged HIGH by
      the pure engine (unit tests green — 49/49 vendors-shared).
- [x] "Acme" vs "Acme (EUR)" and the "Unknown / Unspecified" vendor are NEVER flagged.
- [x] Creating a near-dup in the `/setup/vendors` modal shows "did you mean?", with working
      "use existing" and "create anyway" — **browser-QA'd on Demo**: "Scott Laboratories" surfaced Scott Labs;
      "Crush to Cellar" surfaced Crush2Cellar (the homophone case the old matcher missed); create-anyway made
      the 6th vendor, then Remove cleaned it up; Demo restored to 5.
- [x] Assistant `create_vendor` returns a choice (not a silent create) on a near-dup (structural eval +
      `test/assistant-create-vendor-dedup.test.ts` 4/4 green + a LIVE against-Demo round-trip:
      run→choice→resume→proposal→commit, all passed).
- [x] `npm run verify:vendor-dedupe` green (8/8); `verify:naming` (25) + `verify:tenant-isolation` green.
- [x] All existing tests pass (2264 vitest); no schema change; tsc + lint (0 errors) + `next build` green.
- [x] The intentionally-ungated automated create path is documented (security-register + verify script).

## Follow-on (not this plan)

Slices 1 (QBO → Cellarhand filtered pull + classification queue) and 2 (eager create-into-QBO with
fuzzy-match-before-create + `syncStatus` offline fallback), plus the agentic detective sweep, live in
the design doc: `~/.rstack/projects/cellarhand/russell-cellarhand-quickbooks-vendor-sync-design-20260718-110318.md`.
Both are gated on the QBO-tier spike (is the winery on QBO Advanced? is the custom-field accelerator
available?). Each gets its own `/plan`.
