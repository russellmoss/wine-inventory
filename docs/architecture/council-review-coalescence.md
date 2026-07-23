# Council review — data_model_coalescence.md
**Date**: 2026-07-23
**Reviewers**: Codex (gpt-5.4-mini fallback; sequencing/migration-risk), Gemini 3.1 Pro (strategy/domain)
**Question put to them**: is committing to this phased 8-domain realignment sound, and it omits
assistant coverage entirely — fix that.

## Verdict: do the alignment, but the doc's FRAMING is wrong in two ways

Both models endorse aligning to where the incumbents coalesce and both validated the moat calls
(append-only ledger, lineage DAG, one-lot-per-vessel for tanks, NO unified Party table, no DTC
customer). But they converge hard on two corrections and split on one real decision.

## Agreed correction 1 — the pipeline is sequenced wrong (risk-first, should be GTM-first)

The doc orders CE-1..8 by *risk* (cheap wins first). Both reviewers say order by **what a
custom-crush partner actually needs to onboard**, which is a different order:

- **Gemini (forceful):** custom crush lives on three things — **Intake (weigh-tags), Ownership/
  attribution, and Billing visibility.** Those are CE-5, CE-6, and CE-6's CostLine.visibility —
  currently buried LAST in the pipeline behind cheap wins and reference data. Pull them to the front.
- **Codex:** CE-7 cost writers and CE-6 ownership are "live financial history" work miscast as
  late fold-ins; they're the spine, not cleanup.

**Tempering note (grounded in ROADMAP, not the reviewers):** Gemini framed this as an "8-week
suicide mission" before harvest. That overstates the gun — the roadmap already concedes harvest
2026 and targets **sign-by-fall → validate Jan–Jun → harvest 2027**. So we have runway; the point
stands (sequence GTM-first) but it is not a fire drill.

## Agreed correction 2 — the plan omits ASSISTANT COVERAGE (the user's flag, confirmed critical)

Every `build-new` core needs an assistant tool + golden eval + registry/prompt wiring, or
`verify:ai-native` fails by design. Both gave a clean rule to fold in:

- **Gemini's rule:** *"If a winemaker's hands are wet, the Assistant needs a tool. If it's done at
  a desk with coffee, rely on the GUI."* Append `→ assistant tool + eval` to the definition of done
  for **cellar-floor** items; skip it for back-office/config.
- **Codex:** read tools for projections/reports; write tools (D10 propose→confirm) for mutable
  paths; **domain-composite, not one tool per micro-core** — the app is at ~86 tools with a ~40-tool
  selection-accuracy cliff, so group by aggregate (vessel/harvest/cost/compliance), don't proliferate.
- **Day-1 assistant coverage (talk-to-it):** intake ("took in 4 tons of Cab from Smith Ranch…"),
  WO completion with effective-time, blend predicted-analysis, and querying ("where are the empty
  kegs?", "show me Client X's lots"). **Low-value assistant coverage:** cost allocation, RBAC/config,
  TTB export config, tax-class config — GUI is fine.

## The real decision (cross-model tension) — FRACTIONAL OWNERSHIP

**This contradicts a decision already baked into plan 092.** The audit + plan 092 chose **scalar
ownership + a CHANGE_OWNERSHIP event** (matching InnoVint; Vintrace pairs fractions with the same
event). **Gemini calls scalar "a fatal error for custom crush / AP"**: real APs do 50/50 joint
ventures and a facility routinely takes a 10% cut of bulk wine as a processing fee — both are
fractional co-ownership Vintrace supports natively and scalar cannot represent. Codex did not weigh
in on this; it flagged a related CE-6 inconsistency ("Bond ledger-derived" vs "add Bond.ownerId").

This is genuinely the user's call and depends on whether the target design partner does JV/fractional
deals. Surfaced as a decision, not silently applied. The counter-argument for scalar: the "10%
facility cut" is arguably a *billing/CostLine* concern, not wine-ownership; scalar keeps RLS a
sargable column compare (a join breaks the enforcement model plan 092 rests on); and the Owner entity
can be designed so fractional is an additive extension later, not a rewrite.

## Other specific fixes (fold in)

- **CE-6 Bond wording is internally inconsistent** (Codex): "Bond ledger-derived, not stored" vs
  "add Bond.ownerId + owner-precedence." Reconcilable — bond *derivation* stays ledger-based and now
  *consults* owner — but the doc must say so clearly.
- **"Lightweight in-place edit" is NOT a cheap win** (Codex): it risks the correction-as-event
  invariant unless strictly limited to non-ledger metadata. Re-label or scope it hard.
- **Several "cheap wins" are mislabeled** (Codex): on a LIVE tenant, anything with an FK, RLS,
  uniqueness, or event-write path is **backfill-then-enforce**, not additive-and-cheap. The "cheap"
  label fits only pure projections, additive enums, and read-only reports. Re-mark: Grower FK, Tag
  inheritance, AVA, dual tax class, physical-location, weigh-tags, HarvestPick refs, owner-scoped RLS.
- **Vessel-group nuance** (Gemini): one-lot-per-vessel is right for the atomic tank/barrel, but a
  macro-bin / cage / pallet in custom crush holds mixed lots — ensure barrel-group/vessel-group
  metadata allows a mixed-lot *association* even though the atomic vessel stays 1:1.

## Defer / kill (both agree)

- **Kill for MVP:** graphical tank map (CE-4) — winemakers use whiteboards; a text location list is
  fine. Drag-drop scheduling calendar (CE-3) — a chronological WO list suffices.
- **Defer to Q4/post-harvest:** indirect-overhead allocation + backdating lock (CE-7) — managers do
  indirect math in Excel for the first billing cycle; capture *direct* cost + CostLine.visibility
  only. Also defer the pure-reporting compliance polish (line-25, deriveTaxState *UI*) — get the raw
  data in the ledger now, generate the reports in December when audits run. (Note: `deriveTaxState`
  as a projection is still cheap and useful; it's the reporting UI that waits.)
