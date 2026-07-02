# Glossary — Wine + ERP terms

> One shared vocabulary for you, Claude, and any future SWE. When you hit a fuzzy term,
> pin it down here. In Obsidian, typing a term that matches a heading here will auto-suggest a link.
> Related: [[system-map]].

## Winemaking
- **Lot** — a tracked quantity of wine as it moves through the cellar; the core unit everything attaches to.
- **Vessel** — a physical container (tank, barrel, bottle). A vessel holding multiple lots is a **blend**.
- **Crush** — de-stemming/crushing incoming fruit into must; where fruit **cost** first attaches.
- **Press** — separating juice/wine from skins.
- **Saignée** — bleeding off juice to concentrate a red (a transform that creates a new lot).
- **Rack** — moving wine off its sediment into another vessel.
- **Blend** — combining lots; creates lineage (a lot with multiple parents).
- **Lineage** — the parent/child history of a lot across transforms.
- **En tirage** — the aging-on-lees stage of sparkling production.
- **Whole-cluster** — pressing/fermenting with stems included.

## System / ERP
- **Tenant** — one winery (an isolated customer org). See [[system-map]] §1.
- **RLS (Row-Level Security)** — Postgres feature that enforces tenant isolation at the database level.
- **`app_rls`** — the restricted DB role the running app uses; cannot bypass RLS.
- **Ledger** — the append-only record of every operation on a lot; state is derived from it.
- **Operation** — a recorded action (crush, press, rack, blend, bottle…) that can be reversed/undone.
- **Reversal / Undo** — negating an operation to restore prior state (and cost).
- **TTB 5120.17** — federal report of winery operations. See [[system-map]] §4.
- **TTB 5000.24** — federal wine excise (tax) return.
- **CBMA** — Craft Beverage Modernization Act; tax-credit ladder applied on the excise return.

<!-- Add terms freely as they come up. -->
