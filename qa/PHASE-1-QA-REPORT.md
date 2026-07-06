# Phase 1 — Identity Presentation QA Report

- **Date:** 2026-07-06
- **Build under test:** `chore/phase-1-ui-fast-follow` worktree (merged Phase-1 + #94 fast-follow UI) on `localhost:3000`, Demo Winery, logged in as `demo@demo.com` (Demo Owner / admin).
- **Driver:** Playwright (headless, via the bundled `playwright-core`) against a saved authenticated `storageState`. **CDP-attach was not usable** — see "Tooling notes" — but the same authenticated session was achieved via a Playwright login + storageState.
- **Guard-fixture safety:** `npm run verify:naming` **BEFORE = green (25/25)** and **AFTER = green (25/25)** → QA's `QA-P1-*` mutations never touched the `ZZ-NM*` guard fixtures or demo data.
- **Console errors observed across the session: 0.**
- **Fixtures:** `QA-P1-A/B/C/D` created via a seed script (WINE lots + SEED op + current-code identifier), all mutations confined to them. End-state: `QA-P1-A → QA-P1-A-R2`, `QA-P1-B → QA-P1-A-2` (collision-accept), `QA-P1-C` displayName "Twins", `QA-P1-D → ZED-1` displayName "Twins".

## Result summary

| # | Scenario | Invariant | Result | Evidence |
|---|----------|-----------|--------|----------|
| 1 | displayName lifecycle (set → coalesced label renders; clear → falls back to code, never blank) | Q12 coalesce | **PASS** | `s1b-name-set.png`, `s1b-name-cleared.png` |
| 2 | Honest rename — a.k.a. chip on detail; search OLD code shows "formerly" | NAMING-2 | **PASS** | `s2-clean-renamed-D.png`, `s2-clean-search-formerly.png` |
| 3 | Rename chain (A→B→C); search intermediate resolves to CURRENT code | NAMING-2 | **PASS** | `s3-chain-search.png` |
| 4 | Collision OFFER (rename B → A's code): offered, not silent; cancel keeps B; accept applies `-2` | NAMING-1 | **PASS** | `s4-collision-offer.png`, `s4-collision-accepted.png` |
| 5 | Duplicate displayName ("Twins" on C and D) accepted, no uniqueness error | NAMING-1 (displayName non-unique) | **PASS** | `s5-duplicate-displayname.png` |
| 6 | swapLotCodes via UI — pick other lot, confirm BOTH directions, execute | swap core (G1) | **PASS** (built in this pass) | `s6-swap-confirm.png`, `s6-swap-done.png` |
| 7 | Cross-identifier search envelope — historical hit renders "formerly", not collapsed | council G4 | **PASS** | `s2-clean-search-formerly.png`, `s7-envelope.png` |
| 8 | Naming-template card — create + set default | plan U1 | **PASS** | `s8-settings-card.png`, `s8-after-create.png` |
| 9 | Admin gating of template authoring | conventions | **INFO (not testable)** | — |
| 10 | A11y on rename modal — open + Escape closes | ux-principle | **PASS (partial)** | `s10-a11y-escape.png` |

Screenshots: `qa/screenshots/` (17 files).

## Notes per scenario

- **S1 / S4 / S5** were additionally DB-ground-truthed: `QA-P1-A` displayName set then cleared (2 `LotCodeEvent`s, `current-code` identifier untouched); `QA-P1-B` → `QA-P1-A-2` (1 rename event, identifier updated in place — no `prior-code` dual-write, Q13); `QA-P1-C`/`D` both hold displayName "Twins".
- **S4 visual (`s4-collision-offer.png`):** the modal shows *"QA-P1-A is already used in this winery. Use QA-P1-A-2 instead?"* with **Use QA-P1-A-2** / **Pick another** — the OFFER, never a silent suffix. Cancel kept `QA-P1-B` intact; accept applied `QA-P1-A-2`.
- **S7 visual (`s2-clean-search-formerly.png`):** searching the retired code `QA-P1-D` returns **"ZED-1 · formerly / alias: QA-P1-D"** — the disambiguation envelope, not a silent collapse. When a query is a *substring of a current code*, the current-code match correctly wins the per-lot dedup (verified: searching "QA-P1-A" surfaced the current-code lots, not a false "formerly").
- **S8:** the `/settings` "Lot naming" card listed templates and created "QA Custom Scheme" successfully (demo user is admin).
- **S10:** the "Edit lot identity" modal opens and **Escape closes it**. Full focus-trap + focus-return-to-trigger were not asserted programmatically — flagged for a manual keyboard pass.
- **S6 (added after the initial pass):** the swap affordance ("Swap codes…" on lot detail → cross-identifier search for the other lot → an explicit two-direction confirm) was built and QA'd. Confirm dialog read *"QA-P1-C becomes ZED-1, and ZED-1 becomes QA-P1-C"* (`s6-swap-confirm.png`); after execution the two lots' codes were swapped (C→ZED-1, D→QA-P1-C), 0 console errors, `verify:naming` green before AND after. Wired to the guarded `swapLotCodesAction`.

## Punch list (ranked)

**No product defects found.** All invariant behaviors (NAMING-1 offer-not-silent, NAMING-2 append-only rename + honest history, Q12 coalesce, displayName non-unique, search envelope) work correctly in the UI. The two initial runner "FAIL"s were test-design artifacts (query strings that were substrings of current codes), corrected and re-verified — not code changes.

| Sev | Item | Detail | Recommendation |
|-----|------|--------|----------------|
| ✅ Resolved | **S6 — swap UI** | Was a gap (swap was action-only); the "Swap codes…" affordance + two-direction confirm was **built and QA'd in this pass** (PASS). | Done. |
| Test-debt (Phase 21a/23) | **S9 — admin gating not testable** | Template authoring is admin-gated server-side (`adminAction`); the only Demo Winery user (`demo@demo.com`) IS an admin, so the non-admin **rejection** path cannot be exercised. **Blocked until a non-admin role exists** — the in-app role/tenant switcher is ROADMAP **Phase 21a** and the capability×domain RBAC matrix is **Phase 23**. | Not actionable now. Re-test the "Admins only" rejection with a cellar-hand user once Phase 21a/23 lands. |
| Low | **S10 — focus management not auto-verified** | Escape-closes confirmed; focus-trap and focus-return-to-trigger were not asserted programmatically. | Quick manual keyboard pass, or add a focus assertion. |

## Tooling notes

- `browse` (the rstack CDP tool) was **unusable for authenticated QA on Windows**: `cookie-import-browser` reads only macOS/Linux cookie paths; a fresh headless login didn't persist the session cookie; `cookie-import <json>` threw `isPathWithin is not defined`. The `:9222` CDP endpoint found on the machine was **Lenovo Vantage**, not a browser with the app session.
- Workaround (reliable): Playwright `chromium.launch()` → login with demo creds → `storageState` saved → every scenario script loads that state. Recommend this pattern for Windows QA until `browse`'s Windows cookie handling is fixed.
- The Cellarhand rebrand is live in this build (logo + nav confirmed in screenshots).
