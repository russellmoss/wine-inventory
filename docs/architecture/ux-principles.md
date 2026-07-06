# UX Principles 🧭

> Your interaction/IA principles as **checkable rules**, so `/design-review` and the automated
> **UX-consistency loop** (see [[AUTOMATION]]) grade screens against *your* standard — not generic taste.
> This pairs with [[DESIGN]] (the *visual* system: tokens, fonts, colors) — this file is about
> *behavior and information architecture*: can people do what they need, where they need to?
>
> **Working rule:** when you decide "it should work like X," add a rule here. Tell Claude to
> **check this file when building or reviewing any UI.**

## The north star
> **People can do what they need to do, where they want to do it.** An ERP earns trust by removing
> steps, not adding screens.

## Checkable rules

### 1. Actions live on the thing they act on
An action is available *on the object it affects* (a lot, a vessel, a report), not buried in a
separate menu or a distant admin page. If a user is looking at a lot, they can act on that lot there.

### 2. No dead-ends
Every screen offers the obvious next step. After an action completes, the user lands somewhere useful
(the updated object, or a clear "what now"), never a blank confirmation with no path forward.

### 3. The common path is the short path
The 80% task takes the fewest clicks. Rare/advanced options may be one layer deeper, but must not tax
the everyday flow. Count the clicks for the most common winery task on each screen.

### 4. State is always visible and trustworthy
The user can always see the current state of a lot/vessel/report and how it got there (the timeline).
Because everything is reversible (Undo), the UI should make "you can undo this" obvious — reduce fear.

### 5. Speak the winery's language
Labels use domain terms from the [[glossary]] (crush, rack, blend, en tirage), not database names.
A winemaker should never see `LotOperationLine`.

### 6. Confirm the dangerous, streamline the safe
Destructive/irreversible or compliance-filing actions get a clear confirm. Everyday reversible actions
should be frictionless (they can be undone).

### 7. Consistent with the design system
Uses [[DESIGN]] tokens — never hardcoded colors/fonts/spacing. Same component for the same job everywhere.

<!-- Rules 8-12 added in Phase 0 from the incumbent teardown (analysis/incumbent-teardown/SYNTHESIS.md §B.3). -->

### 8. Self-service correction is first-class
When a correction is blocked (LEDGER-11), the UI **names the later operation that touched the wine** and
offers **"unwind the chain (LIFO)"** in plain language — not an opaque error. Check: can the user resolve a
blocked correction themselves, on the object, without a support ticket?

### 9. No support ticket to configure anything
Bonds, locations, members, vendors, vessel attributes, analysis metrics are **tenant-editable**. Gate a
capability by the tenant's **plan** (Phase 17), never by a **support ticket**. Check: is every configuration
surface self-serve for an admin?

### 10. Exports never fail silently
Server-side generation, synchronous folds: **"click export → file appears."** No pop-up-blocked silent
failures, no hour-long rebuild banners. Check: does every export either produce the file or show a clear,
actionable error?

### 11. Offline-first capture is table stakes  *(forward principle — Phase 28; not yet enforceable)*
Cellar-floor capture should not hard-fail without a live connection — it queues and syncs (D25/Phase 28).
**Not built yet**, so unlike rules 1-10 this is not pass/fail-checkable on a current screen; it is a forward
design commitment. Do not grade today's screens against it until Phase 28 lands.

### 12. No phantom vessels
Split and blend-return are **real operations**, never fake round-trips through a throwaway vessel. Check:
does any flow create a temporary/fake vessel to model an operation that should be a first-class op?

<!--
TEMPLATE — copy for each new rule:

### N. <short title>
<the rule, phrased so a reviewer can check pass/fail on a screen>
-->

---

## Open items the UX loop flagged
<!-- The automated UX-consistency loop appends findings here / as PR comments. -->
- _(none yet)_

---
*Seeded 2026-07-02 from your stated principle. Refine it as you learn how winery staff actually work.*
