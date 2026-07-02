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
