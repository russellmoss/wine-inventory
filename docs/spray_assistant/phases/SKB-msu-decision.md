# SKB Unit 10 — MSU gated populate attempt

**Status: the operator-gated probe has NOT been run. This document records what could be done
without it, and states exactly what Russell needs to run himself.**

## Why this session did not run the probe

D9's own reasoning: MSU's WAF (Imperva) is reputation/rate-scored, and the sweep runs from GitHub
Actions runner IP ranges - the shape it is most hostile to. A probe run from an automated session's
network egress is not evidence about whether the operator's own real crawl will succeed, and running
it here would not actually answer the question the plan needs answered. Per D8's narrowed
authorisation rule, one PASS from one egress is not a licence for anything regardless of who runs
it - so there was no shortcut available even without the network-shape concern.

## What WAS done - the safe, code-only half of this unit

`scripts/verify-msu.ts`'s live-blocked and live-passed messages both claimed more authority than a
single run can carry: the BLOCKED branch said the source "can be un-dormanted" on one future live
PASS. Rewrote both messages so the script **reports what it observed and explicitly declines to
authorise anything** - the narrowed rule (D8) now lives as stated policy in the script's own output:
**N>=3 consecutive PASSes across >=2 distinct egresses, at least one a CI runner**, before `autoCrawl`
changes. This matches D9's reasoning about *why* CI-runner-shaped egress matters, not just a number.

## One data point, for the count

`npm run verify:msu` was run from this session's own network egress (2026-07-27) as part of
confirming the message change actually prints correctly - not as an attempt to satisfy the
authorisation rule. Result: **config checks PASS, live checks BLOCKED** (`imperva (952B)` on the
`/grapes/` hub). Recorded here as one more BLOCKED observation, consistent with every prior
recon pass, not as progress toward N>=3 PASSes.

## What Russell needs to run

Per the plan's three-step sequence (Unit 10 approach), from **your own local machine, never CI**:

1. `npx tsx --conditions=react-server --env-file=.env scripts/crawl-source.ts msu-grapes --follow`
   - serial, no parallel requests, accept the crawler's existing 2s+ spacing
   - a single challenge/CAPTCHA/403 is a **stop** condition, not something to retry through
2. Record the result here (replacing this file, or appending): document count, chunk count,
   `skippedChallenge` count, and any WAF headers/cookies observed (`X-CDN`, `X-Iinfo`,
   `visid_incap_*`, `incap_ses_*`).
3. Compare against the fixed-in-advance criterion: **>=30 documents and zero `skippedChallenge`**.
   - If met: flip `defaultEnabled: true` in `src/lib/knowledge/config.ts`, keep `autoCrawl: false`
     **permanently** (D9 - the sweep runs from CI-shaped egress, which is exactly what Imperva scores
     worst), and run the full staged measurement like any other source (including Unit 9's region
     cases - MSU is the source Gemini's Michigan cross-region example was built on).
   - If not met: change nothing in config; this becomes the second data point toward D8's N>=3 count,
     alongside whatever `verify:msu` reports from your own egress over time.

D14's staleness floor (a source that cannot be CI-refreshed will rot silently) ships WITH the flip,
not before it - if the criterion is met, that floor needs to exist before `defaultEnabled` actually
changes, not after.
