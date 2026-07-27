---
id: SPRAY-6
group: spray-record
severity: critical
enforcedBy: app-code
verify: "npm run verify:latent-infection"
decision: "S5a KD-5 (council); Fedele et al. 2020"
status: guarded
appliesTo:
  - src/lib/spray/
tags:
  - invariant
---

# SPRAY-6 — a clean scouting pass never closes a latent infection event

> [!danger] Invariant (critical, app-code) — GUARDED
> An open latent-infection event is closed by its resolution rule or by an attributed human append.
> It is **never** closed by the absence of symptoms. `evaluateResolution` accepts `scoutedCleanOn`
> and deliberately ignores it for the close decision, and `closeInfectionEvent` exposes no parameter
> that would let a caller close an event because somebody looked and saw nothing.

**Why this is not a matter of taste.** During the latent period there is, by definition, nothing to
see. **Fedele et al. 2020** (*Plant Disease* 104(5):1291-1297) scored a Botrytis model at **65%**
against field assessment but **>87%** against post-harvest incubation assays of **symptomless**
berries — the model was correctly predicting infections scouting could not detect. So "nobody saw
anything" is not "there is nothing there", and if a clean scout could close an event then a diligent
grower walking a clean row would be precisely the thing that silently clears a real infection. That
is the failure this whole ledger exists to prevent.

This is the same family as [[SPRAY-3-gap-renders-unknown]] and [[PEST-1-gap-is-not-a-clearance]] —
an absence of evidence rendering as a clearance — applied to time rather than to coverage. It is
also why `wasScouted` / `isScoutedClean` exist as three distinct facts: `null`, `NOT_ASSESSED` and
`NONE` must never collapse, and even a true `NONE` does not close an incubating event.

**The companion rule, and the reason the two transitions could not be collapsed into one date
(S5a KD-4):** the projected `infectiousExpectedAt` takes the **shortest** plausible latent period
(~5 d) while the event's expiry takes the **longest** (~14 d). Each errs toward "the pathogen is
active". Assuming a later infectious date under-warns; closing on the shorter bound declares a block
clean early. The 2× literature conflict is never averaged into one number.

**Guarded by:** `npm run verify:latent-infection` — assertion group 5 closes an event mid-window
after a clean scout and requires the refusal, then requires the event to still read OPEN; group 4
proves the short/long bounds land on the dates they should, and group 6 proves the `UNKNOWN` arm
never self-closes.
**Decision:** S5a KD-5 — see [[INVARIANTS]] and the S5a plan.
**Applies to:** `src/lib/spray/`

> [!note] Scope note
> S5a ships this ledger WITHOUT a powdery-mildew risk index. The Unit 0 probe measured
> Gubler-Thomas on reconstructed hourly temperature against genuine station METAR and every site
> failed its pre-committed gate, so the index moved to S5b behind S1. A ledger entry is therefore a
> record of something somebody OBSERVED, never a model output, and nothing in this invariant depends
> on an index existing.

This note is the machine-readable face of the invariant. The narrative lives in [[INVARIANTS]]; the
guard status is asserted by `npm run verify:invariants`.
