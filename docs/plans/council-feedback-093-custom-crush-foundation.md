# Council feedback — plan 093 (custom-crush data foundation)
**Date**: 2026-07-23
**Reviewers**: Codex (gpt-5.4-mini fallback; schema/concurrency/migration), Gemini 3.1 Pro (TTB domain)
**Prior gates**: /plan-eng-review (3 correctness fixes + 2 decisions). Council asked to find what a
code-correctness pass missed.

## Headline: two CRITICALs, both domain/legal, both reverse a premise

**Both models independently killed the "owner maps to bond" premise, and Gemini killed the
"refuse cross-owner blends" rule with a concrete floor scenario.** These are not code bugs — they are
the plan (and an earlier decision) being domain-wrong in a way that would produce **false TTB filings**
and **deadlock routine cellar work**. The eng review (correctness) couldn't see them; the domain review
did.

## CRITICAL C1 — CHANGE_OWNERSHIP conflates a commercial title transfer with a TTB transfer-in-bond

**Both Codex and Gemini.** The plan posts symmetric Received/Removed-in-Bond TTB lines on every
`CHANGE_OWNERSHIP` because "owner maps to bond." **That is legally false for a standard custom-crush
client.** A standard client operates under the HOST facility's bond; the wine never leaves the bonded
premises, so a host↔client ownership change is a **pure title transfer with ZERO 5120.17 impact**.
Posting a transfer-in-bond there is a **phantom movement that fails a TTB audit**. TIB applies ONLY when
the wine crosses distinct bonded-winery (BWN) numbers — host → an **AP proprietor** (a legally distinct
bonded winery). And ownerId NULL (facility) ↔ a client with no AP bond is the same bond: ownership
changed, bond did NOT.

**Fix (both agree):** `CHANGE_OWNERSHIP` computes the old bond vs the new bond inside the op:
- **same bond** → a pure **title transfer**: update `ownerId` (+ a billing/invoice event), **no TTB
  line**;
- **different bond** (host → AP, or AP → AP) → title transfer **AND** the symmetric TIB lines.
Reversal mirrors the exact bond delta. Gemini adds: verify the tax class matches on both sides of a
real TIB.

## CRITICAL C2 — Refusing cross-owner blends is a "topping deadlock"

**Gemini, and it's the sharpest finding.** The plan refuses a blend of two owners until a
`CHANGE_OWNERSHIP` unifies them. But **the single most common daily custom-crush operation is topping a
client's barrel with the facility's own (NULL-owner) topping wine** — a cross-owner blend. Refusing it
would force the winemaker to execute legal title paperwork (a transfer of 1.5 gallons) *before* a cellar
hand can top a barrel. "This is backwards and will cause immediate user revolt." A JV blend is *also*
two owners' wine by design.

**This reverses the decision Russell made in the earlier incumbent-parity round** ("refuse cross-owner
blends until CHANGE_OWNERSHIP"). The earlier incumbent research already showed both incumbents *allow*
cross-owner combining (InnoVint warns, Vintrace fractional); Gemini now gives the concrete reason and a
**scalar-compatible fix** that means we still don't need fractional:

**Fix:** ALLOW cross-owner blends on physical execution. The **receiving lot's owner dominates** the
scalar result; the **minority (consumed) owner's fraction generates a pending commercial
`BILLABLE_WINE_CONSUMED` ledger entry** (the facility bills the client for the topping wine, or the JV
is reconciled). Do NOT block physical cellar work on commercial title clearing. This is elegant: it
keeps scalar ownership AND matches how the floor actually works.

## SHOULD-FIX (fold in)

- **WeighTag allocator (Codex):** a naked `MAX(tagNumber)+1` under SERIALIZABLE + `withWriteRetry` +
  PgBouncer either bounces on the unique or burns numbers; a bare sequence gaps on rollback. Use a
  **per-tenant counter row incremented with `SELECT ... FOR UPDATE` inside the same tx**, OR accept gaps
  and use a sequence — but decide gap-free-vs-not explicitly.
- **WeighTag is per-TRUCK, not per-pick (Gemini):** a single scale ticket (gross/tare/net) covers a
  flatbed of 8 bins from multiple growers for multiple owners. Model `WeighTag` (truck/date/weights) →
  child **`WeighTagLine`/bin** (grower, owner, block) → `HarvestPick`. Stamp owner/grower at the
  **line-item** level, not the tag.
- **SKU / inventory uniqueness must include ownerId (Codex):** two clients can have the same
  varietal/vintage `WineSku` (the coalescence audit flagged this too). Owner-specific uniques must add
  `ownerId` — `(tenantId, ownerId)` index alone is not enough; audit `WineSku` identity and
  `BottledInventory`-at-location identity.
- **Backfill must be batched + expand/migrate/contract (Codex):** one migration UPDATE-ing the lot spine
  + ~25 children locks hot tables and stalls `runLedgerWrite`. Split: add columns → batched backfill (by
  tenant, dependency order source-before-child) → validate → deploy reader code that reads only ownerId
  → **drop the enum in a SEPARATE LATER migration** (not F1 same-branch — an old worker can read a
  dropped column). This refines the eng-review "drop in F1" to a proper expand/contract.
- **Post-backfill consistency check (Codex):** ownerId is app-maintained; add a query/repair (the verify
  script partly covers this — extend it to assert every child's ownerId == its lot's).

## DESIGN-QUESTIONS

- **Lossy backfill (Codex):** one per-tenant "Legacy client" Owner is lossy if a tenant already ran
  multiple custom-crush clients under the old enum (the enum can't distinguish them, and there's no data
  to recover from). The backfill is lossy by necessity — flag that a human re-assigns legacy client lots.
- **Lineage-visibility boundary (Gemini):** even pre-RLS, a client seeing their lot's lineage must NOT
  see the host's topping wine's upstream blend %/additives/cost. Gemini wants the verify to test this;
  it's arguably a plan-092 enforcement property — decide whether it's tested here or deferred.
- **JV who-wins-scalar:** with C2's fix, a 50/50 JV means the receiving lot's owner "wins" and bills the
  other. If a true equal JV is intended, the business creates a JV `Owner` first. Confirm that's
  acceptable vs needing fractional now.

---
## Raw — Codex
CRITICAL: WeighTag needs a real allocator (counter row + SELECT FOR UPDATE, or a sequence if gaps ok),
not MAX+1 under SERIALIZABLE/retry/PgBouncer. WineSku/BottledInventory uniqueness must include ownerId,
not just an index. Backfill too coarse — split add/backfill/validate/drop, batch by tenant + dependency
order. CHANGE_OWNERSHIP still assumes ownership change = bond move; false when both owners share a bond
or collapse to the primary under AP precedence — compute old/new bond, emit TTB only on real change.
Dropping Lot.ownership not release-safe same-branch — expand/migrate/contract (drop in a later migration
after new code deploys). SHOULD: add a DB-side/post-backfill projection consistency check. Q: is one
"Legacy client" Owner sufficient (lossy if multiple clients)? Is ownerId on BottledInventory needed?

## Raw — Gemini
CRITICAL: CHANGE_OWNERSHIP conflates commercial title transfer with TTB TIB — standard client is on the
host bond, host↔client is a pure title transfer with zero 5120.17 impact; TIB only host↔AP (distinct
BWN). Fix: evaluate Origin_BWN vs Destination_BWN; title-only if same, title+TIB if different. CRITICAL:
refusing cross-owner blends = topping deadlock (facility tops client barrels with NULL-owner wine
daily); fix: allow, receiving owner dominates scalar, minority fraction → pending BILLABLE_WINE_CONSUMED,
don't block physical work on title clearing. SHOULD: WeighTag is per-truck (scale ticket) with child
line-items/bins per grower/owner, not per-pick. SHOULD: verify a lineage-visibility boundary (client
sees their lineage, not host topping wine's upstream). Q: tax class must match on both sides of a TIB;
true 50/50 JV needs a JV Owner created first under scalar.
